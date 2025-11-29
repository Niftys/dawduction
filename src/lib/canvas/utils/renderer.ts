/**
 * Canvas Renderer
 * Handles rendering the canvas background, grid, trees, and selection box
 */

import type { Pattern, StandaloneInstrument, Instrument } from '$lib/types/pattern';
import type { NodeRenderer } from '$lib/canvas/NodeRenderer';
import { getPlayingNodeIds, getUpcomingNodeIds, getPlayedNodeIds } from './playbackHighlighter';
import {
	createTrackSelectionChecker,
	createInstrumentSelectionChecker,
	createTrackPlaybackChecker,
	createInstrumentPlaybackChecker,
	createTrackUpcomingChecker,
	createInstrumentUpcomingChecker,
	isTrackGreyedOut,
	isInstrumentGreyedOut
} from './renderHelpers';

export interface RenderContext {
	ctx: CanvasRenderingContext2D;
	renderer: NodeRenderer;
	canvas: HTMLCanvasElement;
	viewport: any;
	project: any;
	patternId: string | null;
	pattern: Pattern | null;
	selectionState: any;
	playbackState: any;
	isSelecting: boolean;
	selectionBox: { startX: number; startY: number; endX: number; endY: number } | null;
}

/**
 * Renders a single frame of the canvas
 */
export function renderFrame(context: RenderContext): void {
	const { ctx, renderer, canvas, viewport, project, patternId, pattern, selectionState, playbackState, isSelecting, selectionBox } = context;
	
	if (!ctx || !renderer || !project) return;

	// Clear canvas with subtle background
	ctx.fillStyle = '#1a1a1a';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	// Draw very subtle grid
	drawGrid(ctx, canvas, viewport);
	
	// Get playing, upcoming, and played node IDs (respecting mute/solo)
	const playingNodeIds = getPlayingNodeIds({
		project,
		patternId,
		pattern,
		playbackState
	});
	const upcomingNodeIds = getUpcomingNodeIds({
		project,
		patternId,
		pattern,
		playbackState
	});
	const playedNodeIds = getPlayedNodeIds({
		project,
		patternId,
		pattern,
		playbackState
	});
	
	
	// Check if playback is active (currentTime > 0 or there are playing nodes)
	const isPlaybackActive = playbackState?.currentTime > 0 || playingNodeIds.size > 0;
	const isLoopStart = playbackState?.isLoopStart || false;
	
	// Render standalone instruments only in arrangement view (not in pattern editor mode)
	if (!patternId) {
		renderTracks(ctx, renderer, project, selectionState, playingNodeIds, upcomingNodeIds, playedNodeIds, isPlaybackActive, isLoopStart);
	}
	
	// Render pattern instruments if in pattern editor mode
	if (patternId && pattern) {
		renderPatternInstruments(ctx, renderer, patternId, pattern, selectionState, playingNodeIds, upcomingNodeIds, playedNodeIds, isPlaybackActive, isLoopStart);
	}
	
	// Draw selection box
	if (isSelecting && selectionBox) {
		drawSelectionBox(ctx, selectionBox);
	}
}

/**
 * Draws the background grid
 */
function drawGrid(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	viewport: any
): void {
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
	ctx.lineWidth = 1;
	const gridSize = 50 * viewport.zoom;
	const offsetX = (viewport.x * viewport.zoom) % gridSize;
	const offsetY = (viewport.y * viewport.zoom) % gridSize;
	
	for (let x = -offsetX; x < canvas.width; x += gridSize) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, canvas.height);
		ctx.stroke();
	}
	for (let y = -offsetY; y < canvas.height; y += gridSize) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(canvas.width, y);
		ctx.stroke();
	}
}

/**
 * Renders all tracks
 */
