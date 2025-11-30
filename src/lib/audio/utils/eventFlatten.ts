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
 * Base meter determines the pattern length in beats (always)
 * Root node's division affects the internal rhythmic structure relative to baseMeter
 * 
 * When root.division = baseMeter: normal timing (children split baseMeter proportionally)
 * When root.division > baseMeter: compressed timing (children distributed as if pattern were root.division beats, compressed into baseMeter)
 * When root.division < baseMeter: stretched timing (children distributed as if pattern were root.division beats, stretched to baseMeter)
 * 
 * @param rootNode - The root pattern node
 * @param trackId - Track/instrument ID
 * @param baseMeter - Base meter (pattern length in beats), defaults to 4
 */
export function flattenTrackPattern(rootNode: PatternNode, trackId: string, baseMeter: number = 4): AudioEvent[] {
	// Pattern length is always baseMeter
	const patternLength = baseMeter;
	
	// Root division is calculated from the sum of its children's divisions
	// If root has no children, use baseMeter as default
	let rootDivision: number;
	if (rootNode.children && rootNode.children.length > 0) {
		rootDivision = rootNode.children.reduce((sum, child) => sum + (child.division || 1), 0);
	} else {
		rootDivision = baseMeter; // Default if no children
	}
	
	// Start with root division as parent duration, which will be scaled by the ratio
	// The children will be distributed proportionally within rootDivision, then the whole pattern scales to baseMeter
	return flattenTree(rootNode, rootDivision, 0.0, trackId).map(event => ({
		...event,
		// Scale event times from rootDivision space to baseMeter space
		time: event.time * (baseMeter / rootDivision)
	}));
}

