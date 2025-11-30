// Timeline ruler and grid generation utilities

import { TIMELINE_CONSTANTS } from './timelineUtils';

export interface RulerMark {
	beat: number;
	x: number;
	isBar: boolean;
	isBeat: boolean;
	barNumber: number;
	beatInBar: number;
}

export interface GridLine {
	beat: number;
	x: number;
	isBar: boolean;
	isBeat: boolean;
}

export interface ViewportRange {
	startBeat: number;
	endBeat: number;
}

/**
 * Calculate visible beat range from viewport scroll position
 */
export function calculateVisibleBeatRange(
	scrollLeft: number,
	viewportWidth: number,
	pixelsPerBeat: number,
	totalLength: number
): ViewportRange {
	// Calculate visible pixel range
	const startPixel = scrollLeft;
	const endPixel = scrollLeft + viewportWidth;
	
	// Convert to beats with padding for smooth scrolling
	// Increased padding to prevent visual glitches when scrolling
	const paddingBeats = 16; // Render 16 beats before and after viewport for smoother scrolling
	const startBeat = Math.max(0, Math.floor(pixelToBeat(startPixel, pixelsPerBeat)) - paddingBeats);
	const endBeat = Math.min(totalLength, Math.ceil(pixelToBeat(endPixel, pixelsPerBeat)) + paddingBeats);
	
	return { startBeat, endBeat };
}

function pixelToBeat(pixel: number, pixelsPerBeat: number): number {
	return pixel / pixelsPerBeat;
}

/**
 * Generate ruler marks only for visible range
 * Performance optimization: Only creates marks for beats in viewport + padding
 */
export function generateRulerMarks(
	totalLength: number, 
	pixelsPerBeat: number,
	viewportRange?: ViewportRange
): RulerMark[] {
	if (!totalLength) return [];
	
	// Performance limit: Don't generate more than 2000 marks
	const MAX_MARKS = 2000;
	const { BEATS_PER_BAR } = TIMELINE_CONSTANTS;
	
	// If no viewport range provided or total length is reasonable, generate all
	if (!viewportRange && totalLength <= MAX_MARKS) {
		return generateRulerMarksFull(totalLength, pixelsPerBeat);
	}
	
	// Use viewport range if provided, otherwise limit to MAX_MARKS
	const startBeat = viewportRange ? viewportRange.startBeat : 0;
	const endBeat = viewportRange 
		? Math.min(viewportRange.endBeat, totalLength)
		: Math.min(MAX_MARKS, totalLength);
	
	const marks: RulerMark[] = [];
	
	// Only generate marks for visible range
	for (let beat = startBeat; beat <= endBeat; beat += 1) {
		const isBar = beat % BEATS_PER_BAR === 0;
		const barNumber = Math.floor(beat / BEATS_PER_BAR);
		const beatInBar = Math.floor(beat % BEATS_PER_BAR);
		
		marks.push({
			beat,
			x: beat * pixelsPerBeat,
			isBar,
			isBeat: true,
			barNumber,
			beatInBar
		});
	}
	
	return marks;
}

/**
 * Full generation for short timelines (backward compatibility)
 */
function generateRulerMarksFull(totalLength: number, pixelsPerBeat: number): RulerMark[] {
	const marks: RulerMark[] = [];
	const { BEATS_PER_BAR } = TIMELINE_CONSTANTS;
	
	for (let beat = 0; beat <= totalLength; beat += 1) {
		const isBar = beat % BEATS_PER_BAR === 0;
		const barNumber = Math.floor(beat / BEATS_PER_BAR);
		const beatInBar = Math.floor(beat % BEATS_PER_BAR);
		
		marks.push({
			beat,
			x: beat * pixelsPerBeat,
			isBar,
			isBeat: true,
			barNumber,
			beatInBar
		});
	}
	
	return marks;
}

/**
 * Generate grid lines only for visible range
 * Performance optimization: Only creates lines for beats in viewport + padding
 */
export function generateGridLines(
	totalLength: number, 
	pixelsPerBeat: number,
	viewportRange?: ViewportRange
): GridLine[] {
	if (!totalLength) return [];
	
	// Performance limit: Don't generate more than 2000 lines
	const MAX_LINES = 2000;
	const { BEATS_PER_BAR } = TIMELINE_CONSTANTS;
	
	// If no viewport range provided or total length is reasonable, generate all
	if (!viewportRange && totalLength <= MAX_LINES) {
		return generateGridLinesFull(totalLength, pixelsPerBeat);
	}
	
	// Use viewport range if provided, otherwise limit to MAX_LINES
	const startBeat = viewportRange ? viewportRange.startBeat : 0;
	const endBeat = viewportRange 
		? Math.min(viewportRange.endBeat, totalLength)
		: Math.min(MAX_LINES, totalLength);
	
	const lines: GridLine[] = [];
	
	// Only generate lines for visible range
	for (let beat = startBeat; beat <= endBeat; beat += 1) {
		const isBar = beat % BEATS_PER_BAR === 0;
		lines.push({
			beat,
			x: beat * pixelsPerBeat,
			isBar,
			isBeat: true
		});
	}
	
	return lines;
}

/**
 * Full generation for short timelines (backward compatibility)
 */
function generateGridLinesFull(totalLength: number, pixelsPerBeat: number): GridLine[] {
	const lines: GridLine[] = [];
	const { BEATS_PER_BAR } = TIMELINE_CONSTANTS;
	
	for (let beat = 0; beat <= totalLength; beat += 1) {
		const isBar = beat % BEATS_PER_BAR === 0;
		lines.push({
			beat,
			x: beat * pixelsPerBeat,
			isBar,
			isBeat: true
		});
	}
	
	return lines;
}

