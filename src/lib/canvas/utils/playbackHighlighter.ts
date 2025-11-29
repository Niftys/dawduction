/**
 * Playback Highlighting Utilities
 * Maps playback events to node IDs for visual feedback
 */

import type { PatternNode, Pattern, StandaloneInstrument, Instrument } from '$lib/types/pattern';
import { flattenTrackPattern } from '$lib/audio/utils/eventFlatten';

export interface PlaybackHighlightContext {
	project: any;
	patternId: string | null;
	pattern: Pattern | null;
	playbackState: any;
}

/**
 * Gets the set of node IDs that should be highlighted as "playing"
 */
export function getPlayingNodeIds(context: PlaybackHighlightContext): Set<string> {
	const { project, patternId, pattern, playbackState } = context;
	
	if (!project || !playbackState?.playingNodes) {
		return new Set();
	}
	
	// If working with a specific pattern, handle all instruments separately
	if (patternId && pattern) {
		return getPatternPlayingNodes(patternId, pattern, playbackState);
	}
	
	// Original behavior: handle standalone instruments
	return getTracksPlayingNodes(project, playbackState);
}

/**
 * Gets the set of node IDs that should be dimly lit as "upcoming" (unplayed nodes)
 * This includes all nodes that haven't been played yet in the current loop cycle
 */
export function getUpcomingNodeIds(context: PlaybackHighlightContext): Set<string> {
	const { project, patternId, pattern, playbackState } = context;
	
	if (!project || !playbackState?.currentTime) {
		return new Set();
	}
	
	// If working with a specific pattern, handle all instruments separately
	if (patternId && pattern) {
		return getPatternUnplayedNodes(patternId, pattern, playbackState);
	}
	
	// Original behavior: handle standalone instruments
	return getTracksUnplayedNodes(project, playbackState);
}

/**
 * Gets the set of node IDs that have been played (should not glow)
 */
export function getPlayedNodeIds(context: PlaybackHighlightContext): Set<string> {
	const { project, patternId, pattern, playbackState } = context;
	
	if (!project || !playbackState?.playedNodes) {
		return new Set();
	}
	
	// If working with a specific pattern, handle all instruments separately
	if (patternId && pattern) {
		return getPatternPlayedNodes(patternId, pattern, playbackState);
	}
	
	// Original behavior: handle standalone instruments
	return getTracksPlayedNodes(project, playbackState);
}

/**
 * Gets playing nodes for pattern instruments
 */
function getPatternPlayingNodes(
	patternId: string,
	pattern: Pattern,
	playbackState: any
): Set<string> {
	const playingNodeIds = new Set<string>();
	
	// Get all instruments from pattern
	const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
		? pattern.instruments
		: [];
	
	// Get baseMeter from pattern (defaults to 4)
	const baseMeter = pattern.baseMeter || 4;
	
	// Process each instrument in the pattern
	for (const instrument of patternInstruments) {
		const patternTrackId = `__pattern_${patternId}_${instrument.id}`;
		// Pattern length = baseMeter, which preserves structure when baseMeter = root.division
		const patternLength = baseMeter;
		
		// Build maps for node traversal
		const { nodeToParent, timeToNodes } = buildNodeMaps(instrument.patternTree, patternLength);
		
		// Match playback events to nodes for this instrument
		// Use tolerance for floating point precision (0.001 beats = ~1ms at 120 BPM)
		const TIME_TOLERANCE = 0.001;
		
		for (const eventKey of playbackState.playingNodes) {
			const [trackId, timeStr] = eventKey.split(':');
			if (trackId === patternTrackId) {
				const eventTime = parseFloat(timeStr);
				// Normalize event time to pattern length (patterns loop)
				const normalizedTime = eventTime % patternLength;
				
				// Try exact match first
				let nodeIds = timeToNodes.get(normalizedTime);
				
				// If no exact match, try tolerance-based matching
				if (!nodeIds) {
					for (const [time, ids] of timeToNodes.entries()) {
						if (Math.abs(time - normalizedTime) < TIME_TOLERANCE) {
							nodeIds = ids;
							break;
						}
					}
				}
				
				if (nodeIds) {
					for (const nodeId of nodeIds) {
						// Add the playing node and all its ancestors
						let currentNodeId: string | null = nodeId;
						while (currentNodeId !== null) {
							playingNodeIds.add(currentNodeId);
							currentNodeId = nodeToParent.get(currentNodeId) || null;
						}
					}
				}
			}
		}
	}
	
	return playingNodeIds;
}

