/**
 * Shared filter utilities for synths
 * Provides common filter implementations
 */

/**
 * Low-pass filter using a biquad filter
 * @param {number} input - Input sample
 * @param {number} cutoff - Cutoff frequency in Hz
 * @param {number} resonance - Resonance (0-1)
 * @param {number} sampleRate - Sample rate
 * @param {Object} state - Filter state object {x1, x2, y1, y2}
 * @returns {number} Filtered output sample
 */
export function lowpass(input, cutoff, resonance, sampleRate, state) {
	const c = 1.0 / Math.tan(Math.PI * cutoff / sampleRate);
	const a1 = 1.0 / (1.0 + resonance * c + c * c);
	const a2 = 2 * a1;
	const a3 = a1;
	const b1 = 2.0 * (1.0 - c * c) * a1;
	const b2 = (1.0 - resonance * c + c * c) * a1;

	const output = a1 * input + a2 * state.x1 + a3 * state.x2
		- b1 * state.y1 - b2 * state.y2;

	state.x2 = state.x1;
	state.x1 = input;
	state.y2 = state.y1;
	state.y1 = output;

	return output;
}

