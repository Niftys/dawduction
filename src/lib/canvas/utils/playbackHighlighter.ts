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
	
	// Debug logging removed to prevent console spam during rendering
	
	// If working with a specific pattern, handle all instruments separately
	if (patternId && pattern) {
		return getPatternPlayingNodes(patternId, pattern, playbackState);
	}
	
	// Original behavior: handle standalone instruments
	return getTracksPlayingNodes(project, playbackState);
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
	
	// Process each instrument in the pattern
	for (const instrument of patternInstruments) {
		const patternTrackId = `__pattern_${patternId}_${instrument.id}`;
		const patternLength = instrument.patternTree.division;
		
		// Build maps for node traversal
		const { nodeToParent, timeToNodes } = buildNodeMaps(instrument.patternTree, patternLength);
		
		// Match playback events to nodes for this instrument
		// Use tolerance for floating point precision (0.001 beats = ~1ms at 120 BPM)
		const TIME_TOLERANCE = 0.001;
		
		let matchedCount = 0;
		for (const eventKey of playbackState.playingNodes) {
			const [trackId, timeStr] = eventKey.split(':');
			if (trackId === patternTrackId) {
				matchedCount++;
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

