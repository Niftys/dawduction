import { writable } from 'svelte/store';
import type { Project } from './projectStore.types';
import { cloneProject } from './projectStore.helpers';

// Export types from centralized location
export type { Project, Timeline, TimelineTrack, TimelineClip } from './projectStore.types';
export { cloneProject, deepCopySettings } from './projectStore.helpers';

// Import modules
import { createInstrumentsModule } from './modules/instruments';
import { createPatternsModule } from './modules/patterns';
import { createTimelineModule } from './modules/timeline';
import { createEffectsModule } from './modules/effects';
import { createEnvelopesModule } from './modules/envelopes';
import { createAutomationModule } from './modules/automation';

function createProjectStore() {
	const { subscribe, set, update: svelteUpdate } = writable<Project | null>(null);
	
	// Undo/Redo history
	const MAX_HISTORY = 50;
	let history: Project[] = [];
	let historyIndex = -1;
	let isUndoRedo = false; // Flag to prevent saving history during undo/redo
	let lastSavedState: Project | null = null; // Track last saved state to avoid duplicates
	let isBatching = false; // Flag to batch operations (e.g., during slider drags)
	let batchInitialState: Project | null = null; // Initial state when batch started
	
	// Internal writable for undo/redo state changes (to trigger reactivity)
	const { subscribe: subscribeHistory, set: setHistory } = writable({ canUndo: false, canRedo: false });
	
	// Helper to update history state and notify subscribers
	const updateHistoryState = () => {
		// Can undo if we have at least 2 states and we're not at the first one
		const canUndo = history.length >= 2 && historyIndex > 0;
		// Can redo if we're not at the last state
		const canRedo = historyIndex < history.length - 1;
		setHistory({ canUndo, canRedo });
	};
	
	
	// Helper to get current project value without subscribing
	const getCurrent = (): Project | null => {
		let current: Project | null = null;
		subscribe((p) => (current = p))();
		return current;
	};
	
	// Helper to check if two projects are the same
	const areProjectsEqual = (a: Project | null, b: Project | null): boolean => {
		if (!a || !b) return a === b;
		return JSON.stringify(a) === JSON.stringify(b);
	};
	
	// Save current state to history before making changes
	const saveToHistory = (currentProject: Project | null, isInitial = false) => {
		if (isUndoRedo || !currentProject) return;
		
		// Remove any history after current index (when undoing then making new changes)
		if (!isInitial) {
			history = history.slice(0, historyIndex + 1);
		}
		
		// Add current state to history
		const cloned = cloneProject(currentProject);
		if (cloned) {
			history.push(cloned);
			historyIndex++;
			
			// Limit history size
			if (history.length > MAX_HISTORY) {
				history.shift();
				historyIndex--;
			}
		}
	};

	// Define update function first so it can be referenced by other methods
	const updateFn = (updater: (project: Project | null) => Project | null, skipHistory = false) => {
		if (isUndoRedo) {
			// During undo/redo, just apply the update without saving history
			svelteUpdate(updater);
			return;
		}
		
		// Skip history for operations like node position updates (moves)
		if (skipHistory) {
			svelteUpdate(updater);
			return;
		}
		
		let currentProject: Project | null = null;
		subscribe((p: Project | null) => (currentProject = p))();
		
		// If batching, only save history on the first update (initial state)
		// Subsequent updates during batching won't save to history
		if (isBatching) {
			// If this is the first update in the batch, save the initial state
			if (!batchInitialState && currentProject) {
				const cloned = cloneProject(currentProject);
				if (cloned && cloned.id) {
					batchInitialState = cloned;
					// Remove any history after current index
					history = history.slice(0, historyIndex + 1);
					history.push(cloned);
					historyIndex++;
					
					// Limit history size
					if (history.length > MAX_HISTORY) {
						history.shift();
						historyIndex--;
					}
					
					updateHistoryState();
				}
			}
			// Apply update without saving to history (we'll save final state in endBatch)
			svelteUpdate(updater);
			return;
		}
		
		// ALWAYS save current state before update - this is what we'll undo to
		// This ensures every action is captured, even rapid ones
		// Only save if we have a valid project (tracks can be empty array)
		if (currentProject) {
			const proj = currentProject as Project;
			// Ensure standaloneInstruments is an array if it's undefined
			if (!Array.isArray(proj.standaloneInstruments)) {
				proj.standaloneInstruments = [];
			}
			// Ensure effects and envelopes are arrays
			if (!Array.isArray(proj.effects)) {
				proj.effects = [];
			}
			if (!Array.isArray(proj.envelopes)) {
				proj.envelopes = [];
			}
			// Remove any history after current index (when undoing then making new changes)
			history = history.slice(0, historyIndex + 1);
			
			// Save current state to history BEFORE applying the update
			const cloned = cloneProject(currentProject);
			if (cloned && cloned.id) {
				// Ensure cloned standaloneInstruments is an array
				if (!Array.isArray(cloned.standaloneInstruments)) {
					cloned.standaloneInstruments = [];
				}
				history.push(cloned);
				historyIndex++;
				
				// Limit history size
				if (history.length > MAX_HISTORY) {
					history.shift();
					historyIndex--;
				}
				
				// Update history state
				updateHistoryState();
			}
		}
		
		// Apply the update using the underlying Svelte update
		let newProject: Project | null = null;
		svelteUpdate((project) => {
			newProject = updater(project);
			// Return the new project - let the updater function handle validation
			return newProject;
		});
		
		// Update lastSavedState to the NEW state (after update)
		// This is used for comparison, but we always save before updates anyway
		if (newProject && Array.isArray((newProject as Project).standaloneInstruments)) {
			lastSavedState = cloneProject(newProject);
		}
	};

	return {
		subscribe,
		subscribeHistory, // Expose history state subscription
		getCurrent, // Helper to get current value without subscribing
		startBatch: () => {
			// Start batching operations - saves initial state on first update
			if (!isBatching) {
				isBatching = true;
				batchInitialState = null;
			}
		},
		endBatch: () => {
			// End batching - saves final state to history
			if (isBatching) {
				isBatching = false;
				// Save final state to history
				let currentProject: Project | null = null;
				subscribe((p: Project | null) => (currentProject = p))();
				
				if (currentProject) {
					const proj = currentProject as Project;
					// Ensure arrays are valid
					if (!Array.isArray(proj.standaloneInstruments)) {
						proj.standaloneInstruments = [];
					}
					if (!Array.isArray(proj.effects)) {
						proj.effects = [];
					}
					if (!Array.isArray(proj.envelopes)) {
						proj.envelopes = [];
					}
					
					// Remove any history after current index
					history = history.slice(0, historyIndex + 1);
					
					// Save final state to history
					const cloned = cloneProject(currentProject);
					if (cloned && cloned.id) {
						// Ensure cloned standaloneInstruments is an array
						if (!Array.isArray(cloned.standaloneInstruments)) {
							cloned.standaloneInstruments = [];
						}
						history.push(cloned);
						historyIndex++;
						
						// Limit history size
						if (history.length > MAX_HISTORY) {
							history.shift();
							historyIndex--;
						}
						
						updateHistoryState();
					}
				}
				batchInitialState = null;
			}
		},
		set: (project: Project | null) => {
			// Only initialize history on first load, not during undo/redo
			// Only save valid projects to history
			if (!isUndoRedo && project && project.id && history.length === 0) {
				// Ensure standaloneInstruments is an array
				if (!Array.isArray(project.standaloneInstruments)) {
					project.standaloneInstruments = [];
				}
				const cloned = cloneProject(project);
				if (cloned && cloned.id) {
					// Ensure cloned standaloneInstruments is an array
					if (!Array.isArray(cloned.standaloneInstruments)) {
						cloned.standaloneInstruments = [];
					}
					history.push(cloned);
					historyIndex = 0;
					lastSavedState = cloned;
					updateHistoryState();
				}
			}
			// Always set the project (even if null, but we validate in undo/redo)
			set(project);
		},
		update: updateFn,
		undo: () => {
			// Safety check: ensure we have valid history
			if (history.length === 0) {
				return false;
			}
			
			// Can't undo if we're at the first state (index 0)
			// We need at least 2 states: current (historyIndex) and previous (historyIndex - 1)
			if (historyIndex <= 0 || history.length < 2) {
				return false;
			}
			
			isUndoRedo = true;
			historyIndex--;
			
			// Validate the state before restoring
			const previousState = history[historyIndex];
			if (!previousState || !previousState.id || !Array.isArray(previousState.standaloneInstruments)) {
				// Invalid state - try to find a valid state going backwards
				let foundValid = false;
				for (let i = historyIndex; i >= 0; i--) {
					const candidate = history[i];
					if (candidate && candidate.id && Array.isArray(candidate.standaloneInstruments)) {
						historyIndex = i;
						const cloned = cloneProject(candidate);
						if (cloned) {
							set(cloned);
							lastSavedState = cloned;
							foundValid = true;
							break;
						}
					}
				}
				
				if (!foundValid) {
					// No valid state found - restore to current index
					historyIndex++;
					isUndoRedo = false;
					updateHistoryState();
					return false;
				}
			} else {
				// Clone and restore the valid state
				const cloned = cloneProject(previousState);
				if (cloned && cloned.id && Array.isArray(cloned.standaloneInstruments)) {
					set(cloned);
					lastSavedState = cloned;
				} else {
					// Cloning failed or invalid - abort undo
					historyIndex++;
					isUndoRedo = false;
					updateHistoryState();
					return false;
				}
			}
			
			isUndoRedo = false;
			updateHistoryState();
			return true;
		},
		redo: () => {
			// Safety check: ensure we have valid history
			if (history.length === 0 || historyIndex >= history.length - 1) {
				return false;
			}
			
			isUndoRedo = true;
			historyIndex++;
			
			// Validate the state before restoring
			const nextState = history[historyIndex];
			if (!nextState || !nextState.id || !Array.isArray(nextState.standaloneInstruments)) {
				// Invalid state - try to find a valid state going forwards
				let foundValid = false;
				for (let i = historyIndex; i < history.length; i++) {
					const candidate = history[i];
					if (candidate && candidate.id && Array.isArray(candidate.standaloneInstruments)) {
						historyIndex = i;
						const cloned = cloneProject(candidate);
						if (cloned) {
							set(cloned);
							lastSavedState = cloned;
							foundValid = true;
							break;
						}
					}
				}
				
				if (!foundValid) {
					// No valid state found - restore to current index
					historyIndex--;
					isUndoRedo = false;
					updateHistoryState();
					return false;
				}
			} else {
				// Clone and restore the valid state
				const cloned = cloneProject(nextState);
				if (cloned && cloned.id && Array.isArray(cloned.standaloneInstruments)) {
					set(cloned);
					lastSavedState = cloned;
				} else {
					// Cloning failed or invalid - abort redo
					historyIndex--;
					isUndoRedo = false;
					updateHistoryState();
					return false;
				}
			}
			
			isUndoRedo = false;
			updateHistoryState();
			return true;
		},
		canUndo: () => {
			// Need at least 2 states in history to undo (current + previous)
			return history.length > 1 && historyIndex > 0;
		},
		canRedo: () => {
			// Can redo if we're not at the end of history
			return historyIndex < history.length - 1;
		},
		// Instrument management - delegated to module
		...createInstrumentsModule(updateFn, getCurrent),
		// Pattern management - delegated to module
		...createPatternsModule(updateFn, getCurrent),
		// Timeline management - delegated to module
		...createTimelineModule(updateFn, getCurrent),
		// Effect management - delegated to module
		...createEffectsModule(updateFn, getCurrent),
		// Envelope management - delegated to module
		...createEnvelopesModule(updateFn, getCurrent),
		// Automation management - delegated to module
		...createAutomationModule(updateFn, getCurrent)
	};
}

export const projectStore = createProjectStore();