/**
 * Gets unplayed nodes for pattern instruments (all nodes that haven't been played yet)
 */
function getPatternUnplayedNodes(
	patternId: string,
	pattern: Pattern,
	playbackState: any
): Set<string> {
	const unplayedNodeIds = new Set<string>();
	
	// Get all instruments from pattern
	const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
		? pattern.instruments
		: [];
	
	// Get baseMeter from pattern (defaults to 4)
	const baseMeter = pattern.baseMeter || 4;
	const patternLength = baseMeter;
	
	// Get played and playing node IDs for this pattern
	const playedNodeIds = getPatternPlayedNodes(patternId, pattern, playbackState);
	const playingNodeIds = getPatternPlayingNodes(patternId, pattern, playbackState);
	
	// Process each instrument in the pattern
	for (const instrument of patternInstruments) {
		// Get all nodes from the pattern tree
		const allNodeIds = new Set<string>();
		const collectAllNodes = (node: PatternNode) => {
			allNodeIds.add(node.id);
			for (const child of node.children) {
				collectAllNodes(child);
			}
		};
		collectAllNodes(instrument.patternTree);
		
		// Add all nodes that haven't been played yet (and aren't currently playing)
		for (const nodeId of allNodeIds) {
			if (!playedNodeIds.has(nodeId) && !playingNodeIds.has(nodeId)) {
				unplayedNodeIds.add(nodeId);
			}
		}
	}
	
	return unplayedNodeIds;
}

/**
 * Gets played nodes for pattern instruments
 */
function getPatternPlayedNodes(
	patternId: string,
	pattern: Pattern,
	playbackState: any
): Set<string> {
	const playedNodeIds = new Set<string>();
	
	// Get all instruments from pattern
	const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
		? pattern.instruments
		: [];
	
	// Get baseMeter from pattern (defaults to 4)
	const baseMeter = pattern.baseMeter || 4;
	const patternLength = baseMeter;
	
	// Process each instrument in the pattern
	for (const instrument of patternInstruments) {
		const patternTrackId = `__pattern_${patternId}_${instrument.id}`;
		
		// Build maps for node traversal
		const { nodeToParent, timeToNodes } = buildNodeMaps(instrument.patternTree, patternLength);
		
		// Match played events to nodes for this instrument
		const TIME_TOLERANCE = 0.001;
		
		for (const eventKey of playbackState.playedNodes) {
			const [trackId, timeStr] = eventKey.split(':');
			if (trackId === patternTrackId) {
				const eventTime = parseFloat(timeStr);
				// Normalize event time to pattern length (patterns loop)
				// Handle negative times and ensure we get a positive normalized time
				let normalizedTime = eventTime % patternLength;
				if (normalizedTime < 0) {
					normalizedTime += patternLength;
				}
				
				// Try exact match first
				let nodeIds = timeToNodes.get(normalizedTime);
				
				// If no exact match, try tolerance-based matching
				if (!nodeIds) {
					for (const [time, ids] of timeToNodes.entries()) {
						const timeDiff = Math.abs(time - normalizedTime);
						// Also check wrapped time differences
						const wrappedDiff = Math.min(timeDiff, patternLength - timeDiff);
						if (wrappedDiff < TIME_TOLERANCE) {
							nodeIds = ids;
							break;
						}
					}
				}
				
				if (nodeIds) {
					for (const nodeId of nodeIds) {
						// Add the played node and all its ancestors
						let currentNodeId: string | null = nodeId;
						while (currentNodeId !== null) {
							playedNodeIds.add(currentNodeId);
							currentNodeId = nodeToParent.get(currentNodeId) || null;
						}
					}
				}
			}
		}
	}
	
	return playedNodeIds;
}

