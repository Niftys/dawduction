/**
 * Mouse Event Handlers for Canvas
 * Handles mouse down, move, up, and wheel events
 */

import { selectionStore } from '$lib/stores/selectionStore';
import { canvasStore } from '$lib/stores/canvasStore';
import { projectStore } from '$lib/stores/projectStore';
import { findNodeAtPosition, findNodesInBox, getRadiusForDepth } from '../utils/nodeFinder';
import type { PatternNode, Pattern, StandaloneInstrument, Instrument } from '$lib/types/pattern';
import type { Viewport } from '$lib/canvas/Viewport';
import type { Project } from '$lib/stores/projectStore.types';

export interface MouseHandlerContext {
	project: Project | null;
	patternId: string | null;
	pattern: Pattern | null;
	canvas: HTMLCanvasElement;
	viewport: Viewport;
}

export interface DragState {
	isDragging: boolean;
	dragStart: { x: number; y: number };
	isDraggingNode: boolean;
	draggedNode: DraggedNode | null;
	lastMousePos: { x: number; y: number };
}

export interface DraggedNode {
	patternId: string | null;
	trackId: string | null;
	nodeId: string; // Primary node being dragged
	selectedNodeIds: Set<string>; // All selected nodes to move as a group
	originalTree: PatternNode;
	startScreenX: number;
	startScreenY: number;
	isRoot: boolean;
	instrumentId?: string | null;
}

export interface SelectionBox {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
}

/**
 * Handles mouse down events
 */
export function handleMouseDown(
	e: MouseEvent,
	context: MouseHandlerContext,
	dragState: DragState
): { 
	startedDragging: boolean;
	startedDraggingNode: boolean;
	startedSelecting: boolean;
	selectionBox: SelectionBox | null;
	clickedNode: ClickedNode | null;
} {
	const { canvas, viewport } = context;
	
	if (e.button === 1) {
		// Middle mouse - pan
		dragState.isDragging = true;
		dragState.dragStart = { x: e.clientX, y: e.clientY };
		e.preventDefault();
		return { startedDragging: true, startedDraggingNode: false, startedSelecting: false, selectionBox: null, clickedNode: null };
	}
	
	if (e.button === 0) {
		// Left click
		const clickedNode = findClickedNode(e, context);
		
		if (clickedNode) {
			// Start dragging node
			dragState.isDraggingNode = true;
			const rect = canvas.getBoundingClientRect();
			const startCanvasX = e.clientX - rect.left;
			const startCanvasY = e.clientY - rect.top;
			
			// Deep clone the tree to preserve original positions
			const cloneTree = (node: PatternNode): PatternNode => ({
				...node,
				children: node.children.map(cloneTree)
			});
			
			const originalTree = clickedNode.track 
				? cloneTree(clickedNode.track?.patternTree || clickedNode.instrument?.patternTree)
				: clickedNode.instrument 
					? cloneTree(clickedNode.instrument.patternTree)
					: null;
			
			if (originalTree) {
				// Get current selection state to support group movement
				let currentSelection: any = null;
				selectionStore.subscribe((s) => (currentSelection = s))();
				
				// Check if the clicked node is already in the selection
				const isAlreadySelected = currentSelection?.selectedNodes?.has(clickedNode.node.id);
				const hasMultipleSelected = currentSelection?.selectedNodes?.size > 1;
				
				// If clicking on an already-selected node with multiple nodes selected, keep the selection for group movement
				// Otherwise, select the node normally (which may clear selection if Ctrl/Cmd isn't held)
				if (!isAlreadySelected || !hasMultipleSelected) {
					selectionStore.selectNode(
						clickedNode.node.id,
						clickedNode.trackId,
						clickedNode.isRoot,
						e.ctrlKey || e.metaKey,
						clickedNode.patternId,
						clickedNode.instrumentId
					);
					// Get updated selection after selecting
					selectionStore.subscribe((s) => (currentSelection = s))();
				}
				// If clicking on an already-selected node with multiple selected, keep the existing selection
				
				dragState.draggedNode = {
					patternId: clickedNode.patternId,
					trackId: clickedNode.trackId,
					nodeId: clickedNode.node.id,
					selectedNodeIds: currentSelection?.selectedNodes || new Set([clickedNode.node.id]),
					originalTree,
					startScreenX: startCanvasX,
					startScreenY: startCanvasY,
					isRoot: clickedNode.isRoot,
					instrumentId: clickedNode.instrumentId
				};
			}
			
			e.preventDefault();
			return { startedDragging: false, startedDraggingNode: true, startedSelecting: false, selectionBox: null, clickedNode };
		}
		
		// If no node clicked, start selection box
		if (!e.ctrlKey && !e.metaKey && canvas) {
			const rect = canvas.getBoundingClientRect();
			const selectionBox: SelectionBox = {
				startX: e.clientX - rect.left,
				startY: e.clientY - rect.top,
				endX: e.clientX - rect.left,
				endY: e.clientY - rect.top
			};
			// Clear selection when starting new selection box
			selectionStore.clearSelection();
			e.preventDefault();
			return { startedDragging: false, startedDraggingNode: false, startedSelecting: true, selectionBox, clickedNode: null };
		}
	}
	
	return { startedDragging: false, startedDraggingNode: false, startedSelecting: false, selectionBox: null, clickedNode: null };
}

