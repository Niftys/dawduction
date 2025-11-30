import type { Project } from '../projectStore.types';
import type { Pattern, PatternNode, Instrument, StandaloneInstrument } from '$lib/types/pattern';
import { normalizePattern, getPatternInstruments } from '$lib/utils/patternUtils';
import type { UpdateFn, GetCurrent } from './types';

/**
 * Pattern Management Module
 * Handles pattern creation, updates, deletion, and pattern node operations
 */

export function createPatternsModule(updateFn: UpdateFn, getCurrent: GetCurrent) {
	return {
		/**
		 * Helper: Convert legacy pattern (single instrument) to new format (instruments array)
		 * Delegates to shared utility function
		 */
		normalizePattern,
		/**
		 * Get all instruments from a pattern (handles both new and legacy formats)
		 * Delegates to shared utility function
		 */
		getPatternInstruments,
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
						}, {} as Record<string, Record<string, unknown>>) : undefined
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
					}, {} as Record<string, Record<string, unknown>>) : undefined
				};
				
				return {
					...project,
					patterns: [...project.patterns, independentPattern]
				};
			});
		},
		/**
		 * Duplicate a pattern, creating a new pattern with all the same properties
		 */
		duplicatePattern: (patternId: string): Pattern | null => {
			let duplicatedPattern: Pattern | null = null;
			
			updateFn((project) => {
				if (!project) return project;
				
				const patternToCopy = (project.patterns || []).find((p: Pattern) => p.id === patternId);
				if (!patternToCopy) return project;
				
				// Deep copy helper functions
				const deepCopyPatternTree = (node: PatternNode): PatternNode => {
					return JSON.parse(JSON.stringify(node));
				};
				
				const regenerateIds = (node: PatternNode): PatternNode => ({
					...node,
					id: crypto.randomUUID(),
					children: node.children.map(regenerateIds)
				});
				
				const deepCopySettings = (settings: Record<string, unknown>): Record<string, unknown> => {
					return JSON.parse(JSON.stringify(settings));
				};
				
				// Get all instruments from pattern (handles both new and legacy formats)
				const patternInstruments = getPatternInstruments(patternToCopy);
				
				// Deep copy all instruments with new IDs
				const duplicatedInstruments: Instrument[] = patternInstruments.map((instrument) => {
					const clonedTree = deepCopyPatternTree(instrument.patternTree);
					const newTree = regenerateIds(clonedTree);
					
					return {
						id: crypto.randomUUID(),
						instrumentType: instrument.instrumentType,
						patternTree: newTree,
						settings: deepCopySettings(instrument.settings || {}),
						instrumentSettings: instrument.instrumentSettings ? Object.keys(instrument.instrumentSettings).reduce((acc, key) => {
							acc[key] = deepCopySettings(instrument.instrumentSettings![key]);
							return acc;
						}, {} as Record<string, Record<string, unknown>>) : undefined,
						color: instrument.color,
						volume: instrument.volume,
						pan: instrument.pan,
						mute: instrument.mute ?? false,
						solo: instrument.solo ?? false
					};
				});
				
				// Create the duplicated pattern
				const now = Date.now();
				duplicatedPattern = {
					id: crypto.randomUUID(),
					projectId: patternToCopy.projectId,
					name: `${patternToCopy.name} (Copy)`,
					baseMeter: patternToCopy.baseMeter,
					mute: patternToCopy.mute ?? false,
					solo: patternToCopy.solo ?? false,
					createdAt: now,
					updatedAt: now,
					instruments: duplicatedInstruments,
					// Legacy fields for backward compatibility
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
				
				// Add the duplicated pattern to the project
				return {
					...project,
					patterns: [...(project.patterns || []), duplicatedPattern]
				};
			});
			
			return duplicatedPattern;
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
						}, {} as Record<string, Record<string, unknown>>) : undefined
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
					}, {} as Record<string, Record<string, unknown>>);
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
						const normalized = normalizePattern(pattern);
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
						const normalized = normalizePattern(pattern);
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
						const normalized = normalizePattern(pattern);
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
				const patternInstruments = getPatternInstruments(pattern);
				
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
				
				const deepCopySettings = (settings: Record<string, unknown>): Record<string, unknown> => {
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
						}, {} as Record<string, Record<string, unknown>>)
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
						const normalized = normalizePattern(p);
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
				const patternInstruments = getPatternInstruments(patternToCopy);
				
				// Deep clone helper functions
				const deepCopyPatternTree = (node: PatternNode): PatternNode => {
					return JSON.parse(JSON.stringify(node));
				};
				
				const regenerateIds = (node: PatternNode): PatternNode => ({
					...node,
					id: crypto.randomUUID(),
					children: node.children.map(regenerateIds)
				});
				
				const deepCopySettings = (settings: Record<string, unknown>): Record<string, unknown> => {
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
							}, {} as Record<string, Record<string, unknown>>)
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
			const project = getCurrent();
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
						
						// Helper to find a node in a tree
						const findNode = (node: PatternNode, targetId: string): PatternNode | null => {
							if (node.id === targetId) return node;
							for (const child of node.children) {
								const found = findNode(child, targetId);
								if (found) return found;
							}
							return null;
						};
						
						// Get the tree to search
						const getTree = (): PatternNode | null => {
							if (instrumentId && pattern.instruments && Array.isArray(pattern.instruments)) {
								const instrument = pattern.instruments.find(inst => inst.id === instrumentId);
								return instrument?.patternTree || null;
							}
							return pattern.patternTree || null;
						};
						
						const tree = getTree();
						const targetNode = tree ? findNode(tree, nodeId) : null;
						const oldPitch = targetNode?.pitch ?? 60; // Default to middle C if no pitch set
						const pitchDifference = pitch - oldPitch;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								// Update this node and transpose all its children recursively
								const transposeChildren = (n: PatternNode): PatternNode => {
									const newPitch = n.pitch !== undefined 
										? Math.max(0, Math.min(127, n.pitch + pitchDifference))
										: undefined;
									return {
										...n,
										pitch: n.id === nodeId ? pitch : newPitch,
										children: n.children.map(transposeChildren)
									};
								};
								return transposeChildren(node);
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
		}
	};
}

