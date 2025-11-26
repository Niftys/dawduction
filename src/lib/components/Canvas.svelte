<script lang="ts">
	/**
	 * Canvas Component - Renders instruments on the canvas
	 * 
	 * TERMINOLOGY CLARIFICATION:
	 * - INSTRUMENTS: Generated synths with pattern trees (what's rendered here)
	 *   - Can be stored as Track (standalone) or Pattern (reusable)
	 *   - Multiple instruments can be visible on canvas simultaneously
	 * - PATTERN: Container for instruments (currently stores single instrument)
	 *   - When editing a pattern, all instruments in project.standaloneInstruments are visible
	 *   - The pattern's own instrument is also visible
	 * - TRACK: Timeline track in arrangement view (not rendered here)
	 */
	import { onMount, onDestroy } from 'svelte';
	import { projectStore } from '$lib/stores/projectStore';
	import { canvasStore } from '$lib/stores/canvasStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { playbackStore } from '$lib/stores/playbackStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { Viewport } from '$lib/canvas/Viewport';
	import { NodeRenderer } from '$lib/canvas/NodeRenderer';
	import { updateEnginePatternTree, createUpdateContext } from '$lib/utils/patternTreeUpdater';
	
	// Handlers
	import { handleCanvasKeyboard, type KeyboardHandlerContext } from '$lib/canvas/handlers/keyboardHandlers';
	import { 
		handleMouseDown, 
		handleMouseMove, 
		handleMouseUp, 
		handleWheel,
		type MouseHandlerContext,
		type DragState,
		type SelectionBox,
		type PendingPositionUpdate
	} from '$lib/canvas/handlers/mouseHandlers';
	import { handleNodeClick, handleContextMenu, type NodeClickContext, type ContextMenu } from '$lib/canvas/handlers/nodeClickHandlers';
	import { handleContextAction, type ContextActionContext } from '$lib/canvas/handlers/contextMenuHandlers';
	
	// Renderer
	import { renderFrame, type RenderContext } from '$lib/canvas/utils/renderer';
	
	import NodeContextMenu from './NodeContextMenu.svelte';
	import type { PatternNode, Pattern } from '$lib/types/pattern';
	import '$lib/styles/components/Canvas.css';

	// Props: if patternId is provided, also render that pattern's instrument alongside all tracks
	export let patternId: string | null = null;

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let viewport = new Viewport();
	let renderer: NodeRenderer | null = null;
	let animationFrame: number;

	// Subscribe to stores
	let project: any;
	let canvasState: any;
	let selectionState: any;
	let playbackState: any;
	let engine: any = null;

	projectStore.subscribe((p) => (project = p));
	engineStore.subscribe((e) => (engine = e));
	
	// Get the pattern if patternId is provided
	$: pattern = patternId && project 
		? project.patterns?.find((p: Pattern) => p.id === patternId) || null
		: null;
	canvasStore.subscribe((state) => {
		canvasState = state;
		viewport.x = state.x;
		viewport.y = state.y;
		viewport.zoom = state.zoom;
	});
	selectionStore.subscribe((s) => (selectionState = s));
	playbackStore.subscribe((s) => (playbackState = s));

	// State
	let isDragging = false;
	let dragStart = { x: 0, y: 0 };
	let lastMousePos = { x: 0, y: 0 };
	let isDraggingNode = false;
	let draggedNode: any = null;
	let positionUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	let pendingPositionUpdate: PendingPositionUpdate | null = null;
	let isSelecting = false;
	let selectionBox: SelectionBox | null = null;
	let contextMenu: ContextMenu | null = null;
	let editingNode: { node: PatternNode; patternId: string | null; trackId: string | null; instrumentId?: string | null } | null = null;
	let editValue = '';

	// Helper to get keyboard context
	function getKeyboardContext(): KeyboardHandlerContext {
		return {
			project,
			patternId,
			pattern,
			selectionState,
			engine
		};
	}

	// Helper to get mouse context
	function getMouseContext(): MouseHandlerContext {
		return {
			project,
			patternId,
			pattern,
			canvas: canvas!,
			viewport
		};
	}

	// Helper to get node click context
	function getNodeClickContext(): NodeClickContext {
		return {
			project,
			patternId,
			pattern,
			canvas: canvas!,
			viewport
		};
	}

	// Drag state
	let dragState: DragState = {
		isDragging: false,
		dragStart: { x: 0, y: 0 },
		isDraggingNode: false,
		draggedNode: null,
		lastMousePos: { x: 0, y: 0 }
	};

	onMount(() => {
		if (!canvas) return;

		ctx = canvas.getContext('2d');
		if (!ctx) return;

		renderer = new NodeRenderer(ctx, viewport);

		// Set canvas size
		const resize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		};
		resize();
		window.addEventListener('resize', resize);

		// Start render loop
		const render = () => {
			if (!ctx || !renderer) return;
			doRender();
			animationFrame = requestAnimationFrame(render);
		};
		render();

		// Keyboard shortcuts
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't handle if typing in an input
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}
			handleCanvasKeyboard(e, getKeyboardContext());
		};
		window.addEventListener('keydown', handleKeyDown);

		// Close context menu and editing dialog when clicking outside
		const handleMouseDownOutside = (e: MouseEvent) => {
			if (contextMenu) {
				contextMenu = null;
			}
		};
		const handleClickOutside = (e: MouseEvent) => {
			if (contextMenu) {
			contextMenu = null;
			}
		};
		window.addEventListener('mousedown', handleMouseDownOutside);
		window.addEventListener('contextmenu', handleClickOutside);

		return () => {
			window.removeEventListener('resize', resize);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('mousedown', handleMouseDownOutside);
			window.removeEventListener('contextmenu', handleClickOutside);
			cancelAnimationFrame(animationFrame);
		};
	});

	// Render function
	function doRender() {
		if (!ctx || !renderer || !project || !canvas) return;
		
		renderFrame({
			ctx,
			renderer,
			canvas,
			viewport,
			project,
			patternId,
			pattern,
			selectionState,
			playbackState,
			isSelecting,
			selectionBox
		});
		}
		
	// Mouse handlers
	function onMouseDown(e: MouseEvent) {
		if (!canvas) return;
			
		// Don't handle right-click in mouse down - let context menu handle it
		if (e.button === 2) return;
		
		const result = handleMouseDown(e, getMouseContext(), dragState);
			
		// Update local state from handler result
		isDragging = result.startedDragging;
		isDraggingNode = result.startedDraggingNode;
		isSelecting = result.startedSelecting;
		selectionBox = result.selectionBox;
		dragState.isDragging = result.startedDragging;
		dragState.isDraggingNode = result.startedDraggingNode;
		
		if (result.clickedNode && result.clickedNode.track) {
			// Deep clone the tree
			const cloneTree = (node: PatternNode): PatternNode => ({
				...node,
				children: node.children.map(cloneTree)
			});
			const rect = canvas.getBoundingClientRect();
			const startCanvasX = e.clientX - rect.left;
			const startCanvasY = e.clientY - rect.top;
			
			// Get current selection for group movement
			let currentSelection: any = null;
			selectionStore.subscribe((s) => (currentSelection = s))();
			
			dragState.draggedNode = {
				patternId: result.clickedNode.patternId,
				trackId: result.clickedNode.trackId,
				nodeId: result.clickedNode.node.id,
				selectedNodeIds: currentSelection?.selectedNodes || new Set([result.clickedNode.node.id]),
				originalTree: cloneTree(result.clickedNode.track.patternTree),
				startScreenX: startCanvasX,
				startScreenY: startCanvasY,
				isRoot: result.clickedNode.isRoot,
				instrumentId: result.clickedNode.instrumentId
			};
		} else if (result.clickedNode && result.clickedNode.instrument) {
			// Deep clone the tree
					const cloneTree = (node: PatternNode): PatternNode => ({
						...node,
						children: node.children.map(cloneTree)
					});
					const rect = canvas.getBoundingClientRect();
					const startCanvasX = e.clientX - rect.left;
					const startCanvasY = e.clientY - rect.top;
				
			// Get current selection for group movement
			let currentSelection: any = null;
			selectionStore.subscribe((s) => (currentSelection = s))();
			
			dragState.draggedNode = {
				patternId: result.clickedNode.patternId,
				trackId: result.clickedNode.trackId,
				nodeId: result.clickedNode.node.id,
				selectedNodeIds: currentSelection?.selectedNodes || new Set([result.clickedNode.node.id]),
				originalTree: cloneTree(result.clickedNode.instrument.patternTree),
						startScreenX: startCanvasX,
						startScreenY: startCanvasY,
				isRoot: result.clickedNode.isRoot,
				instrumentId: result.clickedNode.instrumentId
					};
				} else {
			dragState.draggedNode = null;
				}
	}

	function onMouseMove(e: MouseEvent) {
		if (!canvas) return;
		
		const result = handleMouseMove(e, getMouseContext(), dragState, selectionBox);
					
		// Update local state
		selectionBox = result.updatedSelectionBox;
		dragState = result.updatedDragState;
		isDragging = dragState.isDragging;
		isDraggingNode = dragState.isDraggingNode;
		
		if (result.pendingPositionUpdate) {
			pendingPositionUpdate = result.pendingPositionUpdate;
		}
	}

	function onMouseUp(e: MouseEvent) {
		const result = handleMouseUp(e, dragState);
				
		// Update local state
		dragState = result.updatedDragState;
		isDragging = dragState.isDragging;
		isDraggingNode = dragState.isDraggingNode;
				
		// Finalize selection box
		if (result.shouldFinalizeSelection) {
			isSelecting = false;
			selectionBox = null;
		}
			
			// Save final position with history when drag ends
			if (pendingPositionUpdate) {
				if (positionUpdateTimeout) clearTimeout(positionUpdateTimeout);
				if (pendingPositionUpdate.patternId) {
				// For patterns, update the instrument
				if (pendingPositionUpdate.instrumentId) {
					projectStore.updatePatternInstrument(pendingPositionUpdate.patternId, pendingPositionUpdate.instrumentId, { patternTree: pendingPositionUpdate.patternTree });
				} else {
					// Legacy: update pattern directly
					projectStore.updatePattern(pendingPositionUpdate.patternId, { patternTree: pendingPositionUpdate.patternTree }, false);
				}
				} else if (pendingPositionUpdate.trackId) {
					// For standalone instruments, update with skipHistory=false to create history entry
					projectStore.updateStandaloneInstrument(pendingPositionUpdate.trackId, { patternTree: pendingPositionUpdate.patternTree }, false);
				}
				pendingPositionUpdate = null;
				positionUpdateTimeout = null;
			}
	}

	function onWheel(e: WheelEvent) {
		handleWheel(e, getMouseContext());
	}

	function onNodeClick(e: MouseEvent) {
		if (contextMenu) return;
		handleNodeClick(e, getNodeClickContext());
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
				e.stopPropagation();
		if (!canvas) return;
		const menu = handleContextMenu(e, getNodeClickContext());
		if (menu) {
			contextMenu = menu;
		}
	}

	function onContextAction(event: CustomEvent) {
		const result = handleContextAction(event, {
			menu: contextMenu!,
			project,
			engine
		});
		
		if (result.editingNode) {
			editingNode = result.editingNode;
			editValue = result.editValue;
		}
		
		contextMenu = null;
	}
	
	function saveEdit() {
		if (!editingNode) return;
		const division = parseInt(editValue);
		if (isNaN(division) || division < 1) return;
		
		if (editingNode.patternId) {
			projectStore.updatePatternNodeDivision(editingNode.patternId, editingNode.node.id, division, editingNode.instrumentId);
			// Update pattern tree in engine for real-time audio updates
			updateEnginePatternTree(engine, createUpdateContext({ editingNode }));
		} else if (editingNode.trackId) {
			projectStore.updateNodeDivision(editingNode.trackId, editingNode.node.id, division);
			// Update pattern tree in engine for real-time audio updates
			updateEnginePatternTree(engine, createUpdateContext({ editingNode }));
		}
		editingNode = null;
	}