/**
 * Handles mouse move events
 */
export function handleMouseMove(
	e: MouseEvent,
	context: MouseHandlerContext,
	dragState: DragState,
	selectionBox: SelectionBox | null
): {
	updatedSelectionBox: SelectionBox | null;
	updatedDragState: DragState;
	pendingPositionUpdate: PendingPositionUpdate | null;
} {
	const { canvas, viewport, project, patternId, pattern } = context;
	let updatedSelectionBox = selectionBox;
	let pendingPositionUpdate: PendingPositionUpdate | null = null;
	
	// Update selection box if selecting
	if (selectionBox && canvas) {
		const rect = canvas.getBoundingClientRect();
		updatedSelectionBox = {
			...selectionBox,
			endX: e.clientX - rect.left,
			endY: e.clientY - rect.top
		};
		
		// Find nodes within selection box
		if (project) {
			updateSelectionFromBox(updatedSelectionBox, context);
		}
		
		return { updatedSelectionBox, updatedDragState: dragState, pendingPositionUpdate: null };
	}
	
	// Handle panning
	if (dragState.isDragging) {
		const dx = -(e.clientX - dragState.dragStart.x) / viewport.zoom;
		const dy = -(e.clientY - dragState.dragStart.y) / viewport.zoom;
		canvasStore.pan(dx, dy);
		dragState.dragStart = { x: e.clientX, y: e.clientY };
		return { updatedSelectionBox: null, updatedDragState: dragState, pendingPositionUpdate: null };
	}
	
	// Handle node dragging
	if (dragState.isDraggingNode && dragState.draggedNode && canvas) {
		pendingPositionUpdate = handleNodeDrag(e, context, dragState);
	}
	
	dragState.lastMousePos = { x: e.clientX, y: e.clientY };
	return { updatedSelectionBox: null, updatedDragState: dragState, pendingPositionUpdate };
}

/**
 * Handles mouse up events
 */
export function handleMouseUp(
	e: MouseEvent,
	dragState: DragState
): {
	updatedDragState: DragState;
	shouldFinalizeSelection: boolean;
} {
	if (e.button === 1) {
		dragState.isDragging = false;
		return { updatedDragState: dragState, shouldFinalizeSelection: false };
	}
	
	if (e.button === 0) {
		dragState.isDraggingNode = false;
		dragState.draggedNode = null;
		return { updatedDragState: dragState, shouldFinalizeSelection: true };
	}
	
	return { updatedDragState: dragState, shouldFinalizeSelection: false };
}

/**
 * Handles wheel events for zooming
 */
