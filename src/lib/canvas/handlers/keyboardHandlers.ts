/**
 * Keyboard Event Handlers for Canvas
 * Handles keyboard shortcuts like Delete/Backspace for node deletion
 */

import { projectStore } from '$lib/stores/projectStore';
import { selectionStore } from '$lib/stores/selectionStore';
import { updateEnginePatternTree, createUpdateContext } from '$lib/utils/patternTreeUpdater';
import type { Pattern, Instrument, PatternNode } from '$lib/types/pattern';
import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';

export interface KeyboardHandlerContext {
	project: any;
	patternId: string | null;
	pattern: Pattern | null;
	selectionState: any;
	engine: EngineWorklet | null;
}

/**
 * Handles keyboard events for the canvas
 */
export function handleCanvasKeyboard(
	e: KeyboardEvent,
	context: KeyboardHandlerContext
): void {
	if (e.key === 'Delete' || e.key === 'Backspace') {
		handleDeleteKey(e, context);
	} else if (e.key === 'a' || e.key === 'A') {
		// Only handle if not typing in an input field
		const target = e.target as HTMLElement;
		if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
			handleAddChildKey(e, context);
		}
	}
}

/**
 * Handles Delete/Backspace key for node deletion
 */
function handleDeleteKey(
	e: KeyboardEvent,
	context: KeyboardHandlerContext
): void {
	const { project, patternId, pattern, selectionState, engine } = context;
	
	if (!selectionState || selectionState.selectedNodes.size === 0 || !project) {
		return;
	}
	
	// Handle pattern deletion
	if (patternId && selectionState.selectedPatternId === patternId) {
		handlePatternNodeDeletion(context);
		return;
	}
	
	// Handle standalone instrument deletion
	if (selectionState.selectedTrackId) {
		handleTrackNodeDeletion(context);
		return;
	}
}

/**
 * Handles deletion of nodes in a pattern instrument
 */
function handlePatternNodeDeletion(context: KeyboardHandlerContext): void {
	const { patternId, pattern, selectionState, engine } = context;
	
	const instrumentId = selectionState.selectedInstrumentId;
	const patternInstruments = pattern?.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
		? pattern.instruments
		: [];
	
	const selectedInstrument = instrumentId 
		? patternInstruments.find((inst: Instrument) => inst.id === instrumentId)
		: patternInstruments[0];
	
	if (!selectedInstrument || !patternId) return;
	
	for (const nodeId of selectionState.selectedNodes) {
		// Check if this is the root node
		if (selectedInstrument.patternTree.id === nodeId) {
			// Delete the entire instrument
			projectStore.removePatternInstrument(patternId, selectedInstrument.id);
			// Remove track from engine without stopping playback
			if (engine) {
				const patternTrackId = `__pattern_${patternId}_${selectedInstrument.id}`;
				engine.removeTrack(patternTrackId);
			}
			// Clear selection and return early since instrument is gone
			selectionStore.clearSelection();
			return;
		} else {
			// Delete node and its children
			projectStore.deletePatternNode(patternId, nodeId, selectedInstrument.id);
		}
	}
	
	// Update pattern tree in engine for real-time audio updates BEFORE clearing selection
	updateEnginePatternTree(engine, createUpdateContext({
		patternId,
		instrumentId,
		selection: selectionState
	}));
	
	selectionStore.clearSelection();
}

/**
 * Handles deletion of nodes in a standalone instrument
 */
function handleTrackNodeDeletion(context: KeyboardHandlerContext): void {
	const { project, selectionState, engine } = context;
	
		const instrument = project.standaloneInstruments?.find((i: any) => i.id === selectionState.selectedTrackId);
	if (!instrument) return;
	
	const instrumentId = selectionState.selectedTrackId;
	
	for (const nodeId of selectionState.selectedNodes) {
		// Check if this is the root node
		if (instrument.patternTree.id === nodeId) {
			// Delete entire standalone instrument
			projectStore.removeStandaloneInstrument(instrumentId);
			// Remove track from engine without stopping playback
			if (engine) {
				engine.removeTrack(instrumentId);
			}
		} else {
			// Delete node and its children
			projectStore.deleteNode(instrumentId, nodeId);
		}
	}
	
	// Update pattern tree in engine for real-time audio updates BEFORE clearing selection
	// Only update if instrument still exists (wasn't deleted)
	if (instrument.patternTree.id !== Array.from(selectionState.selectedNodes)[0] || project.standaloneInstruments?.find((i: any) => i.id === instrumentId)) {
		updateEnginePatternTree(engine, createUpdateContext({
			trackId: instrumentId,
			selection: selectionState
		}));
	}
	
	selectionStore.clearSelection();
}

/**
 * Handles 'A' key for adding a child node
 */
function handleAddChildKey(
	e: KeyboardEvent,
	context: KeyboardHandlerContext
): void {
	const { project, patternId, pattern, selectionState, engine } = context;
	
	if (!selectionState || selectionState.selectedNodes.size === 0 || !project) {
		return;
	}
	
	e.preventDefault();
	
	// Get the first selected node ID
	const selectedNodeId = Array.from(selectionState.selectedNodes)[0];
	
	// Find the node in the tree
	let targetNode: PatternNode | null = null;
	let foundPatternId: string | null = null;
	let foundTrackId: string | null = null;
	let foundInstrumentId: string | null = null;
	
	// Helper to find node by ID in a tree
	const findNodeInTree = (node: PatternNode, targetId: string): PatternNode | null => {
		if (node.id === targetId) return node;
		for (const child of node.children) {
			const found = findNodeInTree(child, targetId);
			if (found) return found;
		}
		return null;
	};
	
	// Search in pattern instruments if in pattern editor
	if (patternId && pattern) {
		const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
			? pattern.instruments
			: [];
		
		for (const instrument of patternInstruments) {
			const node = findNodeInTree(instrument.patternTree, selectedNodeId);
			if (node) {
				targetNode = node;
				foundPatternId = patternId;
				foundInstrumentId = instrument.id;
				break;
			}
		}
	}
	
	// Search in standalone instruments if not found in pattern
	if (!targetNode) {
		for (const instrument of project.standaloneInstruments || []) {
			const node = findNodeInTree(instrument.patternTree, selectedNodeId);
			if (node) {
				targetNode = node;
				foundTrackId = instrument.id;
				break;
			}
		}
	}
	
	if (!targetNode) return;
	
	// Add child using the same logic as context menu
	if (foundPatternId) {
		projectStore.addPatternChildNode(foundPatternId, targetNode.id, 1, foundInstrumentId);
	} else if (foundTrackId) {
		projectStore.addChildNode(foundTrackId, targetNode.id, 1);
	}
	
	// Update pattern tree in engine for real-time audio updates
	updateEnginePatternTree(engine, createUpdateContext({
		patternId: foundPatternId,
		trackId: foundTrackId,
		instrumentId: foundInstrumentId,
		selection: selectionState
	}));
}

