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

/**
 * High-pass filter using a biquad filter
 * @param {number} input - Input sample
 * @param {number} cutoff - Cutoff frequency in Hz
 * @param {number} resonance - Resonance (0-1)
 * @param {number} sampleRate - Sample rate
 * @param {Object} state - Filter state object {x1, x2, y1, y2}
 * @returns {number} Filtered output sample
 */
export function highpass(input, cutoff, resonance, sampleRate, state) {
	const c = Math.tan(Math.PI * cutoff / sampleRate);
	const a1 = 1.0 / (1.0 + resonance * c + c * c);
	const a2 = -2 * a1;
	const a3 = a1;
	const b1 = 2.0 * (c * c - 1.0) * a1;
	const b2 = (1.0 - resonance * c + c * c) * a1;

	const output = a1 * input + a2 * state.x1 + a3 * state.x2
		- b1 * state.y1 - b2 * state.y2;

	state.x2 = state.x1;
	state.x1 = input;
	state.y2 = state.y1;
	state.y1 = output;

	return output;
}

/**
 * Band-pass filter using a biquad filter
 * @param {number} input - Input sample
 * @param {number} centerFreq - Center frequency in Hz
 * @param {number} bandwidth - Bandwidth in Hz (Q = centerFreq / bandwidth)
 * @param {number} sampleRate - Sample rate
 * @param {Object} state - Filter state object {x1, x2, y1, y2}
 * @returns {number} Filtered output sample
 */
export function bandpass(input, centerFreq, bandwidth, sampleRate, state) {
	const w = 2 * Math.PI * centerFreq / sampleRate;
	const c = Math.cos(w);
	const s = Math.sin(w);
	const alpha = s * Math.sinh(Math.log(2) / 2 * bandwidth / centerFreq * w);
	const a0 = 1 + alpha;
	const a1 = -2 * c;
	const a2 = 1 - alpha;
	const b0 = alpha;
	const b1 = 0;
	const b2 = -alpha;

	const output = (b0 / a0) * input + (b1 / a0) * state.x1 + (b2 / a0) * state.x2
		- (a1 / a0) * state.y1 - (a2 / a0) * state.y2;

	state.x2 = state.x1;
	state.x1 = input;
	state.y2 = state.y1;
	state.y1 = output;

	return output;
}

