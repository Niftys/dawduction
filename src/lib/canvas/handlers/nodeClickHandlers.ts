/**
 * Node Click and Context Menu Handlers
 * Handles clicking on nodes and showing context menus
 */

import { selectionStore } from '$lib/stores/selectionStore';
import { findNodeAtPosition } from '../utils/nodeFinder';
import type { PatternNode, Pattern, StandaloneInstrument, Instrument } from '$lib/types/pattern';
import type { Viewport } from '$lib/canvas/Viewport';

export interface NodeClickContext {
	project: any;
	patternId: string | null;
	pattern: Pattern | null;
	canvas: HTMLCanvasElement;
	viewport: Viewport;
}

export interface ContextMenu {
	x: number;
	y: number;
	node: PatternNode | null;
	patternId: string | null;
	trackId: string | null;
	instrumentId?: string | null;
	isRoot: boolean;
}

/**
 * Handles clicking on nodes (for selection)
 */
export function handleNodeClick(
	e: MouseEvent,
	context: NodeClickContext
): void {
	const { project, patternId, pattern, canvas, viewport } = context;
	if (!project || !canvas) return;

	const rect = canvas.getBoundingClientRect();
	const canvasX = e.clientX - rect.left;
	const canvasY = e.clientY - rect.top;
	const [wx, wy] = viewport.screenToWorld(canvasX, canvasY);

	// Helper to find clicked node
	const findClickedNode = (tree: PatternNode): Array<{ node: any; dist: number; depth: number }> => {
		const results: Array<{ node: any; dist: number; depth: number }> = [];
		
		const search = (node: PatternNode, depth: number = 0) => {
			if (node.x === undefined || node.y === undefined) return;
			
			const dx = node.x - wx;
			const dy = node.y - wy;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const radius = getRadiusForDepth(depth);
			
			if (dist <= radius) {
				results.push({ node, dist, depth });
			}
			
			// Check children
			for (const child of node.children) {
				search(child, depth + 1);
			}
		};
		
		search(tree);
		return results;
	};

	// Find closest node across all tracks and pattern instruments
	let closest: { node: any; dist: number; depth: number; trackId?: string; patternId?: string; instrumentId?: string } | null = null;

	// Search standalone instruments first
	for (const instrument of project.standaloneInstruments || []) {
		const results = findClickedNode(instrument.patternTree);
		for (const result of results) {
			if (!closest || result.dist < closest.dist) {
				closest = { ...result, trackId: instrument.id };
			}
		}
	}

	// Also search pattern instruments if in pattern editor mode
	if (patternId && pattern) {
		const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
			? pattern.instruments
			: [];
		
		for (const instrument of patternInstruments) {
			const results = findClickedNode(instrument.patternTree);
			for (const result of results) {
				if (!closest || result.dist < closest.dist) {
					closest = { ...result, patternId, instrumentId: instrument.id };
				}
			}
		}
	}

	if (closest) {
		selectionStore.selectNode(
			closest.node.id,
			closest.trackId || null,
			closest.depth === 0,
			e.ctrlKey || e.metaKey,
			closest.patternId || null,
			closest.instrumentId || null
		);
	}
}

/**
 * Handles right-click context menu
 */
export function handleContextMenu(
	e: MouseEvent,
	context: NodeClickContext
): ContextMenu | null {
	const { project, patternId, pattern, canvas, viewport } = context;
	if (!project || !canvas) return null;

	const rect = canvas.getBoundingClientRect();
	const canvasX = e.clientX - rect.left;
	const canvasY = e.clientY - rect.top;
	const [wx, wy] = viewport.screenToWorld(canvasX, canvasY);

	// Helper to find node at position (check children first, then parent)
	const findNodeAtPosition = (tree: PatternNode): { node: PatternNode; isRoot: boolean } | null => {
		const results: Array<{ node: PatternNode; dist: number; depth: number }> = [];
		
		const search = (node: PatternNode, depth: number = 0) => {
			if (node.x === undefined || node.y === undefined) return;
			
			// Check children first (they're on top visually)
			for (const child of node.children) {
				const found = search(child, depth + 1);
				if (found) return found;
			}
			
			// Check this node only if no child was hit
			const dx = node.x - wx;
			const dy = node.y - wy;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const radius = getRadiusForDepth(depth);
			
			if (dist <= radius) {
				return { node, isRoot: depth === 0 };
			}
			
			return null;
		};
		
		return search(tree);
	};

	// Search standalone instruments first
	for (const instrument of project.standaloneInstruments || []) {
		const result = findNodeAtPosition(instrument.patternTree);
		if (result) {
			return {
				x: e.clientX,
				y: e.clientY,
				node: result.node,
				patternId: null,
				trackId: instrument.id,
				isRoot: result.isRoot
			};
		}
	}

	// If no track node found and we're in pattern editor mode, also check all instruments in the pattern
	if (patternId && pattern) {
		const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
			? pattern.instruments
			: [];
		
		for (const instrument of patternInstruments) {
			const result = findNodeAtPosition(instrument.patternTree);
			if (result) {
				return {
					x: e.clientX,
					y: e.clientY,
					node: result.node,
					patternId: patternId,
					trackId: null,
					instrumentId: instrument.id,
					isRoot: result.isRoot
				};
			}
		}
	}

	return null;
}

function getRadiusForDepth(depth: number): number {
	if (depth === 0) {
		return 50; // Root is large
	}
	return 18; // Everything else is smaller but visible
}

