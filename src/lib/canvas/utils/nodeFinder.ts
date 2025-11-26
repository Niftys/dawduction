/**
 * Node Finding Utilities
 * Helper functions to find nodes at positions, in boxes, etc.
 */

import type { PatternNode, Pattern, StandaloneInstrument, Instrument } from '$lib/types/pattern';

export interface NodeAtPosition {
	node: PatternNode;
	depth: number;
	isRoot: boolean;
	patternId?: string | null;
	trackId?: string | null;
	instrumentId?: string | null;
}

/**
 * Finds a node at the given world coordinates
 */
export function findNodeAtPosition(
	tree: PatternNode,
	x: number,
	y: number,
	depth: number = 0,
	patternId?: string | null,
	trackId?: string | null,
	instrumentId?: string | null
): NodeAtPosition | null {
	if (tree.x === undefined || tree.y === undefined) return null;
	
	const radius = getRadiusForDepth(depth);
	const dx = tree.x - x;
	const dy = tree.y - y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	
	// Check children first (they're on top visually)
	for (const child of tree.children) {
		const found = findNodeAtPosition(child, x, y, depth + 1, patternId, trackId, instrumentId);
		if (found) return found;
	}
	
	// Check this node
	if (dist <= radius) {
		return {
			node: tree,
			depth,
			isRoot: depth === 0,
			patternId,
			trackId,
			instrumentId
		};
	}
	
	return null;
}

/**
 * Finds all nodes within a selection box
 */
export function findNodesInBox(
	boxLeft: number,
	boxRight: number,
	boxTop: number,
	boxBottom: number,
	tree: PatternNode,
	depth: number = 0,
	trackId?: string | null,
	patternId?: string | null,
	instrumentId?: string | null
): {
	selectedNodes: Set<string>;
	nodeToTrackId: Map<string, string>;
	nodeToPatternId: Map<string, string>;
	nodeToInstrumentId: Map<string, string>;
	hasRootNode: boolean;
} {
	const selectedNodes = new Set<string>();
	const nodeToTrackId = new Map<string, string>();
	const nodeToPatternId = new Map<string, string>();
	const nodeToInstrumentId = new Map<string, string>();
	let hasRootNode = false;
	
	const search = (node: PatternNode, depth: number = 0): void => {
		if (node.x === undefined || node.y === undefined) return;
		
		// Check if node center is within box
		if (node.x >= boxLeft && node.x <= boxRight &&
			node.y >= boxTop && node.y <= boxBottom) {
			selectedNodes.add(node.id);
			
			// Track which track/instrument this node belongs to
			if (trackId) {
				nodeToTrackId.set(node.id, trackId);
			}
			if (patternId) {
				nodeToPatternId.set(node.id, patternId);
			}
			if (instrumentId) {
				nodeToInstrumentId.set(node.id, instrumentId);
			}
			
			// Check if this is a root node
			if (depth === 0) {
				hasRootNode = true;
			}
		}
		
		// Check children
		for (const child of node.children) {
			search(child, depth + 1);
		}
	};
	
	search(tree, depth);
	
	return {
		selectedNodes,
		nodeToTrackId,
		nodeToPatternId,
		nodeToInstrumentId,
		hasRootNode
	};
}

/**
 * Gets radius for a node based on its depth
 */
export function getRadiusForDepth(depth: number): number {
	if (depth === 0) {
		return 50; // Root is large
	}
	return 18; // Everything else is smaller but visible
}

/**
 * Finds the closest node to a position from multiple trees
 */
export function findClosestNode(
	trees: Array<{ tree: PatternNode; patternId?: string | null; trackId?: string | null; instrumentId?: string | null }>,
	x: number,
	y: number
): NodeAtPosition | null {
	let closest: NodeAtPosition | null = null;
	let closestDist = Infinity;
	
	for (const { tree, patternId, trackId, instrumentId } of trees) {
		const found = findNodeAtPosition(tree, x, y, 0, patternId, trackId, instrumentId);
		if (found) {
			const node = found.node;
			if (node.x !== undefined && node.y !== undefined) {
				const dx = node.x - x;
				const dy = node.y - y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < closestDist) {
					closestDist = dist;
					closest = found;
				}
			}
		}
	}
	
	return closest;
}

