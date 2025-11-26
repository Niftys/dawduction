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
				return {
					selectedNodes: newSelectedNodes,
					selectedTrackId: trackId,
					selectedPatternId: patternId,
					selectedInstrumentId: instrumentId,
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