/**
 * Gets playing nodes for standalone instruments
 */
function getTracksPlayingNodes(
	project: any,
	playbackState: any
): Set<string> {
	const playingNodeIds = new Set<string>();
	
	// Get base meter length for pattern repetition calculation
	const baseMeterTrackId = project.baseMeterTrackId || project.standaloneInstruments?.[0]?.id;
	const baseMeterInstrument = project.standaloneInstruments?.find((i: StandaloneInstrument) => i.id === baseMeterTrackId);
	const baseMeterLength = baseMeterInstrument?.patternTree?.division || 4;
	
	// For each standalone instrument, flatten the pattern and match events to nodes
	for (const instrument of project.standaloneInstruments || []) {
		const instrumentPatternLength = instrument.patternTree.division;
		
		// Build maps for node traversal
		const { nodeToParent, timeToNodes } = buildNodeMaps(instrument.patternTree, instrumentPatternLength);
		
		// Flatten events for this instrument
		const events = flattenTrackPattern(instrument.patternTree, instrument.id);
		
		// Match playback events to nodes
		// Use tolerance for floating point precision (0.001 beats = ~1ms at 120 BPM)
		const TIME_TOLERANCE = 0.001;
		
		// Throttle debug logging to avoid infinite loops
		const shouldLog = Math.random() < 0.01; // Log 1% of the time
		
		if (shouldLog && playbackState.playingNodes.size > 0) {
			console.log('[getTracksPlayingNodes] Sample check:', {
				instrumentId: instrument.id,
				instrumentPatternLength,
				baseMeterLength,
				playingNodesCount: playbackState.playingNodes.size,
				sampleEvent: Array.from(playbackState.playingNodes)[0],
				timeToNodesKeys: Array.from(timeToNodes.keys()).slice(0, 5)
			});
		}
		
		for (const eventKey of playbackState.playingNodes) {
			const [trackId, timeStr] = eventKey.split(':');
			if (trackId === instrument.id) {
				let eventTime = parseFloat(timeStr);
				
				// If instrument's pattern is shorter than base meter, events repeat
				if (instrumentPatternLength < baseMeterLength) {
					// Normalize to instrument pattern length
					eventTime = eventTime % instrumentPatternLength;
				}
				
				// Try exact match first
				let nodeIds = timeToNodes.get(eventTime);
				
				// If no exact match, try tolerance-based matching
				if (!nodeIds) {
					for (const [time, ids] of timeToNodes.entries()) {
						if (Math.abs(time - eventTime) < TIME_TOLERANCE) {
							nodeIds = ids;
							break;
						}
					}
				}
				
				if (nodeIds) {
					for (const nodeId of nodeIds) {
						// Add the playing node and all its ancestors
						let currentNodeId: string | null = nodeId;
						while (currentNodeId !== null) {
							playingNodeIds.add(currentNodeId);
							currentNodeId = nodeToParent.get(currentNodeId) || null;
						}
					}
				}
			}
		}
	}
	
	return playingNodeIds;
}

/**
 * Gets unplayed nodes for standalone instruments (all nodes that haven't been played yet)
 */
function getTracksUnplayedNodes(
	project: any,
	playbackState: any
): Set<string> {
	const unplayedNodeIds = new Set<string>();
	
	// Get played and playing node IDs for all tracks
	const playedNodeIds = getTracksPlayedNodes(project, playbackState);
	const playingNodeIds = getTracksPlayingNodes(project, playbackState);
	
	// For each standalone instrument, find unplayed nodes
	for (const instrument of project.standaloneInstruments || []) {
		// Get all nodes from the pattern tree
		const allNodeIds = new Set<string>();
		const collectAllNodes = (node: PatternNode) => {
			allNodeIds.add(node.id);
			for (const child of node.children) {
				collectAllNodes(child);
			}
		};
		collectAllNodes(instrument.patternTree);
		
		// Add all nodes that haven't been played yet (and aren't currently playing)
		for (const nodeId of allNodeIds) {
			if (!playedNodeIds.has(nodeId) && !playingNodeIds.has(nodeId)) {
				unplayedNodeIds.add(nodeId);
			}
		}
	}
	
	return unplayedNodeIds;
}

