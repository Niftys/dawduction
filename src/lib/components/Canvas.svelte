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
	import { findNodeAtPosition } from '$lib/canvas/utils/nodeFinder';
	
	import NodeContextMenu from './NodeContextMenu.svelte';
	import type { PatternNode, Pattern } from '$lib/types/pattern';
	import type { Project } from '$lib/stores/projectStore.types';
	import type { Viewport as ViewportState } from '$lib/stores/canvasStore';
	import type { PlaybackState } from '$lib/stores/playbackStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import '$lib/styles/components/Canvas.css';

	// Props: if patternId is provided, also render that pattern's instrument alongside all tracks
	const { patternId = null }: { patternId?: string | null } = $props();

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let viewport = new Viewport();
	let renderer: NodeRenderer | null = null;
	let animationFrame: number;

	// Subscribe to stores
	let project: Project | null = null;
	let canvasState: ViewportState;
	let selectionState: {
		selectedNodes: Set<string>;
		selectedTrackId: string | null;
		selectedPatternId: string | null;
		selectedInstrumentId: string | null;
		selectedNodeId: string | null;
		isRoot: boolean;
	};
	let playbackState: PlaybackState;
	let engine: EngineWorklet | null = null;

	projectStore.subscribe((p) => (project = p));
	engineStore.subscribe((e) => (engine = e));
	
	// Get the pattern if patternId is provided
	const pattern = $derived(patternId && project 
		? project.patterns?.find((p: Pattern) => p.id === patternId) || null
		: null);
	canvasStore.subscribe((state) => {
		canvasState = state;
		viewport.x = state.x;
		viewport.y = state.y;
		viewport.zoom = state.zoom;
	});
	selectionStore.subscribe((s) => (selectionState = s));
	playbackStore.subscribe((s) => (playbackState = s));

	// State
	let isDragging = $state(false);
	let dragStart = { x: 0, y: 0 };
	let lastMousePos = { x: 0, y: 0 };
	let isDraggingNode = $state(false);
	let draggedNode: {
		patternId: string | null;
		trackId: string | null;
		nodeId: string;
		selectedNodeIds: Set<string>;
		originalTree: PatternNode;
		startScreenX: number;
		startScreenY: number;
		isRoot: boolean;
		instrumentId?: string | null;
	} | null = null;
	let positionUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	let pendingPositionUpdate: PendingPositionUpdate | null = null;
	let isSelecting = $state(false);
	let selectionBox: SelectionBox | null = null;
	let contextMenu: ContextMenu | null = $state(null);
	let editingNode: { node: PatternNode; patternId: string | null; trackId: string | null; instrumentId?: string | null } | null = $state(null);
	let editValue = $state('');
	
	// Helper to get context menu element
	function getContextMenuElement(): HTMLElement | null {
		return document.querySelector('.context-menu') as HTMLElement | null;
	}

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

	// Helper to find node at touch position (for mobile node dragging)
	function findNodeAtTouchPosition(clientX: number, clientY: number): { node: PatternNode; patternId: string | null; trackId: string | null; instrumentId?: string | null; isRoot: boolean } | null {
		if (!canvas) return null;
		
		// Get fresh project state to ensure we're searching in the current tree
		let currentProject: Project | null = null;
		projectStore.subscribe((p) => (currentProject = p))();
		if (!currentProject) return null;
		
		const rect = canvas.getBoundingClientRect();
		const canvasX = clientX - rect.left;
		const canvasY = clientY - rect.top;
		const [wx, wy] = viewport.screenToWorld(canvasX, canvasY);
		
		// Get current pattern if in pattern editor mode
		let currentPattern: Pattern | null = null;
		if (patternId && currentProject) {
			currentPattern = currentProject.patterns?.find((p: Pattern) => p.id === patternId) || null;
		}
		
		// Search in all standalone instruments first (they take priority)
		for (const instrument of currentProject.standaloneInstruments || []) {
			const result = findNodeAtPosition(instrument.patternTree, wx, wy, 0, null, instrument.id);
			if (result) {
				return {
					node: result.node,
					isRoot: result.isRoot,
					patternId: null,
					trackId: instrument.id
				};
			}
		}
		
		// If no track node found and we're in pattern editor mode, check pattern instruments
		if (patternId && currentPattern) {
			const patternInstruments = currentPattern.instruments && Array.isArray(currentPattern.instruments) && currentPattern.instruments.length > 0
				? currentPattern.instruments
				: [];
			
			for (const instrument of patternInstruments) {
				const result = findNodeAtPosition(instrument.patternTree, wx, wy, 0, patternId, null, instrument.id);
				if (result) {
					return {
						node: result.node,
						isRoot: result.isRoot,
						patternId,
						trackId: null,
						instrumentId: instrument.id
					};
				}
			}
		}
		
		return null;
	}

	// Drag state
	let dragState: DragState = {
		isDragging: false,
		dragStart: { x: 0, y: 0 },
		isDraggingNode: false,
		draggedNode: null,
		lastMousePos: { x: 0, y: 0 }
	};

	// Touch interaction state (mobile-only behavior, desktop logic unchanged)
	let isTouchPanning = false;
	let isTouchDraggingNode = false;
	let lastTouchPos = { x: 0, y: 0 };
	let touchStartPos = { x: 0, y: 0 };
	let touchMoved = false;
	let longPressFired = false;
	let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
	let touchStartNode: { node: PatternNode; patternId: string | null; trackId: string | null; instrumentId?: string | null; isRoot: boolean } | null = null;
	let isTouchInteraction = false; // Track if we're currently in a touch interaction

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
			const target = e.target as Node;
			// Don't close if clicking on the canvas itself (let canvas handle it)
			if (canvas && canvas.contains(target)) {
				return;
			}
			// Don't close if clicking on the context menu itself
			const menuElement = getContextMenuElement();
			if (menuElement && menuElement.contains(target)) {
				return;
			}
			if (contextMenu) {
				contextMenu = null;
			}
		};
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Node;
			// Don't close if clicking on the canvas itself
			if (canvas && canvas.contains(target)) {
				return;
			}
			// Don't close if clicking on the context menu itself
			const menuElement = getContextMenuElement();
			if (menuElement && menuElement.contains(target)) {
				return;
			}
			// Use a small delay to allow button clicks to fire first
			setTimeout(() => {
				if (contextMenu) {
					contextMenu = null;
				}
			}, 0);
		};
		const handleTouchStartOutside = (e: TouchEvent) => {
			const target = e.target as Node;
			// Don't close if touching the canvas itself
			if (canvas && target && canvas.contains(target)) {
				return;
			}
			// Don't close if touching the context menu itself
			const menuElement = getContextMenuElement();
			if (menuElement && target && menuElement.contains(target)) {
				return;
			}
			// Close context menu on any touch outside as well (mobile)
			if (contextMenu) {
				contextMenu = null;
			}
		};
		window.addEventListener('mousedown', handleMouseDownOutside);
		window.addEventListener('click', handleClickOutside);
		window.addEventListener('touchstart', handleTouchStartOutside);

		return () => {
			window.removeEventListener('resize', resize);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('mousedown', handleMouseDownOutside);
			window.removeEventListener('click', handleClickOutside);
			window.removeEventListener('touchstart', handleTouchStartOutside);
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
		
		// Check if clicking on the context menu itself - if so, don't handle it
		const target = e.target as Node;
		const menuElement = getContextMenuElement();
		if (menuElement && menuElement.contains(target)) {
			return; // Let the context menu handle it
		}
		
		// Don't handle mouse events when context menu is open (close it instead)
		if (contextMenu) {
			// Clicking outside the menu - close it
			contextMenu = null;
			return;
		}
		
		// Ignore mouse events that occur during touch interactions (to prevent interference)
		// Some browsers fire mouse events after touch events, which can cause conflicts
		if (isTouchInteraction) {
			return;
		}
			
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
			let currentSelection: {
				selectedNodes: Set<string>;
				selectedTrackId: string | null;
				selectedPatternId: string | null;
				selectedInstrumentId: string | null;
				selectedNodeId: string | null;
				isRoot: boolean;
			} | null = null;
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
			let currentSelection: {
				selectedNodes: Set<string>;
				selectedTrackId: string | null;
				selectedPatternId: string | null;
				selectedInstrumentId: string | null;
				selectedNodeId: string | null;
				isRoot: boolean;
			} | null = null;
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

	// Touch handlers (mobile) - map taps/long-press to mouse semantics and allow panning/node dragging
	function onTouchStart(e: TouchEvent) {
		if (!canvas) return;
		if (e.touches.length !== 1) return;

		// Mark that we're in a touch interaction to prevent mouse events from interfering
		isTouchInteraction = true;
		
		const touch = e.touches[0];
		lastTouchPos = { x: touch.clientX, y: touch.clientY };
		touchStartPos = { x: touch.clientX, y: touch.clientY };
		touchMoved = false;
		longPressFired = false;
		isTouchPanning = false;
		isTouchDraggingNode = false;
		touchStartNode = null;

		// Reset any previous drag state completely before starting new touch
		dragState.isDraggingNode = false;
		dragState.draggedNode = null;
		isDraggingNode = false;
		pendingPositionUpdate = null;
		if (positionUpdateTimeout) {
			clearTimeout(positionUpdateTimeout);
			positionUpdateTimeout = null;
		}

		// Check if we touched a node
		const touchedNode = findNodeAtTouchPosition(touch.clientX, touch.clientY);
		if (touchedNode) {
			// Don't cancel long-press here - allow long-press on nodes for context menu
			// The long-press will be cancelled if movement starts
			touchStartNode = touchedNode;
			// Don't set isTouchDraggingNode yet - wait for movement threshold
			// Start node dragging setup (similar to mouse down on node)
			const rect = canvas.getBoundingClientRect();
			const startCanvasX = touch.clientX - rect.left;
			const startCanvasY = touch.clientY - rect.top;
			
			// Deep clone the tree
			const cloneTree = (node: PatternNode): PatternNode => ({
				...node,
				children: node.children.map(cloneTree)
			});
			
			// Get current selection for group movement
			let currentSelection: {
				selectedNodes: Set<string>;
				selectedTrackId: string | null;
				selectedPatternId: string | null;
				selectedInstrumentId: string | null;
				selectedNodeId: string | null;
				isRoot: boolean;
			} | null = null;
			selectionStore.subscribe((s) => (currentSelection = s))();
			
			// Get fresh project state to ensure we have the latest tree (after any previous drags)
			let currentProject: Project | null = null;
			projectStore.subscribe((p) => (currentProject = p))();
			
			// Find the instrument/track to get the CURRENT tree state
			let originalTree: PatternNode | null = null;
			if (touchedNode.trackId) {
				const track = currentProject?.standaloneInstruments?.find((i) => i.id === touchedNode.trackId);
				if (track) {
					originalTree = cloneTree(track.patternTree);
				}
			} else if (touchedNode.patternId && touchedNode.instrumentId) {
				const pattern = currentProject?.patterns?.find((p: Pattern) => p.id === touchedNode.patternId);
				if (pattern) {
					const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
						? pattern.instruments
						: [];
					const instrument = instruments.find((inst) => inst.id === touchedNode.instrumentId);
					if (instrument) {
						originalTree = cloneTree(instrument.patternTree);
					}
				}
			}
			
			if (originalTree) {
				// Select the node first if not already selected, then get fresh selection
				if (!currentSelection?.selectedNodes?.has(touchedNode.node.id)) {
					selectionStore.selectNode(
						touchedNode.node.id,
						touchedNode.trackId,
						touchedNode.isRoot,
						false,
						touchedNode.patternId,
						touchedNode.instrumentId
					);
					// Get updated selection after selecting
					selectionStore.subscribe((s) => (currentSelection = s))();
				}
				
				// Now set up drag state with fresh selection
				// Use touch position as start - this is correct because we calculate delta from touch
				dragState.draggedNode = {
					patternId: touchedNode.patternId,
					trackId: touchedNode.trackId,
					nodeId: touchedNode.node.id,
					selectedNodeIds: currentSelection?.selectedNodes || new Set([touchedNode.node.id]),
					originalTree,
					startScreenX: startCanvasX,
					startScreenY: startCanvasY,
					isRoot: touchedNode.isRoot,
					instrumentId: touchedNode.instrumentId
				};
				// Don't set isDraggingNode yet - wait for movement threshold
				// dragState.isDraggingNode will be set when movement starts
			}
		}

		// Long-press -> right click (context menu) - works both on and off nodes
		if (longPressTimeout) {
			clearTimeout(longPressTimeout);
			longPressTimeout = null;
		}
		longPressTimeout = setTimeout(() => {
			if (!touchMoved && !longPressFired && !isTouchDraggingNode && canvas) {
				longPressFired = true;
				// Synthesize a right-click at touch position
				const eventInit: MouseEventInit = {
					clientX: touch.clientX,
					clientY: touch.clientY,
					button: 2,
					bubbles: true,
					cancelable: true
				};
				const fakeEvent = new MouseEvent('contextmenu', eventInit);
				onContextMenu(fakeEvent);
			}
		}, 1000); // 1 second for right-click (long-press)

		e.preventDefault();
	}

	function onTouchMove(e: TouchEvent) {
		if (!canvas || e.touches.length !== 1) return;
		const touch = e.touches[0];
		const moveX = touch.clientX - touchStartPos.x;
		const moveY = touch.clientY - touchStartPos.y;
		const distanceSq = moveX * moveX + moveY * moveY;

		// If we started on a node and moved past threshold, start node dragging
		if (touchStartNode && !isTouchDraggingNode && distanceSq > 25) {
			isTouchDraggingNode = true;
			dragState.isDraggingNode = true;
			isDraggingNode = true;
			touchMoved = true;
			// Cancel long-press when dragging starts
			if (longPressTimeout) {
				clearTimeout(longPressTimeout);
				longPressTimeout = null;
			}
		}
		
		// If we're dragging a node, update node position
		if (isTouchDraggingNode && dragState.draggedNode && dragState.isDraggingNode) {
			touchMoved = true;
			if (longPressTimeout) {
				clearTimeout(longPressTimeout);
				longPressTimeout = null;
			}
			
			// Update node position using same logic as mouse drag
			const rect = canvas.getBoundingClientRect();
			const canvasX = touch.clientX - rect.left;
			const canvasY = touch.clientY - rect.top;
			const [currentWx, currentWy] = viewport.screenToWorld(canvasX, canvasY);
			const [startWx, startWy] = viewport.screenToWorld(dragState.draggedNode.startScreenX, dragState.draggedNode.startScreenY);
			const dx = currentWx - startWx;
			const dy = currentWy - startWy;
			
			// Helper to move tree
			const moveTree = (node: PatternNode): PatternNode => {
				const origX = node.x ?? 0;
				const origY = node.y ?? 0;
				return {
					...node,
					x: origX + dx,
					y: origY + dy,
					children: node.children.map(moveTree)
				};
			};
			
			// Helper to move individual node or group of nodes
			const moveNode = (node: PatternNode): PatternNode => {
				if (!dragState.draggedNode) return node;
				
				// Check if this node is in the selected set (for group movement)
				const isSelected = dragState.draggedNode.selectedNodeIds.has(node.id);
				
				if (isSelected) {
					const origX = node.x ?? 0;
					const origY = node.y ?? 0;
					return {
						...node,
						x: origX + dx,
						y: origY + dy,
						children: node.children.map(moveNode)
					};
				} else {
					return {
						...node,
						children: node.children.map(moveNode)
					};
				}
			};
			
			const newTree = dragState.draggedNode.isRoot
				? moveTree(dragState.draggedNode.originalTree)
				: moveNode(dragState.draggedNode.originalTree);
			
			// Update immediately for smooth visuals, but skip history during drag
			if (dragState.draggedNode.patternId) {
				// Update the instrument in the pattern
				if (dragState.draggedNode.instrumentId) {
					projectStore.updatePatternInstrument(dragState.draggedNode.patternId, dragState.draggedNode.instrumentId, { patternTree: newTree }, true);
				} else {
					// Legacy: update pattern directly
					projectStore.updatePattern(dragState.draggedNode.patternId, { patternTree: newTree }, true);
				}
				pendingPositionUpdate = {
					patternId: dragState.draggedNode.patternId,
					trackId: null,
					patternTree: newTree,
					instrumentId: dragState.draggedNode.instrumentId
				};
			} else if (dragState.draggedNode.trackId) {
				// Update immediately with skipHistory=true to avoid undo entries during drag
				projectStore.updateStandaloneInstrument(dragState.draggedNode.trackId, { patternTree: newTree }, true);
				pendingPositionUpdate = {
					patternId: null,
					trackId: dragState.draggedNode.trackId,
					patternTree: newTree
				};
			}
		} else {
			// If finger has moved more than a small threshold, treat as pan and cancel long-press
			if (distanceSq > 25) {
				touchMoved = true;
				if (longPressTimeout) {
					clearTimeout(longPressTimeout);
					longPressTimeout = null;
				}
				// Start panning once movement threshold exceeded
				if (!isTouchPanning) {
					isTouchPanning = true;
					lastTouchPos = { x: touch.clientX, y: touch.clientY };
				}
			}

			if (isTouchPanning) {
				const dx = -(touch.clientX - lastTouchPos.x) / viewport.zoom;
				const dy = -(touch.clientY - lastTouchPos.y) / viewport.zoom;
				canvasStore.pan(dx, dy);
			}
		}

		lastTouchPos = { x: touch.clientX, y: touch.clientY };
		e.preventDefault();
	}

	function onTouchEnd(e: TouchEvent) {
		if (longPressTimeout) {
			clearTimeout(longPressTimeout);
			longPressTimeout = null;
		}

		// No remaining touches: potentially a tap or end of drag
		if (e.touches.length === 0) {
			// If we were dragging a node, finalize the drag
			if (isTouchDraggingNode && dragState.isDraggingNode && dragState.draggedNode) {
				// Save final position with history when drag ends (same as mouse up)
				if (pendingPositionUpdate) {
					if (positionUpdateTimeout) clearTimeout(positionUpdateTimeout);
					if (pendingPositionUpdate.patternId) {
						// For patterns, update the instrument
						if (pendingPositionUpdate.instrumentId) {
							projectStore.updatePatternInstrument(pendingPositionUpdate.patternId, pendingPositionUpdate.instrumentId, { patternTree: pendingPositionUpdate.patternTree }, false);
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
				
				// Reset drag state
				dragState.isDraggingNode = false;
				dragState.draggedNode = null;
				isDraggingNode = false;
				isTouchDraggingNode = false;
				touchStartNode = null;
			} else if (touchStartNode && !isTouchDraggingNode) {
				// Touched a node but didn't drag - clean up drag state and treat as tap
				dragState.isDraggingNode = false;
				dragState.draggedNode = null;
				isDraggingNode = false;
				touchStartNode = null;
				
				if (!touchMoved && !longPressFired && canvas) {
					// Short tap on node -> left click
					const touch = e.changedTouches[0];
					const eventInit: MouseEventInit = {
						clientX: touch.clientX,
						clientY: touch.clientY,
						button: 0
					};
					const downEvent = new MouseEvent('mousedown', eventInit);
					const upEvent = new MouseEvent('mouseup', eventInit);
					onMouseDown(downEvent);
					onMouseUp(upEvent);
				}
			} else if (!touchMoved && !longPressFired && !isTouchDraggingNode && canvas) {
				// Short tap -> left click (only if not dragging a node)
				const touch = e.changedTouches[0];
				const eventInit: MouseEventInit = {
					clientX: touch.clientX,
					clientY: touch.clientY,
					button: 0
				};
				const downEvent = new MouseEvent('mousedown', eventInit);
				const upEvent = new MouseEvent('mouseup', eventInit);
				onMouseDown(downEvent);
				onMouseUp(upEvent);
			}
			isTouchPanning = false;
			touchMoved = false;
		}
		
		// Reset touch interaction flag after a delay to allow any synthetic events to complete
		setTimeout(() => {
			isTouchInteraction = false;
		}, 100);
	}

	function onNodeClick(e: MouseEvent) {
		if (contextMenu) return;
		handleNodeClick(e, getNodeClickContext());
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (!canvas) return;
		
		// Handle both real mouse right-clicks and synthesized touch events
		// Real mouse events will have button === 2, synthesized events from touch won't
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
		// Don't allow editing root node division
		if (selectionState.isRoot) {
			editingNode = null;
			return;
		}
		const division = parseInt(editValue);
		if (isNaN(division) || division < 1) return;
		
		if (editingNode.patternId) {
			projectStore.updatePatternNodeDivision(editingNode.patternId, editingNode.node.id, division, editingNode.instrumentId);
			// Small delay to ensure store update completes, then update engine
			setTimeout(() => {
				updateEnginePatternTree(engine, createUpdateContext({ editingNode }));
			}, 0);
		} else if (editingNode.trackId) {
			projectStore.updateNodeDivision(editingNode.trackId, editingNode.node.id, division);
			// Small delay to ensure store update completes, then update engine
			setTimeout(() => {
				updateEnginePatternTree(engine, createUpdateContext({ editingNode }));
			}, 0);
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
	on:touchstart={onTouchStart}
	on:touchmove={onTouchMove}
	on:touchend={onTouchEnd}
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
		onAddChild={onContextAction}
		onDelete={onContextAction}
		onEdit={onContextAction}
		onCopy={onContextAction}
	/>
{/if}

{#if editingNode}
	<div class="edit-overlay">
		<div class="edit-dialog">
			<label for="edit-division" title="Controls how much time this node takes relative to its siblings. Higher values = longer duration.">
				Division:
			</label>
			<div class="edit-help-text" title="Controls how much time this node takes relative to its siblings. Higher values = longer duration.">
				This value determines how many beats this node takes to play relative to its siblings
			</div>
			<input
				id="edit-division"
				type="number"
				bind:value={editValue}
				min="1"
				title="Controls how much time this node takes relative to its siblings. Higher values = longer duration."
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
