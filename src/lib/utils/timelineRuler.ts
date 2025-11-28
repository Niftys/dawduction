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

export function generateRulerMarks(totalLength: number, pixelsPerBeat: number): RulerMark[] {
	if (!totalLength) return [];
	
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

export function generateGridLines(totalLength: number, pixelsPerBeat: number): GridLine[] {
	if (!totalLength) return [];
	
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

