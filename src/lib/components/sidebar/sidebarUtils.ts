import type { PatternNode } from '$lib/types/pattern';

/**
 * Find a node in the tree by ID
 */
export function findNodeInTree(node: PatternNode, nodeId: string): PatternNode | null {
	if (node.id === nodeId) return node;
	for (const child of node.children) {
		const found = findNodeInTree(child, nodeId);
		if (found) return found;
	}
	return null;
}

/**
 * Get input value from event
 */
export function getInputValue(e: Event): string {
	const target = e.target as HTMLInputElement;
	return target?.value || '';
}

/**
 * Get select value from event
 */
export function getSelectValue(e: Event): string {
	const target = e.target as HTMLSelectElement;
	return target?.value || '';
}

