import type { ParameterAutomation, AutomationPoint } from '$lib/types/effects';

/**
 * Interpolate automation value at a given beat position
 * Uses linear interpolation between automation points
 * @param points - Array of automation points (sorted by beat)
 * @param beat - Beat position to get value for
 * @param min - Minimum value for the parameter
 * @param max - Maximum value for the parameter
 * @returns Interpolated value at the given beat
 */
export function getAutomationValueAtBeat(
	points: AutomationPoint[],
	beat: number,
	min: number,
	max: number
): number {
	if (!points || points.length === 0) {
		// No automation points - return default (middle value)
		return (min + max) / 2;
	}

	// Sort points by beat to ensure correct order
	const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);

	// If before first point, return first point's value
	if (beat <= sortedPoints[0].beat) {
		return sortedPoints[0].value;
	}

	// If after last point, return last point's value
	if (beat >= sortedPoints[sortedPoints.length - 1].beat) {
		return sortedPoints[sortedPoints.length - 1].value;
	}

	// Find the two points to interpolate between
	for (let i = 0; i < sortedPoints.length - 1; i++) {
		const p1 = sortedPoints[i];
		const p2 = sortedPoints[i + 1];

		if (beat >= p1.beat && beat <= p2.beat) {
			// Linear interpolation
			const t = (beat - p1.beat) / (p2.beat - p1.beat);
			return p1.value + (p2.value - p1.value) * t;
		}
	}

	// Fallback (shouldn't reach here)
	return sortedPoints[0].value;
}

/**
 * Generate SVG path for automation curve visualization
 * Returns a path string that can be used in an SVG <path> element
 * The automation points are interpolated and mapped to vertical positions
 * @param width - Width of the effect clip in pixels
 * @param height - Height of the effect clip in pixels
 * @param automation - The automation object containing points, min, and max
 * @param startBeat - Start beat of the timeline effect (for offset calculation)
 * @param duration - Duration of the timeline effect in beats
 * @returns SVG path string
 */
export function generateAutomationCurvePath(
	width: number,
	height: number,
	automation: ParameterAutomation,
	startBeat: number,
	duration: number
): string {
	if (!automation || !automation.points || automation.points.length === 0) {
		return '';
	}

	const { points, min, max } = automation;
	const endBeat = startBeat + duration;

	// Filter points that are within the clip's time range
	const relevantPoints = points.filter((p) => p.beat >= startBeat && p.beat <= endBeat);

	if (relevantPoints.length === 0) {
		return '';
	}

	// Sort points by beat
	const sortedPoints = [...relevantPoints].sort((a, b) => a.beat - b.beat);

	// Calculate number of points for smooth curve
	const numPoints = Math.max(20, Math.floor(width / 2));
	const curvePoints: Array<[number, number]> = [];

	// Generate curve points by interpolating between automation points
	for (let i = 0; i <= numPoints; i++) {
		const progress = i / numPoints;
		const beat = startBeat + progress * duration;

		// Get interpolated value at this beat
		const value = getAutomationValueAtBeat(points, beat, min, max);

		// Normalize value to 0-1 range based on min/max
		const normalizedValue = (value - min) / (max - min);

		// Map to pixel coordinates
		// value 0 = bottom (height), value 1 = top (0)
		const x = progress * width;
		const y = height * (1 - normalizedValue);
		curvePoints.push([x, y]);
	}

	// Create path: start at bottom-left, curve through points, end at bottom-right
	// Get first and last values for start/end positions
	const firstValue = getAutomationValueAtBeat(points, startBeat, min, max);
	const lastValue = getAutomationValueAtBeat(points, endBeat, min, max);
	const firstNormalized = (firstValue - min) / (max - min);
	const lastNormalized = (lastValue - min) / (max - min);

	const startY = height * (1 - firstNormalized);
	const endY = height * (1 - lastNormalized);

	// Clamp values to prevent overflow
	const clampedStartY = Math.max(0, Math.min(height, startY));
	const clampedEndY = Math.max(0, Math.min(height, endY));

	let path = `M 0 ${height}`; // Move to bottom-left corner
	path += ` L 0 ${clampedStartY}`; // Line to start position on left edge
	for (const [x, y] of curvePoints) {
		const clampedY = Math.max(0, Math.min(height, y));
		path += ` L ${x} ${clampedY}`; // Line to each curve point
	}
	path += ` L ${width} ${clampedEndY}`; // Line to end position on right edge
	path += ` L ${width} ${height} Z`; // Line to bottom-right corner and close path

	return path;
}