/**
 * Gets played nodes for standalone instruments
 */
function getTracksPlayedNodes(
	project: any,
	playbackState: any
): Set<string> {
	const playedNodeIds = new Set<string>();
	
	// Get base meter length for pattern repetition calculation
	const baseMeterTrackId = project.baseMeterTrackId || project.standaloneInstruments?.[0]?.id;
	const baseMeterInstrument = project.standaloneInstruments?.find((i: StandaloneInstrument) => i.id === baseMeterTrackId);
	const baseMeterLength = baseMeterInstrument?.patternTree?.division || 4;
	
	// For each standalone instrument, match played events to nodes
	for (const instrument of project.standaloneInstruments || []) {
		const instrumentPatternLength = instrument.patternTree.division;
		
		// Build maps for node traversal
		const { nodeToParent, timeToNodes } = buildNodeMaps(instrument.patternTree, instrumentPatternLength);
		
		// Match playback events to nodes
		const TIME_TOLERANCE = 0.001;
		
		for (const eventKey of playbackState.playedNodes) {
			const [trackId, timeStr] = eventKey.split(':');
			if (trackId === instrument.id) {
				let eventTime = parseFloat(timeStr);
				
				// If instrument's pattern is shorter than base meter, events repeat
				if (instrumentPatternLength < baseMeterLength) {
					// Normalize to instrument pattern length
					eventTime = eventTime % instrumentPatternLength;
				}
				
				// Try exact match first
				let nodeIds = timeToNodes.get(eventTime);
				
				// If no exact match, try tolerance-based matching
				if (!nodeIds) {
					for (const [time, ids] of timeToNodes.entries()) {
						if (Math.abs(time - eventTime) < TIME_TOLERANCE) {
							nodeIds = ids;
							break;
						}
					}
				}
				
				if (nodeIds) {
					for (const nodeId of nodeIds) {
						// Add the played node and all its ancestors
						let currentNodeId: string | null = nodeId;
						while (currentNodeId !== null) {
							playedNodeIds.add(currentNodeId);
							currentNodeId = nodeToParent.get(currentNodeId) || null;
						}
					}
				}
			}
		}
	}
	
	return playedNodeIds;
}

/**
 * Builds maps for efficient node traversal
 */
function buildNodeMaps(
	tree: PatternNode,
	patternLength: number
): {
	nodeToParent: Map<string, string | null>;
	timeToNodes: Map<number, string[]>;
} {
	const nodeToParent = new Map<string, string | null>();
	const timeToNodes = new Map<number, string[]>();
	
	// Build parent map
	const buildParentMap = (node: PatternNode, parentId: string | null) => {
		nodeToParent.set(node.id, parentId);
		for (const child of node.children) {
			buildParentMap(child, node.id);
		}
	};
	buildParentMap(tree, null);
	
	// Build time map
	const buildTimeMap = (node: PatternNode, startTime: number, duration: number) => {
		if (node.children.length === 0) {
			// Leaf node - this is where events are created
			const nodeIds = timeToNodes.get(startTime) || [];
			nodeIds.push(node.id);
			timeToNodes.set(startTime, nodeIds);
		} else {
			// Calculate child durations proportionally
			// Match flattenTree logic: use child.division || 1 to default to 1
			const totalDivision = node.children.reduce((sum, child) => sum + (child.division || 1), 0);
			let currentTime = startTime;
			for (const child of node.children) {
				const childDivision = child.division || 1;
				const childDuration = duration * (childDivision / totalDivision);
				buildTimeMap(child, currentTime, childDuration);
				currentTime += childDuration;
			}
		}
	};
	buildTimeMap(tree, 0, patternLength);
	
	return { nodeToParent, timeToNodes };
}