</script>

<canvas
	bind:this={canvas}
	class="canvas"
	on:mousedown={onMouseDown}
	on:mousemove={onMouseMove}
	on:mouseup={onMouseUp}
	on:wheel={onWheel}
	on:contextmenu={onContextMenu}
	style="cursor: {isDraggingNode ? 'grabbing' : isSelecting ? 'crosshair' : 'grab'};"
	class:grabbing={isDragging || isDraggingNode}
	class:selecting={isSelecting}
></canvas>

{#if contextMenu}
	<NodeContextMenu
		x={contextMenu.x}
		y={contextMenu.y}
		node={contextMenu.node}
		isRoot={contextMenu.isRoot}
		patternId={contextMenu?.patternId ?? null}
		trackId={contextMenu?.trackId ?? null}
		on:addChild={onContextAction}
		on:delete={onContextAction}
		on:edit={onContextAction}
		on:copy={onContextAction}
	/>
{/if}

{#if editingNode}
	<div class="edit-overlay">
		<div class="edit-dialog">
			<label for="edit-division">Division:</label>
			<input
				id="edit-division"
				type="number"
				bind:value={editValue}
				min="1"
				on:keydown={(e) => {
					if (e.key === 'Enter') saveEdit();
					if (e.key === 'Escape') editingNode = null;
				}}
			/>
			<div class="edit-buttons">
				<button on:click={saveEdit}>Save</button>
				<button on:click={() => editingNode = null}>Cancel</button>
			</div>
		</div>
	</div>
{/if}
