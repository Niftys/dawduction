/**
 * Centralized deep copy utilities
 */
import type { PatternNode, Pattern } from '$lib/types/pattern';

/**
 * Deep copy a pattern tree node
 */
export function deepCopyPatternTree(node: PatternNode): PatternNode {
	return JSON.parse(JSON.stringify(node));
}

/**
 * Deep copy a pattern
 */
export function deepCopyPattern(pattern: Pattern): Pattern {
	return JSON.parse(JSON.stringify(pattern));
}

/**
 * Deep copy any object (generic)
 */
export function deepCopy<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

