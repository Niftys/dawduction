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
			handleCopy(menu, engine);
			break;
		case 'addChild':
			handleAddChild(menu, node, engine);
			break;
		case 'delete':
			handleDelete(menu, node, project, engine);
			break;
		case 'edit':
			// Don't allow editing root node division
			if (menu.isRoot) {
				return { editingNode: null, editValue: '' };
			}
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
function handleCopy(menu: ContextMenu, engine: EngineWorklet | null): void {
	if (menu.patternId && menu.isRoot) {
		// If instrumentId is provided, copy just that instrument within the pattern
		if (menu.instrumentId) {
			const originalRootNodeId = menu.node?.id;
			projectStore.copyPatternInstrument(menu.patternId, menu.instrumentId);
			
			// After copying, select the new instrument and update the engine
			setTimeout(() => {
				// Get the updated project
				let currentProject: any = null;
				projectStore.subscribe((p) => (currentProject = p))();
				if (!currentProject) return;
				
				const pattern = currentProject.patterns?.find((p: Pattern) => p.id === menu.patternId);
				if (!pattern) return;
				
				// Get all instruments from pattern
				const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
					? pattern.instruments
					: [];
				
				// Find the new instrument (it will have a different root node ID than the original)
				const newInstrument = patternInstruments.find((inst: any) => 
					inst.patternTree?.id && inst.patternTree.id !== originalRootNodeId && inst.id !== menu.instrumentId
				);
				
				if (newInstrument) {
					// Select the new instrument
					selectionStore.selectNode(newInstrument.patternTree.id, null, true, false, menu.patternId, newInstrument.id);
					
					// Update the engine with the new instrument
					if (engine) {
						const patternTrackId = `__pattern_${menu.patternId}_${newInstrument.id}`;
						const trackForEngine = {
							id: patternTrackId,
							projectId: pattern.projectId,
							instrumentType: newInstrument.instrumentType,
							patternTree: newInstrument.patternTree,
							settings: newInstrument.settings || {},
							instrumentSettings: newInstrument.instrumentSettings,
							volume: newInstrument.volume ?? 1.0,
							pan: newInstrument.pan ?? 0.0,
							color: newInstrument.color,
							mute: newInstrument.mute ?? false,
							solo: newInstrument.solo ?? false
						};
						
						// Add the track to the engine - updateTrack will add it if it doesn't exist
						engine.updateTrack(patternTrackId, trackForEngine);
					}
				}
			}, 0);
			
			window.dispatchEvent(new CustomEvent('reloadProject'));
		} else {
			// Copy entire pattern (all instruments) to standalone instruments
			projectStore.copyPattern(menu.patternId);
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
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