function renderTracks(
	ctx: CanvasRenderingContext2D,
	renderer: NodeRenderer,
	project: any,
	selectionState: any,
	playingNodeIds: Set<string>,
	upcomingNodeIds: Set<string>,
	playedNodeIds: Set<string>,
	isPlaybackActive: boolean,
	isLoopStart: boolean
): void {
	const renderContext = {
		project,
		patternId: null,
		pattern: null,
		selectionState,
		playingNodeIds,
		upcomingNodeIds,
		playedNodeIds
	};
	
	// Render all standalone instruments
	for (const instrument of project.standaloneInstruments || []) {
		const isSelected = createTrackSelectionChecker(instrument, renderContext);
		const isPlaying = createTrackPlaybackChecker(instrument, renderContext);
		const isUpcoming = createTrackUpcomingChecker(instrument, renderContext);
		const isGreyedOut = isTrackGreyedOut(instrument, project);
		
		renderer.renderTree(instrument.patternTree, instrument.color, isSelected, isPlaying, isUpcoming, playedNodeIds, instrument.instrumentType, isGreyedOut, isPlaybackActive, isLoopStart);
	}
}

/**
 * Renders all instruments in a pattern
 * Uses the same logic as projectStore.getPatternInstruments to handle both new and legacy formats
 */
function renderPatternInstruments(
	ctx: CanvasRenderingContext2D,
	renderer: NodeRenderer,
	patternId: string,
	pattern: Pattern,
	selectionState: any,
	playingNodeIds: Set<string>,
	upcomingNodeIds: Set<string>,
	playedNodeIds: Set<string>,
	isPlaybackActive: boolean,
	isLoopStart: boolean
): void {
	// Get instruments using the same logic as projectStore.getPatternInstruments
	let patternInstruments: any[] = [];
	
	// Check new format first
	if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
		patternInstruments = pattern.instruments;
	} 
	// If no instruments in new format, check legacy format
	else if (pattern.instrumentType && pattern.patternTree) {
		// Legacy format: convert single instrument
		patternInstruments = [{
			id: pattern.id,
			instrumentType: pattern.instrumentType,
			patternTree: pattern.patternTree,
			settings: pattern.settings || {},
			instrumentSettings: pattern.instrumentSettings,
			color: pattern.color || '#7ab8ff',
			volume: pattern.volume ?? 1.0,
			pan: pattern.pan ?? 0.0,
			mute: pattern.mute,
			solo: pattern.solo
		}];
	}
	
	const renderContext = {
		project: null,
		patternId,
		pattern,
		selectionState,
		playingNodeIds,
		upcomingNodeIds,
		playedNodeIds
	};
	
	// Render each instrument in the pattern
	for (const instrument of patternInstruments) {
		const isSelected = createInstrumentSelectionChecker(instrument, patternId, renderContext);
		const isPlaying = createInstrumentPlaybackChecker(instrument, pattern, renderContext);
		const isUpcoming = createInstrumentUpcomingChecker(instrument, pattern, renderContext);
		const isGreyedOut = isInstrumentGreyedOut(instrument, pattern);
		
		renderer.renderTree(instrument.patternTree, instrument.color, isSelected, isPlaying, isUpcoming, playedNodeIds, instrument.instrumentType, isGreyedOut, isPlaybackActive, isLoopStart);
	}
}

/**
 * Draws the selection box
 */
function drawSelectionBox(
	ctx: CanvasRenderingContext2D,
	selectionBox: { startX: number; startY: number; endX: number; endY: number }
): void {
	const x = Math.min(selectionBox.startX, selectionBox.endX);
	const y = Math.min(selectionBox.startY, selectionBox.endY);
	const width = Math.abs(selectionBox.endX - selectionBox.startX);
	const height = Math.abs(selectionBox.endY - selectionBox.startY);
	
	// Only draw if box has some size
	if (width > 2 && height > 2) {
		ctx.strokeStyle = '#7ab8ff';
		ctx.lineWidth = 2;
		ctx.setLineDash([5, 5]);
		ctx.strokeRect(x, y, width, height);
		
		ctx.fillStyle = 'rgba(122, 184, 255, 0.1)';
		ctx.fillRect(x, y, width, height);
		
		ctx.setLineDash([]);
	}
}

