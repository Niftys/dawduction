// Timeline utility functions for beat/pixel conversion, zoom, and snapping

export const TIMELINE_CONSTANTS = {
	ROW_LABEL_WIDTH: 200,
	BASE_ZOOM: 8,
	BASE_PIXELS_PER_BEAT: 4,
	RULER_HEIGHT: 50,
	PATTERN_ROW_HEIGHT: 80,
	BEATS_PER_BAR: 4
} as const;

export function beatToPixel(beat: number, pixelsPerBeat: number): number {
	return beat * pixelsPerBeat;
}

export function pixelToBeat(pixel: number, pixelsPerBeat: number): number {
	return pixel / pixelsPerBeat;
}

export function snapToBeat(beat: number): number {
	return Math.round(beat * 4) / 4;
}

export function formatZoomDisplay(zoomLevel: number, baseZoom: number): string {
	return `${Math.round((zoomLevel / baseZoom) * 100)}%`;
}

export function clampZoomLevel(zoomLevel: number, delta: number, min: number = 0.25, max: number = 64): number {
	return Math.max(min, Math.min(max, zoomLevel + delta));
}

