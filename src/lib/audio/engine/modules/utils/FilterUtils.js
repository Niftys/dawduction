/**
 * Shared filter utilities for audio effects
 * Provides common filter implementations and coefficient calculations
 */

// Note: This file is concatenated with other modules, so we use a global class
class FilterUtils {
	/**
	 * Flush extremely small float values to zero to avoid denormals/subnormals
	 * Denormals can severely impact CPU performance in deep tails/low frequencies.
	 */
	static flushDenormals(x) {
		// Threshold tuned to be inaudible and effective for JS engines
		return (x > -1e-20 && x < 1e-20) ? 0 : x;
	}

	/**
	 * Calculate filter coefficients (cached to avoid recalculating every sample)
	 * @param {number} cutoff - Cutoff frequency
	 * @param {number} q - Q factor
	 * @param {string} type - Filter type ('lowpass', 'highpass', 'bandpass', 'notch', 'bell', 'lowshelf', 'highshelf')
	 * @param {number} gain - Gain in dB (for bell, notch, shelf filters)
	 * @param {number} sampleRate - Sample rate
	 * @returns {Object} Filter coefficients
	 */
	static calculateFilterCoeffs(cutoff, q, type, gain, sampleRate) {
		const clampedCutoff = Math.max(20, Math.min(20000, cutoff));
		const w0 = 2.0 * Math.PI * clampedCutoff / sampleRate;
		const cosw0 = Math.cos(w0);
		const sinw0 = Math.sin(w0);
		const A = Math.pow(10, (gain || 0) / 40);
		const alpha = sinw0 / (2.0 * q);
		
		if (type === 'lowpass') {
			const c = 1.0 / Math.tan(Math.PI * clampedCutoff / sampleRate);
			const a1 = 1.0 / (1.0 + q * c + c * c);
			return {
				a1: a1,
				a2: 2 * a1,
				a3: a1,
				b1: 2.0 * (1.0 - c * c) * a1,
				b2: (1.0 - q * c + c * c) * a1,
				a0: 1
			};
		} else if (type === 'highpass') {
			const c = 1.0 / Math.tan(Math.PI * clampedCutoff / sampleRate);
			const a1 = 1.0 / (1.0 + q * c + c * c);
			return {
				a1: a1,
				a2: -2 * a1,
				a3: a1,
				b1: 2.0 * (c * c - 1.0) * a1,
				b2: (1.0 - q * c + c * c) * a1,
				a0: 1
			};
		} else if (type === 'bandpass') {
			return {
				b0: alpha,
				b1: 0,
				b2: -alpha,
				a0: 1 + alpha,
				a1: -2 * cosw0,
				a2: 1 - alpha
			};
		} else if (type === 'notch') {
			return {
				b0: 1,
				b1: -2 * cosw0,
				b2: 1,
				a0: 1 + alpha,
				a1: -2 * cosw0,
				a2: 1 - alpha
			};
		} else if (type === 'bell') {
			return {
				b0: 1 + alpha * A,
				b1: -2 * cosw0,
				b2: 1 - alpha * A,
				a0: 1 + alpha / A,
				a1: -2 * cosw0,
				a2: 1 - alpha / A
			};
		} else if (type === 'lowshelf') {
			const sqrtA = Math.sqrt(A);
			return {
				b0: A * ((A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha),
				b1: 2 * A * ((A - 1) - (A + 1) * cosw0),
				b2: A * ((A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha),
				a0: (A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha,
				a1: -2 * ((A - 1) + (A + 1) * cosw0),
				a2: (A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha
			};
		} else if (type === 'highshelf') {
			const sqrtA = Math.sqrt(A);
			return {
				b0: A * ((A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha),
				b1: -2 * A * ((A - 1) + (A + 1) * cosw0),
				b2: A * ((A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha),
				a0: (A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha,
				a1: 2 * ((A - 1) - (A + 1) * cosw0),
				a2: (A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha
			};
		} else {
			// Default to bandpass
			return {
				b0: alpha,
				b1: 0,
				b2: -alpha,
				a0: 1 + alpha,
				a1: -2 * cosw0,
				a2: 1 - alpha
			};
		}
	}

	/**
	 * Apply filter with pre-calculated coefficients (generic, works for all filter types)
	 */
	static applyFilterWithCoeffs(input, state, coeffs, type, flushDenormals) {
		const flush = flushDenormals || FilterUtils.flushDenormals;
		let output;
		
		if (type === 'lowpass' || type === 'highpass') {
			// These use a1, a2, a3, b1, b2 format
			output = flush(
				coeffs.a1 * input + coeffs.a2 * state.x1 + coeffs.a3 * state.x2
				- coeffs.b1 * state.y1 - coeffs.b2 * state.y2
			);
		} else {
			// These use b0, b1, b2, a0, a1, a2 format
			output = flush(
				(coeffs.b0 / coeffs.a0) * input + (coeffs.b1 / coeffs.a0) * state.x1 + (coeffs.b2 / coeffs.a0) * state.x2
				- (coeffs.a1 / coeffs.a0) * state.y1 - (coeffs.a2 / coeffs.a0) * state.y2
			);
		}

		state.x2 = flush(state.x1);
		state.x1 = flush(input);
		state.y2 = flush(state.y1);
		state.y1 = output;

		return output;
	}

	/**
	 * Apply lowpass filter with pre-calculated coefficients
	 */
	static applyLowpassFilterWithCoeffs(input, state, coeffs, flushDenormals) {
		const flush = flushDenormals || FilterUtils.flushDenormals;
		const output = flush(
			coeffs.a1 * input + coeffs.a2 * state.x1 + coeffs.a3 * state.x2
			- coeffs.b1 * state.y1 - coeffs.b2 * state.y2
		);

		state.x2 = flush(state.x1);
		state.x1 = flush(input);
		state.y2 = flush(state.y1);
		state.y1 = output;

		return output;
	}

	/**
	 * Apply highpass filter with pre-calculated coefficients
	 */
	static applyHighpassFilterWithCoeffs(input, state, coeffs, flushDenormals) {
		const flush = flushDenormals || FilterUtils.flushDenormals;
		const output = flush(
			coeffs.a1 * input + coeffs.a2 * state.x1 + coeffs.a3 * state.x2
			- coeffs.b1 * state.y1 - coeffs.b2 * state.y2
		);

		state.x2 = flush(state.x1);
		state.x1 = flush(input);
		state.y2 = flush(state.y1);
		state.y1 = output;

		return output;
	}

	/**
	 * Apply bandpass filter with pre-calculated coefficients
	 */
	static applyBandpassFilterWithCoeffs(input, state, coeffs, flushDenormals) {
		const flush = flushDenormals || FilterUtils.flushDenormals;
		const output = flush(
			(coeffs.b0 / coeffs.a0) * input + (coeffs.b1 / coeffs.a0) * state.x1 + (coeffs.b2 / coeffs.a0) * state.x2
			- (coeffs.a1 / coeffs.a0) * state.y1 - (coeffs.a2 / coeffs.a0) * state.y2
		);

		state.x2 = flush(state.x1);
		state.x1 = flush(input);
		state.y2 = flush(state.y1);
		state.y1 = output;

		return output;
	}
}

