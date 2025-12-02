import type { Project } from '../projectStore.types';
import type { StandaloneInstrument, PatternNode } from '$lib/types/pattern';
import type { UpdateFn, GetCurrent } from './types';

/**
 * Standalone Instrument Management Module
 * Handles operations on standalone instruments (instruments on the canvas)
 */

export function createInstrumentsModule(updateFn: UpdateFn, getCurrent: GetCurrent) {
	return {
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
					pitch: 60, // Default pitch (Middle C)
					choke: 1.0 // Default choke (full length)
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
						pitch: childNode.pitch !== undefined ? childNode.pitch : 60, // Inherit from parent or default
						choke: childNode.choke !== undefined ? childNode.choke : 1.0 // Inherit from parent or default to full length
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
				// TR-808 wavetable defaults (matching synth constructors)
				tr808kick: { color: '#00ffff', settings: { attack: 0.001, decay: 4.0, sustain: 0.0, release: 0.5 } },
				tr808snare: { color: '#ff00ff', settings: { attack: 0.001, decay: 0.6, sustain: 0.0, release: 0.3 } },
				tr808hihat: { color: '#ffff00', settings: { attack: 0.001, decay: 0.5, sustain: 0.0, release: 0.2 } },
				tr808openhihat: { color: '#ffff00', settings: { attack: 0.001, decay: 1.5, sustain: 0.0, release: 0.5 } },
				tr808closedhihat: { color: '#ffff00', settings: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.1 } },
				tr808clap: { color: '#ff6600', settings: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.3 } },
				tr808lowtom: { color: '#00ff00', settings: { attack: 0.001, decay: 1.0, sustain: 0.0, release: 0.4 } },
				tr808midtom: { color: '#00ff00', settings: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.3 } },
				tr808hightom: { color: '#00ff00', settings: { attack: 0.001, decay: 0.6, sustain: 0.0, release: 0.2 } },
				tr808cymbal: { color: '#ff0066', settings: { attack: 0.001, decay: 2.0, sustain: 0.0, release: 1.0 } },
				tr808ride: { color: '#ff0066', settings: { attack: 0.001, decay: 3.0, sustain: 0.0, release: 1.0 } },
				tr808shaker: { color: '#6600ff', settings: { attack: 0.001, decay: 0.6, sustain: 0.0, release: 0.3 } },
				tr808cowbell: { color: '#ffcc00', settings: { attack: 0.001, decay: 0.6, sustain: 0.0, release: 0.3 } },
				tr808clave: { color: '#cc6600', settings: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.2 } },
				tr808rimshot: { color: '#ff9900', settings: { attack: 0.001, decay: 0.5, sustain: 0.0, release: 0.2 } },
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
				const deepCopySettings = (settings: Record<string, unknown>): Record<string, unknown> => {
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
						}, {} as Record<string, Record<string, unknown>>)
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
		// Update node pitch (and transpose all children by the same amount)
		updateNodePitch: (instrumentId: string, nodeId: string, pitch: number) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) => {
						if (instrument.id !== instrumentId) return instrument;
						
						// Find the node to get its old pitch
						const findNode = (node: PatternNode, targetId: string): PatternNode | null => {
							if (node.id === targetId) return node;
							for (const child of node.children) {
								const found = findNode(child, targetId);
								if (found) return found;
							}
							return null;
						};
						
						const targetNode = findNode(instrument.patternTree, nodeId);
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
		// Update node choke
		updateNodeChoke: (instrumentId: string, nodeId: string, choke: number | null) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) => {
						if (instrument.id !== instrumentId) return instrument;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								return { ...node, choke };
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
		// Update node ADSR parameters
		updateNodeADSR: (instrumentId: string, nodeId: string, adsr: { attack?: number; decay?: number; sustain?: number; release?: number }) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					standaloneInstruments: project.standaloneInstruments.map((instrument) => {
						if (instrument.id !== instrumentId) return instrument;
						
						const updateNode = (node: PatternNode): PatternNode => {
							if (node.id === nodeId) {
								return { 
									...node, 
									attack: adsr.attack !== undefined ? adsr.attack : node.attack,
									decay: adsr.decay !== undefined ? adsr.decay : node.decay,
									sustain: adsr.sustain !== undefined ? adsr.sustain : node.sustain,
									release: adsr.release !== undefined ? adsr.release : node.release
								};
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
		}
	};
}