export function handleWheel(
	e: WheelEvent,
	context: MouseHandlerContext
): void {
	e.preventDefault();
	const { canvas } = context;
	if (!canvas) return;
	
	const rect = canvas.getBoundingClientRect();
	const canvasX = e.clientX - rect.left;
	const canvasY = e.clientY - rect.top;
	const delta = -e.deltaY * 0.001;
	// Zoom towards mouse position
	canvasStore.zoom(delta, canvasX, canvasY);
}

// Helper types and functions

interface ClickedNode {
	node: PatternNode;
	isRoot: boolean;
	patternId: string | null;
	trackId: string | null;
	instrumentId?: string | null;
	track?: Track;
	instrument?: Instrument;
}

function findClickedNode(
	e: MouseEvent,
	context: MouseHandlerContext
): ClickedNode | null {
	const { project, patternId, pattern, canvas, viewport } = context;
	if (!project || !canvas) return null;
	
	const rect = canvas.getBoundingClientRect();
	const canvasX = e.clientX - rect.left;
	const canvasY = e.clientY - rect.top;
	const [wx, wy] = viewport.screenToWorld(canvasX, canvasY);
	
	// Search in all standalone instruments first (they take priority for clicking)
	for (const instrument of project.standaloneInstruments || []) {
		const result = findNodeAtPosition(instrument.patternTree, wx, wy, 0, null, instrument.id);
		if (result) {
			return {
				node: result.node,
				isRoot: result.isRoot,
				patternId: null,
				trackId: instrument.id,
				track: instrument
			};
		}
	}
	
	// If no track node clicked and we're in pattern editor mode, also check all instruments in the pattern
	if (patternId && pattern) {
		const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
			? pattern.instruments
			: [];
		
		for (const instrument of patternInstruments) {
			const result = findNodeAtPosition(instrument.patternTree, wx, wy, 0, patternId, null, instrument.id);
			if (result) {
				return {
					node: result.node,
					isRoot: result.isRoot,
					patternId,
					trackId: null,
					instrumentId: instrument.id,
					instrument
				};
			}
		}
	}
	
	return null;
}

export interface PendingPositionUpdate {
	patternId: string | null;
	trackId: string | null;
	patternTree: PatternNode;
	instrumentId?: string | null;
}

function handleNodeDrag(
	e: MouseEvent,
	context: MouseHandlerContext,
	dragState: DragState
): PendingPositionUpdate | null {
	const { canvas, viewport, project, patternId, pattern } = context;
	if (!dragState.draggedNode || !canvas) return null;
	
	// Calculate offset in world coordinates
	const rect = canvas.getBoundingClientRect();
	const canvasX = e.clientX - rect.left;
	const canvasY = e.clientY - rect.top;
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
	// This allows smooth dragging while only creating one history entry when dropped
	if (dragState.draggedNode.patternId) {
		// Update the instrument in the pattern
		if (dragState.draggedNode.instrumentId) {
			projectStore.updatePatternInstrument(dragState.draggedNode.patternId, dragState.draggedNode.instrumentId, { patternTree: newTree }, true);
		} else {
			// Legacy: update pattern directly
			projectStore.updatePattern(dragState.draggedNode.patternId, { patternTree: newTree }, true);
		}
		return {
			patternId: dragState.draggedNode.patternId,
			trackId: null,
			patternTree: newTree,
			instrumentId: dragState.draggedNode.instrumentId
		};
	} else if (dragState.draggedNode.trackId) {
		// Update immediately with skipHistory=true to avoid undo entries during drag
		projectStore.updateStandaloneInstrument(dragState.draggedNode.trackId, { patternTree: newTree }, true);
		return {
			patternId: null,
			trackId: dragState.draggedNode.trackId,
			patternTree: newTree
		};
	}
	
	return null;
}

