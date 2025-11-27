import type { Envelope } from '$lib/types/effects';

/**
 * Calculate the envelope value at a given progress (0-1) based on curve type and settings
 * @param progress - Progress through the envelope (0 = start, 1 = end)
 * @param settings - Envelope settings object containing startValue, endValue, curve, reverse
 * @param envelopeType - Type of envelope ('volume', 'filter', 'pitch', 'pan')
 * @returns The calculated envelope value (0-1)
 */
export function calculateEnvelopeCurveValue(
	progress: number,
	settings: Record<string, any>,
	envelopeType: string
): number {
	let defaultStart = 0;
	let defaultEnd = 1;
	if (envelopeType === 'pitch') {
		defaultStart = 0.5;
		defaultEnd = 0.5;
	}

	const startValue =
		settings.startValue !== undefined && settings.startValue !== null
			? settings.startValue
			: defaultStart;
	const endValue =
		settings.endValue !== undefined && settings.endValue !== null ? settings.endValue : defaultEnd;
	const curve = settings.curve || 'linear';
	const reverse = settings.reverse === true;

	// Apply reverse if needed
	let actualProgress = reverse ? 1.0 - progress : progress;

	let value: number;
	switch (curve) {
		case 'exponential':
			value =
				startValue +
				(endValue - startValue) * ((Math.exp(actualProgress * 5) - 1) / (Math.exp(5) - 1));
			break;
		case 'logarithmic':
			value =
				startValue +
				(endValue - startValue) * (Math.log(actualProgress * 9 + 1) / Math.log(10));
			break;
		case 'linear':
		default:
			value = startValue + (endValue - startValue) * actualProgress;
			break;
	}

	return Math.max(0, Math.min(1, value));
}

/**
 * Generate SVG path for envelope curve visualization
 * Returns a path string that can be used in an SVG <path> element
 * The startValue and endValue directly map to vertical positions in the clip
 * - startValue 0 = bottom, startValue 1 = top
 * - endValue 0 = bottom, endValue 1 = top
 * @param width - Width of the envelope clip in pixels
 * @param height - Height of the envelope clip in pixels
 * @param envelope - The envelope object containing type and settings
 * @param duration - Duration of the envelope in beats (not currently used, but kept for future expansion)
 * @returns SVG path string
 */
export function generateEnvelopeCurvePath(
	width: number,
	height: number,
	envelope: Envelope,
	duration: number
): string {
	if (!envelope || !envelope.settings) return '';

	const settings = envelope.settings;
	let defaultStart = 0;
	let defaultEnd = 1;
	if (envelope.type === 'pitch') {
		defaultStart = 0.5;
		defaultEnd = 0.5;
	}

	const startValue =
		settings.startValue !== undefined && settings.startValue !== null
			? settings.startValue
			: defaultStart;
	const endValue =
		settings.endValue !== undefined && settings.endValue !== null ? settings.endValue : defaultEnd;

	// Calculate start and end y positions based on startValue and endValue
	// value 0 = bottom (height), value 1 = top (0)
	const startY = height * (1 - startValue);
	const endY = height * (1 - endValue);

	const numPoints = Math.max(20, Math.floor(width / 2)); // Enough points for smooth curve
	const points: Array<[number, number]> = [];

	for (let i = 0; i <= numPoints; i++) {
		const progress = i / numPoints;
		const value = calculateEnvelopeCurveValue(progress, settings, envelope.type);

		// Map the calculated value (which is between startValue and endValue) to vertical position
		// value 0 = bottom (height), value 1 = top (0)
		const x = progress * width;
		const y = height * (1 - value);
		points.push([x, y]);
	}

	// Create path: start at bottom-left corner, go to start point on left edge,
	// curve through points, end at end point on right edge, then to bottom-right corner
	// Ensure all y values are clamped to [0, height] to prevent overflow
	const clampedStartY = Math.max(0, Math.min(height, startY));
	const clampedEndY = Math.max(0, Math.min(height, endY));
	
	let path = `M 0 ${height}`; // Move to bottom-left corner
	path += ` L 0 ${clampedStartY}`; // Line to start position on left edge (based on startValue)
	for (const [x, y] of points) {
		const clampedY = Math.max(0, Math.min(height, y));
		path += ` L ${x} ${clampedY}`; // Line to each curve point
	}
	path += ` L ${width} ${clampedEndY}`; // Line to end position on right edge (based on endValue)
	path += ` L ${width} ${height} Z`; // Line to bottom-right corner and close path

	return path;
}

