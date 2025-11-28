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
		// If startTime is 0, it's the root node - treat as empty if no velocity/pitch
		if (startTime === 0 && node.velocity === undefined && node.pitch === undefined) {
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
 * Root node's division value determines the pattern structure
 * Base meter scales the pattern speed: patternLength = root.division * (baseMeter / root.division) = baseMeter
 * When baseMeter = root.division, patternLength = root.division (normal speed)
 * When baseMeter < root.division, patternLength < root.division (faster)
 * When baseMeter > root.division, patternLength > root.division (slower)
 * 
 * Examples:
 * - baseMeter=6, root=6: patternLength = 6 beats (normal speed)
 * - baseMeter=3, root=6: patternLength = 3 beats (double speed)
 * - baseMeter=12, root=6: patternLength = 12 beats (half speed)
 * 
 * @param rootNode - The root pattern node
 * @param trackId - Track/instrument ID
 * @param baseMeter - Base meter (denominator X in Y/X time signature), defaults to 4
 */
export function flattenTrackPattern(rootNode: PatternNode, trackId: string, baseMeter: number = 4): AudioEvent[] {
	// Pattern length = baseMeter, which preserves structure when baseMeter = root.division
	// The hierarchical structure is preserved because children split parent's duration proportionally
	const patternLength = baseMeter;
	return flattenTree(rootNode, patternLength, 0.0, trackId);
}

