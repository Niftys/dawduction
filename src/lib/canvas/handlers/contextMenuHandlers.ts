/**
 * Context Menu Handlers for Canvas
 * Handles right-click context menu actions (add child, delete, edit, copy)
 */

import { projectStore } from '$lib/stores/projectStore';
import { selectionStore } from '$lib/stores/selectionStore';
import { updateEnginePatternTree, createUpdateContext } from '$lib/utils/patternTreeUpdater';
import type { Pattern } from '$lib/types/pattern';
import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';

export interface ContextMenu {
	x: number;
	y: number;
	node: any;
	patternId: string | null;
	trackId: string | null;
	instrumentId?: string | null;
	isRoot: boolean;
}

export interface ContextActionContext {
	menu: ContextMenu;
	project: any;
	engine: EngineWorklet | null;
}

/**
 * Handles context menu actions (add child, delete, edit, copy)
 */
export function handleContextAction(
	event: CustomEvent,
	context: ContextActionContext
): { editingNode: any | null; editValue: string } {
	const { type } = event.detail;
	const { menu, project, engine } = context;
	
	if (!menu || !menu.node) {
		return { editingNode: null, editValue: '' };
	}
	
	const node = menu.node;
	
	switch (type) {
		case 'copy':
			handleCopy(menu);
			break;
		case 'addChild':
			handleAddChild(menu, node, engine);
			break;
		case 'delete':
			handleDelete(menu, node, project, engine);
			break;
		case 'edit':
			return {
				editingNode: {
					node,
					patternId: menu.patternId,
					trackId: menu.trackId,
					instrumentId: menu.instrumentId
				},
				editValue: node.division.toString()
			};
	}
	
	return { editingNode: null, editValue: '' };
}

/**
 * Handles copy action
 */
function handleCopy(menu: ContextMenu): void {
	if (menu.patternId && menu.isRoot) {
		// Copy pattern
		projectStore.copyPattern(menu.patternId);
		window.dispatchEvent(new CustomEvent('reloadProject'));
	} else if (menu.trackId && menu.isRoot) {
		// Copy track
		projectStore.copyTrack(menu.trackId);
		window.dispatchEvent(new CustomEvent('reloadProject'));
	}
}

/**
 * Handles add child action
 */
function handleAddChild(
	menu: ContextMenu,
	node: any,
	engine: EngineWorklet | null
): void {
	if (menu.patternId) {
		projectStore.addPatternChildNode(menu.patternId, node.id, 1, menu.instrumentId);
	} else if (menu.trackId) {
		projectStore.addChildNode(menu.trackId, node.id, 1);
	}
	
	// Update pattern tree in engine for real-time audio updates
	// Use a small delay to ensure store update completes
	setTimeout(() => {
		updateEnginePatternTree(engine, createUpdateContext({ menu }));
	}, 0);
}

/**
 * Handles delete action
 */
function handleDelete(
	menu: ContextMenu,
	node: any,
	project: any,
	engine: EngineWorklet | null
): void {
	let instrumentWasRemoved = false;
	
		if (menu.isRoot) {
		if (menu.patternId) {
			// If instrumentId is provided, remove that instrument from the pattern
			if (menu.instrumentId) {
				projectStore.removePatternInstrument(menu.patternId, menu.instrumentId);
				instrumentWasRemoved = true;
				// Remove track from engine without stopping playback
				if (engine) {
					const patternTrackId = `__pattern_${menu.patternId}_${menu.instrumentId}`;
					engine.removeTrack(patternTrackId);
				}
			} else {
				// If no instrumentId but we're in pattern editor, try to find which instrument this root belongs to
				const pattern = project?.patterns?.find((p: Pattern) => p.id === menu.patternId);
				if (pattern) {
					const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
						? pattern.instruments
						: [];
					
					// Find the instrument whose root node matches the clicked node
					const matchingInstrument = patternInstruments.find((inst: any) => inst.patternTree?.id === menu.node?.id);
					if (matchingInstrument) {
						// Remove the matching instrument
						projectStore.removePatternInstrument(menu.patternId, matchingInstrument.id);
						instrumentWasRemoved = true;
						// Remove track from engine without stopping playback
						if (engine) {
							const patternTrackId = `__pattern_${menu.patternId}_${matchingInstrument.id}`;
							engine.removeTrack(patternTrackId);
						}
					} else if (patternInstruments.length > 0) {
						// Fallback: remove the first instrument if we can't find a match
						projectStore.removePatternInstrument(menu.patternId, patternInstruments[0].id);
						instrumentWasRemoved = true;
						// Remove track from engine without stopping playback
						if (engine) {
							const patternTrackId = `__pattern_${menu.patternId}_${patternInstruments[0].id}`;
							engine.removeTrack(patternTrackId);
						}
					}
				}
			}
		} else if (menu.trackId) {
			projectStore.removeStandaloneInstrument(menu.trackId);
			// Remove track from engine without stopping playback
			if (engine) {
				engine.removeTrack(menu.trackId);
			}
		}
		selectionStore.clearSelection();
	} else {
		if (menu.patternId) {
			projectStore.deletePatternNode(menu.patternId, node.id, menu.instrumentId);
		} else if (menu.trackId) {
			projectStore.deleteNode(menu.trackId, node.id);
		}
		selectionStore.clearSelection();
	}
	
	// Update pattern tree in engine for real-time audio updates
	// (Only if we didn't remove an instrument - that's handled by reloadProject)
	if (!instrumentWasRemoved) {
		updateEnginePatternTree(engine, createUpdateContext({ menu }));
	}
}

