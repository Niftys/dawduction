/**
 * Filter Processing for Waveform Visualization
 * Simplified filter implementations for visualization purposes
 */

import { VISUALIZATION_SAMPLE_RATE } from './constants';

export interface FilterState {
	y1: number;
	y2: number;
	x1: number;
	x2: number;
}

/**
 * Simple low-pass filter approximation
 * This is a simplified version for visualization purposes
 */
export function applyLowpassFilter(
	input: number,
	frequency: number,
	cutoff: number,
	resonance: number,
	filterState: FilterState
): number {
	// Simple IIR low-pass filter approximation
	// Use visualization sample rate for filter calculations
	const c = 1.0 / Math.tan(Math.PI * Math.min(cutoff, VISUALIZATION_SAMPLE_RATE / 2 - 1) / VISUALIZATION_SAMPLE_RATE);
	const a1 = 1.0 / (1.0 + resonance * c + c * c);
	const a2 = 2 * a1;
	const a3 = a1;
	const b1 = 2.0 * (1.0 - c * c) * a1;
	const b2 = (1.0 - resonance * c + c * c) * a1;
	
	const output = a1 * input + a2 * filterState.x1 + a3 * filterState.x2
		- b1 * filterState.y1 - b2 * filterState.y2;
	
	filterState.x2 = filterState.x1;
	filterState.x1 = input;
	filterState.y2 = filterState.y1;
	filterState.y1 = output;
	
	return output;
}