function updateSelectionFromBox(
	selectionBox: SelectionBox,
	context: MouseHandlerContext
): void {
	const { project, patternId, pattern, viewport } = context;
	if (!project) return;
	
	const [startWx, startWy] = viewport.screenToWorld(selectionBox.startX, selectionBox.startY);
	const [endWx, endWy] = viewport.screenToWorld(selectionBox.endX, selectionBox.endY);
	
	const boxLeft = Math.min(startWx, endWx);
	const boxRight = Math.max(startWx, endWx);
	const boxTop = Math.min(startWy, endWy);
	const boxBottom = Math.max(startWy, endWy);
	
	const selectedNodes = new Set<string>();
	let selectedTrackId: string | null = null;
	let selectedPatternId: string | null = null;
	let selectedInstrumentId: string | null = null;
	let hasRootNode = false;
	
	const nodeToTrackId = new Map<string, string>();
	const nodeToPatternId = new Map<string, string>();
	const nodeToInstrumentId = new Map<string, string>();
	
	// Find all nodes within the selection box - search standalone instruments first
	for (const instrument of project.standaloneInstruments || []) {
		const nodesBefore = selectedNodes.size;
		const result = findNodesInBox(boxLeft, boxRight, boxTop, boxBottom, instrument.patternTree, 0, instrument.id);
		for (const nodeId of result.selectedNodes) {
			selectedNodes.add(nodeId);
		}
		result.nodeToTrackId.forEach((id, nodeId) => nodeToTrackId.set(nodeId, id));
		if (result.hasRootNode) hasRootNode = true;
		
		// If we found nodes from this instrument, set it as the selected instrument (use first instrument found)
		if (selectedNodes.size > nodesBefore && !selectedTrackId) {
			selectedTrackId = instrument.id;
		}
	}
	
	// Also search all instruments in pattern if in pattern editor mode
	if (patternId && pattern) {
		const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
			? pattern.instruments
			: [];
		
		for (const instrument of patternInstruments) {
			const nodesBefore = selectedNodes.size;
			const result = findNodesInBox(boxLeft, boxRight, boxTop, boxBottom, instrument.patternTree, 0, null, patternId, instrument.id);
			for (const nodeId of result.selectedNodes) {
				selectedNodes.add(nodeId);
			}
			result.nodeToPatternId.forEach((id, nodeId) => nodeToPatternId.set(nodeId, id));
			result.nodeToInstrumentId.forEach((id, nodeId) => nodeToInstrumentId.set(nodeId, id));
			if (result.hasRootNode) hasRootNode = true;
			
			// If we found nodes from this instrument, set it as the selected pattern/instrument (use first found)
			if (selectedNodes.size > nodesBefore && !selectedPatternId) {
				selectedPatternId = patternId;
				selectedInstrumentId = instrument.id;
			}
		}
	}
	
	// If we have nodes from multiple sources, prefer standalone instruments over patterns
	if (selectedNodes.size > 0) {
		// If we have nodes from standalone instruments, prioritize instrument selection
		if (selectedTrackId) {
			selectedPatternId = null;
			selectedInstrumentId = null;
		} else if (selectedPatternId && selectedInstrumentId) {
			// If we have nodes from patterns, check if all nodes are from the same instrument
			const instrumentIds = Array.from(selectedNodes)
				.map(nodeId => nodeToInstrumentId.get(nodeId))
				.filter(id => id !== undefined);
			
			// If all nodes are from the same instrument, use that instrument
			if (instrumentIds.length > 0 && instrumentIds.every(id => id === instrumentIds[0])) {
				selectedInstrumentId = instrumentIds[0] || null;
			} else {
				// Mixed instruments - use first one found
				selectedInstrumentId = instrumentIds[0] || null;
			}
		}
	}
	
	// Update selection
	if (selectedNodes.size > 0) {
		selectionStore.selectMultipleNodes(selectedNodes, selectedTrackId, hasRootNode, selectedPatternId, selectedInstrumentId);
	} else {
		// Clear selection if no nodes in box
		selectionStore.clearSelection();
	}
}

