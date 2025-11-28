import { writable } from 'svelte/store';
import type { StandaloneInstrument, PatternNode, Pattern, Instrument } from '$lib/types/pattern';
import type { Effect, Envelope, TimelineEffect, TimelineEnvelope } from '$lib/types/effects';

// Export types from centralized location
export type { Project, Timeline, TimelineTrack, TimelineClip } from './projectStore.types';
export { cloneProject, deepCopySettings } from './projectStore.helpers';

// Import types
import type { Project, TimelineTrack, TimelineClip } from './projectStore.types';

// Import modules
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
	
	// Deep clone project for history
	const cloneProject = (project: Project | null): Project | null => {
		if (!project) return null;
		return JSON.parse(JSON.stringify(project));
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
			} else {
				console.warn('Failed to clone project for history', currentProject);
			}
		} else {
			console.warn('Cannot save to history: invalid project', currentProject);
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
		/**
		 * Create a new INSTRUMENT (legacy name: "track")
		 * Creates a generated synth with a pattern tree structure.
		 * This is an Instrument that goes into patterns' canvas or exists standalone.
		 * 
		 * Structure: Root (4 beats) - Level 1 (4 beats) - Level 2 (4 subdivisions per beat)
		 * Creates default 4-4-1 tree structure (4/4 time with 16th notes)
		 */
		createNewStandaloneInstrument: (projectId: string, instrumentType: string = 'kick'): StandaloneInstrument => {
			// Create root node with division 4 (4 beats total)
			const rootX = 400 + Math.random() * 200;
			const rootY = 200 + Math.random() * 100; // Start higher up
			
			const rootNode: PatternNode = {
				id: crypto.randomUUID(),
				division: 4, // 4 beats total
				x: rootX,
				y: rootY,
				children: []
			};
			
			// Create 4 child nodes, each representing 1 beat
			const childSpacing = 200; // Increased spacing to prevent overlap
			const childStartX = rootX - (childSpacing * 1.5); // Center 4 children under root
			const childY = rootY + 200; // Increased vertical spacing
			
			for (let i = 0; i < 4; i++) {
				const childX = childStartX + (i * childSpacing);
				
				const childNode: PatternNode = {
					id: crypto.randomUUID(),
					division: 1, // Each beat is 1 beat
					x: childX,
					y: childY,
					children: [],
					velocity: 1.0, // Default velocity for child nodes (100%)
					pitch: 60 // Default pitch (Middle C)
				};
				
				// Each beat has 4 subdivisions (16th notes), equally spaced within that beat
				const grandchildSpacing = 40; // Increased spacing
				const grandchildStartX = childX - (grandchildSpacing * 1.5);
				const grandchildY = childY + 150; // Increased vertical spacing
				
				for (let j = 0; j < 4; j++) {
					const grandchildX = grandchildStartX + (j * grandchildSpacing);
					
					childNode.children.push({
						id: crypto.randomUUID(),
						division: 1, // Each subdivision
						x: grandchildX,
						y: grandchildY,
						children: [],
						velocity: childNode.velocity !== undefined ? childNode.velocity : 1.0, // Inherit from parent or default
						pitch: childNode.pitch !== undefined ? childNode.pitch : 60 // Inherit from parent or default
					});
				}
				
				rootNode.children.push(childNode);
			}

			const instrumentDefaults = {
				kick: { color: '#00ffff', settings: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 0.15 } },
				snare: { color: '#ff00ff', settings: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.1 } },
				hihat: { color: '#ffff00', settings: { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.01 } },
				clap: { color: '#ff6600', settings: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.05 } },
				tom: { color: '#00ff00', settings: { attack: 0.01, decay: 0.4, sustain: 0.0, release: 0.1 } },
				cymbal: { color: '#ff0066', settings: { attack: 0.01, decay: 0.5, sustain: 0.0, release: 0.2 } },
				shaker: { color: '#6600ff', settings: { attack: 0.01, decay: 0.3, sustain: 0.0, release: 0.1 } },
				rimshot: { color: '#ff9900', settings: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.05 } },
				subtractive: { color: '#00ffcc', settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, osc1Type: 'saw', osc2Type: 'saw', osc2Detune: 0, filterCutoff: 5000, filterResonance: 0.5 } },
				fm: { color: '#cc00ff', settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, operators: [{ frequency: 1, amplitude: 1, waveform: 'sine' }] } },
				wavetable: { color: '#ffcc00', settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3 } },
				supersaw: { color: '#ff3366', settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, numOscillators: 7, detune: 0.1, spread: 0.5, filterCutoff: 8000, filterResonance: 0.5, lfoRate: 0, lfoAmount: 0 } },
				pluck: { color: '#66ff99', settings: { attack: 0.01, decay: 0.3, sustain: 0.0, release: 0.4, damping: 0.96 } },
				bass: { color: '#0066ff', settings: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, osc1Type: 'saw', subLevel: 0.6, saturation: 0.3, filterCutoff: 2000, filterResonance: 0.3 } }
			};
			
			const defaults = instrumentDefaults[instrumentType as keyof typeof instrumentDefaults] || instrumentDefaults.kick;

			return {
				id: crypto.randomUUID(),
				projectId,
				instrumentType,
				patternTree: rootNode,
				settings: { ...defaults.settings },
				volume: 1.0,
				pan: 0.0,
				color: defaults.color,
				mute: false,
				solo: false
			};
		},
		/**
		 * Add a standalone instrument to project
		 * Adds a generated synth with pattern tree to the project's standalone instruments list.
		 */
		addStandaloneInstrument: (instrument: StandaloneInstrument) => {
			updateFn((project) => {
				if (!project) {
					console.warn('Cannot add standalone instrument: no project exists');
					return project;
				}
				// Ensure standaloneInstruments array exists
				if (!Array.isArray(project.standaloneInstruments)) {
					project.standaloneInstruments = [];
				}
				// If this is the first instrument, set it as the base meter
				const isFirstInstrument = project.standaloneInstruments.length === 0;
				const newProject = {
					...project,
					standaloneInstruments: [...project.standaloneInstruments, instrument],
					baseMeterTrackId: isFirstInstrument ? instrument.id : project.baseMeterTrackId
				};
				console.log('Adding standalone instrument:', { instrumentId: instrument.id, totalInstruments: newProject.standaloneInstruments.length });
				return newProject;
			});
		},
		// Update standalone instrument
		updateStandaloneInstrument: (instrumentId: string, updates: Partial<StandaloneInstrument>, skipHistory = false) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) =>
						instrument.id === instrumentId ? { ...instrument, ...updates } : instrument
					)
				};
			}, skipHistory);
			
			// No longer need to dispatch trackUpdated for temporary pattern tracks
			// Patterns are now edited directly, not via temporary tracks
		},
		// Remove standalone instrument
		removeStandaloneInstrument: (instrumentId: string) => {
			updateFn((project) => {
				if (!project) return project;
				// If removing the base meter instrument, reset to first instrument
				let baseMeterTrackId = project.baseMeterTrackId;
				if (baseMeterTrackId === instrumentId) {
					const remainingInstruments = project.standaloneInstruments.filter((instrument) => instrument.id !== instrumentId);
					baseMeterTrackId = remainingInstruments[0]?.id;
				}
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.filter((instrument) => instrument.id !== instrumentId),
					baseMeterTrackId
				};
			});
		},
		// Set the base meter track (determines pattern loop length)
		setBaseMeterTrack: (instrumentId: string | null) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					baseMeterTrackId: instrumentId || project.standaloneInstruments[0]?.id
				};
			});
		},
		/**
		 * Copy a standalone instrument
		 * Duplicates an instrument with new IDs, copying instrument type, settings, and pattern structure.
		 */
		copyStandaloneInstrument: (instrumentId: string) => {
			updateFn((project) => {
				if (!project) return project;
				const instrumentToCopy = project.standaloneInstruments.find((i) => i.id === instrumentId);
				if (!instrumentToCopy) return project;
				
				// Find the index of the instrument to copy
				const instrumentIndex = project.standaloneInstruments.findIndex((i) => i.id === instrumentId);
				
				// Deep clone the pattern tree with new IDs
				const deepCopyPatternTree = (node: PatternNode): PatternNode => {
					return JSON.parse(JSON.stringify(node));
				};
				const clonedTree = deepCopyPatternTree(instrumentToCopy.patternTree);
				
				// Generate new IDs for all nodes in the cloned tree
				const regenerateIds = (node: PatternNode): PatternNode => ({
					...node,
					id: crypto.randomUUID(),
					children: node.children.map(regenerateIds)
				});
				const newTree = regenerateIds(clonedTree);
				
				// Offset position so it doesn't overlap
				newTree.x = (instrumentToCopy.patternTree.x ?? 0) + 300;
				newTree.y = (instrumentToCopy.patternTree.y ?? 0) + 100;
				
				// Deep copy settings and instrumentSettings
				const deepCopySettings = (settings: Record<string, any>): Record<string, any> => {
					return JSON.parse(JSON.stringify(settings));
				};
				
				// Create new instrument with all properties copied: instrument type, settings, and pattern structure
				const newInstrument: StandaloneInstrument = {
					id: crypto.randomUUID(),
					projectId: instrumentToCopy.projectId,
					instrumentType: instrumentToCopy.instrumentType, // Copy instrument type
					patternTree: newTree, // Copy pattern structure
					settings: deepCopySettings(instrumentToCopy.settings || {}), // Copy instrument settings
					instrumentSettings: instrumentToCopy.instrumentSettings 
						? Object.keys(instrumentToCopy.instrumentSettings).reduce((acc, key) => {
							acc[key] = deepCopySettings(instrumentToCopy.instrumentSettings![key]);
							return acc;
						}, {} as Record<string, Record<string, any>>)
						: undefined, // Copy all instrument settings
					volume: instrumentToCopy.volume,
					pan: instrumentToCopy.pan,
					color: instrumentToCopy.color,
					mute: instrumentToCopy.mute,
					solo: instrumentToCopy.solo
				};
				
				// Insert the new instrument right after the original
				const newInstruments = [...project.standaloneInstruments];
				newInstruments.splice(instrumentIndex + 1, 0, newInstrument);
				
				return {
					...project,
					standaloneInstruments: newInstruments
				};
			});
		},
		// Add child node to a parent node in a standalone instrument
		addChildNode: (instrumentId: string, parentNodeId: string, division: number = 1) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) => {
						if (instrument.id !== instrumentId) return instrument;
						
						const addChild = (node: PatternNode): PatternNode => {
							if (node.id === parentNodeId) {
								// Create new child first
								// Inherit velocity and pitch from parent if they exist
								const newChild: PatternNode = {
									id: crypto.randomUUID(),
									division,
									x: 0, // Will be calculated below
									y: 0, // Will be calculated below
									children: [],
									velocity: node.velocity !== undefined ? node.velocity : 1.0, // Inherit from parent or default to 100%
									pitch: node.pitch !== undefined ? node.pitch : 60 // Inherit from parent or default to Middle C
								};
								
								// Now we have all children (existing + new)
								const allChildren = [...node.children, newChild];
								const totalChildren = allChildren.length;
								
								// Use a larger radius (about double) to space nodes further
								const radius = 160;
								
								// Start from bottom center and spread outward slightly
								// Use a small spread angle (about 60 degrees total) so nodes are close together
								const spreadAngle = Math.PI / 3; // 60 degrees total spread
								const centerAngle = Math.PI / 2; // Bottom center (90 degrees)
								const startAngle = centerAngle - (spreadAngle / 2); // Start from left side of arc
								
								// Reposition ALL children evenly distributed
								const repositionedChildren = allChildren.map((child, index) => {
									let angle: number;
									if (totalChildren === 1) {
										// Single child goes in the center
										angle = centerAngle;
									} else {
										// Distribute evenly: first child on right, last on left (counter-clockwise)
										// index 0 -> rightmost, index (totalChildren-1) -> leftmost
										const ratio = index / (totalChildren - 1);
										angle = startAngle + spreadAngle * (1 - ratio);
									}
									
									const x = (node.x || 0) + Math.cos(angle) * radius;
									const y = (node.y || 0) + Math.sin(angle) * radius;
									
									if (child.id === newChild.id) {
										const actualRatio = totalChildren > 1 ? index / (totalChildren - 1) : 0;
										console.log('[NodePositioning] New child node', {
											index,
											totalChildren,
											ratio: actualRatio.toFixed(3),
											angle: (angle * 180 / Math.PI).toFixed(1) + '°',
											startAngle: (startAngle * 180 / Math.PI).toFixed(1) + '°',
											spreadAngle: (spreadAngle * 180 / Math.PI).toFixed(1) + '°',
											formula: `startAngle(${(startAngle * 180 / Math.PI).toFixed(1)}°) + spreadAngle(${(spreadAngle * 180 / Math.PI).toFixed(1)}°) * (1 - ratio(${actualRatio.toFixed(3)})) = ${(angle * 180 / Math.PI).toFixed(1)}°`,
											x: x.toFixed(1),
											y: y.toFixed(1),
											radius
										});
									}
									
									return {
										...child,
										x,
										y
									};
								});
								
								// Append at the end so children play in creation order
								return {
									...node,
									children: repositionedChildren
								};
							}
							return {
								...node,
								children: node.children.map(addChild)
							};
						};
						
						return {
							...instrument,
							patternTree: addChild(instrument.patternTree)
						};
					})
				};
			});
		},
		// Delete node and all its children
		deleteNode: (instrumentId: string, nodeId: string) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) => {
						if (instrument.id !== instrumentId) return instrument;
						
						const deleteNodeRecursive = (node: PatternNode): PatternNode | null => {
							if (node.id === nodeId) return null; // Delete this node
							return {
								...node,
								children: node.children
									.map(deleteNodeRecursive)
									.filter((n): n is PatternNode => n !== null)
							};
						};
						
						const newTree = deleteNodeRecursive(instrument.patternTree);
						if (!newTree) return instrument; // Can't delete root
						
						return {
							...instrument,
							patternTree: newTree
						};
					})
				};
			});
		},
		// Update node division
		updateNodeDivision: (instrumentId: string, nodeId: string, division: number) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) => {
						if (instrument.id !== instrumentId) return instrument;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								return { ...node, division };
							}
							return {
								...node,
								children: node.children.map(updateNode)
							};
						};
						
						return {
							...instrument,
							patternTree: updateNode(instrument.patternTree)
						};
					})
				};
			});
		},
		// Update node pitch (and inherit to all children)
		updateNodePitch: (instrumentId: string, nodeId: string, pitch: number) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) => {
						if (instrument.id !== instrumentId) return instrument;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								// Update this node and all its children recursively
								const updateChildren = (n: PatternNode): PatternNode => ({
									...n,
									pitch,
									children: n.children.map(updateChildren)
								});
								return updateChildren(node);
							}
							return {
								...node,
								children: node.children.map(updateNode)
							};
						};
						
						return {
							...instrument,
							patternTree: updateNode(instrument.patternTree)
						};
					})
				};
			});
		},
		// Update node velocity (and inherit to all children)
		updateNodeVelocity: (instrumentId: string, nodeId: string, velocity: number) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) => {
						if (instrument.id !== instrumentId) return instrument;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								// Update this node and all its children recursively
								const updateChildren = (n: PatternNode): PatternNode => ({
									...n,
									velocity,
									children: n.children.map(updateChildren)
								});
								return updateChildren(node);
							}
							return {
								...node,
								children: node.children.map(updateNode)
							};
						};
						
						return {
							...instrument,
							patternTree: updateNode(instrument.patternTree)
						};
					})
				};
			});
		},
		// Timeline management
		addTimelineClip: (clip: TimelineClip) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				const updatedTimeline = {
					...timeline,
					clips: [...(timeline.clips || []), clip],
					totalLength: Math.max(timeline.totalLength, clip.startBeat + clip.duration)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineClip: (clipId: string, updates: Partial<TimelineClip>) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					clips: project.timeline.clips.map((clip: TimelineClip) =>
						clip.id === clipId ? { ...clip, ...updates } : clip
					),
					totalLength: project.timeline.totalLength
				};
				// Recalculate total length
				if (updates.startBeat !== undefined || updates.duration !== undefined) {
					const maxEnd = Math.max(
						...updatedTimeline.clips.map((c: TimelineClip) => c.startBeat + c.duration),
						updatedTimeline.totalLength
					);
					updatedTimeline.totalLength = maxEnd;
				}
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		deleteTimelineClip: (clipId: string) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					clips: (project.timeline.clips || []).filter((clip: TimelineClip) => clip.id !== clipId)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineLength: (length: number) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				return {
					...project,
					timeline: {
						...timeline,
						totalLength: Math.max(length, timeline.totalLength)
					}
				};
			});
		},
		// Timeline effect management
		addTimelineEffect: (effect: TimelineEffect) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				const updatedTimeline = {
					...timeline,
					effects: [...(timeline.effects || []), effect],
					totalLength: Math.max(timeline.totalLength, effect.startBeat + effect.duration)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineEffect: (effectId: string, updates: Partial<TimelineEffect>) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					effects: (project.timeline.effects || []).map((effect: TimelineEffect) =>
						effect.id === effectId ? { ...effect, ...updates } : effect
					),
					totalLength: project.timeline.totalLength
				};
				// Recalculate total length
				if (updates.startBeat !== undefined || updates.duration !== undefined) {
					const maxEnd = Math.max(
						...(updatedTimeline.effects || []).map((e: TimelineEffect) => e.startBeat + e.duration),
						updatedTimeline.totalLength
					);
					updatedTimeline.totalLength = maxEnd;
				}
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		deleteTimelineEffect: (effectId: string) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					effects: (project.timeline.effects || []).filter((effect: TimelineEffect) => effect.id !== effectId)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		// Timeline envelope management
		addTimelineEnvelope: (envelope: TimelineEnvelope) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				const updatedTimeline = {
					...timeline,
					envelopes: [...(timeline.envelopes || []), envelope],
					totalLength: Math.max(timeline.totalLength, envelope.startBeat + envelope.duration)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineEnvelope: (envelopeId: string, updates: Partial<TimelineEnvelope>) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					envelopes: (project.timeline.envelopes || []).map((envelope: TimelineEnvelope) =>
						envelope.id === envelopeId ? { ...envelope, ...updates } : envelope
					),
					totalLength: project.timeline.totalLength
				};
				// Recalculate total length
				if (updates.startBeat !== undefined || updates.duration !== undefined) {
					const maxEnd = Math.max(
						...(updatedTimeline.envelopes || []).map((e: TimelineEnvelope) => e.startBeat + e.duration),
						updatedTimeline.totalLength
					);
					updatedTimeline.totalLength = maxEnd;
				}
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		deleteTimelineEnvelope: (envelopeId: string) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					envelopes: (project.timeline.envelopes || []).filter((envelope: TimelineEnvelope) => envelope.id !== envelopeId)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		/**
		 * Create a TRACK (TimelineTrack) - the actual track in arrangement view
		 * Tracks are where patterns, effects, and envelopes are manipulated to create songs.
		 * Tracks exist ONLY in the arrangement view timeline editor.
		 */
		createTimelineTrack: (type: 'pattern' | 'effect' | 'envelope', patternId?: string, name?: string): TimelineTrack => {
			const now = Date.now();
			const defaultNames = {
				pattern: 'Pattern Track',
				effect: 'Effect Track',
				envelope: 'Envelope Track'
			};
			
			// Default colors for each track type
			const defaultColors = {
				pattern: '#7ab8ff', // Blue
				effect: '#9b59b6', // Purple
				envelope: '#2ecc71' // Green
			};
			
			// Get order number based on track type
			const project = getCurrent();
			const existingTracks: TimelineTrack[] = project?.timeline?.tracks || [];
			
			let order: number;
			if (type === 'pattern') {
				// Pattern tracks go at the top - use negative or low positive numbers
				const patternTracks = existingTracks.filter((t: TimelineTrack) => t.type === 'pattern');
				if (patternTracks.length === 0) {
					order = 0; // First pattern track
				} else {
					const minPatternOrder = Math.min(...patternTracks.map((t: TimelineTrack) => t.order));
					order = minPatternOrder - 1; // Insert at the top
				}
			} else {
				// Effect and envelope tracks go at the bottom - use high positive numbers
				const maxOrder = existingTracks.length > 0 
					? Math.max(...existingTracks.map((t: TimelineTrack) => t.order))
					: 999; // Start at 1000 if no tracks exist
				order = maxOrder + 1; // Insert at the bottom
			}
			
			return {
				id: crypto.randomUUID(),
				type,
				name: name || `${defaultNames[type]} ${existingTracks.filter((t: TimelineTrack) => t.type === type).length + 1}`,
				patternId,
				order,
				volume: 1.0, // Default volume
				mute: false, // Default mute state
				solo: false, // Default solo state
				color: defaultColors[type], // Default color based on track type
				createdAt: now
			};
		},
		addTimelineTrack: (track: TimelineTrack) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				const updatedTimeline = {
					...timeline,
					tracks: [...(timeline.tracks || []), track]
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		deleteTimelineTrack: (trackId: string) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				// Also remove all clips/effects/envelopes that belong to this track
				const updatedTimeline = {
					...project.timeline,
					tracks: (project.timeline.tracks || []).filter((track: TimelineTrack) => track.id !== trackId),
					clips: (project.timeline.clips || []).filter((clip: TimelineClip) => clip.trackId !== trackId),
					effects: (project.timeline.effects || []).filter((effect: TimelineEffect) => effect.trackId !== trackId),
					envelopes: (project.timeline.envelopes || []).filter((envelope: TimelineEnvelope) => envelope.trackId !== trackId)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineTrack: (trackId: string, updates: Partial<TimelineTrack>) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					tracks: (project.timeline.tracks || []).map((track: TimelineTrack) =>
						track.id === trackId ? { ...track, ...updates } : track
					) as TimelineTrack[]
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		/**
		 * Helper: Convert legacy pattern (single instrument) to new format (instruments array)
		 */
		normalizePattern: (pattern: Pattern): Pattern => {
			// If already has instruments array, return as-is
			if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
				return pattern;
			}
			
			// Convert legacy format to new format
			if (pattern.instrumentType && pattern.patternTree) {
				const instrument: Instrument = {
				id: crypto.randomUUID(),
					instrumentType: pattern.instrumentType,
					patternTree: pattern.patternTree,
					settings: pattern.settings || {},
					instrumentSettings: pattern.instrumentSettings,
					color: pattern.color || '#7ab8ff',
					volume: pattern.volume ?? 1.0,
					pan: pattern.pan ?? 0.0,
					mute: pattern.mute,
					solo: pattern.solo
				};
				
				return {
					...pattern,
					instruments: [instrument],
					// Keep legacy fields for backward compatibility during transition
					instrumentType: pattern.instrumentType,
					patternTree: pattern.patternTree,
					settings: pattern.settings,
					instrumentSettings: pattern.instrumentSettings,
					color: pattern.color,
					volume: pattern.volume,
					pan: pattern.pan
				};
					}
					
			// No instruments, create empty array
			return {
				...pattern,
				instruments: []
			};
		},
		/**
		 * Get all instruments from a pattern (handles both new and legacy formats)
		 */
		getPatternInstruments: (pattern: Pattern): Instrument[] => {
			if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
				return pattern.instruments;
			}
			
			// Legacy format: convert single instrument
			if (pattern.instrumentType && pattern.patternTree) {
				return [{
					id: crypto.randomUUID(),
					instrumentType: pattern.instrumentType,
					patternTree: pattern.patternTree,
					settings: pattern.settings || {},
					instrumentSettings: pattern.instrumentSettings,
					color: pattern.color || '#7ab8ff',
					volume: pattern.volume ?? 1.0,
					pan: pattern.pan ?? 0.0,
					mute: pattern.mute,
					solo: pattern.solo
				}];
			}
			
			return [];
		},
		/**
		 * Create a new PATTERN (container for multiple instruments)
		 * Creates a pattern that can store multiple instruments that play simultaneously.
		 */
		createPattern: (projectId: string, name: string, instrumentType?: string, withDefaultKick?: boolean): Pattern => {
			// Note: instrumentType and withDefaultKick parameters are deprecated
			// Patterns now always start empty - users add instruments via InstrumentSelector
			const now = Date.now();
			
			return {
				id: crypto.randomUUID(),
				projectId,
				name,
				baseMeter: 4,
				mute: false,
				solo: false,
				createdAt: now,
				updatedAt: now,
				// Start with empty instruments array - no default instruments
				instruments: [],
				// LEGACY: Keep single instrument fields empty for backward compatibility
				instrumentType: '',
				patternTree: {
					id: crypto.randomUUID(),
					division: 4,
					x: 0,
					y: 0,
					children: []
				},
				settings: {},
				instrumentSettings: undefined,
				color: '#7ab8ff',
				volume: 1.0,
				pan: 0.0
			};
		},
		addPattern: (pattern: Pattern) => {
			updateFn((project) => {
				if (!project) {
					console.warn('Cannot add pattern: no project exists');
					return project;
				}
				if (!Array.isArray(project.patterns)) {
					project.patterns = [];
				}
				
				// Deep copy the pattern to ensure it's independent from any other patterns
				const deepCopyPatternTree = (node: PatternNode): PatternNode => {
					return {
						...node,
						children: node.children.map(child => deepCopyPatternTree(child))
					};
				};
				
				// Deep copy instruments array if present
				const deepCopyInstruments = (instruments: Instrument[]): Instrument[] => {
					return instruments.map(inst => ({
						...inst,
						patternTree: deepCopyPatternTree(inst.patternTree),
						settings: { ...inst.settings },
						instrumentSettings: inst.instrumentSettings ? Object.keys(inst.instrumentSettings).reduce((acc, key) => {
							acc[key] = { ...inst.instrumentSettings![key] };
							return acc;
						}, {} as Record<string, Record<string, any>>) : undefined
					}));
				};
				
				const independentPattern: Pattern = {
					...pattern,
					// Deep copy instruments array if present
					instruments: pattern.instruments && Array.isArray(pattern.instruments) 
						? deepCopyInstruments(pattern.instruments)
						: undefined,
					// Legacy: deep copy patternTree if present (for backward compatibility)
					patternTree: pattern.patternTree ? deepCopyPatternTree(pattern.patternTree) : undefined,
					settings: { ...pattern.settings },
					instrumentSettings: pattern.instrumentSettings ? Object.keys(pattern.instrumentSettings).reduce((acc, key) => {
						acc[key] = { ...pattern.instrumentSettings![key] };
						return acc;
					}, {} as Record<string, Record<string, any>>) : undefined
				};
				
				return {
					...project,
					patterns: [...project.patterns, independentPattern]
				};
			});
		},
		updatePattern: (patternId: string, updates: Partial<Pattern>, skipHistory = false) => {
			updateFn((project) => {
				if (!project) return project;
				
				// Deep copy patternTree if it's being updated to prevent reference sharing
				const deepCopyPatternTree = (node: PatternNode): PatternNode => {
				return {
						...node,
						children: node.children.map(child => deepCopyPatternTree(child))
					};
				};
				
				// Deep copy instruments array if it's being updated
				const deepCopyInstruments = (instruments: Instrument[]): Instrument[] => {
					return instruments.map(inst => ({
						...inst,
						patternTree: deepCopyPatternTree(inst.patternTree),
						settings: { ...inst.settings },
						instrumentSettings: inst.instrumentSettings ? Object.keys(inst.instrumentSettings).reduce((acc, key) => {
							acc[key] = { ...inst.instrumentSettings![key] };
							return acc;
						}, {} as Record<string, Record<string, any>>) : undefined
					}));
				};
				
				const processedUpdates = { ...updates };
				if (updates.patternTree) {
					processedUpdates.patternTree = deepCopyPatternTree(updates.patternTree);
				}
				if (updates.instruments && Array.isArray(updates.instruments)) {
					processedUpdates.instruments = deepCopyInstruments(updates.instruments);
				}
				// Deep copy settings and instrumentSettings to prevent reference sharing
				if (updates.settings) {
					processedUpdates.settings = { ...updates.settings };
				}
				if (updates.instrumentSettings) {
					processedUpdates.instrumentSettings = Object.keys(updates.instrumentSettings).reduce((acc, key) => {
						acc[key] = { ...updates.instrumentSettings![key] };
						return acc;
					}, {} as Record<string, Record<string, any>>);
				}
				
				const updatedPatterns = (project.patterns || []).map((pattern) =>
						pattern.id === patternId 
						? { ...pattern, ...processedUpdates, updatedAt: Date.now() }
							: pattern
				);
				return {
					...project,
					patterns: updatedPatterns
				};
			}, skipHistory);
		},
		/**
		 * Add an instrument to a pattern
		 * When editing a pattern, this adds a new instrument to the pattern's instruments array.
		 * All instruments in a pattern play simultaneously.
		 */
		addPatternInstrument: (patternId: string, instrument: Instrument) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						// Normalize pattern to ensure it has instruments array
						const normalized = projectStore.normalizePattern(pattern);
						const instruments = [...(normalized.instruments || []), instrument];
						
						return {
							...normalized,
							instruments,
							updatedAt: Date.now()
						};
					})
				};
			});
		},
		/**
		 * Remove an instrument from a pattern
		 */
		removePatternInstrument: (patternId: string, instrumentId: string) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						// Normalize pattern to ensure it has instruments array
						const normalized = projectStore.normalizePattern(pattern);
						const instruments = (normalized.instruments || []).filter(inst => inst.id !== instrumentId);
						
						return {
							...normalized,
							instruments,
							updatedAt: Date.now()
						};
					})
				};
			});
		},
		/**
		 * Update an instrument in a pattern
		 */
		updatePatternInstrument: (patternId: string, instrumentId: string, updates: Partial<Instrument>, skipHistory = false) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						// Normalize pattern to ensure it has instruments array
						const normalized = projectStore.normalizePattern(pattern);
						const instruments = (normalized.instruments || []).map(inst => 
							inst.id === instrumentId ? { ...inst, ...updates } : inst
						);
						
						return {
							...normalized,
							instruments,
							updatedAt: Date.now()
						};
					})
				};
			}, skipHistory);
		},
		/**
		 * Copy a single instrument within a pattern
		 * Creates a duplicate instrument in the same pattern with all properties copied
		 */
		copyPatternInstrument: (patternId: string, instrumentId: string) => {
			updateFn((project) => {
				if (!project) return project;
				const pattern = (project.patterns || []).find((p: Pattern) => p.id === patternId);
				if (!pattern) return project;
				
				// Get all instruments from pattern
				const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
					? pattern.instruments
					: (pattern.instrumentType && pattern.patternTree ? [{
						id: pattern.id,
						instrumentType: pattern.instrumentType,
						patternTree: pattern.patternTree,
						settings: pattern.settings || {},
						instrumentSettings: pattern.instrumentSettings,
						color: pattern.color || '#7ab8ff',
						volume: pattern.volume ?? 1.0,
						pan: pattern.pan ?? 0.0,
						mute: pattern.mute,
						solo: pattern.solo
					}] : []);
				
				// Find the instrument to copy
				const instrumentToCopy = patternInstruments.find((inst: Instrument) => inst.id === instrumentId);
				if (!instrumentToCopy) return project;
				
				// Deep clone helper functions
				const deepCopyPatternTree = (node: PatternNode): PatternNode => {
					return JSON.parse(JSON.stringify(node));
				};
				
				const regenerateIds = (node: PatternNode): PatternNode => ({
					...node,
					id: crypto.randomUUID(),
					children: node.children.map(regenerateIds)
				});
				
				const deepCopySettings = (settings: Record<string, any>): Record<string, any> => {
					return JSON.parse(JSON.stringify(settings));
				};
				
				// Deep clone the pattern tree with new IDs
				const clonedTree = deepCopyPatternTree(instrumentToCopy.patternTree);
				const newTree = regenerateIds(clonedTree);
				
				// Recursively offset all nodes to preserve spatial relationships
				const offsetX = 300;
				const offsetY = 100;
				const offsetTree = (node: PatternNode): PatternNode => ({
					...node,
					x: (node.x ?? 0) + offsetX,
					y: (node.y ?? 0) + offsetY,
					children: node.children.map(offsetTree)
				});
				const offsetNewTree = offsetTree(newTree);
				
				// Create new instrument with all properties copied
				const newInstrument: Instrument = {
					id: crypto.randomUUID(),
					instrumentType: instrumentToCopy.instrumentType,
					patternTree: offsetNewTree,
					settings: deepCopySettings(instrumentToCopy.settings || {}),
					instrumentSettings: instrumentToCopy.instrumentSettings 
						? Object.keys(instrumentToCopy.instrumentSettings).reduce((acc, key) => {
							acc[key] = deepCopySettings(instrumentToCopy.instrumentSettings![key]);
							return acc;
						}, {} as Record<string, Record<string, any>>)
						: undefined,
					color: instrumentToCopy.color,
					volume: instrumentToCopy.volume,
					pan: instrumentToCopy.pan,
					mute: instrumentToCopy.mute ?? false,
					solo: instrumentToCopy.solo ?? false
				};
				
				// Add the new instrument to the pattern
				return {
					...project,
					patterns: (project.patterns || []).map((p: Pattern) => {
						if (p.id !== patternId) return p;
						
						// Normalize pattern to ensure it has instruments array
						const normalized = projectStore.normalizePattern(p);
						const instruments = [...(normalized.instruments || []), newInstrument];
						
						return {
							...normalized,
							instruments,
							updatedAt: Date.now()
						};
					})
				};
			});
		},
		/**
		 * Copy an INSTRUMENT stored as Pattern (legacy name: "copyPattern")
		 * Creates a new standalone instrument (track) in arrangement view with the same instrument properties.
		 * This allows copying a pattern's instrument to the canvas for editing.
		 */
		copyPattern: (patternId: string) => {
			updateFn((project) => {
				if (!project) return project;
				const patternToCopy = (project.patterns || []).find((p: Pattern) => p.id === patternId);
				if (!patternToCopy) return project;
				
				// Get all instruments from pattern
				const patternInstruments = patternToCopy.instruments && Array.isArray(patternToCopy.instruments) && patternToCopy.instruments.length > 0
					? patternToCopy.instruments
					: (patternToCopy.instrumentType && patternToCopy.patternTree ? [{
						id: patternToCopy.id,
						instrumentType: patternToCopy.instrumentType,
						patternTree: patternToCopy.patternTree,
						settings: patternToCopy.settings || {},
						instrumentSettings: patternToCopy.instrumentSettings,
						color: patternToCopy.color || '#7ab8ff',
						volume: patternToCopy.volume ?? 1.0,
						pan: patternToCopy.pan ?? 0.0,
						mute: patternToCopy.mute,
						solo: patternToCopy.solo
					}] : []);
				
				// Deep clone helper functions
				const deepCopyPatternTree = (node: PatternNode): PatternNode => {
					return JSON.parse(JSON.stringify(node));
				};
				
				const regenerateIds = (node: PatternNode): PatternNode => ({
					...node,
					id: crypto.randomUUID(),
					children: node.children.map(regenerateIds)
				});
				
				const deepCopySettings = (settings: Record<string, any>): Record<string, any> => {
					return JSON.parse(JSON.stringify(settings));
				};
				
				// Create a new standalone instrument for each instrument in the pattern
				const newInstruments: StandaloneInstrument[] = patternInstruments.map((instrument, index) => {
					const clonedTree = deepCopyPatternTree(instrument.patternTree);
					const newTree = regenerateIds(clonedTree);
					
					// Offset position so instruments don't overlap
					newTree.x = (instrument.patternTree.x ?? 0) + (index * 300);
					newTree.y = (instrument.patternTree.y ?? 0) + (index * 100);
					
					return {
					id: crypto.randomUUID(),
					projectId: patternToCopy.projectId,
						instrumentType: instrument.instrumentType,
						patternTree: newTree,
						settings: deepCopySettings(instrument.settings || {}),
						instrumentSettings: instrument.instrumentSettings 
							? Object.keys(instrument.instrumentSettings).reduce((acc, key) => {
								acc[key] = deepCopySettings(instrument.instrumentSettings![key]);
							return acc;
						}, {} as Record<string, Record<string, any>>)
							: undefined,
						volume: instrument.volume,
						pan: instrument.pan,
						color: instrument.color,
					mute: false,
					solo: false
				};
				});
				
				// Ensure standaloneInstruments array exists
				if (!Array.isArray(project.standaloneInstruments)) {
					project.standaloneInstruments = [];
				}
				
				// Add all new instruments to the project
				const updatedInstruments = [...project.standaloneInstruments, ...newInstruments];
				
				// If this is the first instrument, set it as the base meter
				const isFirstInstrument = project.standaloneInstruments.length === 0;
				
				return {
					...project,
					standaloneInstruments: updatedInstruments,
					baseMeterTrackId: isFirstInstrument ? newInstruments[0]?.id : project.baseMeterTrackId
				};
			});
		},
		deletePattern: (patternId: string) => {
			updateFn((project) => {
				if (!project) return project;
				// Also remove any timeline clips that reference this pattern
				const timeline = project.timeline;
				if (timeline) {
					timeline.clips = (timeline.clips || []).filter((clip) => clip.patternId !== patternId);
				}
				return {
					...project,
					patterns: (project.patterns || []).filter((p: Pattern) => p.id !== patternId),
					timeline: timeline
				};
			});
		},
		getPattern: (patternId: string): Pattern | null => {
			let project: Project | null = null;
			subscribe((p: Project | null) => (project = p))();
			if (!project) return null;
			return ((project as Project).patterns || []).find((p: Pattern) => p.id === patternId) || null;
		},
		// Pattern node operations (similar to track node operations)
		updatePatternTree: (patternId: string, patternTree: PatternNode, instrumentId?: string | null) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						// If instrumentId is provided, update that instrument's tree
						if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
							const instruments = pattern.instruments.map(inst =>
								inst.id === instrumentId ? { ...inst, patternTree } : inst
							);
							return { ...pattern, instruments, updatedAt: Date.now() };
						}
						
						// Legacy: update pattern directly (for backward compatibility during transition)
						return { ...pattern, patternTree, updatedAt: Date.now() };
					})
				};
			});
		},
		updatePatternNodeDivision: (patternId: string, nodeId: string, division: number, instrumentId?: string | null) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								return { ...node, division };
							}
							return {
								...node,
								children: node.children.map(updateNode)
							};
						};
						
						// If instrumentId is provided, update that instrument's tree
						if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
							const instruments = pattern.instruments.map(inst =>
								inst.id === instrumentId 
									? { ...inst, patternTree: updateNode(inst.patternTree) }
									: inst
							);
							return { ...pattern, instruments, updatedAt: Date.now() };
						}
						
						// Legacy: update pattern directly
						return {
							...pattern,
							patternTree: updateNode(pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] }),
							updatedAt: Date.now()
						};
					})
				};
			});
		},
		updatePatternNodePitch: (patternId: string, nodeId: string, pitch: number, instrumentId?: string | null) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								// Update this node and all its children recursively
								const updateChildren = (n: PatternNode): PatternNode => ({
									...n,
									pitch,
									children: n.children.map(updateChildren)
								});
								return updateChildren(node);
							}
							return {
								...node,
								children: node.children.map(updateNode)
							};
						};
						
						// If instrumentId is provided, update that instrument's tree
						if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
							const instruments = pattern.instruments.map(inst =>
								inst.id === instrumentId 
									? { ...inst, patternTree: updateNode(inst.patternTree) }
									: inst
							);
							return { ...pattern, instruments, updatedAt: Date.now() };
						}
						
						// Legacy: update pattern directly
						return {
							...pattern,
							patternTree: updateNode(pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] }),
							updatedAt: Date.now()
						};
					})
				};
			});
		},
		updatePatternNodeVelocity: (patternId: string, nodeId: string, velocity: number, instrumentId?: string | null) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								// Update this node and all its children recursively
								const updateChildren = (n: PatternNode): PatternNode => ({
									...n,
									velocity,
									children: n.children.map(updateChildren)
								});
								return updateChildren(node);
							}
							return {
								...node,
								children: node.children.map(updateNode)
							};
						};
						
						// If instrumentId is provided, update that instrument's tree
						if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
							const instruments = pattern.instruments.map(inst =>
								inst.id === instrumentId 
									? { ...inst, patternTree: updateNode(inst.patternTree) }
									: inst
							);
							return { ...pattern, instruments, updatedAt: Date.now() };
						}
						
						// Legacy: update pattern directly
						return {
							...pattern,
							patternTree: updateNode(pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] }),
							updatedAt: Date.now()
						};
					})
				};
			});
		},
		addPatternChildNode: (patternId: string, parentNodeId: string, division: number = 1, instrumentId?: string | null) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						const addChild = (node: PatternNode): PatternNode => {
							if (node.id === parentNodeId) {
								// Create new child first
								// Inherit velocity and pitch from parent if they exist
								const newChild: PatternNode = {
									id: crypto.randomUUID(),
									division,
									x: 0, // Will be calculated below
									y: 0, // Will be calculated below
									children: [],
									velocity: node.velocity !== undefined ? node.velocity : 1.0, // Inherit from parent or default to 100%
									pitch: node.pitch !== undefined ? node.pitch : 60 // Inherit from parent or default to Middle C
								};
								
								// Now we have all children (existing + new)
								const allChildren = [...node.children, newChild];
								const totalChildren = allChildren.length;
								
								// Use a larger radius (about double) to space nodes further
								const radius = 160;
								
								// Start from bottom center and spread outward slightly
								// Use a small spread angle (about 60 degrees total) so nodes are close together
								const spreadAngle = Math.PI / 3; // 60 degrees total spread
								const centerAngle = Math.PI / 2; // Bottom center (90 degrees)
								const startAngle = centerAngle - (spreadAngle / 2); // Start from left side of arc
								
								// Reposition ALL children evenly distributed
								const repositionedChildren = allChildren.map((child, index) => {
									let angle: number;
									if (totalChildren === 1) {
										// Single child goes in the center
										angle = centerAngle;
									} else {
										// Distribute evenly: first child on right, last on left (counter-clockwise)
										// index 0 -> rightmost, index (totalChildren-1) -> leftmost
										const ratio = index / (totalChildren - 1);
										angle = startAngle + spreadAngle * (1 - ratio);
									}
									
									const x = (node.x || 0) + Math.cos(angle) * radius;
									const y = (node.y || 0) + Math.sin(angle) * radius;
									
									if (child.id === newChild.id) {
										const actualRatio = totalChildren > 1 ? index / (totalChildren - 1) : 0;
										console.log('[NodePositioning] New child node', {
											index,
											totalChildren,
											ratio: actualRatio.toFixed(3),
											angle: (angle * 180 / Math.PI).toFixed(1) + '°',
											startAngle: (startAngle * 180 / Math.PI).toFixed(1) + '°',
											spreadAngle: (spreadAngle * 180 / Math.PI).toFixed(1) + '°',
											formula: `startAngle(${(startAngle * 180 / Math.PI).toFixed(1)}°) + spreadAngle(${(spreadAngle * 180 / Math.PI).toFixed(1)}°) * (1 - ratio(${actualRatio.toFixed(3)})) = ${(angle * 180 / Math.PI).toFixed(1)}°`,
											x: x.toFixed(1),
											y: y.toFixed(1),
											radius
										});
									}
									
									return {
										...child,
										x,
										y
									};
								});
								
								return {
									...node,
									children: repositionedChildren
								};
							}
							return {
								...node,
								children: node.children.map(addChild)
							};
						};
						
						// If instrumentId is provided, update that instrument's tree
						if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
							const instruments = pattern.instruments.map(inst =>
								inst.id === instrumentId 
									? { ...inst, patternTree: addChild(inst.patternTree) }
									: inst
							);
							return { ...pattern, instruments, updatedAt: Date.now() };
						}
						
						// Legacy: update pattern directly
						return {
							...pattern,
							patternTree: addChild(pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] }),
							updatedAt: Date.now()
						};
					})
				};
			});
		},
		deletePatternNode: (patternId: string, nodeId: string, instrumentId?: string | null) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					patterns: (project.patterns || []).map((pattern) => {
						if (pattern.id !== patternId) return pattern;
						
						const deleteNode = (node: PatternNode): PatternNode | null => {
							if (node.id === nodeId) {
								return null; // Delete this node
							}
							return {
								...node,
								children: node.children.map(deleteNode).filter((n): n is PatternNode => n !== null)
							};
						};
						
						// If instrumentId is provided, update that instrument's tree
						if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
							const instruments = pattern.instruments.map(inst => {
								if (inst.id !== instrumentId) return inst;
								const newTree = deleteNode(inst.patternTree);
						if (!newTree) {
									// If root was deleted, create a new empty root
									return {
										...inst,
										patternTree: {
											id: crypto.randomUUID(),
											division: pattern.baseMeter || 4,
											x: 0,
											y: 0,
											children: []
										}
									};
								}
								return { ...inst, patternTree: newTree };
							});
							return { ...pattern, instruments, updatedAt: Date.now() };
						}
						
						// Legacy: update pattern directly
						const patternTree = pattern.patternTree || { id: crypto.randomUUID(), division: 4, children: [] };
						const newTree = deleteNode(patternTree);
						if (!newTree) {
							// If root was deleted, create a new empty root
							return {
								...pattern,
								patternTree: {
									id: crypto.randomUUID(),
									division: pattern.baseMeter || 4,
									x: 0,
									y: 0,
									children: []
								},
								updatedAt: Date.now()
							};
						}
						
						return {
							...pattern,
							patternTree: newTree,
							updatedAt: Date.now()
						};
					})
				};
			});
		},
		// Effect management - delegated to module
		...createEffectsModule(updateFn, getCurrent),
		// Envelope management - delegated to module
		...createEnvelopesModule(updateFn, getCurrent),
		// Automation management - delegated to module
		...createAutomationModule(updateFn, getCurrent)
	};
}

export const projectStore = createProjectStore();

