import type { PatternNode, AudioEvent } from '$lib/types/pattern';

/**
 * Converts a recursive pattern tree into a flat list of timed events for playback.
 * 
 * Uses division-based proportional timing as specified in the project plan:
 * - Root node's division value = pattern length in beats (user-defined)
 * - Each child gets a proportional share based on its division value
 * - Supports polyrhythmic patterns with unequal subdivisions
 * 
 * @param node - The pattern node to flatten
 * @param parentDuration - Duration of parent node in beats
 * @param startTime - Start time in beats
 * @param instrumentId - Track/instrument ID
 * @returns Array of audio events
 */
export function flattenTree(
	node: PatternNode,
	parentDuration: number,
	startTime: number,
	instrumentId: string
): AudioEvent[] {
	// Leaf node - create event
	// BUT: if this is the root node (parentDuration equals node.division) and it has no children,
	// it's an empty pattern, so return empty array
	// We detect root node by checking if startTime is 0 AND parentDuration equals node.division
	// AND the node has no velocity/pitch (indicating it's not meant to be a leaf)
	if (!node.children || node.children.length === 0) {
		// Check if this is the root node (empty pattern)
		// Root node in empty pattern won't have velocity/pitch set
		if (parentDuration === node.division && startTime === 0 && node.velocity === undefined && node.pitch === undefined) {
			// This is the root node with no children - empty pattern, return no events
			return [];
		}
		// Otherwise, it's a real leaf node - create event
		return [{
			time: startTime,
			velocity: node.velocity ?? 1.0,
			pitch: node.pitch ?? 60, // Middle C default
			instrumentId
		}];
	}
	
	// Calculate total division sum for proportional distribution
	const totalDivision = node.children.reduce((sum, child) => sum + (child.division || 1), 0);
	
	// If totalDivision is 0, something is wrong - return empty array
	if (totalDivision === 0) {
		console.warn('[flattenTree] Total division is 0, returning empty events');
		return [];
	}
	
	// Recursively process children with proportional timing
	let currentTime = startTime;
	const events: AudioEvent[] = [];
	
	for (const child of node.children) {
		// Each child gets a proportional share based on its division value
		const childDivision = child.division || 1;
		const childDuration = parentDuration * (childDivision / totalDivision);
		events.push(...flattenTree(child, childDuration, currentTime, instrumentId));
		currentTime += childDuration;
	}
	
	return events;
}

/**
 * Flatten a complete track's pattern tree
 * Root node's division value = pattern length in beats (user-defined)
 * 
 * Usage: `flattenTree(rootNode, rootNode.division, 0.0, trackId)`
 * This makes the root division value the total pattern length in beats
 */
export function flattenTrackPattern(rootNode: PatternNode, trackId: string): AudioEvent[] {
	return flattenTree(rootNode, rootNode.division, 0.0, trackId);
}

