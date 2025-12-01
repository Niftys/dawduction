import { writable } from 'svelte/store';
import type { PatternNode } from '$lib/types/pattern';

function createSelectionStore() {
	const { subscribe, set, update } = writable<{
		selectedNodes: Set<string>;
		selectedTrackId: string | null;
		selectedPatternId: string | null; // For pattern editor mode
		selectedInstrumentId: string | null; // Which instrument within a pattern is selected
		selectedNodeId: string | null;
		isRoot: boolean;
	}>({
		selectedNodes: new Set(),
		selectedTrackId: null,
		selectedPatternId: null,
		selectedInstrumentId: null,
		selectedNodeId: null,
		isRoot: false
	});

	return {
		subscribe,
		selectNode: (nodeId: string, trackId: string | null, isRoot: boolean, multiSelect = false, patternId: string | null = null, instrumentId: string | null = null) => {
			update((state) => {
				const newSelectedNodes = multiSelect
					? new Set(state.selectedNodes)
					: new Set<string>();
				newSelectedNodes.add(nodeId);
				
				// When multiselecting, preserve existing track/pattern/instrument IDs if they're already set
				// This allows selecting nodes from multiple instruments without breaking the selection
				let finalTrackId = trackId;
				let finalPatternId = patternId;
				let finalInstrumentId = instrumentId;
				
				if (multiSelect && state.selectedNodes.size > 0) {
					// If we already have a selection, check if the new node is from a different source
					const isDifferentSource = 
						state.selectedTrackId !== trackId ||
						state.selectedPatternId !== patternId ||
						state.selectedInstrumentId !== instrumentId;
					
					// If it's from a different source, preserve the existing IDs to maintain selection context
					// This allows multiselect across instruments while keeping the first instrument's context
					if (isDifferentSource) {
						finalTrackId = state.selectedTrackId;
						finalPatternId = state.selectedPatternId;
						finalInstrumentId = state.selectedInstrumentId;
					}
				}
				
				return {
					selectedNodes: newSelectedNodes,
					selectedTrackId: finalTrackId,
					selectedPatternId: finalPatternId,
					selectedInstrumentId: finalInstrumentId,
					selectedNodeId: nodeId,
					isRoot
				};
			});
		},
		selectMultipleNodes: (nodeIds: Set<string>, trackId: string | null, isRoot: boolean = false, patternId: string | null = null, instrumentId: string | null = null) => {
			update((state) => {
				// Replace selection with new box selection
				const newSelectedNodes = new Set(nodeIds);
				
				return {
					selectedNodes: newSelectedNodes,
					selectedTrackId: trackId,
					selectedPatternId: patternId,
					selectedInstrumentId: instrumentId,
					selectedNodeId: newSelectedNodes.size === 1 ? Array.from(newSelectedNodes)[0] : null,
					isRoot
				};
			});
		},
		clearSelection: () => {
			set({
				selectedNodes: new Set(),
				selectedTrackId: null,
				selectedPatternId: null,
				selectedInstrumentId: null,
				selectedNodeId: null,
				isRoot: false
			});
		},
		isSelected: (nodeId: string) => {
			let selected = false;
			subscribe((state) => {
				selected = state.selectedNodes.has(nodeId);
			})();
			return selected;
		}
	};
}

export const selectionStore = createSelectionStore();

