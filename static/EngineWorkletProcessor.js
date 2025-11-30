

// ========== UTILITIES ==========

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





// ========== EFFECT HANDLERS ==========

/**
 * Individual effect processor handlers
 * Each effect is extracted into its own handler class for better organization
 * Note: This file is concatenated with other modules, so FilterUtils must be loaded first
 */

/**
 * Base effect handler with common functionality
 */
class EffectHandler {
	constructor(effectsProcessor) {
		this.effectsProcessor = effectsProcessor;
		this._flushDenormals = (x) => (x > -1e-20 && x < 1e-20) ? 0 : x;
	}

	getSampleRate() {
		return (this.effectsProcessor.processor && this.effectsProcessor.processor.sampleRate) 
			? this.effectsProcessor.processor.sampleRate 
			: 44100;
	}
}

/**
 * Reverb effect handler
 */
class ReverbEffect extends EffectHandler {
	process(sample, settings, effect) {
		const sampleRate = this.getSampleRate();
		const reverbWet = settings.wet !== undefined ? Math.max(0, Math.min(1, settings.wet)) : 0.5;
		const reverbDry = settings.dry !== undefined ? Math.max(0, Math.min(1, settings.dry)) : 0.5;
		const reverbRoomSize = settings.roomSize !== undefined ? Math.max(0, Math.min(1, settings.roomSize)) : 0.5;
		const reverbDampening = settings.dampening !== undefined ? Math.max(0, Math.min(1, settings.dampening)) : 0.5;
		
		// Initialize reverb buffers if needed
		if (!this.effectsProcessor._reverbBuffers) {
			this.effectsProcessor._reverbBuffers = new Map();
		}
		const reverbKey = effect.timelineEffectId || 'global';
		
		if (!this.effectsProcessor._reverbBuffers.has(reverbKey)) {
			const maxReverbTime = 3.0;
			const reverbBufferSize = Math.floor(sampleRate * maxReverbTime * 1.5);
			const combDelays = [
				Math.floor(sampleRate * 0.0297),
				Math.floor(sampleRate * 0.0371),
				Math.floor(sampleRate * 0.0411),
				Math.floor(sampleRate * 0.0437)
			];
			const allpassDelays = [
				Math.floor(sampleRate * 0.005),
				Math.floor(sampleRate * 0.0017)
			];
			
			this.effectsProcessor._reverbBuffers.set(reverbKey, {
				combBuffers: combDelays.map(() => new Float32Array(reverbBufferSize)),
				combIndices: combDelays.map(() => 0),
				combDelays: combDelays,
				allpassBuffers: allpassDelays.map(() => new Float32Array(reverbBufferSize)),
				allpassIndices: allpassDelays.map(() => 0),
				allpassDelays: allpassDelays,
				lowpassStates: combDelays.map(() => 0)
			});
		}
		
		const reverbState = this.effectsProcessor._reverbBuffers.get(reverbKey);
		if (!reverbState) return sample;
		
		const reverbTime = 0.02 + (reverbRoomSize * 2.98);
		const baseFeedback = Math.pow(0.001, reverbState.combDelays[0] / (sampleRate * reverbTime));
		
		let processed = sample;
		for (let i = 0; i < reverbState.allpassDelays.length; i++) {
			const delay = reverbState.allpassDelays[i];
			const readIndex = (reverbState.allpassIndices[i] - delay + reverbState.allpassBuffers[i].length) % reverbState.allpassBuffers[i].length;
			const delayed = reverbState.allpassBuffers[i][readIndex];
			const allpassFeedback = 0.5;
			const output = processed + delayed * allpassFeedback;
			reverbState.allpassBuffers[i][reverbState.allpassIndices[i]] = processed - delayed * allpassFeedback;
			reverbState.allpassIndices[i] = (reverbState.allpassIndices[i] + 1) % reverbState.allpassBuffers[i].length;
			processed = output;
		}
		
		let reverbOutput = 0;
		for (let i = 0; i < reverbState.combDelays.length; i++) {
			const delay = reverbState.combDelays[i];
			const readIndex = (reverbState.combIndices[i] - delay + reverbState.combBuffers[i].length) % reverbState.combBuffers[i].length;
			let dampened = reverbState.combBuffers[i][readIndex];
			
			if (reverbDampening > 0) {
				const cutoff = 20000 * (1 - reverbDampening * 0.975);
				const rc = 1.0 / (cutoff * 2 * Math.PI / sampleRate);
				const alpha = 1.0 / (1.0 + rc);
				reverbState.lowpassStates[i] = alpha * dampened + (1 - alpha) * reverbState.lowpassStates[i];
				dampened = reverbState.lowpassStates[i];
			}
			
			const feedback = baseFeedback * (1 - reverbDampening * 0.3);
			reverbState.combBuffers[i][reverbState.combIndices[i]] = processed + dampened * feedback;
			reverbState.combIndices[i] = (reverbState.combIndices[i] + 1) % reverbState.combBuffers[i].length;
			reverbOutput += dampened;
		}
		
		reverbOutput /= reverbState.combDelays.length;
		return sample * reverbDry + reverbOutput * reverbWet;
	}
}

/**
 * Delay effect handler
 */
class DelayEffect extends EffectHandler {
	process(sample, settings, effect) {
		const sampleRate = this.getSampleRate();
		const delayWet = settings.wet !== undefined ? Math.max(0, Math.min(1, settings.wet)) : 0.5;
		const delayDry = settings.dry !== undefined ? Math.max(0, Math.min(1, settings.dry)) : 0.5;
		const delayFeedback = settings.feedback !== undefined ? Math.max(0, Math.min(0.99, settings.feedback)) : 0.5;
		const delayTime = settings.time !== undefined ? Math.max(0, Math.min(2.0, settings.time)) : 0.25;
		
		if (!this.effectsProcessor._delayBuffers) {
			this.effectsProcessor._delayBuffers = new Map();
		}
		const delayKey = effect.timelineEffectId || 'global';
		const maxDelayTime = 2.0;
		const delayBufferSize = Math.floor(sampleRate * maxDelayTime * 1.5);
		
		if (!this.effectsProcessor._delayBuffers.has(delayKey)) {
			this.effectsProcessor._delayBuffers.set(delayKey, {
				buffer: new Float32Array(delayBufferSize),
				writeIndex: 0
			});
		}
		const delayState = this.effectsProcessor._delayBuffers.get(delayKey);
		
		const delaySamples = Math.floor(delayTime * sampleRate);
		const delayReadIndex = (delayState.writeIndex - delaySamples + delayBufferSize) % delayBufferSize;
		const delayReadIndex1 = Math.floor(delayReadIndex);
		const delayReadIndex2 = (delayReadIndex1 + 1) % delayBufferSize;
		const delayFrac = delayReadIndex - delayReadIndex1;
		const delayedSample1 = delayState.buffer[delayReadIndex1];
		const delayedSample2 = delayState.buffer[delayReadIndex2];
		const delayedSample = delayedSample1 * (1 - delayFrac) + delayedSample2 * delayFrac;
		
		delayState.buffer[delayState.writeIndex] = sample + (delayedSample * delayFeedback);
		delayState.writeIndex = (delayState.writeIndex + 1) % delayBufferSize;
		
		return sample * delayDry + delayedSample * delayWet;
	}
}

/**
 * Filter effect handler
 */
class FilterEffect extends EffectHandler {
	process(sample, settings, effect) {
		const sampleRate = this.getSampleRate();
		const filterFreq = settings.frequency !== undefined ? Math.max(0, Math.min(1, settings.frequency)) : 0.5;
		const filterResonance = settings.resonance !== undefined ? Math.max(0, Math.min(1, settings.resonance)) : 0.5;
		const filterType = settings.type || 'lowpass';
		
		if (!this.effectsProcessor._filterStates) {
			this.effectsProcessor._filterStates = new Map();
		}
		const filterKey = effect.timelineEffectId || 'global';
		
		if (!this.effectsProcessor._filterStates.has(filterKey)) {
			this.effectsProcessor._filterStates.set(filterKey, {
				x1: 0, x2: 0, y1: 0, y2: 0,
				cachedCutoff: -1,
				cachedQ: -1,
				cachedType: '',
				cachedSampleRate: 0,
				coeffs: null
			});
		}
		const filterState = this.effectsProcessor._filterStates.get(filterKey);
		if (!filterState) return sample;
		
		const minFreq = 20;
		const maxFreq = 20000;
		const cutoff = minFreq + (filterFreq * (maxFreq - minFreq));
		const q = 0.5 + (filterResonance * 9.5);
		
		if (filterState.cachedCutoff !== cutoff || filterState.cachedQ !== q ||
			filterState.cachedType !== filterType || filterState.cachedSampleRate !== sampleRate) {
			filterState.cachedCutoff = cutoff;
			filterState.cachedQ = q;
			filterState.cachedType = filterType;
			filterState.cachedSampleRate = sampleRate;
			filterState.coeffs = FilterUtils.calculateFilterCoeffs(cutoff, q, filterType, 0, sampleRate);
		}
		
		let filtered = sample;
		if (filterType === 'lowpass') {
			filtered = FilterUtils.applyLowpassFilterWithCoeffs(sample, filterState, filterState.coeffs, this._flushDenormals);
		} else if (filterType === 'highpass') {
			filtered = FilterUtils.applyHighpassFilterWithCoeffs(sample, filterState, filterState.coeffs, this._flushDenormals);
		} else if (filterType === 'bandpass') {
			filtered = FilterUtils.applyBandpassFilterWithCoeffs(sample, filterState, filterState.coeffs, this._flushDenormals);
		}
		
		return filtered;
	}
}

/**
 * Distortion effect handler
 */
class DistortionEffect extends EffectHandler {
	process(sample, settings, effect) {
		const distortionDrive = settings.drive !== undefined ? Math.max(0, Math.min(1, settings.drive)) : 0.5;
		const distortionAmount = settings.amount !== undefined ? Math.max(0, Math.min(1, settings.amount)) : 0.3;
		
		const driveMultiplier = 1 + (distortionDrive * 19);
		const driven = sample * driveMultiplier;
		let distorted = Math.tanh(driven);
		
		if (distortionDrive > 0.7) {
			const hardClipAmount = (distortionDrive - 0.7) / 0.3;
			distorted = distorted * (1 - hardClipAmount) + Math.max(-1, Math.min(1, driven)) * hardClipAmount;
		}
		
		return sample * (1 - distortionAmount) + distorted * distortionAmount;
	}
}

/**
 * Compressor effect handler
 */
class CompressorEffect extends EffectHandler {
	process(sample, settings, effect) {
		const sampleRate = this.getSampleRate();
		const compThreshold = settings.threshold !== undefined ? Math.max(0, Math.min(1, settings.threshold)) : 0.7;
		const compRatio = settings.ratio !== undefined ? Math.max(1, Math.min(20, settings.ratio)) : 4;
		const compAttack = settings.attack !== undefined ? Math.max(0, Math.min(1, settings.attack)) : 0.01;
		const compRelease = settings.release !== undefined ? Math.max(0, Math.min(1, settings.release)) : 0.1;
		
		if (!this.effectsProcessor._compressorStates) {
			this.effectsProcessor._compressorStates = new Map();
		}
		const compKey = effect.timelineEffectId || 'global';
		
		if (!this.effectsProcessor._compressorStates.has(compKey)) {
			this.effectsProcessor._compressorStates.set(compKey, {
				envelope: 0,
				attackCoeff: 0,
				releaseCoeff: 0,
				cachedAttack: -1,
				cachedRelease: -1,
				cachedSampleRate: 0
			});
		}
		const compState = this.effectsProcessor._compressorStates.get(compKey);
		
		if (compState.cachedAttack !== compAttack || compState.cachedRelease !== compRelease || compState.cachedSampleRate !== sampleRate) {
			compState.attackCoeff = Math.exp(-1.0 / (compAttack * sampleRate * 0.001 + 0.0001));
			compState.releaseCoeff = Math.exp(-1.0 / (compRelease * sampleRate * 0.001 + 0.0001));
			compState.cachedAttack = compAttack;
			compState.cachedRelease = compRelease;
			compState.cachedSampleRate = sampleRate;
		}
		
		const absSample = Math.abs(sample);
		let targetGain = 1.0;
		if (absSample > compThreshold) {
			const excess = absSample - compThreshold;
			const compressed = compThreshold + excess / compRatio;
			targetGain = compressed / absSample;
		}
		
		if (targetGain < compState.envelope) {
			compState.envelope = targetGain + (compState.envelope - targetGain) * compState.attackCoeff;
		} else {
			compState.envelope = targetGain + (compState.envelope - targetGain) * compState.releaseCoeff;
		}
		
		return sample * compState.envelope;
	}
}

/**
 * Chorus effect handler
 */
class ChorusEffect extends EffectHandler {
	process(sample, settings, effect) {
		const sampleRate = this.getSampleRate();
		const chorusWet = settings.wet !== undefined ? Math.max(0, Math.min(1, settings.wet)) : 0.5;
		const chorusRate = settings.rate !== undefined ? Math.max(0, Math.min(1, settings.rate)) : 0.5;
		const chorusDepth = settings.depth !== undefined ? Math.max(0, Math.min(1, settings.depth)) : 0.6;
		const chorusDelay = settings.delay !== undefined ? Math.max(0, Math.min(0.1, settings.delay)) : 0.02;
		
		if (!this.effectsProcessor._chorusBuffers) {
			this.effectsProcessor._chorusBuffers = new Map();
			this.effectsProcessor._chorusPhases = new Map();
			this.effectsProcessor._chorusCache = new Map();
		}
		const chorusKey = effect.timelineEffectId || 'global';
		const maxDelay = 0.1;
		const chorusBufferSize = Math.floor(sampleRate * maxDelay * 1.5);
		
		if (!this.effectsProcessor._chorusBuffers.has(chorusKey)) {
			this.effectsProcessor._chorusBuffers.set(chorusKey, {
				buffer: new Float32Array(chorusBufferSize),
				writeIndex: 0
			});
			this.effectsProcessor._chorusPhases.set(chorusKey, 0);
			this.effectsProcessor._chorusCache.set(chorusKey, {
				lfoFreq: 0,
				delaySamples: 0,
				cachedRate: -1,
				cachedDelay: -1,
				cachedDepth: -1,
				cachedSampleRate: 0
			});
		}
		const chorusState = this.effectsProcessor._chorusBuffers.get(chorusKey);
		const chorusPhase = this.effectsProcessor._chorusPhases.get(chorusKey);
		const chorusCache = this.effectsProcessor._chorusCache.get(chorusKey);
		
		if (chorusCache.cachedRate !== chorusRate || chorusCache.cachedDelay !== chorusDelay ||
			chorusCache.cachedDepth !== chorusDepth || chorusCache.cachedSampleRate !== sampleRate) {
			chorusCache.lfoFreq = 0.1 + (chorusRate * 9.9);
			chorusCache.delaySamples = chorusDelay * sampleRate;
			chorusCache.cachedRate = chorusRate;
			chorusCache.cachedDelay = chorusDelay;
			chorusCache.cachedDepth = chorusDepth;
			chorusCache.cachedSampleRate = sampleRate;
		}
		
		chorusState.buffer[chorusState.writeIndex] = sample;
		chorusState.writeIndex = (chorusState.writeIndex + 1) % chorusState.buffer.length;
		
		const lfo = Math.sin(chorusPhase * 2 * Math.PI * chorusCache.lfoFreq);
		const modulatedDelay = chorusDelay * (1 + lfo * chorusDepth);
		const readPos = chorusState.writeIndex - (modulatedDelay * sampleRate);
		const readIndex1 = Math.floor(readPos);
		const readIndex2 = readIndex1 + 1;
		const frac = readPos - readIndex1;
		
		let idx1 = readIndex1 % chorusBufferSize;
		if (idx1 < 0) idx1 += chorusBufferSize;
		let idx2 = readIndex2 % chorusBufferSize;
		if (idx2 < 0) idx2 += chorusBufferSize;
		
		const sample1 = chorusState.buffer[idx1];
		const sample2 = chorusState.buffer[idx2];
		const chorusedSample = sample1 * (1 - frac) + sample2 * frac;
		
		this.effectsProcessor._chorusPhases.set(chorusKey, (chorusPhase + chorusCache.lfoFreq / sampleRate) % 1.0);
		
		return sample * (1 - chorusWet) + chorusedSample * chorusWet;
	}
}

/**
 * Saturator effect handler
 */
class SaturatorEffect extends EffectHandler {
	process(sample, settings, effect) {
		const sampleRate = this.getSampleRate();
		const satAmount = settings.amount !== undefined ? Math.max(0, Math.min(1, settings.amount)) : 0.3;
		const satDrive = settings.drive !== undefined ? Math.max(0, Math.min(1, settings.drive)) : 0.5;
		const satTone = settings.tone !== undefined ? Math.max(0, Math.min(1, settings.tone)) : 0.5;
		const satWet = settings.wet !== undefined ? Math.max(0, Math.min(1, settings.wet)) : 0.5;
		
		if (!this.effectsProcessor._saturatorStates) {
			this.effectsProcessor._saturatorStates = new Map();
		}
		const satKey = effect.timelineEffectId || 'global';
		
		if (!this.effectsProcessor._saturatorStates.has(satKey)) {
			this.effectsProcessor._saturatorStates.set(satKey, {
				toneState: { x1: 0, x2: 0, y1: 0, y2: 0 },
				cachedTone: -1,
				cachedSampleRate: 0,
				toneCoeffs: null
			});
		}
		const satState = this.effectsProcessor._saturatorStates.get(satKey);
		
		let toneFiltered = sample;
		if (satTone !== 0.5) {
			const toneCutoff = 500 + (satTone * 4500);
			
			if (satState.cachedTone !== satTone || satState.cachedSampleRate !== sampleRate) {
				satState.cachedTone = satTone;
				satState.cachedSampleRate = sampleRate;
				
				if (satTone > 0.5) {
					satState.toneCoeffs = FilterUtils.calculateFilterCoeffs(toneCutoff, 0.707, 'highpass', 0, sampleRate);
				} else {
					satState.toneCoeffs = FilterUtils.calculateFilterCoeffs(toneCutoff, 0.707, 'lowpass', 0, sampleRate);
				}
			}
			
			if (satTone > 0.5) {
				toneFiltered = FilterUtils.applyHighpassFilterWithCoeffs(sample, satState.toneState, satState.toneCoeffs, this._flushDenormals);
			} else {
				toneFiltered = FilterUtils.applyLowpassFilterWithCoeffs(sample, satState.toneState, satState.toneCoeffs, this._flushDenormals);
			}
		}
		
		const satDriveMultiplier = 1 + (satDrive * 19);
		const satDriven = toneFiltered * satDriveMultiplier;
		let saturated = Math.tanh(satDriven);
		
		const saturatedMix = sample * (1 - satAmount) + saturated * satAmount;
		return sample * (1 - satWet) + saturatedMix * satWet;
	}
}

/**
 * Equalizer effect handler
 */
class EqualizerEffect extends EffectHandler {
	process(sample, settings, effect) {
		const sampleRate = this.getSampleRate();
		const hasNewFormat = settings.band0 !== undefined;
		
		if (!this.effectsProcessor._eqStates) {
			this.effectsProcessor._eqStates = new Map();
		}
		const eqKey = effect.timelineEffectId || 'global';
		
		if (!this.effectsProcessor._eqStates.has(eqKey)) {
			const state = {
				bands: [],
				cachedSampleRate: 0,
				lowState: { x1: 0, x2: 0, y1: 0, y2: 0 },
				midState: { x1: 0, x2: 0, y1: 0, y2: 0 },
				highState: { x1: 0, x2: 0, y1: 0, y2: 0 },
				cachedLowFreq: -1,
				cachedMidFreq: -1,
				cachedHighFreq: -1,
				cachedLowQ: -1,
				cachedMidQ: -1,
				cachedHighQ: -1,
				lowCoeffs: null,
				midCoeffs: null,
				highCoeffs: null
			};
			for (let i = 0; i < 8; i++) {
				state.bands.push({
					state: { x1: 0, x2: 0, y1: 0, y2: 0 },
					cachedFreq: -1,
					cachedQ: -1,
					cachedGain: -1,
					cachedType: null,
					coeffs: null
				});
			}
			this.effectsProcessor._eqStates.set(eqKey, state);
		}
		const eqState = this.effectsProcessor._eqStates.get(eqKey);
		
		let eqProcessed = sample;
		
		if (hasNewFormat) {
			for (let i = 0; i < 8; i++) {
				const bandData = settings[`band${i}`];
				if (!bandData || !bandData.enabled) continue;
				
				const bandFreq = Math.max(20, Math.min(20000, bandData.frequency || 1000));
				const bandQ = Math.max(0.1, Math.min(10, bandData.q || 0.71));
				const bandGain = Math.max(-12, Math.min(12, bandData.gain || 0));
				const bandType = bandData.type || 'bell';
				
				const bandState = eqState.bands[i];
				
				if (bandState.cachedFreq !== bandFreq || bandState.cachedQ !== bandQ ||
					bandState.cachedGain !== bandGain || bandState.cachedType !== bandType ||
					eqState.cachedSampleRate !== sampleRate) {
					bandState.cachedFreq = bandFreq;
					bandState.cachedQ = bandQ;
					bandState.cachedGain = bandGain;
					bandState.cachedType = bandType;
					eqState.cachedSampleRate = sampleRate;
					bandState.coeffs = FilterUtils.calculateFilterCoeffs(bandFreq, bandQ, bandType, bandGain, sampleRate);
				}
				
				if (bandState.coeffs) {
					const filtered = FilterUtils.applyFilterWithCoeffs(sample, bandState.state, bandState.coeffs, bandType, this._flushDenormals);
					if (bandType === 'bell' || bandType === 'notch' || bandType === 'lowshelf' || bandType === 'highshelf') {
						eqProcessed = eqProcessed + (filtered - sample);
					} else {
						if (Math.abs(bandGain) > 0.01) {
							const gainLinear = Math.pow(10, bandGain / 20);
							eqProcessed = eqProcessed + (filtered * (gainLinear - 1));
						}
					}
				}
			}
		} else {
			// Legacy 3-band format
			const eqLowGain = settings.lowGain !== undefined ? Math.max(-12, Math.min(12, settings.lowGain)) : 0;
			const eqMidGain = settings.midGain !== undefined ? Math.max(-12, Math.min(12, settings.midGain)) : 0;
			const eqHighGain = settings.highGain !== undefined ? Math.max(-12, Math.min(12, settings.highGain)) : 0;
			const eqLowFreq = settings.lowFreq !== undefined ? Math.max(20, Math.min(1000, settings.lowFreq)) : 200;
			const eqMidFreq = settings.midFreq !== undefined ? Math.max(200, Math.min(8000, settings.midFreq)) : 2000;
			const eqHighFreq = settings.highFreq !== undefined ? Math.max(2000, Math.min(20000, settings.highFreq)) : 8000;
			const eqLowQ = settings.lowQ !== undefined ? Math.max(0.1, Math.min(10, settings.lowQ)) : 1;
			const eqMidQ = settings.midQ !== undefined ? Math.max(0.1, Math.min(10, settings.midQ)) : 1;
			const eqHighQ = settings.highQ !== undefined ? Math.max(0.1, Math.min(10, settings.highQ)) : 1;
			
			if (eqState.cachedLowFreq !== eqLowFreq || eqState.cachedLowQ !== eqLowQ ||
				eqState.cachedSampleRate !== sampleRate) {
				eqState.cachedLowFreq = eqLowFreq;
				eqState.cachedLowQ = eqLowQ;
				eqState.lowCoeffs = FilterUtils.calculateFilterCoeffs(eqLowFreq, eqLowQ, 'lowpass', 0, sampleRate);
			}
			
			if (eqState.cachedMidFreq !== eqMidFreq || eqState.cachedMidQ !== eqMidQ ||
				eqState.cachedSampleRate !== sampleRate) {
				eqState.cachedMidFreq = eqMidFreq;
				eqState.cachedMidQ = eqMidQ;
				eqState.midCoeffs = FilterUtils.calculateFilterCoeffs(eqMidFreq, eqMidQ, 'bandpass', 0, sampleRate);
			}
			
			if (eqState.cachedHighFreq !== eqHighFreq || eqState.cachedHighQ !== eqHighQ ||
				eqState.cachedSampleRate !== sampleRate) {
				eqState.cachedHighFreq = eqHighFreq;
				eqState.cachedHighQ = eqHighQ;
				eqState.cachedSampleRate = sampleRate;
				eqState.highCoeffs = FilterUtils.calculateFilterCoeffs(eqHighFreq, eqHighQ, 'highpass', 0, sampleRate);
			}
			
			if (Math.abs(eqLowGain) > 0.01) {
				const lowFiltered = FilterUtils.applyLowpassFilterWithCoeffs(sample, eqState.lowState, eqState.lowCoeffs, this._flushDenormals);
				const lowGainLinear = Math.pow(10, eqLowGain / 20);
				eqProcessed = eqProcessed + (lowFiltered * (lowGainLinear - 1));
			}
			
			if (Math.abs(eqMidGain) > 0.01) {
				const midFiltered = FilterUtils.applyBandpassFilterWithCoeffs(sample, eqState.midState, eqState.midCoeffs, this._flushDenormals);
				const midGainLinear = Math.pow(10, eqMidGain / 20);
				eqProcessed = eqProcessed + (midFiltered * (midGainLinear - 1));
			}
			
			if (Math.abs(eqHighGain) > 0.01) {
				const highFiltered = FilterUtils.applyHighpassFilterWithCoeffs(sample, eqState.highState, eqState.highCoeffs, this._flushDenormals);
				const highGainLinear = Math.pow(10, eqHighGain / 20);
				eqProcessed = eqProcessed + (highFiltered * (highGainLinear - 1));
			}
		}
		
		return eqProcessed;
	}
}

// Effect handlers map (available globally after concatenation)
const EffectHandlers = {
	reverb: ReverbEffect,
	delay: DelayEffect,
	filter: FilterEffect,
	distortion: DistortionEffect,
	compressor: CompressorEffect,
	chorus: ChorusEffect,
	saturator: SaturatorEffect,
	equalizer: EqualizerEffect
};





// ========== MODULES ==========

/**
 * Manages track state (volume, pan, mute, solo)
 * This module handles all per-track audio state
 */

class TrackStateManager {
	constructor() {
		this.trackVolumes = new Map();
		this.trackPans = new Map();
		this.trackMutes = new Map();
		this.trackSolos = new Map();
	}

	initializeTracks(tracks) {
		if (!tracks) return;
		
		for (const track of tracks) {
			this.trackVolumes.set(track.id, (track.volume !== undefined && track.volume !== null) ? track.volume : 1.0);
			this.trackPans.set(track.id, (track.pan !== undefined && track.pan !== null) ? track.pan : 0.0);
			this.trackMutes.set(track.id, (track.mute !== undefined && track.mute !== null) ? track.mute : false);
			this.trackSolos.set(track.id, (track.solo !== undefined && track.solo !== null) ? track.solo : false);
		}
	}

	updateTrack(trackId, updatedTrack) {
		if (updatedTrack.volume !== undefined) {
			this.trackVolumes.set(trackId, updatedTrack.volume);
		}
		if (updatedTrack.pan !== undefined) {
			this.trackPans.set(trackId, updatedTrack.pan);
		}
		if (updatedTrack.mute !== undefined) {
			this.trackMutes.set(trackId, updatedTrack.mute);
		}
		if (updatedTrack.solo !== undefined) {
			this.trackSolos.set(trackId, updatedTrack.solo);
		}
	}

	setVolume(trackId, volume) {
		this.trackVolumes.set(trackId, volume);
	}

	setPan(trackId, pan) {
		this.trackPans.set(trackId, pan);
	}

	setMute(trackId, mute) {
		this.trackMutes.set(trackId, mute);
	}

	setSolo(trackId, solo) {
		this.trackSolos.set(trackId, solo);
	}

	getVolume(trackId) {
		const volume = this.trackVolumes.get(trackId);
		return (volume !== undefined && volume !== null) ? volume : 1.0;
	}

	getPan(trackId) {
		const pan = this.trackPans.get(trackId);
		return (pan !== undefined && pan !== null) ? pan : 0.0;
	}

	isMuted(trackId) {
		const muted = this.trackMutes.get(trackId);
		return (muted !== undefined && muted !== null) ? muted : false;
	}

	isSoloed(trackId) {
		const soloed = this.trackSolos.get(trackId);
		return (soloed !== undefined && soloed !== null) ? soloed : false;
	}

	hasAnySoloedTrack() {
		for (const solo of this.trackSolos.values()) {
			if (solo) return true;
		}
		return false;
	}

	removeTrack(trackId) {
		this.trackVolumes.delete(trackId);
		this.trackPans.delete(trackId);
		this.trackMutes.delete(trackId);
		this.trackSolos.delete(trackId);
	}

	clear() {
		this.trackVolumes.clear();
		this.trackPans.clear();
		this.trackMutes.clear();
		this.trackSolos.clear();
	}
}



/**
 * Manages playback state, tempo, and transport control
 * Handles play/stop/pause and tempo changes
 */

class PlaybackController {
	constructor(processor) {
		this.processor = processor;
		this.isPlaying = false;
		this.bpm = 120;
		this.beatsPerSecond = this.bpm / 60;
		this.samplesPerBeat = this.processor.sampleRate / this.beatsPerSecond;
	}

	setTempo(bpm) {
		this.bpm = bpm;
		this.beatsPerSecond = bpm / 60;
		this.samplesPerBeat = this.processor.sampleRate / this.beatsPerSecond;
	}

	setTransport(state, position = 0) {
		this.isPlaying = state === 'play';
		this.processor.currentTime = position * this.samplesPerBeat;
	}

	getCurrentBeat() {
		return this.processor.currentTime / this.samplesPerBeat;
	}

	getBPM() {
		return this.bpm;
	}

	isTransportPlaying() {
		return this.isPlaying;
	}
}



/**
 * Handles event scheduling and timing
 * Manages when events should be triggered based on playback position
 */

class EventScheduler {
	constructor(processor) {
		this.processor = processor;
		this.scheduledEvents = new Map();
		this._lastScheduledBeat = -1;
		// Adaptive scheduling interval: smaller for dense timelines, larger for sparse ones
		// This reduces unnecessary iterations when there are many events
		this._scheduleInterval = 0.1; // Only schedule every 0.1 beats (~83ms at 120 BPM)
		// Track which events have been scheduled to avoid re-checking them
		this._scheduledEventKeys = new Set(); // Format: "eventIndex_sampleTime"
		// Track the last event index we've checked to enable incremental scheduling
		this._lastCheckedEventIndex = -1;
		// Cleanup threshold: remove scheduled events older than this (in samples)
		this._cleanupThresholdSamples = processor.sampleRate * 0.5; // 500ms lookback
		// Track event count to adapt scheduling interval
		this._lastEventCount = 0;
	}

	scheduleEvents() {
		const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
		const currentSampleTime = this.processor.currentTime;
		
		// If playback looped backwards, allow scheduling immediately
		if (this._lastScheduledBeat > currentBeat) {
			this._lastScheduledBeat = -1;
		}
		
		// Clean up old scheduled events that have already passed
		this._cleanupOldEvents(currentSampleTime);
		
		// Adaptive scheduling interval based on event density
		const events = this.processor.projectManager.events;
		const eventCount = events ? events.length : 0;
		if (eventCount !== this._lastEventCount) {
			// Adjust interval based on event count: more events = less frequent scheduling
			// This prevents excessive iterations when there are many events
			if (eventCount > 1000) {
				this._scheduleInterval = 0.2; // 200ms for very dense timelines
			} else if (eventCount > 500) {
				this._scheduleInterval = 0.15; // 150ms for dense timelines
			} else {
				this._scheduleInterval = 0.1; // 100ms for normal timelines
			}
			this._lastEventCount = eventCount;
		}
		
		// Only schedule if we've moved forward enough (optimization)
		if (this._lastScheduledBeat >= 0 && (currentBeat - this._lastScheduledBeat) < this._scheduleInterval) {
			return; // Skip scheduling if we haven't moved forward enough
		}
		this._lastScheduledBeat = currentBeat;
		
		const lookaheadTime = 0.15; // 150ms
		const lookaheadBeat = currentBeat + lookaheadTime * this.processor.playbackController.beatsPerSecond;
		
		// Get pattern length for looping
		const patternLength = this.getPatternLength();
		const isTimelineMode = this.processor.projectManager.isArrangementView && this.processor.projectManager.timeline && this.processor.projectManager.timeline.totalLength;

		// In arrangement view, schedule events with a window relative to current beat
		const timelineLength = isTimelineMode ? this.processor.projectManager.timeline.totalLength : 0;
		let extendedLookahead = lookaheadBeat;
		if (isTimelineMode) {
			const timelineWindow = timelineLength > 0 ? Math.min(Math.max(timelineLength * 0.1, 2.0), timelineLength) : 4.0;
			extendedLookahead = currentBeat + timelineWindow;
		}

		// Use events already declared above (line 32)
		if (!events || events.length === 0) return;

		let scheduledThisCall = 0;
		// Optimized: Only check events that haven't been scheduled yet or are in the lookahead window
		// Start from where we left off for incremental scheduling
		const startIndex = Math.max(0, this._lastCheckedEventIndex);
		
		// Schedule events in the lookahead window
		for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
			const event = events[eventIndex];
			let eventTime = event.time;
			
			// For timeline/arrangement mode, use absolute times
			if (isTimelineMode) {
				const timelineLength = this.processor.projectManager.timeline.totalLength;
				// In arrangement view, events are at absolute timeline positions
				// For first loop, use absolute times directly
				// For subsequent loops, normalize and add loop offset
				const loopNumber = Math.floor(currentBeat / timelineLength);
				
				if (loopNumber === 0) {
					// First loop: use absolute event time directly (no normalization)
					eventTime = eventTime;
				} else {
					// Subsequent loops: normalize and add loop offset
					const normalizedEventTime = eventTime % timelineLength;
					eventTime = normalizedEventTime + (loopNumber * timelineLength);
				}
				
				// Also check if event should play in next loop (if we're near the end of current loop)
				const beatInCurrentLoop = currentBeat % timelineLength;
				const lookaheadInCurrentLoop = lookaheadBeat % timelineLength;
				const crossesLoopBoundary = lookaheadInCurrentLoop < beatInCurrentLoop || 
				                           lookaheadBeat >= timelineLength * (loopNumber + 1);
				
				if (crossesLoopBoundary && loopNumber === 0) {
					// We're wrapping to next loop, check next loop events
					const normalizedEventTime = eventTime % timelineLength;
					const nextLoopEventTime = normalizedEventTime + timelineLength;
					if (nextLoopEventTime >= currentBeat && nextLoopEventTime < lookaheadBeat) {
						eventTime = nextLoopEventTime;
					}
				} else if (crossesLoopBoundary && loopNumber > 0) {
					// Already in a loop, check next loop
					const normalizedEventTime = eventTime % timelineLength;
					const nextLoopEventTime = normalizedEventTime + ((loopNumber + 1) * timelineLength);
					if (nextLoopEventTime >= currentBeat && nextLoopEventTime < lookaheadBeat) {
						eventTime = nextLoopEventTime;
					}
				}
			} else {
				// For pattern mode, normalize to current pattern loop
				eventTime = event.time % patternLength;
			}
			
			// Check if event is in current lookahead window
			// Use extended lookahead for arrangement view to schedule events further ahead
			const checkLookahead = isTimelineMode ? extendedLookahead : lookaheadBeat;
			// Use <= for lookahead to include events at the exact lookahead boundary
			// Also handle events at time 0.0 specially to ensure they're scheduled
			if (eventTime >= currentBeat && eventTime <= checkLookahead) {
				const eventSampleTime = Math.floor(eventTime * this.processor.playbackController.samplesPerBeat);
				const eventKey = `${eventIndex}_${eventSampleTime}`;
				
				// Skip if already scheduled
				if (this._scheduledEventKeys.has(eventKey)) {
					continue;
				}
				
				if (!this.scheduledEvents.has(eventSampleTime)) {
					this.scheduledEvents.set(eventSampleTime, []);
				}
				// Only schedule if not already scheduled (double-check for duplicates)
				const existing = this.scheduledEvents.get(eventSampleTime);
				if (!existing.some(e => e.instrumentId === event.instrumentId && e.time === event.time && e.pitch === event.pitch)) {
					this.scheduledEvents.get(eventSampleTime).push(event);
					this._scheduledEventKeys.add(eventKey);
					scheduledThisCall++;
				}
			} else if (eventTime > checkLookahead) {
				// Events are sorted by time, so we can break early if we've passed the lookahead window
				// But only if we're not in timeline mode with looping (where events might wrap)
				if (!isTimelineMode) {
					break;
				}
			}
		}
		
		// Update last checked index for incremental scheduling
		this._lastCheckedEventIndex = events.length - 1;
		
		// Debug: Log scheduling summary (disabled for cleaner logs)
		// if (scheduledThisCall > 0 && (!this._lastScheduledCount || scheduledThisCall !== this._lastScheduledCount)) {
		// 	this._lastScheduledCount = scheduledThisCall;
		// 	this.processor.port.postMessage({
		// 		type: 'debug',
		// 		message: 'EventScheduler: Scheduling summary',
		// 		data: {
		// 			scheduledThisCall,
		// 			totalScheduled: this.scheduledEvents.size
		// 		}
		// 	});
		// }
	}

	getEventsAtTime(sampleTime) {
		return this.scheduledEvents.get(sampleTime);
	}

	removeEventsAtTime(sampleTime) {
		if (this.scheduledEvents.has(sampleTime)) {
			// Clean up the scheduled event keys for this sample time
			// We need to find and remove all keys that match this sampleTime
			for (const key of this._scheduledEventKeys) {
				if (key.endsWith(`_${sampleTime}`)) {
					this._scheduledEventKeys.delete(key);
				}
			}
			this.scheduledEvents.delete(sampleTime);
		}
	}
	
	/**
	 * Clean up old scheduled events that have already passed
	 * This prevents the Map from growing indefinitely
	 */
	_cleanupOldEvents(currentSampleTime) {
		const cleanupThreshold = currentSampleTime - this._cleanupThresholdSamples;
		const keysToDelete = [];
		
		// Find all sample times that are too old
		for (const sampleTime of this.scheduledEvents.keys()) {
			if (sampleTime < cleanupThreshold) {
				keysToDelete.push(sampleTime);
			}
		}
		
		// Remove old events
		for (const sampleTime of keysToDelete) {
			// Clean up scheduled event keys
			for (const key of this._scheduledEventKeys) {
				if (key.endsWith(`_${sampleTime}`)) {
					this._scheduledEventKeys.delete(key);
				}
			}
			this.scheduledEvents.delete(sampleTime);
		}
	}

	getPatternLength() {
		// If timeline exists and we're in arrangement view, use timeline length for looping
		if (this.processor.projectManager.isArrangementView && this.processor.projectManager.timeline && this.processor.projectManager.timeline.totalLength) {
			return this.processor.projectManager.timeline.totalLength;
		}
		
		// Otherwise use pattern-based looping
		let patternLength = 4; // Default fallback
		let baseMeter = 4; // Default baseMeter
		
		if (this.processor.projectManager.baseMeterTrackId) {
			const baseTrack = this.processor.projectManager.getTrack(this.processor.projectManager.baseMeterTrackId);
			if (baseTrack) {
				const rootDivision = (baseTrack.patternTree && baseTrack.patternTree.division) ? baseTrack.patternTree.division : 4;
				
				// Check if this is a pattern instrument (ID starts with __pattern_)
				if (baseTrack.id && baseTrack.id.startsWith('__pattern_')) {
					// Extract pattern ID and get baseMeter
					const lastUnderscore = baseTrack.id.lastIndexOf('_');
					if (lastUnderscore > '__pattern_'.length) {
						const patternId = baseTrack.id.substring('__pattern_'.length, lastUnderscore);
						const patterns = this.processor.projectManager.patterns;
						const pattern = (patterns) ? patterns.find(p => p.id === patternId) : null;
						if (pattern) {
							baseMeter = pattern.baseMeter || 4;
						}
					}
				}
				
				// Pattern length = baseMeter, which preserves structure when baseMeter = root.division
				// The hierarchical structure is preserved because children split parent's duration proportionally
				patternLength = baseMeter;
			}
		} else if (this.processor.projectManager.tracks && this.processor.projectManager.tracks.length > 0) {
			const firstTrack = this.processor.projectManager.tracks[0];
			const rootDivision = (firstTrack.patternTree && firstTrack.patternTree.division) ? firstTrack.patternTree.division : 4;
			
			// Check if this is a pattern instrument
			if (firstTrack.id && firstTrack.id.startsWith('__pattern_')) {
				const lastUnderscore = firstTrack.id.lastIndexOf('_');
				if (lastUnderscore > '__pattern_'.length) {
					const patternId = firstTrack.id.substring('__pattern_'.length, lastUnderscore);
					const patterns = this.processor.projectManager.patterns;
					const pattern = (patterns) ? patterns.find(p => p.id === patternId) : null;
					if (pattern) {
						baseMeter = pattern.baseMeter || 4;
					}
				}
			}
			
			// Pattern length = baseMeter, which preserves structure when baseMeter = root.division
			// The hierarchical structure is preserved because children split parent's duration proportionally
			patternLength = baseMeter;
		}
		return patternLength;
	}

	checkLoopReset() {
		const patternLength = this.getPatternLength();
		const patternLengthSamples = patternLength * this.processor.playbackController.samplesPerBeat;
		const isTimelineMode = this.processor.projectManager.isArrangementView && this.processor.projectManager.timeline && this.processor.projectManager.timeline.totalLength;
		
		if (this.processor.currentTime >= patternLengthSamples) {
			if (isTimelineMode) {
				// In arrangement view, loop based on timeline length
				// Reset to 0 and clear scheduled events for next loop
				this.processor.currentTime = 0;
				this._lastScheduledBeat = -1;
				if (this.processor.audioProcessor) {
					// Reset playback update timers so visual updates keep firing after loop
					this.processor.audioProcessor.lastPlaybackUpdateTime = 0;
					if (typeof this.processor.audioProcessor._lastBatchedSampleTime === 'number') {
						this.processor.audioProcessor._lastBatchedSampleTime = 0;
					}
				}
				this.scheduledEvents.clear();
				this._scheduledEventKeys.clear();
				this._lastCheckedEventIndex = -1;
				// Re-schedule events for next loop
				this.scheduleEvents();
			} else {
				// Pattern mode: reset to 0
				this.processor.currentTime = 0;
				this._lastScheduledBeat = -1;
				if (this.processor.audioProcessor) {
					// Reset playback update timers so visual updates keep firing after loop
					this.processor.audioProcessor.lastPlaybackUpdateTime = 0;
					if (typeof this.processor.audioProcessor._lastBatchedSampleTime === 'number') {
						this.processor.audioProcessor._lastBatchedSampleTime = 0;
					}
				}
				this.scheduledEvents.clear();
				this._scheduledEventKeys.clear();
				this._lastCheckedEventIndex = -1;
				// Re-schedule events for next loop
				this.scheduleEvents();
			}
		}
	}

		clear() {
		this.scheduledEvents.clear();
		this._scheduledEventKeys.clear();
		this._lastScheduledBeat = -1; // Reset scheduling state
		this._lastCheckedEventIndex = -1; // Reset event index tracking
		this._lastEventCount = 0; // Reset event count
	}
}



/**
 * Handles effect processing based on timeline position and pattern assignments
 * Applies effects to audio samples based on active timeline effects and their pattern assignments
 */

class EffectsProcessor {
	constructor() {
		this.effects = []; // Global effect definitions
		this.timelineEffects = []; // Timeline effect instances
		this.patternToTrackId = new Map(); // Maps pattern IDs to track IDs
		this.timelineTrackToAudioTracks = new Map(); // Maps timeline track IDs to audio track IDs
		this.timelineTracks = []; // Timeline tracks (for looking up patternId on pattern tracks)
		this.processor = null; // Reference to processor for accessing ProjectManager
		this.automation = null; // Project automation data
		
		// Performance optimization caches
		this._trackToTimelineTrackId = new Map(); // trackId -> timelineTrackId
		this._activeEffectsCache = new Map(); // trackId_patternId_beat -> activeEffects[]
		this._globalEffectsCache = null; // Cached global effects (beat -> activeEffects[])
		this._lastGlobalCacheBeat = -1;
		this._lastCacheUpdateBeat = -1;
		this._cacheUpdateInterval = 0.1; // Update cache every 0.1 beats (~100ms at 120 BPM)
		
		// Automation optimization caches
		this._automationByEffectInstance = new Map(); // timelineEffectId -> automation[]
		this._sortedPointsCache = new Map(); // automationId -> sortedPoints[]
		this._automationSettingsCache = new Map(); // timelineEffectId_beat -> settings
	}

	/**
	 * Flush extremely small float values to zero to avoid denormals/subnormals
	 * Denormals can severely impact CPU performance in deep tails/low frequencies.
	 */
	_flushDenormals(x) {
		// Threshold tuned to be inaudible and effective for JS engines
		return (x > -1e-20 && x < 1e-20) ? 0 : x;
	}

	initialize(effects, timelineEffects, patternToTrackId, timelineTrackToAudioTracks, processor, timelineTracks, automation) {
		this.effects = effects || [];
		this.timelineEffects = timelineEffects || [];
		this.patternToTrackId = patternToTrackId || new Map();
		this.timelineTrackToAudioTracks = timelineTrackToAudioTracks || new Map();
		this.timelineTracks = timelineTracks || [];
		this.processor = processor || null;
		this.automation = automation || null;
		
		// Clear caches when reinitializing
		this.clearCaches();
		
		// Build automation lookup map for fast access
		this._buildAutomationMap();
		
		// Debug: Log initialization
		if (this.processor && this.processor.port) {
			const automationKeys = automation ? Object.keys(automation) : [];
			this.processor.port.postMessage({
				type: 'debug',
				message: 'EffectsProcessor initialized',
				data: {
					effectsCount: this.effects.length,
					timelineEffectsCount: this.timelineEffects.length,
					timelineTrackMappingSize: this.timelineTrackToAudioTracks.size,
					automationLoaded: !!automation,
					automationKeysCount: automationKeys.length,
					automationKeys: automationKeys.slice(0, 5) // First 5 keys for debugging
				}
			});
		}
	}

	/**
	 * Clear all performance caches (call when project changes)
	 */
	clearCaches() {
		this._trackToTimelineTrackId.clear();
		this._activeEffectsCache.clear();
		this._globalEffectsCache = null;
		this._lastGlobalCacheBeat = -1;
		this._lastCacheUpdateBeat = -1;
		this._automationByEffectInstance.clear();
		this._sortedPointsCache.clear();
		this._automationSettingsCache.clear();
	}
	
	/**
	 * Build automation lookup map indexed by effect instance ID
	 * This avoids iterating through all automation entries every sample
	 */
	_buildAutomationMap() {
		this._automationByEffectInstance.clear();
		this._sortedPointsCache.clear();
		
		if (!this.automation) return;
		
		for (const automationId in this.automation) {
			const automation = this.automation[automationId];
			if (!automation || typeof automation !== 'object') continue;
			if (automation.targetType !== 'effect' || !automation.timelineInstanceId) continue;
			
			const timelineEffectId = automation.timelineInstanceId;
			if (!this._automationByEffectInstance.has(timelineEffectId)) {
				this._automationByEffectInstance.set(timelineEffectId, []);
			}
			// Store automation with its ID for cache lookup
			const automationWithId = Object.assign({}, automation, { id: automationId });
			this._automationByEffectInstance.get(timelineEffectId).push(automationWithId);
			
			// Pre-sort and cache points for this automation
			if (automation.points && automation.points.length > 0) {
				const sortedPoints = automation.points.slice().sort((a, b) => a.beat - b.beat);
				this._sortedPointsCache.set(automationId, sortedPoints);
			}
		}
	}

	/**
	 * Update effect settings in real-time
	 * @param {string} effectId - The effect ID to update
	 * @param {Object} settings - New settings object (will be merged with existing settings)
	 */
	updateEffect(effectId, settings) {
		const effect = this.effects.find(e => e.id === effectId);
		if (effect) {
			// Update effect settings - deep merge to ensure all band settings are preserved
			if (effect.type === 'equalizer' && settings.band0 !== undefined) {
				// For equalizer, completely replace settings to ensure all bands are updated
				effect.settings = Object.assign({}, settings);
			} else {
				// For other effects, merge settings
				effect.settings = Object.assign({}, effect.settings || {}, settings);
			}
			
			// If this is an equalizer effect, invalidate EQ state cache to force recalculation
			// This ensures immediate updates when EQ bands are changed
			if (effect.type === 'equalizer' && this._eqStates) {
				// Find all timeline effects using this effect ID and invalidate their EQ states
				const timelineEffectIds = this.timelineEffects
					.filter(te => te.effectId === effectId)
					.map(te => te.id);
				
				// Clear EQ states for this effect (both global and timeline-specific)
				// The EQ processor will recreate states with new settings on next process call
				for (const [key, state] of this._eqStates.entries()) {
					// Invalidate if it's the global state or matches a timeline effect using this effect
					const isGlobal = key === 'global';
					const isTimelineEffect = timelineEffectIds.includes(key);
					
					if (isGlobal || isTimelineEffect) {
						// Invalidate cached values to force recalculation
						state.cachedSampleRate = -1;
						for (let i = 0; i < state.bands.length; i++) {
							state.bands[i].cachedFreq = -1;
							state.bands[i].cachedQ = -1;
							state.bands[i].cachedGain = -1;
							state.bands[i].cachedType = null;
							state.bands[i].coeffs = null;
						}
					}
				}
			}
		}
	}

	/**
	 * Get active effects for a track at a specific timeline position (track-based only)
	 * @param {string} trackId - The audio track ID to get effects for
	 * @param {number} currentBeat - Current playback position in beats
	 * @param {boolean} isArrangementView - Whether we're in arrangement view
	 * @returns {Array} Array of active effect definitions with their settings
	 */
	getActiveEffects(trackId, currentBeat, isArrangementView) {
		if (!isArrangementView) {
			// No per-track timeline effects outside arrangement view (for now)
			return [];
		}

		// Update caches periodically (not every sample)
		const shouldUpdateCache = Math.abs(currentBeat - this._lastCacheUpdateBeat) >= this._cacheUpdateInterval;
		if (shouldUpdateCache) {
			this._updateCaches(currentBeat);
			this._lastCacheUpdateBeat = currentBeat;
		}

		// Check cache first (track-specific)
		const cacheKey = trackId + '_' + Math.floor(currentBeat / this._cacheUpdateInterval);
		const cached = this._activeEffectsCache.get(cacheKey);
		if (cached && Math.abs(currentBeat - cached.beat) < this._cacheUpdateInterval * 2) {
			return cached.effects;
		}

		// Optimize: For global effects, calculate once and reuse
		// Check if we need to recalculate global effects
		const beatBucket = Math.floor(currentBeat / this._cacheUpdateInterval);
		const shouldRecalcGlobal = !this._globalEffectsCache || 
		                           Math.abs(currentBeat - this._lastGlobalCacheBeat) >= this._cacheUpdateInterval;
		
		let globalEffects = [];
		if (shouldRecalcGlobal) {
			// Calculate global effects once (effects with no trackId and no patternId)
			globalEffects = this._calculateGlobalEffects(currentBeat);
			this._globalEffectsCache = {
				beat: currentBeat,
				beatBucket: beatBucket,
				effects: globalEffects
			};
			this._lastGlobalCacheBeat = currentBeat;
		} else {
			// Reuse cached global effects
			globalEffects = this._globalEffectsCache.effects;
		}

		// Calculate track-specific effects (track-targeted only)
		const trackSpecificEffects = this._calculateTrackSpecificEffects(trackId, currentBeat);

		// Combine global and track-specific effects
		const activeEffects = globalEffects.concat(trackSpecificEffects);

		// Store in cache
		this._activeEffectsCache.set(cacheKey, {
			beat: currentBeat,
			effects: activeEffects
		});

		return activeEffects;
	}

	/**
	 * Calculate global effects (effects with no trackId/patternId OR effects on effect tracks)
	 * These apply to all tracks, so we calculate once and reuse
	 */
	_calculateGlobalEffects(currentBeat) {
		const globalEffects = [];
		
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);
			
			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				// Skip effects with targetTrackId - those are track-specific, not global
				if (timelineEffect.targetTrackId) {
					continue;
				}
				
				// Include global effects: no trackId/patternId OR on effect track
				let isGlobal = false;
				if (!timelineEffect.trackId && !timelineEffect.patternId) {
					isGlobal = true;
				} else if (timelineEffect.trackId) {
					// Check if it's on an effect track (which makes it global)
					const effectTimelineTrack = this.timelineTracks.find(t => t.id === timelineEffect.trackId);
					if (effectTimelineTrack && effectTimelineTrack.type === 'effect') {
						isGlobal = true;
					}
				}
				
				if (isGlobal) {
					const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
					if (effectDef) {
						// Apply automation to effect settings
						const automatedSettings = this.applyAutomationToEffect(
							effectDef,
							timelineEffect.id,
							currentBeat,
							startBeat,
							endBeat
						);
						
						globalEffects.push(Object.assign({}, effectDef, {
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat),
							timelineEffectId: timelineEffect.id // Include timeline effect ID for buffer isolation
						}));
					}
				}
			}
		}
		
		return globalEffects;
	}
	
	/**
	 * Calculate track-specific effects (track-targeted only)
	 */
	_calculateTrackSpecificEffects(trackId, currentBeat) {
		const trackSpecificEffects = [];
		
		// Use cached timeline track ID lookup
		let timelineTrackId = this._trackToTimelineTrackId.get(trackId);
		if (timelineTrackId === undefined && this.timelineTrackToAudioTracks) {
			// Fallback: calculate if not cached
			const entries = this.timelineTrackToAudioTracks.entries();
			for (let entry = entries.next(); !entry.done; entry = entries.next()) {
				const tId = entry.value[0];
				const audioTrackIds = entry.value[1];
				if (audioTrackIds.includes(trackId)) {
					timelineTrackId = tId;
					this._trackToTimelineTrackId.set(trackId, tId);
					break;
				}
			}
		}
		
		// Find timeline effects that are active at this position and targeted to a track
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);
			
			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				// Only process effects with targetTrackId (track-specific inserts)
				// Global effects are handled in _calculateGlobalEffects
				if (!timelineEffect.targetTrackId) {
					continue;
				}
				
				// Check track assignment (per-track insert)
				let shouldApply = false;
				if (timelineTrackId && timelineEffect.targetTrackId === timelineTrackId) {
					shouldApply = true;
				}
				
				if (shouldApply) {
					const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
					if (effectDef) {
						// Apply automation to effect settings
						const automatedSettings = this.applyAutomationToEffect(
							effectDef,
							timelineEffect.id,
							currentBeat,
							startBeat,
							endBeat
						);
						
						trackSpecificEffects.push(Object.assign({}, effectDef, {
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat),
							timelineEffectId: timelineEffect.id // Include timeline effect ID for buffer isolation
						}));
					}
				}
			}
		}
		
		return trackSpecificEffects;
	}
	
	/**
	 * Calculate active effects (uncached version) - DEPRECATED
	 */
	_calculateActiveEffects(trackId, currentBeat) {
		const activeEffects = [];

		// Use cached timeline track ID lookup
		let timelineTrackId = this._trackToTimelineTrackId.get(trackId);
		if (timelineTrackId === undefined && this.timelineTrackToAudioTracks) {
			// Fallback: calculate if not cached
			const entries = this.timelineTrackToAudioTracks.entries();
			for (let entry = entries.next(); !entry.done; entry = entries.next()) {
				const tId = entry.value[0];
				const audioTrackIds = entry.value[1];
				if (audioTrackIds.includes(trackId)) {
					timelineTrackId = tId;
					this._trackToTimelineTrackId.set(trackId, tId);
					break;
				}
			}
		}

		// Debug: Log effect matching details (occasionally)
		if (this.processor && this.processor.port && (!this._lastEffectDebugTime || (currentBeat - this._lastEffectDebugTime) > 8)) {
			this._lastEffectDebugTime = currentBeat;
			const matchingDetails = this.timelineEffects.map(te => {
				const startBeat = te.startBeat || 0;
				const endBeat = startBeat + (te.duration || 0);
				const isActive = currentBeat >= startBeat && currentBeat < endBeat;
				let matchStatus = 'not active';
				if (isActive) {
					if (te.targetTrackId) {
						matchStatus = te.targetTrackId === timelineTrackId ? 'MATCH (targetTrackId)' : 'NO MATCH: targetTrackId mismatch (effect=' + te.targetTrackId + ', audioTrack=' + timelineTrackId + ')';
					} else if (te.trackId) {
						matchStatus = 'GLOBAL (effect track)';
					} else {
						matchStatus = 'MATCH (global effect)';
					}
				}
				return {
					effectId: te.effectId,
					trackId: te.trackId,
					targetTrackId: te.targetTrackId,
					startBeat,
					duration: te.duration,
					endBeat,
					isActive,
					matchStatus
				};
			});
			this.processor.port.postMessage({
				type: 'debug',
				message: 'Effect matching debug',
				data: {
					trackId,
					timelineTrackId,
					currentBeat: currentBeat.toFixed(2),
					timelineEffectsCount: this.timelineEffects.length,
					timelineEffects: matchingDetails,
					timelineTrackMapping: (function() {
						const result = [];
						const entries = this.timelineTrackToAudioTracks.entries();
						for (let entry = entries.next(); !entry.done; entry = entries.next()) {
							const tid = entry.value[0];
							const aids = entry.value[1];
							result.push({
								timelineTrackId: tid,
								audioTrackIds: aids,
								includesCurrentTrack: aids.includes(trackId)
							});
						}
						return result;
					}.call(this))
				}
			});
		}

		// Find timeline effects that are active at this position
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);

			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				let shouldApply = false;
				let matchReason = '';

				if (timelineEffect.trackId) {
					// Effect is assigned to a specific timeline track
					// Effects can ONLY be on effect tracks (not pattern or envelope tracks)
					const effectTimelineTrack = this.timelineTracks.find(t => t.id === timelineEffect.trackId);
					if (effectTimelineTrack) {
						if (effectTimelineTrack.type === 'effect') {
							// Effect is on an effect track - apply globally to all tracks
							shouldApply = true;
							matchReason = 'effect track (global)';
						} else {
							// Effect is incorrectly placed on a non-effect track (shouldn't happen, but handle gracefully)
							matchReason = 'effect on wrong track type: effect=' + timelineEffect.trackId + ' (type=' + effectTimelineTrack.type + ', should be \'effect\')';
						}
					} else {
						// Timeline track not found - this shouldn't happen but handle gracefully
						// Debug: Log this case
						if (this.processor && this.processor.port && Math.random() < 0.1) {
							this.processor.port.postMessage({
								type: 'debug',
								message: 'Timeline track not found for effect',
								data: {
									effectTrackId: timelineEffect.trackId,
									availableTrackIds: this.timelineTracks.map(t => t.id),
									timelineTracksCount: this.timelineTracks.length
								}
							});
						}
						matchReason = 'trackId mismatch: effect=' + timelineEffect.trackId + ' (track not found), audioTrack=' + timelineTrackId;
					}
				} else if (timelineEffect.targetTrackId) {
					// Per-track insert
					if (timelineEffect.targetTrackId === timelineTrackId) {
						shouldApply = true;
						matchReason = 'targetTrackId match';
					} else {
						matchReason = 'targetTrackId mismatch: effect=' + timelineEffect.targetTrackId + ', audioTrack=' + timelineTrackId;
					}
				} else {
					// Global effect (no trackId or patternId) - applies to all tracks
					shouldApply = true;
					matchReason = 'global effect';
				}

				if (shouldApply) {
					const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
					if (effectDef) {
						// Apply automation to effect settings
						const automatedSettings = this.applyAutomationToEffect(
							effectDef,
							timelineEffect.id,
							currentBeat,
							startBeat,
							endBeat
						);
						
						activeEffects.push(Object.assign({}, effectDef, {
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat) // 0-1 progress through effect
						}));
					} else {
						// Debug: Effect definition not found (throttled to avoid spam)
						if (this.processor && this.processor.port) {
						// Track last log time per effect ID to avoid spam
						const lastLogKey = 'missing_effect_' + timelineEffect.effectId;
						if (!this._missingEffectLogTimes) {
							this._missingEffectLogTimes = {};
						}
						const lastLogTime = (this._missingEffectLogTimes && this._missingEffectLogTimes[lastLogKey]) ? this._missingEffectLogTimes[lastLogKey] : 0;
							
							// Only log once every 4 beats to avoid infinite loops
							if (currentBeat - lastLogTime > 4) {
								this._missingEffectLogTimes[lastLogKey] = currentBeat;
								this.processor.port.postMessage({
									type: 'debug',
									message: 'Effect definition not found',
									data: { 
										effectId: timelineEffect.effectId, 
										availableIds: this.effects.map(e => e.id),
										matchReason
									}
								});
							}
						}
					}
				} else {
					// Debug: Log why effect didn't match (occasionally)
					if (this.processor && this.processor.port && Math.random() < 0.1) {
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Effect not matching',
							data: {
								effectId: timelineEffect.effectId,
								matchReason,
								effectTrackId: timelineEffect.trackId,
								targetTrackId: timelineEffect.targetTrackId,
								audioTrackId: trackId,
								audioTimelineTrackId: timelineTrackId,
								currentBeat: currentBeat.toFixed(2),
								effectTimeRange: startBeat.toFixed(2) + '-' + endBeat.toFixed(2)
							}
						});
					}
				}
			}
		}

		return activeEffects;
	}

	/**
	 * Update performance caches to avoid expensive lookups per-sample
	 * Called periodically (every ~0.1 beats) instead of every sample
	 */
	_updateCaches(currentBeat) {
		// Build trackId -> timelineTrackId map (only if not already built)
		if (this._trackToTimelineTrackId.size === 0 && this.timelineTrackToAudioTracks) {
			const entries = this.timelineTrackToAudioTracks.entries();
			for (let entry = entries.next(); !entry.done; entry = entries.next()) {
				const timelineTrackId = entry.value[0];
				const audioTrackIds = entry.value[1];
				for (let i = 0; i < audioTrackIds.length; i++) {
					const audioTrackId = audioTrackIds[i];
					if (!this._trackToTimelineTrackId.has(audioTrackId)) {
						this._trackToTimelineTrackId.set(audioTrackId, timelineTrackId);
					}
				}
			}
		}

		// Clear old cache entries (keep only recent ones)
		const cacheKeysToDelete = [];
		const cacheEntries = this._activeEffectsCache.entries();
		for (let entry = cacheEntries.next(); !entry.done; entry = cacheEntries.next()) {
			const key = entry.value[0];
			const cached = entry.value[1];
			if (Math.abs(currentBeat - cached.beat) > this._cacheUpdateInterval * 4) {
				cacheKeysToDelete.push(key);
			}
		}
		for (const key of cacheKeysToDelete) {
			this._activeEffectsCache.delete(key);
		}
	}

	/**
	 * Apply effects to an audio sample
	 * @param {number} sample - Input audio sample
	 * @param {Array} activeEffects - Array of active effects to apply
	 * @returns {number} Processed audio sample
	 */
	processSample(sample, activeEffects) {
		let processed = Number.isFinite(sample) ? sample : 0;
		processed = this._flushDenormals(processed);

		if (activeEffects && activeEffects.length > 0) {
			for (const effect of activeEffects) {
				// Smooth fade-in for effects (prevent clicks when effect starts)
				// Use progress (0-1) to fade in over first ~10ms (0.01 beats at 120 BPM)
				let effectMix = 1.0;
				if (effect.progress !== undefined && effect.progress < 0.01) {
					// Fade in over first 0.01 beats (~10ms at 120 BPM)
					effectMix = Math.min(1.0, effect.progress / 0.01);
				}
				
				const effectOutput = this._flushDenormals(this.applyEffect(processed, effect));
				// Crossfade between dry and wet to prevent clicks
				processed = processed * (1 - effectMix) + effectOutput * effectMix;
				processed = this._flushDenormals(processed);
				
				// Safety: prevent NaN/Infinity from propagating and killing audio
				if (!Number.isFinite(processed)) {
					processed = 0;
				}
			}
		}

		// Final safety clamp
		if (!Number.isFinite(processed)) {
			return 0;
		}

		// Flush denormals before clamp (keeps state clean)
		processed = this._flushDenormals(processed);

		// Hard clamp to [-2, 2] to avoid runaway values
		if (processed > 2) processed = 2;
		if (processed < -2) processed = -2;

		return processed;
	}

	/**
	 * Apply automation curves to effect settings
	 * @param {Object} effectDef - Effect definition
	 * @param {string} timelineEffectId - Timeline effect instance ID
	 * @param {number} currentBeat - Current playback position
	 * @param {number} startBeat - Effect start beat
	 * @param {number} endBeat - Effect end beat
	 * @returns {Object} Effect settings with automation applied
	 */
	applyAutomationToEffect(effectDef, timelineEffectId, currentBeat, startBeat, endBeat) {
		if (!this.automation || !effectDef) {
			return effectDef.settings || {};
		}

		// Check cache first (cache per 0.1 beats to reduce recalculations)
		const cacheKey = timelineEffectId + '_' + Math.floor(currentBeat / 0.1);
		const cached = this._automationSettingsCache.get(cacheKey);
		if (cached && Math.abs(currentBeat - cached.beat) < 0.15) {
			return cached.settings;
		}

		// Start with base settings
		const automatedSettings = Object.assign({}, effectDef.settings || {});

		// Use pre-built automation map for fast lookup
		const automations = this._automationByEffectInstance.get(timelineEffectId);
		if (automations && automations.length > 0) {
			for (const auto of automations) {
				// Verify this automation is for this effect (should already be filtered, but double-check)
				if (auto.targetId === effectDef.id) {
					// Get cached sorted points or sort if not cached
					let sortedPoints = this._sortedPointsCache.get(auto.id || '');
					if (!sortedPoints && auto.points && auto.points.length > 0) {
						sortedPoints = auto.points.slice().sort((a, b) => a.beat - b.beat);
						if (auto.id) {
							this._sortedPointsCache.set(auto.id, sortedPoints);
						}
					}
					
					// Get automation value at current beat (using cached sorted points)
					const value = this.getAutomationValueAtBeatFast(sortedPoints || [], currentBeat, auto.min || 0, auto.max || 1);
					
					// Apply to the parameter
					automatedSettings[auto.parameterKey] = value;
				}
			}
		}
		
		// Cache the result
		this._automationSettingsCache.set(cacheKey, {
			beat: currentBeat,
			settings: automatedSettings
		});
		
		// Clean old cache entries (keep only recent ones)
		if (this._automationSettingsCache.size > 100) {
			const keysToDelete = [];
			const cacheEntries = this._automationSettingsCache.entries();
			for (let entry = cacheEntries.next(); !entry.done; entry = cacheEntries.next()) {
				const key = entry.value[0];
				const cached = entry.value[1];
				if (Math.abs(currentBeat - cached.beat) > 1.0) {
					keysToDelete.push(key);
				}
			}
			for (const key of keysToDelete) {
				this._automationSettingsCache.delete(key);
			}
		}

		return automatedSettings;
	}

	/**
	 * Get automation value at a specific beat using linear interpolation
	 * @param {Array} points - Automation points array
	 * @param {number} beat - Beat position
	 * @param {number} min - Minimum value
	 * @param {number} max - Maximum value
	 * @returns {number} Interpolated value
	 */
	getAutomationValueAtBeat(points, beat, min, max) {
		if (!points || points.length === 0) {
			return (min + max) / 2; // Default to middle value
		}

		// Sort points by beat (fallback for uncached calls)
		const sortedPoints = points.slice().sort((a, b) => a.beat - b.beat);
		return this.getAutomationValueAtBeatFast(sortedPoints, beat, min, max);
	}
	
	/**
	 * Fast version that assumes points are already sorted
	 * Uses binary search for O(log n) lookup instead of O(n)
	 * @param {Array} sortedPoints - Pre-sorted automation points array
	 * @param {number} beat - Beat position
	 * @param {number} min - Minimum value
	 * @param {number} max - Maximum value
	 * @returns {number} Interpolated value
	 */
	getAutomationValueAtBeatFast(sortedPoints, beat, min, max) {
		if (!sortedPoints || sortedPoints.length === 0) {
			return (min + max) / 2; // Default to middle value
		}

		// Before first point
		if (beat <= sortedPoints[0].beat) {
			return sortedPoints[0].value;
		}

		// After last point
		if (beat >= sortedPoints[sortedPoints.length - 1].beat) {
			return sortedPoints[sortedPoints.length - 1].value;
		}

		// Binary search for the two points to interpolate between
		let left = 0;
		let right = sortedPoints.length - 1;
		
		while (left < right - 1) {
			const mid = Math.floor((left + right) / 2);
			if (sortedPoints[mid].beat <= beat) {
				left = mid;
			} else {
				right = mid;
			}
		}
		
		// Interpolate between sortedPoints[left] and sortedPoints[right]
		const p1 = sortedPoints[left];
		const p2 = sortedPoints[right];
		const t = (beat - p1.beat) / (p2.beat - p1.beat);
		return p1.value + (p2.value - p1.value) * t;
	}

	/**
	 * Apply a single effect to a sample
	 * @param {number} sample - Input audio sample
	 * @param {Object} effect - Effect definition with settings
	 * @returns {number} Processed audio sample
	 */
	applyEffect(sample, effect) {
		if (!effect || !effect.settings) return sample;

		const settings = effect.settings;
		
		// Use effect handlers (always available after build)
		if (typeof EffectHandlers !== 'undefined' && EffectHandlers[effect.type]) {
			const HandlerClass = EffectHandlers[effect.type];
			if (!this._effectHandlerInstances) {
				this._effectHandlerInstances = new Map();
			}
			if (!this._effectHandlerInstances.has(effect.type)) {
				this._effectHandlerInstances.set(effect.type, new HandlerClass(this));
			}
			const handler = this._effectHandlerInstances.get(effect.type);
			return handler.process(sample, settings, effect);
		}

		// Unknown effect type
		return sample;
	}
}


/**
 * Handles envelope processing based on timeline position and pattern assignments
 * Applies envelopes to control parameters (volume, filter, pitch, pan) over time
 */

class EnvelopesProcessor {
	constructor() {
		this.envelopes = []; // Global envelope definitions
		this.timelineEnvelopes = []; // Timeline envelope instances
		this.patternToTrackId = new Map(); // Maps pattern IDs to track IDs
		this.timelineTrackToAudioTracks = new Map(); // Maps timeline track IDs to audio track IDs
		this.timelineTracks = []; // Timeline tracks (for validation)
		this.processor = null; // Reference to processor for debug logging
		
		// Performance optimization caches
		this._activeEnvelopeValuesCache = new Map(); // trackId_beat -> envelopeValues
		this._trackToTimelineTrackId = new Map(); // trackId -> timelineTrackId
		this._lastCacheUpdateBeat = -1;
		this._cacheUpdateInterval = 0.1; // Update cache every 0.1 beats (~100ms at 120 BPM)
	}

	initialize(envelopes, timelineEnvelopes, patternToTrackId, timelineTracks, processor = null, timelineTrackToAudioTracks = null) {
		this.envelopes = envelopes || [];
		this.timelineEnvelopes = timelineEnvelopes || [];
		this.patternToTrackId = patternToTrackId || new Map();
		this.timelineTracks = timelineTracks || [];
		this.processor = processor || null;
		this.timelineTrackToAudioTracks = timelineTrackToAudioTracks || new Map();
		
		// Clear caches when reinitializing
		this.clearCaches();
		
		// Debug: Log initialization
		if (this.processor && this.processor.port) {
			this.processor.port.postMessage({
				type: 'debug',
				message: 'EnvelopesProcessor initialized',
				data: {
					envelopesCount: this.envelopes.length,
					timelineEnvelopesCount: this.timelineEnvelopes.length,
					envelopeIds: this.envelopes.map(e => e.id),
					timelineEnvelopeIds: this.timelineEnvelopes.map(te => te.envelopeId)
				}
			});
		}
	}

	/**
	 * Clear all performance caches (call when project changes)
	 */
	clearCaches() {
		this._activeEnvelopeValuesCache.clear();
		this._trackToTimelineTrackId.clear();
		this._lastCacheUpdateBeat = -1;
	}

	/**
	 * Update envelope settings in real-time
	 * @param {string} envelopeId - The envelope ID to update
	 * @param {Object} settings - New settings object (will be merged with existing settings)
	 */
	updateEnvelope(envelopeId, settings) {
		const envelope = this.envelopes.find(e => e.id === envelopeId);
		if (envelope) {
			// Update envelope settings
			envelope.settings = Object.assign({}, envelope.settings || {}, settings);
		}
	}

	/**
	 * Get active envelopes for a track at a specific timeline position
	 * @param {string} trackId - The track ID to get envelopes for
	 * @param {number} currentBeat - Current playback position in beats
	 * @param {boolean} isArrangementView - Whether we're in arrangement view
	 * @returns {Object} Object with envelope values for each envelope type
	 */
	getActiveEnvelopeValues(trackId, currentBeat, isArrangementView) {
		if (!isArrangementView) {
			// In pattern view, return default values
			// Pattern view envelopes can be added later if needed
			return {
				volume: 1.0,
				filter: 1.0,
				pitch: 1.0,
				pan: 0.0
			};
		}

		// Update caches periodically (not every sample)
		const shouldUpdateCache = Math.abs(currentBeat - this._lastCacheUpdateBeat) >= this._cacheUpdateInterval;
		if (shouldUpdateCache) {
			this._updateCaches(currentBeat);
			this._lastCacheUpdateBeat = currentBeat;
		}

		// Check cache first
		const cacheKey = `${trackId}_${Math.floor(currentBeat / this._cacheUpdateInterval)}`;
		const cached = this._activeEnvelopeValuesCache.get(cacheKey);
		if (cached && Math.abs(currentBeat - cached.beat) < this._cacheUpdateInterval * 2) {
			return cached.values;
		}

		// Cache miss - calculate envelope values
		const envelopeValues = this._calculateEnvelopeValues(trackId, currentBeat);

		// Store in cache
		this._activeEnvelopeValuesCache.set(cacheKey, {
			beat: currentBeat,
			values: envelopeValues
		});

		return envelopeValues;
	}

	/**
	 * Calculate envelope values (uncached version)
	 */
	_calculateEnvelopeValues(trackId, currentBeat) {
		const envelopeValues = {
			volume: 1.0,
			filter: 1.0,
			pitch: 1.0,
			pan: 0.0
		};

		// Resolve audio track's timeline track id for per-track matching
		let timelineTrackId = this._trackToTimelineTrackId.get(trackId);
		if (timelineTrackId === undefined && this.timelineTrackToAudioTracks) {
			const entries = this.timelineTrackToAudioTracks.entries();
			for (let entry = entries.next(); !entry.done; entry = entries.next()) {
				const tId = entry.value[0];
				const audioTrackIds = entry.value[1];
				if (audioTrackIds.includes(trackId)) {
					timelineTrackId = tId;
					this._trackToTimelineTrackId.set(trackId, tId);
					break;
				}
			}
		}

		// Find timeline envelopes that are active at this position
		// Envelopes can be global (on envelope tracks) or targeted to a specific pattern row via targetTrackId
		for (const timelineEnvelope of this.timelineEnvelopes) {
			const startBeat = timelineEnvelope.startBeat || 0;
			const endBeat = startBeat + (timelineEnvelope.duration || 0);

			// Check if envelope is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				let shouldApply = false;

				// Global if on an envelope track
				const envelopeTrack = this.timelineTracks.find(t => t.id === timelineEnvelope.trackId);
				if (envelopeTrack && envelopeTrack.type === 'envelope' && !timelineEnvelope.targetTrackId) {
					shouldApply = true;
				}

				// Per-track insert if targetTrackId matches this audio track's timeline track id
				if (!shouldApply && timelineEnvelope.targetTrackId && timelineTrackId) {
					shouldApply = (timelineEnvelope.targetTrackId === timelineTrackId);
				}
				
				if (shouldApply) {
					const envelopeDef = this.envelopes.find(e => e.id === timelineEnvelope.envelopeId);
					if (envelopeDef) {
						this.applyEnvelope(envelopeValues, envelopeDef, currentBeat, startBeat, endBeat);
					} else {
						// Debug: Envelope definition not found (throttled to avoid spam)
						if (this.processor && this.processor.port) {
							// Track last log time per envelope ID to avoid spam
							const lastLogKey = `missing_envelope_${timelineEnvelope.envelopeId}`;
							if (!this._missingEnvelopeLogTimes) {
								this._missingEnvelopeLogTimes = {};
							}
							const lastLogTime = (this._missingEnvelopeLogTimes && this._missingEnvelopeLogTimes[lastLogKey]) ? this._missingEnvelopeLogTimes[lastLogKey] : 0;
							if (!this._missingEnvelopeLogTimes) {
								this._missingEnvelopeLogTimes = {};
							}
							
							// Only log once every 4 beats to avoid infinite loops
							if (currentBeat - lastLogTime > 4) {
								this._missingEnvelopeLogTimes[lastLogKey] = currentBeat;
								this.processor.port.postMessage({
									type: 'debug',
									message: 'Envelope definition not found',
									data: { 
										envelopeId: timelineEnvelope.envelopeId, 
										availableIds: this.envelopes.map(e => e.id),
										timelineEnvelopeTrackId: timelineEnvelope.trackId,
									targetTrackId: timelineEnvelope.targetTrackId
									}
								});
							}
						}
					}
				}
			}
		}

		// Safety: ensure all values are finite and within reasonable ranges
		if (!Number.isFinite(envelopeValues.volume)) envelopeValues.volume = 1.0;
		if (!Number.isFinite(envelopeValues.filter)) envelopeValues.filter = 1.0;
		if (!Number.isFinite(envelopeValues.pitch)) envelopeValues.pitch = 1.0;
		if (!Number.isFinite(envelopeValues.pan)) envelopeValues.pan = 0.0;

		// Clamp to avoid extreme modulation
		envelopeValues.volume = Math.max(0, Math.min(4, envelopeValues.volume));
		envelopeValues.filter = Math.max(0, Math.min(4, envelopeValues.filter));
		envelopeValues.pitch = Math.max(0.25, Math.min(4, envelopeValues.pitch));
		envelopeValues.pan = Math.max(-1, Math.min(1, envelopeValues.pan));

		return envelopeValues;
	}

	/**
	 * Apply envelope values to the envelope values object
	 * @param {Object} envelopeValues - Object to modify
	 * @param {Object} envelopeDef - Envelope definition
	 * @param {number} currentBeat - Current playback position
	 * @param {number} startBeat - Envelope start position
	 * @param {number} endBeat - Envelope end position
	 */
	applyEnvelope(envelopeValues, envelopeDef, currentBeat, startBeat, endBeat) {
		if (!envelopeDef || !envelopeDef.settings) return;

		let progress = (currentBeat - startBeat) / (endBeat - startBeat); // 0-1
		const envelopeType = envelopeDef.type;

		// Check if envelope should be reversed
		const reverse = envelopeDef.settings.reverse === true;
		if (reverse) {
			progress = 1.0 - progress; // Invert progress: 0→1 becomes 1→0
		}

		// Get envelope curve value based on settings
		const value = this.calculateEnvelopeValue(progress, envelopeDef.settings, envelopeType);

		// Debug logging removed

		// Apply to appropriate parameter
		switch (envelopeType) {
		case 'volume':
			envelopeValues.volume *= value;
			break;
		case 'filter':
			envelopeValues.filter *= value;
			break;
		case 'pitch':
			// Pitch envelope: value is 0-1, map to pitch multiplier
			// The pitch shifter appears to be inverted, so we invert the value
			// 0.0 should map to 2.0x (up octave), 0.5 to 1.0x (normal), 1.0 to 0.5x (down octave)
			// So we use: invertedValue = 1.0 - value, then map that
			const invertedValue = 1.0 - value;
			let pitchMultiplier;
			if (invertedValue <= 0.5) {
				// Map 0.0-0.5 to 0.5-1.0 (down octave to normal)
				pitchMultiplier = 0.5 + (invertedValue * 1.0); // 0.0→0.5, 0.5→1.0
			} else {
				// Map 0.5-1.0 to 1.0-2.0 (normal to up octave)
				pitchMultiplier = 1.0 + ((invertedValue - 0.5) * 2.0); // 0.5→1.0, 1.0→2.0
			}
			envelopeValues.pitch *= pitchMultiplier;
			break;
		case 'pan':
			// Pan is additive (can be -1 to 1)
			const panValue = (value - 0.5) * 2; // Convert 0-1 to -1 to 1
			envelopeValues.pan += panValue;
			envelopeValues.pan = Math.max(-1, Math.min(1, envelopeValues.pan)); // Clamp
			break;
		}
	}

	/**
	 * Calculate envelope value at a given progress (0-1)
	 * @param {number} progress - Progress through envelope (0-1)
	 * @param {Object} settings - Envelope settings
	 * @returns {number} Envelope value (typically 0-1)
	 */
	calculateEnvelopeValue(progress, settings, envelopeType = null) {
		// Simple linear envelope for now
		// Can be enhanced with curves, attack/decay/sustain/release, etc.
		// For pitch envelopes, default to 0.5 (normal pitch, center of range) instead of 0
		let defaultStart = 0;
		let defaultEnd = 1;
		if (envelopeType === 'pitch') {
			defaultStart = 0.5; // Default to center (normal pitch, 1.0x multiplier)
			defaultEnd = 0.5;   // Default to center (normal pitch, 1.0x multiplier)
		}
		
		// Handle undefined values - use defaults
		const startValue = (settings.startValue !== undefined && settings.startValue !== null) ? settings.startValue : defaultStart;
		const endValue = (settings.endValue !== undefined && settings.endValue !== null) ? settings.endValue : defaultEnd;
		const curve = settings.curve || 'linear'; // linear, exponential, logarithmic

		let value;
		switch (curve) {
		case 'exponential':
			value = startValue + (endValue - startValue) * (Math.exp(progress * 5) - 1) / (Math.exp(5) - 1);
			break;
		case 'logarithmic':
			value = startValue + (endValue - startValue) * Math.log(progress * 9 + 1) / Math.log(10);
			break;
		case 'linear':
		default:
			value = startValue + (endValue - startValue) * progress;
			break;
		}

		return Math.max(0, Math.min(1, value)); // Clamp to 0-1
	}

	/**
	 * Update performance caches to avoid expensive lookups per-sample
	 * Called periodically (every ~0.1 beats) instead of every sample
	 */
	_updateCaches(currentBeat) {
		// Build trackId -> timelineTrackId map (only if not already built)
		if (this._trackToTimelineTrackId.size === 0 && this.timelineTrackToAudioTracks) {
			const entries = this.timelineTrackToAudioTracks.entries();
			for (let entry = entries.next(); !entry.done; entry = entries.next()) {
				const timelineTrackId = entry.value[0];
				const audioTrackIds = entry.value[1];
				for (let i = 0; i < audioTrackIds.length; i++) {
					const audioTrackId = audioTrackIds[i];
					if (!this._trackToTimelineTrackId.has(audioTrackId)) {
						this._trackToTimelineTrackId.set(audioTrackId, timelineTrackId);
					}
				}
			}
		}

		// Clear old cache entries (keep only recent ones)
		const cacheKeysToDelete = [];
		for (const [key, cached] of this._activeEnvelopeValuesCache.entries()) {
			if (Math.abs(currentBeat - cached.beat) > this._cacheUpdateInterval * 4) {
				cacheKeysToDelete.push(key);
			}
		}
		for (const key of cacheKeysToDelete) {
			this._activeEnvelopeValuesCache.delete(key);
		}
	}
}



/**
 * Manages project state, instruments, timeline tracks, effects, and envelopes
 * Handles project loading and view mode configuration
 * 
 * TERMINOLOGY CLARIFICATION:
 * - INSTRUMENT: A generated synth with a pattern tree (what goes into pattern canvas)
 *   - Stored as Track (standalone) or Pattern (reusable)
 *   - Has instrumentType, patternTree, settings
 * - PATTERN: Currently stores a single instrument (future: container for multiple instruments)
 *   - Patterns can be loaded into timeline tracks
 *   - All instruments in a pattern play simultaneously (when pattern supports multiple)
 * - TRACK (TimelineTrack): Where patterns, effects, and envelopes are arranged
 *   - Exists ONLY in arrangement view timeline
 *   - Can be type 'pattern', 'effect', or 'envelope'
 */

class ProjectManager {
	constructor(processor) {
		this.processor = processor;
		this.tracks = null;
		this.events = [];
		this.timeline = null;
		this.patterns = []; // Store patterns to access baseMeter
		this.effects = [];
		this.envelopes = [];
		this.baseMeterTrackId = null;
		this.isArrangementView = false;
		this.patternToTrackId = new Map();
		this.timelineTrackToAudioTracks = new Map(); // Maps timeline track ID to array of audio track IDs
	}

	loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId, timelineTrackToAudioTracks, automation, patterns) {
		this.tracks = tracks;
		this.events = events || [];
		const timelineData = this._normalizeTimeline(timeline, this.events);
		this.timeline = timelineData;
		this.patterns = patterns || []; // Store patterns to access baseMeter
		this.effects = effects || [];
		this.envelopes = envelopes || [];
		this.isArrangementView = viewMode === 'arrangement' && timelineData && timelineData.clips && timelineData.clips.length > 0;
		
		// Build timeline track to audio tracks mapping
		this.timelineTrackToAudioTracks.clear();
		if (timelineTrackToAudioTracks && Array.isArray(timelineTrackToAudioTracks)) {
			for (const [timelineTrackId, audioTrackIds] of timelineTrackToAudioTracks) {
				this.timelineTrackToAudioTracks.set(timelineTrackId, audioTrackIds);
			}
		}
		
		// Debug: Log project load
		this.processor.port.postMessage({
			type: 'debug',
			message: 'ProjectManager.loadProject',
			data: {
				viewMode,
				isArrangementView: this.isArrangementView,
				tracksCount: (tracks && tracks.length) ? tracks.length : 0,
				eventsCount: this.events.length,
				timelineLength: (timelineData && timelineData.totalLength) ? timelineData.totalLength : 0,
				clipsCount: (timelineData && timelineData.clips && timelineData.clips.length) ? timelineData.clips.length : 0,
				firstEvent: this.events[0] || null,
				firstTrack: (tracks && tracks.length > 0) ? tracks[0] : null
			}
		});
		
		// Set base meter track (defaults to first track if not specified)
		this.baseMeterTrackId = baseMeterTrackId || ((tracks && tracks.length > 0 && tracks[0] && tracks[0].id) ? tracks[0].id : null);
		
		// Build pattern to track ID mapping for effect/envelope assignment
		this.patternToTrackId.clear();
		if (this.isArrangementView) {
			// Use provided mapping if available, otherwise build from tracks
			if (patternToTrackId && Array.isArray(patternToTrackId)) {
				for (const [patternId, trackId] of patternToTrackId) {
					this.patternToTrackId.set(patternId, trackId);
				}
			} else if (timelineData && timelineData.clips) {
				// Fallback: build from tracks
				for (const clip of timelineData.clips) {
					if (clip.patternId && !this.patternToTrackId.has(clip.patternId)) {
						// Find the track ID for this pattern
						const track = tracks.find(t => t.id && t.id.startsWith(`__pattern_${clip.patternId}`));
						if (track) {
							this.patternToTrackId.set(clip.patternId, track.id);
						}
					}
				}
			}
		}
		
		// Initialize effects and envelopes processors
		const timelineEffects = (timelineData && timelineData.effects) ? timelineData.effects : [];
		const timelineEnvelopes = (timelineData && timelineData.envelopes) ? timelineData.envelopes : [];
		const timelineTracks = (timelineData && timelineData.tracks) ? timelineData.tracks : [];
		// Pass automation data to effects processor
		this.processor.effectsProcessor.initialize(effects || [], timelineEffects, this.patternToTrackId, this.timelineTrackToAudioTracks, this.processor, timelineTracks, automation || null);
		this.processor.envelopesProcessor.initialize(envelopes || [], timelineEnvelopes, this.patternToTrackId, timelineTracks, this.processor, this.timelineTrackToAudioTracks);
	}

	getTrack(trackId) {
		if (this.tracks) {
			return this.tracks.find(t => t.id === trackId);
		}
		return null;
	}

	updatePatternTree(trackId, patternTree, baseMeter = 4) {
		const track = this.getTrack(trackId);
		if (track) {
			track.patternTree = patternTree;
			// Re-flatten events for this track in real-time
			this.updateTrackEvents(trackId, baseMeter);
		}
	}
	
	updateTrackEvents(trackId, baseMeter = 4) {
		// Remove old events for this track
		this.events = this.events.filter(e => e.instrumentId !== trackId);
		
		// Get the track
		const track = this.getTrack(trackId);
		if (!track || !track.patternTree) return;
		
		// Re-flatten events for this track
		// Inline flattenTrackPattern function (can't use require in AudioWorklet)
		const flattenTree = (node, parentDuration, startTime, instrumentId) => {
			// Leaf node - create event
			if (!node.children || node.children.length === 0) {
				// Check if this is the root node (empty pattern)
				// If startTime is 0, it's the root node - treat as empty if no velocity/pitch
				if (startTime === 0 && node.velocity === undefined && node.pitch === undefined) {
					return [];
				}
				// Real leaf node - create event
				return [{
					time: startTime,
					velocity: node.velocity !== undefined ? node.velocity : 1.0,
					pitch: node.pitch !== undefined ? node.pitch : 60,
					instrumentId
				}];
			}
			
			// Calculate total division sum for proportional distribution
			const totalDivision = node.children.reduce((sum, child) => sum + (child.division || 1), 0);
			
			if (totalDivision === 0) {
				return [];
			}
			
			// Recursively process children with proportional timing
			let currentTime = startTime;
			const events = [];
			
			for (const child of node.children) {
				const childDivision = child.division || 1;
				const childDuration = parentDuration * (childDivision / totalDivision);
				events.push(...flattenTree(child, childDuration, currentTime, instrumentId));
				currentTime += childDuration;
			}
			
			return events;
		};
		
		const flattenTrackPattern = (rootNode, trackId, baseMeter = 4) => {
			// Pattern length is always baseMeter
			const patternLength = baseMeter;
			
			// Root division affects the internal structure - use it as the initial parent duration
			const rootDivision = rootNode.division || baseMeter;
			
			// Calculate events using rootDivision, then scale to baseMeter
			const events = flattenTree(rootNode, rootDivision, 0.0, trackId);
			const scaleFactor = baseMeter / rootDivision;
			
			// Scale all event times from rootDivision space to baseMeter space
			return events.map(event => ({
				...event,
				time: event.time * scaleFactor
			}));
		};
		
		// Determine baseMeter for this track
		let finalBaseMeter = 4; // Default for standalone instruments
		if (trackId && trackId.startsWith('__pattern_')) {
			// Extract pattern ID and get baseMeter from patterns
			const lastUnderscore = trackId.lastIndexOf('_');
			if (lastUnderscore > '__pattern_'.length) {
				const patternId = trackId.substring('__pattern_'.length, lastUnderscore);
				if (this.patterns) {
					const pattern = this.patterns.find(p => p.id === patternId);
					if (pattern) {
						finalBaseMeter = pattern.baseMeter || 4;
					}
				}
			}
		}
		
		const newEvents = flattenTrackPattern(track.patternTree, trackId, finalBaseMeter);
		
		// Add new events
		this.events.push(...newEvents);
		
		// Re-sort events by time
		this.events.sort((a, b) => a.time - b.time);
		
		// Notify processor to clear future scheduled events and re-schedule
		if (this.processor && this.processor.eventScheduler) {
			// Clear scheduled events for future times (keep past ones that are already playing)
			const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
			const currentSampleTime = Math.floor(this.processor.currentTime);
			
			// Remove scheduled events that are in the future
			for (const [sampleTime, events] of this.processor.eventScheduler.scheduledEvents.entries()) {
				if (sampleTime > currentSampleTime) {
					// Filter out events for this track
					const filteredEvents = events.filter(e => e.instrumentId !== trackId);
					if (filteredEvents.length === 0) {
						this.processor.eventScheduler.scheduledEvents.delete(sampleTime);
					} else {
						this.processor.eventScheduler.scheduledEvents.set(sampleTime, filteredEvents);
					}
				}
			}
		}
	}

	updateTrackSettings(trackId, settings) {
		const track = this.getTrack(trackId);
		if (track) {
			track.settings = Object.assign({}, track.settings || {}, settings);
		}
	}

	updateTrack(trackId, updatedTrack) {
		if (!this.tracks) return null;
		const index = this.tracks.findIndex(t => t.id === trackId);
		if (index !== -1) {
			const oldTrack = this.tracks[index];
			this.tracks[index] = updatedTrack;
			return oldTrack;
		}
		return null;
	}

	addTrack(track) {
		if (!this.tracks) {
			this.tracks = [];
		}
		// Check if track already exists
		const existingIndex = this.tracks.findIndex(t => t.id === track.id);
		if (existingIndex !== -1) {
			this.tracks[existingIndex] = track;
		} else {
			this.tracks.push(track);
		}
	}

	updateTimelineTrackVolume(trackId, volume) {
		if (this.timeline && this.timeline.tracks) {
			const track = this.timeline.tracks.find(t => t.id === trackId);
			if (track) {
				track.volume = volume;
			}
		}
	}

	updateTimelineTrackMute(trackId, mute) {
		if (this.timeline && this.timeline.tracks) {
			const track = this.timeline.tracks.find(t => t.id === trackId);
			if (track) {
				track.mute = mute;
			}
		}
	}

	updateTimelineTrackSolo(trackId, solo) {
		if (this.timeline && this.timeline.tracks) {
			const track = this.timeline.tracks.find(t => t.id === trackId);
			if (track) {
				track.solo = solo;
			}
		}
	}

	getTimelineTrackVolume(trackId) {
		if (this.timeline && this.timeline.tracks) {
			const track = this.timeline.tracks.find(t => t.id === trackId);
			if (track && track.volume !== undefined && track.volume !== null) {
				return track.volume;
			}
			return 1.0;
		}
		return 1.0;
	}
	
	_normalizeTimeline(timeline, events) {
		if (!timeline) return null;
		let totalLength = (timeline.totalLength && typeof timeline.totalLength === 'number') ? timeline.totalLength : 0;
		
		const updateMaxLength = (start, duration) => {
			const startBeat = typeof start === 'number' ? start : parseFloat(start) || 0;
			const durationBeats = typeof duration === 'number' ? duration : parseFloat(duration) || 0;
			if (!Number.isFinite(startBeat) || !Number.isFinite(durationBeats)) {
				return;
			}
			const rangeEnd = startBeat + Math.max(durationBeats, 0);
			if (rangeEnd > totalLength) {
				totalLength = rangeEnd;
			}
		};
		
		if (Array.isArray(timeline.clips)) {
			for (const clip of timeline.clips) {
				if (clip) {
					updateMaxLength(clip.startBeat || 0, clip.duration || 0);
				}
			}
		}
		
		if (Array.isArray(timeline.effects)) {
			for (const effect of timeline.effects) {
				if (effect) {
					updateMaxLength(effect.startBeat || 0, effect.duration || 0);
				}
			}
		}
		
		if (Array.isArray(timeline.envelopes)) {
			for (const envelope of timeline.envelopes) {
				if (envelope) {
					updateMaxLength(envelope.startBeat || 0, envelope.duration || 0);
				}
			}
		}
		
		if (Array.isArray(events) && events.length > 0) {
			const lastEvent = events[events.length - 1];
			if (lastEvent && typeof lastEvent.time === 'number' && lastEvent.time > totalLength) {
				totalLength = lastEvent.time;
			}
		}
		
		if (!totalLength || totalLength < 4) {
			totalLength = 4;
		}
		
		// Add a tiny guard so scheduling lookahead can cross the loop boundary cleanly
		const bufferedLength = totalLength + 0.0001;
		
		return Object.assign({}, timeline, {
			totalLength: bufferedLength
		});
	}
}


/**
 * Manages synth instances lifecycle
 * Handles creation, retrieval, and cleanup of synth instances per track
 */

/**
 * Manages synth instances for instruments
 * 
 * TERMINOLOGY: trackId here refers to an INSTRUMENT ID (legacy naming).
 * Instruments are the generated synths that play audio.
 */
class SynthManager {
	constructor(processor) {
		this.processor = processor;
		this.synths = new Map();
	}

	/**
	 * Get or create a synth for an instrument
	 * @param {string} trackId - The instrument ID (legacy name: "trackId")
	 * @param {string} patternId - Optional pattern ID (for effects/envelopes)
	 * @returns {Object|null} The synth instance or null if instrument not found
	 */
	getOrCreateSynth(trackId, patternId = null) {
		let synth = this.synths.get(trackId);
		if (!synth) {
			const track = this.processor.projectManager.getTrack(trackId);
			if (track) {
				// Ensure instrumentType is set - use track's instrumentType or try to get from pattern
				let instrumentType = track.instrumentType;
				if (!instrumentType || instrumentType === '') {
					// Try to get from pattern if patternId is available
					if (patternId && this.processor.projectManager.patternToTrackId) {
						// Could look up pattern, but for now use a default
						instrumentType = 'kick'; // Default fallback
					} else {
						instrumentType = 'kick'; // Default fallback
					}
				}
				
				// Merge settings - use track settings and instrumentSettings
				const settings = Object.assign({}, track.settings || {}, track.instrumentSettings || {});
				
				synth = this.processor.synthFactory.create(instrumentType, settings);
				if (synth) {
					this.synths.set(trackId, synth);
					// Store patternId with synth for effects/envelopes lookup
					if (patternId) {
						synth._patternId = patternId;
					}
					// Debug: Log synth creation
					this.processor.port.postMessage({
						type: 'debug',
						message: 'SynthManager: Created synth',
						data: {
							trackId,
							patternId: patternId || 'none',
							instrumentType: instrumentType,
							totalSynths: this.synths.size
						}
					});
				} else {
					// Debug: Log synth creation failure
					this.processor.port.postMessage({
						type: 'debug',
						message: 'SynthManager: Failed to create synth',
						data: {
							trackId,
							patternId: patternId || 'none',
							instrumentType: instrumentType,
							settings: settings,
							trackInstrumentType: track.instrumentType,
							trackSettings: track.settings,
							trackInstrumentSettings: track.instrumentSettings
						}
					});
				}
			} else {
				// Debug: Log track not found
				this.processor.port.postMessage({
					type: 'debug',
					message: 'SynthManager: Track not found',
					data: {
						trackId,
						patternId: patternId || 'none',
						availableTracks: (this.processor.projectManager.tracks) ? this.processor.projectManager.tracks.map(t => ({ id: t.id, instrumentType: t.instrumentType })) : []
					}
				});
			}
		} else if (patternId && !synth._patternId) {
			// Update patternId if not set
			synth._patternId = patternId;
		}
		return synth;
	}

	/**
	 * Get an existing synth instance
	 * @param {string} trackId - The track ID
	 * @returns {Object|undefined} The synth instance or undefined
	 */
	getSynth(trackId) {
		return this.synths.get(trackId);
	}

	/**
	 * Remove a synth instance
	 * @param {string} trackId - The track ID
	 */
	removeSynth(trackId) {
		this.synths.delete(trackId);
	}

	/**
	 * Clear all synth instances
	 */
	clear() {
		this.synths.clear();
	}

	/**
	 * Update settings for a synth
	 * @param {string} trackId - The track ID
	 * @param {Object} settings - Settings to update
	 */
	updateSynthSettings(trackId, settings) {
		const synth = this.synths.get(trackId);
		if (synth && synth.updateSettings) {
			synth.updateSettings(settings);
		}
	}

	/**
	 * Trigger a note on a synth
	 * @param {string} trackId - The track ID
	 * @param {number} velocity - Note velocity
	 * @param {number} pitch - Note pitch
	 * @param {string} patternId - Optional pattern ID from event
	 */
	triggerNote(trackId, velocity, pitch, patternId = null) {
		const synth = this.getOrCreateSynth(trackId, patternId);
		if (synth && synth.trigger) {
			// Debug: Log synth trigger (disabled for cleaner logs)
			// this.processor.port.postMessage({
			// 	type: 'debug',
			// 	message: 'SynthManager: Triggering note',
			// 	data: {
			// 		trackId,
			// 		patternId: patternId || 'none',
			// 		velocity,
			// 		pitch,
			// 		synthExists: !!synth,
			// 		hasTrigger: !!synth.trigger,
			// 		totalSynths: this.synths.size
			// 	}
			// });
			synth.trigger(velocity, pitch);
		}
	}

	/**
	 * Get all synths (for mixing)
	 * @returns {Map} Map of trackId -> synth instance
	 */
	getAllSynths() {
		return this.synths;
	}
}



/**
 * Handles audio mixing with per-track volume, pan, mute, solo, effects, and envelopes
 * Applies constant power panning for smooth stereo imaging
 */

/**
 * @typedef {Object} BiquadState
 * @property {number} x1
 * @property {number} x2
 * @property {number} y1
 * @property {number} y2
 */

class AudioMixer {
	/**
	 * @param {*} trackStateManager
	 * @param {*} effectsProcessor
	 * @param {*} envelopesProcessor
	 * @param {*} processor
	 */
	constructor(trackStateManager, effectsProcessor, envelopesProcessor, processor) {
		this.trackStateManager = trackStateManager;
		this.effectsProcessor = effectsProcessor;
		this.envelopesProcessor = envelopesProcessor;
		this.processor = processor; // Store reference to processor for pattern lookup
		
		// Per-track filter state for filter envelopes
		this.filterStates = new Map(); // trackId -> {x1, x2, y1, y2}
		// Per-track pitch envelope state for pitch shifting
		this.pitchStates = new Map(); // trackId -> {lastSample, phase}
		
		// Debug tracking (per-track to avoid infinite loops)
		this._lastDebugStates = new Map(); // trackId_patternId -> {muted, soloed, beat}
		
		// Performance optimization caches
		this._trackToTimelineTracks = new Map(); // trackId -> timelineTrack[]
		this._trackToPatternId = new Map(); // trackId -> patternId
		this._trackToTimelineVolume = new Map(); // trackId -> volume multiplier
		this._activeClipsCache = new Map(); // patternId -> {beat: number, clips: clip[]}
		this._lastCacheUpdateBeat = -1;
		this._cacheUpdateInterval = 0.1; // Update cache every 0.1 beats (~100ms at 120 BPM)
		this._panGainsCache = new Map(); // trackId -> {pan: number, leftGain: number, rightGain: number}

		// Cache biquad coefficients per track to avoid recompute every sample
		this._filterCoeffCache = new Map(); // trackId -> {cutoff, q, sampleRate, coeffs}
	}

	/**
	 * @param {Map<string, any>} synths
	 * @param {number} masterGain
	 * @param {number} currentBeat
	 * @param {boolean} isArrangementView
	 */
	mixSynths(synths, masterGain = 0.3, currentBeat = 0, isArrangementView = false) {
		let leftSample = 0;
		let rightSample = 0;
		
		// Update caches periodically (not every sample)
		const shouldUpdateCache = Math.abs(currentBeat - this._lastCacheUpdateBeat) >= this._cacheUpdateInterval;
		if (shouldUpdateCache) {
			this._updateCaches(isArrangementView);
			this._lastCacheUpdateBeat = currentBeat;
		}
		
		// Check if any timeline track is soloed (for arrangement view)
		let hasSoloedTimelineTrack = false;
		if (isArrangementView && this.processor && this.processor.projectManager && this.processor.projectManager.timeline && this.processor.projectManager.timeline.tracks) {
			hasSoloedTimelineTrack = this.processor.projectManager.timeline.tracks.some((t) => t.type === 'pattern' && t.solo === true);
		}
		
		const hasSoloedTrack = this.trackStateManager.hasAnySoloedTrack();
		
		for (const [trackId, synth] of synths.entries()) {
			if (synth.process) {
				// Early mute check - skip expensive lookups if already muted (pattern view only)
				const isMuted = this.trackStateManager.isMuted(trackId);
				if (isMuted && !isArrangementView) {
					continue; // Skip muted tracks in pattern view
				}
				
				// Use cached timeline tracks lookup
				const timelineTracks = this._trackToTimelineTracks.get(trackId) || [];
				
				// Check timeline track mute/solo state (for arrangement view)
				// For mute: Check if there's at least one active clip on a non-muted timeline track
				// For solo: Check if there's at least one active clip on a soloed timeline track
				let isTimelineMuted = false;
				let isTimelineSoloed = false;
				if (isArrangementView && timelineTracks.length > 0) {
					// Use cached pattern ID
					const patternId = this._trackToPatternId.get(trackId);
					
					// Cache timeline reference to avoid repeated property access
					const timeline = this.processor?.projectManager?.timeline;
					const timelineTracksArray = timeline?.tracks;
					
					// Use cached active clips (updated periodically)
					let activeClips = [];
					if (patternId) {
						const cached = this._activeClipsCache.get(patternId);
						if (cached && Math.abs(currentBeat - cached.beat) < this._cacheUpdateInterval * 2) {
							activeClips = cached.clips;
						} else if (timeline?.clips) {
							// Fallback: calculate if cache is stale
							activeClips = timeline.clips.filter((clip) => {
								return clip.patternId === patternId &&
								       currentBeat >= clip.startBeat &&
								       currentBeat < clip.startBeat + clip.duration;
							});
						}
						
						if (activeClips.length > 0 && timelineTracksArray) {
							// Check if all active clips are on muted timeline tracks
							const allClipsMuted = activeClips.every((clip) => {
								const clipTrack = timelineTracksArray.find((t) => t.id === clip.trackId);
								return clipTrack?.mute === true;
							});
							
							// If any timeline track is soloed, play if ANY active clip is on a soloed track
							// This allows soloed tracks to play even if other non-soloed clips are active
							if (hasSoloedTimelineTrack) {
								// Solo mode: play if ANY active clip is on a soloed track
								const hasSoloedClip = activeClips.some((clip) => {
									const clipTrack = timelineTracksArray.find((t) => t.id === clip.trackId);
									return clipTrack?.solo === true;
								});
								isTimelineSoloed = hasSoloedClip;
							} else {
								// No solo mode: check if any active clip is on a soloed timeline track (shouldn't happen, but for safety)
								const hasSoloedClip = activeClips.some((clip) => {
									const clipTrack = timelineTracksArray.find((t) => t.id === clip.trackId);
									return clipTrack?.solo === true;
								});
								isTimelineSoloed = hasSoloedClip;
							}
							
							isTimelineMuted = allClipsMuted;
							
							// Debug: Log mute/solo decision for this track (track-specific, throttled)
							const debugKey = `${trackId}_${patternId}`;
							const lastDebugState = (this._lastDebugStates) ? this._lastDebugStates.get(debugKey) : null;
							const stateChanged = !lastDebugState || 
							                    lastDebugState.muted !== isTimelineMuted || 
							                    lastDebugState.soloed !== isTimelineSoloed ||
							                    (currentBeat - lastDebugState.beat) > 1.0; // Log at most once per beat per track
							
							if (stateChanged) {
								if (!this._lastDebugStates) {
									this._lastDebugStates = new Map();
								}
								this._lastDebugStates.set(debugKey, {
									muted: isTimelineMuted,
									soloed: isTimelineSoloed,
									beat: currentBeat
								});
								
								const clipInfo = activeClips.map((clip) => {
									const clipTrack = timelineTracksArray?.find((t) => t.id === clip.trackId);
									return {
										clipId: clip.id,
										trackId: clip.trackId,
										trackName: clipTrack?.name || 'unknown',
										mute: clipTrack?.mute || false,
										solo: clipTrack?.solo || false,
										startBeat: clip.startBeat,
										duration: clip.duration,
										clipEndBeat: clip.startBeat + clip.duration
									};
								});
								
								this.processor.port.postMessage({
									type: 'debug',
									message: 'AudioMixer: Mute/Solo Check',
									data: {
										currentBeat: currentBeat.toFixed(3),
										trackId,
										patternId,
										activeClips: clipInfo,
										activeClipsCount: activeClips.length,
										allClipsMuted,
										isTimelineMuted,
										isTimelineSoloed,
										hasSoloedTimelineTrack,
										willSkip: isTimelineMuted || (hasSoloedTimelineTrack && !isTimelineSoloed),
										skipReason: isTimelineMuted ? 'muted' : (hasSoloedTimelineTrack && !isTimelineSoloed ? 'not-soloed' : 'none')
									}
								});
							}
						} else {
							// No active clips - mute this audio track
							isTimelineMuted = true;
						}
					} else {
						// Fallback: If any timeline track is muted, mute this audio track
						isTimelineMuted = timelineTracks.some((t) => t.mute === true);
						// If any timeline track is soloed, this audio track is soloed
						isTimelineSoloed = timelineTracks.some((t) => t.solo === true);
					}
				}
				
				// Get solo state (isMuted already declared above)
				const isSoloed = this.trackStateManager.isSoloed(trackId);
				
				// Combine mute states: muted if audio track is muted OR any timeline track is muted
				const shouldMute = isMuted || isTimelineMuted;
				
				// Skip if muted
				if (shouldMute) continue;
				
				// Solo logic: if any timeline track is soloed, only play if this audio track belongs to a soloed timeline track
				// Otherwise, use audio track solo state
				if (isArrangementView && hasSoloedTimelineTrack) {
					if (!isTimelineSoloed) continue;
				} else if (hasSoloedTrack && !isSoloed) {
					continue;
				}
				
				// Get base track volume and pan
				let trackVolume = this.trackStateManager.getVolume(trackId);
				let trackPan = this.trackStateManager.getPan(trackId);
				
				// Apply cached timeline track volume
				const timelineVolume = this._trackToTimelineVolume.get(trackId);
				if (timelineVolume !== undefined) {
					trackVolume *= timelineVolume;
				}
				
				// Use cached pattern ID
				let patternId = this._trackToPatternId.get(trackId);
				// Fallback: check if synth has a stored patternId (from event)
				if (!patternId && synth._patternId) {
					patternId = synth._patternId;
				}
				
				// Get envelope values for this track at current position
				// Initialize with default values
				let envelopeValues = {
					volume: 1.0,
					filter: 1.0,
					pitch: 1.0,
					pan: 0.0
				};
				
				if (this.envelopesProcessor) {
					envelopeValues = this.envelopesProcessor.getActiveEnvelopeValues(
						trackId,
						currentBeat,
						isArrangementView
					);

					// Apply envelope values
					trackVolume *= envelopeValues.volume;
					trackPan += envelopeValues.pan;
					trackPan = Math.max(-1, Math.min(1, trackPan)); // Clamp pan
				}
				
				// Get synth sample
				let synthSample = synth.process();
				
				// Apply filter envelope (if active)
				if (envelopeValues.filter !== 1.0) {
					// Filter envelope modulates filter cutoff
					// envelopeValues.filter is 0-1, map to cutoff frequency
					// Lower filter value = lower cutoff (darker sound)
					const baseCutoff = 20000; // Full frequency range
					const cutoff = baseCutoff * envelopeValues.filter;
					
					// Initialize filter state if needed
					if (!this.filterStates.has(trackId)) {
						this.filterStates.set(trackId, { x1: 0, x2: 0, y1: 0, y2: 0 });
					}
					const filterState = this.filterStates.get(trackId);
					
					// Apply simple lowpass filter
					synthSample = this.applyLowpassFilter(synthSample, cutoff, 0.5, filterState, trackId);
					
					// Debug: Log filter envelope application (occasionally)
					if (this.processor && this.processor.port && (!this._lastFilterLog || (currentBeat - this._lastFilterLog) > 4)) {
						this._lastFilterLog = currentBeat;
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Filter envelope being applied',
							data: {
								trackId,
								patternId,
								currentBeat: currentBeat.toFixed(2),
								filterValue: envelopeValues.filter.toFixed(3),
								cutoff: cutoff.toFixed(0)
							}
						});
					}
				}
				
				// Apply pitch envelope (if active)
				if (envelopeValues.pitch !== 1.0) {
					// Pitch envelope modulates pitch
					// envelopeValues.pitch is a multiplier (0.5 = down octave, 2.0 = up octave)
					// Apply as simple frequency modulation
					synthSample = this.applyPitchShift(synthSample, envelopeValues.pitch, trackId);
					
					// Debug: Log pitch envelope application (occasionally)
					if (this.processor && this.processor.port && (!this._lastPitchLog || (currentBeat - this._lastPitchLog) > 4)) {
						this._lastPitchLog = currentBeat;
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Pitch envelope being applied',
							data: {
								trackId,
								patternId,
								currentBeat: currentBeat.toFixed(2),
								pitchMultiplier: envelopeValues.pitch.toFixed(3)
							}
						});
					}
				}
				
				// Apply effects to this track's audio
				if (this.effectsProcessor) {
					// Debug: Log that we're checking for effects (occasionally)
					if (this.processor && this.processor.port && (!this._lastEffectCheckLog || (currentBeat - this._lastEffectCheckLog) > 4)) {
						this._lastEffectCheckLog = currentBeat;
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Checking for effects',
							data: {
								trackId,
								patternId,
								currentBeat: currentBeat.toFixed(2),
								isArrangementView
							}
						});
					}
					
					const activeEffects = this.effectsProcessor.getActiveEffects(
						trackId,
						currentBeat,
						isArrangementView
					);
					
					// Debug: Log when effects are found (occasionally to avoid spam)
					if (activeEffects && activeEffects.length > 0 && this.processor && this.processor.port) {
						// Only log occasionally to avoid console spam
						if (!this._lastEffectLogTime || (currentBeat - this._lastEffectLogTime) > 4) {
							this._lastEffectLogTime = currentBeat;
							this.processor.port.postMessage({
								type: 'debug',
								message: 'Effects being applied',
								data: {
									trackId,
									currentBeat: currentBeat.toFixed(2),
									activeEffectsCount: activeEffects.length,
									effectTypes: activeEffects.map(e => e.type)
								}
							});
						}
					}
					
					synthSample = this.effectsProcessor.processSample(synthSample, activeEffects);
				}
				
				// Apply track volume
				synthSample *= trackVolume;
				
				// Pan calculation using constant power panning
				// -1 = full left, 0 = center, 1 = full right
				// This maintains constant perceived volume across the pan range
				// Cache pan calculations per track to avoid recalculating every sample
				let panGains = this._panGainsCache?.get(trackId);
				if (!this._panGainsCache) {
					this._panGainsCache = new Map();
				}
				if (!panGains || panGains.pan !== trackPan) {
					const panRadians = (trackPan + 1) * (Math.PI / 4); // Map -1..1 to 0..π/2
					panGains = {
						pan: trackPan,
						leftGain: Math.cos(panRadians),
						rightGain: Math.sin(panRadians)
					};
					this._panGainsCache.set(trackId, panGains);
				}
				
				leftSample += synthSample * panGains.leftGain;
				rightSample += synthSample * panGains.rightGain;
			}
		}

		return {
			left: leftSample * masterGain,
			right: rightSample * masterGain,
			mono: (leftSample + rightSample) * 0.5 * masterGain
		};
	}

	/**
	 * Clear all performance caches (call when project changes)
	 */
	clearCaches() {
		this._trackToTimelineTracks.clear();
		this._trackToPatternId.clear();
		this._trackToTimelineVolume.clear();
		this._activeClipsCache.clear();
		this._lastCacheUpdateBeat = -1;
		if (this._panGainsCache) {
			this._panGainsCache.clear();
		}
	}

	/**
	 * Update performance caches to avoid expensive lookups per-sample
	 * Called periodically (every ~0.1 beats) instead of every sample
	 */
	/**
	 * @param {boolean} isArrangementView
	 */
	_updateCaches(isArrangementView) {
		// Clear old caches
		this._trackToTimelineTracks.clear();
		this._trackToPatternId.clear();
		this._trackToTimelineVolume.clear();
		
		if (!this.processor || !this.processor.projectManager) {
			return;
		}
		
		const projectManager = this.processor.projectManager;
		const synths = this.processor.synthManager.getAllSynths();
		const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
		
		// Build reverse lookup: audioTrackId -> timelineTracks[]
		if (isArrangementView && projectManager.timelineTrackToAudioTracks) {
			for (const [timelineTrackId, audioTrackIds] of projectManager.timelineTrackToAudioTracks.entries()) {
				const timeline = projectManager.timeline;
				const timelineTrack = (timeline && timeline.tracks) ? timeline.tracks.find((t) => t.id === timelineTrackId) : null;
				if (timelineTrack && timelineTrack.type === 'pattern') {
					for (const audioTrackId of audioTrackIds) {
						if (!this._trackToTimelineTracks.has(audioTrackId)) {
							this._trackToTimelineTracks.set(audioTrackId, []);
						}
						this._trackToTimelineTracks.get(audioTrackId).push(timelineTrack);
					}
				}
			}
		}
		
		// Build trackId -> patternId map and trackId -> timelineVolume map
		for (const [trackId] of synths.entries()) {
			// Extract pattern ID from track ID
			let patternId = null;
			if (trackId && trackId.startsWith('__pattern_')) {
				const patternPrefix = '__pattern_';
				const afterPrefix = trackId.substring(patternPrefix.length);
				const uuidMatch = afterPrefix.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
				if (uuidMatch) {
					patternId = uuidMatch[1];
					this._trackToPatternId.set(trackId, patternId);
				}
			} else if (projectManager.patternToTrackId) {
				// Reverse lookup: find pattern ID for this track ID
				for (const [pid, tid] of projectManager.patternToTrackId.entries()) {
					if (tid === trackId) {
						patternId = pid;
						this._trackToPatternId.set(trackId, patternId);
						break;
					}
				}
			}
			
			// Build timeline volume cache
			if (isArrangementView && projectManager.timelineTrackToAudioTracks) {
				for (const [timelineTrackId, audioTrackIds] of projectManager.timelineTrackToAudioTracks.entries()) {
					if (audioTrackIds.includes(trackId)) {
						const timeline = projectManager.timeline;
						const timelineTrack = (timeline && timeline.tracks) ? timeline.tracks.find((t) => t.id === timelineTrackId) : null;
						if (timelineTrack && timelineTrack.volume !== undefined) {
							this._trackToTimelineVolume.set(trackId, timelineTrack.volume);
						}
						break;
					}
				}
			}
		}
		
		// Cache active clips per pattern (for current beat)
		if (isArrangementView && projectManager.timeline && projectManager.timeline.clips) {
			this._activeClipsCache.clear();
			const allPatternIds = new Set(this._trackToPatternId.values());
			
			for (const patternId of allPatternIds) {
				const activeClips = projectManager.timeline.clips.filter((clip) => {
					return clip.patternId === patternId &&
					       currentBeat >= clip.startBeat &&
					       currentBeat < clip.startBeat + clip.duration;
				});
				
				if (activeClips.length > 0) {
					this._activeClipsCache.set(patternId, {
						beat: currentBeat,
						clips: activeClips
					});
				}
			}
		}
	}

	/**
	 * Apply a simple lowpass filter
	 * @param {number} input - Input sample
	 * @param {number} cutoff - Cutoff frequency in Hz
	 * @param {number} resonance - Resonance (0-1)
	 * @param {BiquadState} state - Filter state {x1, x2, y1, y2}
	 * @param {string} trackId - Track ID for coeff caching
	 * @returns {number} Filtered sample
	 */
	applyLowpassFilter(input, cutoff, resonance, state, trackId) {
		const sampleRate = this.processor ? this.processor.sampleRate : 44100;

		// Clamp cutoff to safe audible range to avoid extreme sub-lows
		const clampedCutoff = Math.max(20, Math.min(20000, cutoff));

		// Retrieve cached coeffs
		let cache = this._filterCoeffCache.get(trackId);
		if (!cache || cache.cutoff !== clampedCutoff || cache.q !== resonance || cache.sampleRate !== sampleRate) {
			const c = 1.0 / Math.tan(Math.PI * clampedCutoff / sampleRate);
			const a1 = 1.0 / (1.0 + resonance * c + c * c);
			cache = {
				cutoff: clampedCutoff,
				q: resonance,
				sampleRate,
				coeffs: {
					a1: a1,
					a2: 2 * a1,
					a3: a1,
					b1: 2.0 * (1.0 - c * c) * a1,
					b2: (1.0 - resonance * c + c * c) * a1
				}
			};
			this._filterCoeffCache.set(trackId, cache);
		}

		const coeffs = cache.coeffs;
		let output = coeffs.a1 * input + coeffs.a2 * state.x1 + coeffs.a3 * state.x2
			- coeffs.b1 * state.y1 - coeffs.b2 * state.y2;

		// Flush denormals to zero
		output = this._flushDenormals(output);
		state.x2 = this._flushDenormals(state.x1);
		state.x1 = this._flushDenormals(input);
		state.y2 = this._flushDenormals(state.y1);
		state.y1 = output;

		return output;
	}

	/**
	 * Flush extremely small float values to zero to avoid denormals/subnormals
	 */
	_flushDenormals(x) {
		return (x > -1e-20 && x < 1e-20) ? 0 : x;
	}

	/**
	 * Apply pitch shift using delay buffer with variable read speed
	 * @param {number} input - Input sample
	 * @param {number} pitchMultiplier - Pitch multiplier (1.0 = no change, 2.0 = up octave, 0.5 = down octave)
	 * @param {string} trackId - Track ID for state management
	 * @returns {number} Pitch-shifted sample
	 */
	applyPitchShift(input, pitchMultiplier, trackId) {
		// Clamp pitch multiplier to reasonable range (0.25 to 4.0 = 2 octaves down/up)
		const clampedMultiplier = Math.max(0.25, Math.min(4.0, pitchMultiplier));
		
		// If multiplier is exactly 1.0, no pitch change needed
		if (Math.abs(clampedMultiplier - 1.0) < 0.001) {
			return input;
		}
		
		// Initialize pitch state if needed
		if (!this.pitchStates.has(trackId)) {
			const bufferSize = 4096; // Larger buffer for better quality
			this.pitchStates.set(trackId, { 
				buffer: new Float32Array(bufferSize),
				writeIndex: 0,
				readIndex: 0,
				readPhase: 0, // Fractional part for interpolation
				bufferSize: bufferSize,
				initialized: false
			});
		}
		const pitchState = this.pitchStates.get(trackId);
		
		// Write current sample to buffer
		pitchState.buffer[pitchState.writeIndex] = input;
		pitchState.writeIndex = (pitchState.writeIndex + 1) % pitchState.bufferSize;
		
		// Wait for buffer to fill before reading (need at least half buffer for proper shifting)
		if (!pitchState.initialized) {
			if (pitchState.writeIndex < pitchState.bufferSize / 2) {
				return input; // Return original until buffer is ready
			}
			pitchState.initialized = true;
			// Initialize read index to be behind write index
			pitchState.readIndex = (pitchState.writeIndex - pitchState.bufferSize / 2 + pitchState.bufferSize) % pitchState.bufferSize;
			pitchState.readPhase = 0;
		}
		
		// Calculate read step based on pitch multiplier
		// pitchMultiplier > 1 = read faster (higher pitch) = step < 1
		// pitchMultiplier < 1 = read slower (lower pitch) = step > 1
		const readStep = 1.0 / clampedMultiplier;
		
		// Update read position
		pitchState.readPhase += readStep;
		
		// When readPhase >= 1, advance readIndex
		while (pitchState.readPhase >= 1.0) {
			pitchState.readIndex = (pitchState.readIndex + 1) % pitchState.bufferSize;
			pitchState.readPhase -= 1.0;
		}
		
		// Read from buffer with linear interpolation
		const index1 = pitchState.readIndex;
		const index2 = (pitchState.readIndex + 1) % pitchState.bufferSize;
		const frac = pitchState.readPhase;
		
		const sample1 = pitchState.buffer[index1];
		const sample2 = pitchState.buffer[index2];
		const output = sample1 * (1 - frac) + sample2 * frac;
		
		// Prevent read index from catching up to write index (would cause glitches)
		const distance = (pitchState.writeIndex - pitchState.readIndex + pitchState.bufferSize) % pitchState.bufferSize;
		if (distance < 128 || distance > pitchState.bufferSize - 128) {
			// Too close or too far, reset read position to maintain safe distance
			pitchState.readIndex = (pitchState.writeIndex - pitchState.bufferSize / 2 + pitchState.bufferSize) % pitchState.bufferSize;
			pitchState.readPhase = 0;
		}
		
		// Smooth the output to reduce crackling
		// Use a simple one-pole lowpass filter on the output
		if (!pitchState.lastOutput) {
			pitchState.lastOutput = output;
		}
		const smoothed = pitchState.lastOutput * 0.7 + output * 0.3;
		pitchState.lastOutput = smoothed;
		
		return smoothed;
	}
}



/**
 * Handles the main audio processing loop
 * Processes audio samples, triggers events, and mixes output
 */

class AudioProcessor {
	constructor(processor) {
		this.processor = processor;
		this.lastPlaybackUpdateTime = 0;
		this.playbackUpdateInterval = processor.sampleRate * 0.05; // Update every 50ms
		// Batch event IDs for playback updates to reduce message frequency
		this._batchedEventIds = [];
		this._lastBatchedSampleTime = 0;
		this._batchInterval = processor.sampleRate * 0.02; // Batch events for 20ms before sending
	}

	/**
	 * Process a single audio buffer
	 * @param {AudioWorkletProcessor} inputs - Audio inputs
	 * @param {AudioWorkletProcessor} outputs - Audio outputs
	 * @param {AudioWorkletProcessor} parameters - Audio parameters
	 * @returns {boolean} Whether to keep processing
	 */
	process(inputs, outputs, parameters) {
		if (!this.processor.playbackController.isTransportPlaying()) {
			return true;
		}

		const output = outputs[0];
		const bufferLength = output[0].length;

		// Schedule events ahead of time
		this.processor.eventScheduler.scheduleEvents();

		// Pre-calculate samples per beat for efficiency
		const samplesPerBeat = this.processor.playbackController.samplesPerBeat;
		const startTime = this.processor.currentTime;
		
		// Process audio
		for (let i = 0; i < bufferLength; i++) {
			const sampleTime = Math.floor(startTime + i);
			// Calculate currentBeat more efficiently (avoid division every sample)
			const currentBeat = (startTime + i) / samplesPerBeat;

			// Check for events at this sample time
			const eventsAtTime = this.processor.eventScheduler.getEventsAtTime(sampleTime);
			if (eventsAtTime) {
				// Get pattern length once for all events in this batch
				const patternLength = this.processor.eventScheduler.getPatternLength();
				for (const event of eventsAtTime) {
					this.processor.triggerEvent(event);
					// Batch event IDs for visual feedback instead of sending immediately
					// Use normalized time (within pattern) for matching with node times
					// This ensures events match correctly even when patterns loop
					const normalizedTime = (event.time || 0) % patternLength;
					this._batchedEventIds.push(event.instrumentId + ':' + normalizedTime.toFixed(6));
				}
				this.processor.eventScheduler.removeEventsAtTime(sampleTime);
			}

			// Mix all synths with per-track volume, pan, effects, and envelopes
			const mixed = this.processor.audioMixer.mixSynths(
				this.processor.synthManager.getAllSynths(),
				0.3, // master gain
				currentBeat,
				this.processor.projectManager.isArrangementView
			);

			// Write to output
			if (output.length >= 2) {
				output[0][i] = mixed.left;
				output[1][i] = mixed.right;
			} else {
				// Mono output
				output[0][i] = mixed.mono;
			}
		}

		this.processor.currentTime += bufferLength;

		// Send batched playback updates periodically
		const timeSinceLastBatch = this.processor.currentTime - this._lastBatchedSampleTime;
		if (this._batchedEventIds.length > 0 && timeSinceLastBatch >= this._batchInterval) {
			const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
			this.processor.port.postMessage({
				type: 'playbackUpdate',
				time: currentBeat,
				eventIds: this._batchedEventIds
			});
			this._batchedEventIds = [];
			this._lastBatchedSampleTime = this.processor.currentTime;
		}

		// Send periodic playback position updates
		if (this.processor.currentTime - this.lastPlaybackUpdateTime >= this.playbackUpdateInterval) {
			const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
			this.processor.port.postMessage({
				type: 'playbackPosition',
				time: currentBeat
			});
			this.lastPlaybackUpdateTime = this.processor.currentTime;
		}

		// Check for loop reset
		this.processor.eventScheduler.checkLoopReset();

		return true;
	}
}



/**
 * Handles incoming messages from the main thread
 * Routes messages to appropriate handlers
 */

class MessageHandler {
	constructor(processor) {
		this.processor = processor;
	}

	handle(message) {
		switch (message.type) {
		case 'loadProject':
			this.processor.loadProject(message.tracks, message.bpm, message.events, message.baseMeterTrackId, message.timeline, message.effects, message.envelopes, message.viewMode, message.patternToTrackId, message.timelineTrackToAudioTracks, message.automation, message.patterns);
			break;
			case 'setTransport':
				this.processor.setTransport(message.state, message.position);
				break;
			case 'setTempo':
				this.processor.setTempo(message.bpm);
				break;
		case 'updatePatternTree':
			this.processor.updatePatternTree(message.trackId, message.patternTree, message.baseMeter);
			break;
			case 'updateTrackSettings':
				this.processor.updateTrackSettings(message.trackId, message.settings);
				break;
			case 'updateTrack':
				this.processor.updateTrack(message.trackId, message.track);
				break;
			case 'updateTrackVolume':
				this.processor.updateTrackVolume(message.trackId, message.volume);
				break;
			case 'updateTrackPan':
				this.processor.updateTrackPan(message.trackId, message.pan);
				break;
			case 'updateTrackMute':
				this.processor.updateTrackMute(message.trackId, message.mute);
				break;
		case 'updateTrackSolo':
			this.processor.updateTrackSolo(message.trackId, message.solo);
			break;
		case 'updateTrackEvents':
			this.processor.updateTrackEvents(message.trackId, message.events);
			break;
		case 'removeTrack':
			this.processor.removeTrack(message.trackId);
			break;
		case 'updateTimelineTrackVolume':
			this.processor.updateTimelineTrackVolume(message.trackId, message.volume);
			break;
		case 'updateTimelineTrackMute':
			this.processor.updateTimelineTrackMute(message.trackId, message.mute);
			break;
		case 'updateTimelineTrackSolo':
			this.processor.updateTimelineTrackSolo(message.trackId, message.solo);
			break;
		case 'updateEffect':
			this.processor.updateEffect(message.effectId, message.settings);
			break;
		case 'updateEnvelope':
			this.processor.updateEnvelope(message.envelopeId, message.settings);
			break;
		}
	}
}



/**
 * Factory for creating synth instances based on instrument type
 * Centralizes synth creation logic
 */

class SynthFactory {
	constructor(sampleRate) {
		this.sampleRate = sampleRate;
	}

	create(instrumentType, settings) {
		switch (instrumentType) {
			case 'kick':
				return new KickSynth(settings, this.sampleRate);
			case 'snare':
				return new SnareSynth(settings, this.sampleRate);
			case 'hihat':
				return new HiHatSynth(settings, this.sampleRate);
			case 'clap':
				return new ClapSynth(settings, this.sampleRate);
			case 'tom':
				return new TomSynth(settings, this.sampleRate);
			case 'cymbal':
				return new CymbalSynth(settings, this.sampleRate);
		case 'shaker':
			return new ShakerSynth(settings, this.sampleRate);
		case 'rimshot':
			return new RimshotSynth(settings, this.sampleRate);
		case 'subtractive':
			return new SubtractiveSynth(settings, this.sampleRate);
			case 'fm':
				return new FMSynth(settings, this.sampleRate);
			case 'wavetable':
				return new WavetableSynth(settings, this.sampleRate);
		case 'supersaw':
			return new SupersawSynth(settings, this.sampleRate);
		case 'pluck':
			return new PluckSynth(settings, this.sampleRate);
		case 'bass':
			return new BassSynth(settings, this.sampleRate);
		case 'pad':
			return new PadSynth(settings, this.sampleRate);
		case 'organ':
			return new OrganSynth(settings, this.sampleRate);
		default:
			return null;
	}
}
}



/**
 * AudioWorklet Processor for the DAW engine
 * Runs in a separate thread for sample-accurate timing
 * 
 * This is the core processor - synth classes are added by the build script
 * 
 * The processor is now modularized into separate concerns:
 * - TrackStateManager: Manages track volume, pan, mute, solo
 * - PlaybackController: Manages playback state, tempo, and transport control
 * - EventScheduler: Handles event scheduling and timing
 * - EffectsProcessor: Applies effects based on timeline position
 * - EnvelopesProcessor: Applies envelopes based on timeline position
 * - ProjectManager: Manages project state, tracks, timeline, effects, and envelopes
 * - SynthManager: Manages synth instances lifecycle
 * - AudioMixer: Handles audio mixing with panning, effects, and envelopes
 * - AudioProcessor: Handles the main audio processing loop
 * - MessageHandler: Routes incoming messages
 * - SynthFactory: Creates synth instances
 */

class EngineWorkletProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.currentTime = 0;
		this.sampleRate = sampleRate;
		
		
		// Initialize modules
		this.trackState = new TrackStateManager();
		this.eventScheduler = new EventScheduler(this);
		this.effectsProcessor = new EffectsProcessor();
		this.envelopesProcessor = new EnvelopesProcessor();
		this.audioMixer = new AudioMixer(this.trackState, this.effectsProcessor, this.envelopesProcessor, this);
		this.messageHandler = new MessageHandler(this);
		this.synthFactory = new SynthFactory(this.sampleRate);
		this.projectManager = new ProjectManager(this);
		this.synthManager = new SynthManager(this);
		this.playbackController = new PlaybackController(this);
		this.audioProcessor = new AudioProcessor(this);
		
		this.port.onmessage = (event) => {
			this.messageHandler.handle(event.data);
		};
	}

	loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId, timelineTrackToAudioTracks, automation, patterns) {
		this.playbackController.setTempo(bpm);
		this.eventScheduler.clear();
		// Clear old synths when reloading
		this.synthManager.clear();
		// Clear audio mixer caches when reloading
		this.audioMixer.clearCaches();
		
		// Reset playback position when loading new project
		this.currentTime = 0;
		if (this.audioProcessor) {
			this.audioProcessor.lastPlaybackUpdateTime = 0;
		}
		
		// Delegate to ProjectManager
		this.projectManager.loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId, timelineTrackToAudioTracks, automation, patterns);
		
		// Initialize track state
		this.trackState.initializeTracks(tracks);
		
		// Don't initialize timeline track mute/solo on audio tracks
		// AudioMixer will check timeline track mute/solo state based on active clips
		// This allows the same pattern on multiple tracks to be muted/soloed independently
	}

	setTempo(bpm) {
		// If playing, preserve the current beat position when BPM changes
		const wasPlaying = this.playbackController.isTransportPlaying();
		let currentBeat = 0;
		
		if (wasPlaying && this.currentTime > 0) {
			// Calculate current beat position before changing BPM
			currentBeat = this.currentTime / this.playbackController.samplesPerBeat;
		}
		
		// Update BPM
		this.playbackController.setTempo(bpm);
		
		// If playing, adjust currentTime to maintain the same beat position
		if (wasPlaying && currentBeat > 0) {
			this.currentTime = currentBeat * this.playbackController.samplesPerBeat;
		}
		
		// Clear scheduled events and reset scheduler state
		// This ensures events are re-scheduled with the new BPM
		if (this.eventScheduler) {
			this.eventScheduler.clear();
			// Force immediate re-scheduling on next process call
			this.eventScheduler._lastScheduledBeat = -1;
			this.eventScheduler._lastCheckedEventIndex = -1;
		}
	}

	setTransport(state, position = 0) {
		this.playbackController.setTransport(state, position);
	}

	updatePatternTree(trackId, patternTree, baseMeter = 4) {
		this.projectManager.updatePatternTree(trackId, patternTree, baseMeter);
	}

	updateTrackSettings(trackId, settings) {
		this.projectManager.updateTrackSettings(trackId, settings);
		this.synthManager.updateSynthSettings(trackId, settings);
	}

	updateTrack(trackId, updatedTrack) {
		const oldTrack = this.projectManager.updateTrack(trackId, updatedTrack);
		if (oldTrack) {
			// Update track state
			this.trackState.updateTrack(trackId, updatedTrack);
			
		// If instrument type changed, create new synth to replace old one seamlessly
		if (oldTrack.instrumentType !== updatedTrack.instrumentType) {
			// Extract patternId from trackId if it's a pattern track
			// Format: __pattern_{patternId}_{instrumentId}
			let patternId = null;
			if (trackId && trackId.startsWith('__pattern_')) {
				// Remove '__pattern_' prefix to get '{patternId}_{instrumentId}'
				const withoutPrefix = trackId.substring('__pattern_'.length);
				// Split by '_' to get [patternId, instrumentId]
				const parts = withoutPrefix.split('_');
				if (parts.length >= 1) {
					patternId = parts[0]; // patternId is the first part after prefix
				}
			}
			
			// Remove old synth first to force creation of new one with new instrument type
			this.synthManager.removeSynth(trackId);
			
			// Create new synth with updated instrument type
			// The track has already been updated in projectManager, so getOrCreateSynth will use the new type
			this.synthManager.getOrCreateSynth(trackId, patternId);
			
			// Update synth settings to match the new track settings
			if (updatedTrack.settings) {
				this.synthManager.updateSynthSettings(trackId, updatedTrack.settings);
			}
		}
			
		// If pattern tree changed, update it in real-time
		if (oldTrack && updatedTrack.patternTree && oldTrack.patternTree !== updatedTrack.patternTree) {
			// Determine baseMeter for this track
			let baseMeter = 4; // Default for standalone instruments
			if (trackId && trackId.startsWith('__pattern_')) {
				const lastUnderscore = trackId.lastIndexOf('_');
				if (lastUnderscore > '__pattern_'.length) {
					const patternId = trackId.substring('__pattern_'.length, lastUnderscore);
					if (this.projectManager.patterns) {
						const pattern = this.projectManager.patterns.find(p => p.id === patternId);
						if (pattern) {
							baseMeter = pattern.baseMeter || 4;
						}
					}
				}
			}
			this.updatePatternTree(trackId, updatedTrack.patternTree, baseMeter);
		}
		} else {
			// Track doesn't exist yet, add it
			this.projectManager.addTrack(updatedTrack);
			this.trackState.updateTrack(trackId, updatedTrack);
			
			// Extract patternId from trackId if it's a pattern track
			let patternId = null;
			if (trackId && trackId.startsWith('__pattern_')) {
				const withoutPrefix = trackId.substring('__pattern_'.length);
				const parts = withoutPrefix.split('_');
				if (parts.length >= 1) {
					patternId = parts[0];
				}
			}
			
			// Create synth for new track
			this.synthManager.getOrCreateSynth(trackId, patternId);
			
			// If pattern tree exists, update events
			if (updatedTrack.patternTree) {
				// Determine baseMeter for this track
				let baseMeter = 4; // Default for standalone instruments
				if (trackId && trackId.startsWith('__pattern_')) {
					const lastUnderscore = trackId.lastIndexOf('_');
					if (lastUnderscore > '__pattern_'.length) {
						const patternId = trackId.substring('__pattern_'.length, lastUnderscore);
						if (this.projectManager.patterns) {
							const pattern = this.projectManager.patterns.find(p => p.id === patternId);
							if (pattern) {
								baseMeter = pattern.baseMeter || 4;
							}
						}
					}
				}
				this.updatePatternTree(trackId, updatedTrack.patternTree, baseMeter);
			}
		}
	}

	updateTrackVolume(trackId, volume) {
		this.trackState.setVolume(trackId, volume);
	}

	updateTimelineTrackVolume(trackId, volume) {
		this.projectManager.updateTimelineTrackVolume(trackId, volume);
	}

	updateTimelineTrackMute(trackId, mute) {
		this.projectManager.updateTimelineTrackMute(trackId, mute);
		// Don't set mute on audio tracks - AudioMixer will check timeline track mute state based on active clips
		// This allows the same pattern on multiple tracks to be muted independently
	}

	updateTimelineTrackSolo(trackId, solo) {
		this.projectManager.updateTimelineTrackSolo(trackId, solo);
		// Don't set solo on audio tracks - AudioMixer will check timeline track solo state based on active clips
		// This allows the same pattern on multiple tracks to be soloed independently
	}

	updateTrackEvents(trackId, events) {
		// Remove old events for this track
		this.projectManager.events = this.projectManager.events.filter(e => e.instrumentId !== trackId);
		
		// Add new events
		this.projectManager.events.push(...events);
		
		// Re-sort events by time
		this.projectManager.events.sort((a, b) => a.time - b.time);
		
		// Clear scheduled events for this track in the future
		const currentBeat = this.currentTime / this.playbackController.samplesPerBeat;
		const currentSampleTime = Math.floor(this.currentTime);
		
		// Remove scheduled events that are in the future
		for (const [sampleTime, scheduledEvents] of this.eventScheduler.scheduledEvents.entries()) {
			if (sampleTime > currentSampleTime) {
				// Filter out events for this track
				const filteredEvents = scheduledEvents.filter(e => e.instrumentId !== trackId);
				if (filteredEvents.length === 0) {
					this.eventScheduler.scheduledEvents.delete(sampleTime);
				} else {
					this.eventScheduler.scheduledEvents.set(sampleTime, filteredEvents);
				}
			}
		}
	}

	removeTrack(trackId) {
		// Remove from project manager
		if (this.projectManager.tracks) {
			this.projectManager.tracks = this.projectManager.tracks.filter(t => t.id !== trackId);
		}
		
		// Remove from track state
		this.trackState.removeTrack(trackId);
		
		// Remove synth
		this.synthManager.removeSynth(trackId);
		
		// Remove events
		this.projectManager.events = this.projectManager.events.filter(e => e.instrumentId !== trackId);
		
		// Clear scheduled events for this track
		const currentSampleTime = Math.floor(this.currentTime);
		for (const [sampleTime, scheduledEvents] of this.eventScheduler.scheduledEvents.entries()) {
			if (sampleTime > currentSampleTime) {
				const filteredEvents = scheduledEvents.filter(e => e.instrumentId !== trackId);
				if (filteredEvents.length === 0) {
					this.eventScheduler.scheduledEvents.delete(sampleTime);
				} else {
					this.eventScheduler.scheduledEvents.set(sampleTime, filteredEvents);
				}
			}
		}
	}

	updateTrackPan(trackId, pan) {
		this.trackState.setPan(trackId, pan);
	}

	updateTrackMute(trackId, mute) {
		this.trackState.setMute(trackId, mute);
	}

	updateTrackSolo(trackId, solo) {
		this.trackState.setSolo(trackId, solo);
	}

	updateEffect(effectId, settings) {
		this.effectsProcessor.updateEffect(effectId, settings);
	}

	updateEnvelope(envelopeId, settings) {
		this.envelopesProcessor.updateEnvelope(envelopeId, settings);
	}

	process(inputs, outputs, parameters) {
		return this.audioProcessor.process(inputs, outputs, parameters);
	}

	triggerEvent(event) {
		// Extract patternId from event if available (for effects/envelopes)
		const patternId = event.patternId || null;
		this.synthManager.triggerNote(event.instrumentId, event.velocity, event.pitch, patternId);
	}
}


// ========== DRUM SYNTH CLASSES ==========

/**
 * Kick Drum Synth (procedural)
 * Generates an organic, realistic kick drum sound
 * - Multiple oscillators with slight detuning for character
 * - Clean tonal body without noise/rattling or clicks
 * - Realistic pitch envelope (quick drop like real drum head)
 * - Natural compression/saturation characteristics
 */

class KickSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0; // Continuous phase accumulator (0-2π)
		this.phase2 = 0; // Second oscillator phase accumulator (0-2π)
		this.phase3 = 0; // Third oscillator for impact transient
		this.envelopePhase = 0;
		this.isActive = false;
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
		
		// DC blocking filter to prevent DC offset clicks
		this.dcFilterState = { x1: 0, y1: 0 };
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		// Reset to 0 to start from beginning of waveform
		this.phase = 0;
		this.phase2 = 0;
		this.phase3 = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Reset DC filter state on trigger to prevent clicks
		this.dcFilterState.x1 = 0;
		this.dcFilterState.y1 = 0;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;

		const attack = (this.settings.attack || 0.005) * this.sampleRate;
		const decay = (this.settings.decay || 0.4) * this.sampleRate;
		const sustain = this.settings.sustain || 0.0;
		const release = (this.settings.release || 0.15) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Calculate pitch multiplier (base pitch is C4 = MIDI 60, matching default)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Realistic kick drum frequencies
		// Real kick drums have fundamental around 40-60Hz, with quick pitch drop
		// Higher initial frequency for more punch and impact
		const startFreq = 90 * pitchMultiplier; // Initial frequency (higher for more attack punch)
		const fundamentalFreq = 50 * pitchMultiplier; // Main body frequency (typical kick fundamental)
		const endFreq = 40 * pitchMultiplier; // End frequency (slight drop)
		
		// Realistic pitch envelope - quick drop like a real drum head
		// The head tension releases quickly, causing pitch to drop
		// Use smooth continuous curve to prevent clicks
		let freq;
		if (this.envelopePhase < attack + decay) {
			// Smooth pitch drop throughout attack and decay
			const totalPhase = this.envelopePhase / (attack + decay);
			// Use smooth exponential curve for continuous frequency change
			// Start at startFreq, quickly drop to fundamentalFreq, then slowly to endFreq
			if (totalPhase < 0.2) {
				// Quick initial drop (first 20% of total duration)
				const phase = totalPhase / 0.2;
				freq = startFreq * Math.exp(-phase * 3) + fundamentalFreq * (1 - Math.exp(-phase * 3));
			} else {
				// Slower decay to end frequency
				const phase = (totalPhase - 0.2) / 0.8;
				freq = fundamentalFreq * Math.exp(-phase * 1.5) + endFreq * (1 - Math.exp(-phase * 1.5));
			}
		} else {
			// During release, maintain end frequency
			freq = endFreq;
		}

		// Multiple oscillators with slight detuning for organic character
		// Real drums have multiple resonances that create a richer sound
		const detune1 = 1.0; // Main oscillator
		const detune2 = 1.02; // Slightly detuned for character (2% detune)
		
		// Calculate phase increments based on current frequency
		// This ensures smooth phase accumulation even when frequency changes
		const phaseIncrement1 = 2 * Math.PI * freq * detune1 / this.sampleRate;
		const phaseIncrement2 = 2 * Math.PI * freq * detune2 / this.sampleRate;
		
		// Generate sine waves using continuous phase accumulation
		const sine1 = Math.sin(this.phase);
		const sine2 = Math.sin(this.phase2);
		
		// Accumulate phase continuously (wrap to prevent overflow)
		this.phase += phaseIncrement1;
		this.phase2 += phaseIncrement2;
		
		// Wrap phases smoothly using modulo to prevent discontinuities
		// Use larger range (100 * 2π) before wrapping to maintain precision
		const twoPi = 2 * Math.PI;
		const wrapRange = 100 * twoPi;
		if (this.phase > wrapRange) {
			this.phase = this.phase % twoPi;
		}
		if (this.phase2 > wrapRange) {
			this.phase2 = this.phase2 % twoPi;
		}
		
		// Combine oscillators with slight phase offset for more character
		const tonalBody = (sine1 * 0.6 + sine2 * 0.4);
		
		// Add impact transient - high-frequency tonal component for realistic kick attack
		// This gives the kick that initial "thump" and "click" like real drums
		// Use a tonal component instead of noise to avoid clicks
		const impactFreq = 400 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.15));
		const phaseIncrement3 = 2 * Math.PI * impactFreq / this.sampleRate;
		const impactTone = Math.sin(this.phase3) * 0.3;
		
		// Accumulate impact phase
		this.phase3 += phaseIncrement3;
		if (this.phase3 > wrapRange) {
			this.phase3 = this.phase3 % twoPi;
		}
		
		// Impact transient envelope - very short, only during attack phase
		// This creates the initial "click" and "thump" of a real kick
		let impactEnvelope = 0;
		const impactDuration = Math.min(attack * 0.4, 0.015 * this.sampleRate); // Very short, max 15ms
		if (this.envelopePhase < impactDuration) {
			const impactPhase = this.envelopePhase / impactDuration;
			// Quick attack, fast decay for sharp transient
			impactEnvelope = Math.exp(-impactPhase * 10);
		}

		// Extended total duration with long fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.3); // 100ms minimum fade-out
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// ADSR envelope for clean tonal body
		// Use smoother curves to prevent clicks
		let envelope = 0;
		let decayEndValue = sustain;
		
		if (this.envelopePhase < attack) {
			// More aggressive attack for punch and impact
			const attackPhase = this.envelopePhase / attack;
			// Faster exponential curve for more immediate punch
			envelope = 1 - Math.exp(-attackPhase * 10);
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			
			// Smooth exponential decay - avoid mixing exponential and linear to prevent clicks
			// Use pure exponential decay for smoothness
			envelope = Math.exp(-decayPhase * 3) * (1 - sustain) + sustain;
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : sustain;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : sustain) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		// Ensure envelope is never negative and clamp to [0, 1]
		envelope = Math.max(0, Math.min(1, envelope));

		// Phase accumulation is done above when calculating sine waves
		this.envelopePhase++;
		
		// Apply envelope to clean tonal body
		// Increased gain to match other drums' volume levels
		let output = tonalBody * envelope * this.velocity * 2;
		
		// Add impact transient - mix the high-frequency tonal component with the body
		// This gives the kick that realistic initial attack and impact without clicks
		const impactComponent = impactTone * impactEnvelope * this.velocity * 1;
		output += impactComponent;
		
		// DC blocking filter to remove any DC offset that could cause clicks
		// Simple one-pole high-pass filter
		const dcAlpha = 0.995; // Filter coefficient
		const dcFiltered = output - this.dcFilterState.x1 + dcAlpha * this.dcFilterState.y1;
		this.dcFilterState.x1 = output;
		this.dcFilterState.y1 = dcFiltered;
		output = dcFiltered;
		
		// Subtle saturation for organic character (soft clipping)
		// Real drums have natural compression from the head
		// Increased saturation threshold to allow more headroom for punch
		const saturation = 0.4; // Amount of saturation (increased from 0.3)
		if (Math.abs(output) > saturation) {
			const sign = output > 0 ? 1 : -1;
			output = sign * (saturation + (1 - saturation) * Math.tanh((Math.abs(output) - saturation) / (1 - saturation)));
		}
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			// Use smooth curve for fade (sine curve for smoother transition)
			const smoothFade = 0.5 * (1 - Math.cos(Math.PI * fadeProgress));
			const oldGain = 1 - smoothFade;
			const newGain = smoothFade;
			// Smooth the old output to prevent discontinuities
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05; // Smooth transition
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Smooth fade-out at the end to prevent clicks
		// Add an extra fade-out phase before stopping
		const finalFadeOutSamples = Math.max(20, 0.001 * this.sampleRate); // At least 20 samples or 1ms
		if (this.envelopePhase >= extendedDuration - finalFadeOutSamples) {
			const fadeOutPhase = (this.envelopePhase - (extendedDuration - finalFadeOutSamples)) / finalFadeOutSamples;
			// Smooth exponential fade-out
			const fadeOutGain = Math.exp(-fadeOutPhase * 5);
			output *= fadeOutGain;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				// Reset filter states when stopping to prevent clicks on next trigger
				this.dcFilterState.x1 = 0;
				this.dcFilterState.y1 = 0;
				return 0;
			}
		}
		
		return output;
	}
}



/**
 * Snare Drum Synth
 * Based on rimshot structure but with strong snare wire rattle
 * - Sharp tonal components (like rimshot) for punch
 * - Strong snare wire rattle (bandpass filtered noise) for snare character
 * - More transients for the rattling effect
 */

class SnareSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.001) * this.sampleRate;
		const decay = (this.settings.decay || 0.15) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Snare = rimshot structure + strong snare wire rattle
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// 1. Sharp tonal "ping" - high frequency sine that quickly decays (like rimshot)
		const pingFreq = 800 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.2));
		const pingPhase = this.phase * 2 * Math.PI * pingFreq / this.sampleRate;
		const ping = Math.sin(pingPhase) * 0.4;
		
		// 2. Body tone - lower frequency for character (like rimshot)
		const bodyFreq = 200 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.5));
		const bodyPhase = this.phase * 2 * Math.PI * bodyFreq / this.sampleRate;
		const body = Math.sin(bodyPhase) * 0.2;
		
		// 3. SNARE WIRES - bandpass filtered noise for rattle (THIS IS THE KEY DIFFERENCE)
		// This is what makes it a snare, not just a rimshot
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Bandpass filter for snare wire rattle (200-800Hz range)
		// Use multiple bandpass filters at different frequencies for more transients/rattling
		// Scale all frequencies proportionally with pitch
		const snareWireCenter1 = 400 * pitchMultiplier; // Hz - main snare wire resonance
		const snareWireCenter2 = 550 * pitchMultiplier; // Hz - secondary resonance for more transients
		const snareWireBandwidth = 300 * pitchMultiplier; // Hz - bandwidth also scales to maintain character
		
		// Simple bandpass approximation for snare wires
		// Create resonant peaks for rattling effect
		const snarePhase1 = this.phase * 2 * Math.PI * snareWireCenter1 / this.sampleRate;
		const snarePhase2 = this.phase * 2 * Math.PI * snareWireCenter2 / this.sampleRate;
		
		// Modulate noise with resonant frequencies to create snare wire rattle
		const snareWire1 = noise * (0.5 + 0.5 * Math.sin(snarePhase1)) * 0.6;
		const snareWire2 = noise * (0.5 + 0.5 * Math.sin(snarePhase2)) * 0.4;
		const snareWireNoise = snareWire1 + snareWire2;
		
		// 4. Bright filtered noise for snappy character (like rimshot, but less)
		const hpfFreq = 2000 * pitchMultiplier;
		const hpfPhase = this.phase * 2 * Math.PI * hpfFreq / this.sampleRate;
		const filteredNoise = noise * (0.3 + 0.7 * Math.abs(Math.sin(hpfPhase))) * 0.3;
		
		// Separate envelopes for different components
		// Body tone needs to decay very fast to avoid melodic tone
		let bodyEnvelope = 0;
		let mainEnvelope = 0;
		let decayEndValue = 0;
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		if (this.envelopePhase < attack) {
			// Very fast attack for sharp transient
			const attackPhase = this.envelopePhase / attack;
			bodyEnvelope = 0.5 * (1 - Math.cos(Math.PI * attackPhase));
			mainEnvelope = 0.5 * (1 - Math.cos(Math.PI * attackPhase));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			
			// Body: extremely fast decay - only first 10% of decay to avoid melodic tone
			if (decayPhase < 0.1) {
				bodyEnvelope = Math.exp(-decayPhase * 20) * (1 - decayPhase / 0.1);
			} else {
				bodyEnvelope = 0; // Cut off body tone early
			}
			
			// Main envelope: quick exponential decay for other components
			mainEnvelope = Math.exp(-decayPhase * 4);
			decayEndValue = mainEnvelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			bodyEnvelope = 0; // Body is gone by release
			// Use exponential decay for smooth release
			mainEnvelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-8);
			bodyEnvelope = 0;
			mainEnvelope = fadeStartValue * Math.exp(-fadePhase * 12);
		} else {
			bodyEnvelope = 0;
			mainEnvelope = 0;
		}

		bodyEnvelope = Math.max(0, Math.min(1, bodyEnvelope));
		mainEnvelope = Math.max(0, Math.min(1, mainEnvelope));

		// Apply separate envelopes - body decays much faster
		const bodyComponent = body * bodyEnvelope;
		const otherComponents = (ping + snareWireNoise + filteredNoise) * mainEnvelope;
		let sample = bodyComponent + otherComponents;

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * this.velocity * 0.7;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}
}


/**
 * Hi-Hat Synth
 * High-frequency filtered noise for metallic cymbal character
 */

class HiHatSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
		
		// High-pass filter state
		this.hpFilterState = { x1: 0, y1: 0 };
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Reset filter state for clean retrigger
		if (this.hpFilterState) {
			this.hpFilterState.x1 = 0;
			this.hpFilterState.y1 = 0;
		}
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.001) * this.sampleRate;
		const decay = (this.settings.decay || 0.05) * this.sampleRate;
		const release = (this.settings.release || 0.01) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// High-frequency noise (metallic)
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Use high-pass filtering with cutoff that scales with pitch
		// This creates a clear pitch shift by moving the spectral content up/down
		// Higher pitch = higher cutoff = brighter, more metallic sound
		const baseCutoff = 8000; // Base cutoff frequency for C4
		const cutoffFreq = baseCutoff * pitchMultiplier;
		
		// Simple one-pole high-pass filter for pitch shifting
		// Initialize filter state if needed
		if (!this.hpFilterState) {
			this.hpFilterState = { x1: 0, y1: 0 };
		}
		
		// High-pass filter coefficient
		const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
		const dt = 1.0 / this.sampleRate;
		const alpha = rc / (rc + dt);
		
		// Apply high-pass filter
		const filtered = alpha * (this.hpFilterState.y1 + noise - this.hpFilterState.x1);
		this.hpFilterState.x1 = noise;
		this.hpFilterState.y1 = filtered;
		
		let sample = filtered;

		// Extended fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 5);
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential decay for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-8);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.3;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}
}



/**
 * Clap Synth
 * Multiple delayed noise bursts to simulate multiple hands clapping
 * - 2-3 percussive impacts very close together (1-3ms delays)
 * - Bright, sharp noise bursts with bandpass filtering
 * - Short, percussive envelopes
 */

class ClapSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.bursts = [];
		this.isActive = false;
		// Pre-generated noise buffer for consistent sound
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.bursts = [];
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// 2-3 percussive impacts very close together (like hands clapping)
		// Use tight timing to create that characteristic clap sound
		const numBursts = 3;
		for (let i = 0; i < numBursts; i++) {
			// Very tight delays: 1-3ms between impacts for that clapping sound
			const delayMs = 0.001 + (i * 0.001) + (Math.random() * 0.001); // 1-3ms total spread
			this.bursts.push({
				delay: Math.floor(delayMs * this.sampleRate),
				phase: 0,
				envelopePhase: 0,
				velocity: velocity * (1 - i * 0.3), // More velocity reduction for later bursts
				noiseIndex: this.noiseIndex + i * 3000 // More offset for variation
			});
		}
		this.isActive = true;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive || this.bursts.length === 0) return 0;
		
		// Use settings with defaults for clap (very short, percussive)
		const attack = (this.settings.attack || 0.0005) * this.sampleRate; // Even faster attack
		const decay = (this.settings.decay || 0.02) * this.sampleRate; // Much shorter decay for sharp clap
		const release = (this.settings.release || 0.01) * this.sampleRate; // Very short release
		const totalDuration = attack + decay + release;
		const fadeOutSamples = Math.max(0.005 * this.sampleRate, release * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		let sample = 0;
		for (let burst of this.bursts) {
			// Handle delay - decrement and skip processing but don't increment phase yet
			if (burst.delay > 0) {
				burst.delay--;
				continue;
			}
			
			// Use pre-generated noise buffer
			const noiseIdx = (burst.noiseIndex + burst.phase) % this.noiseBuffer.length;
			let noise = this.noiseBuffer[noiseIdx];
			
			// Add a sharp transient "click" at the very start (like hands smacking together)
			// Use lower frequency to avoid squeaking
			let click = 0;
			if (burst.envelopePhase < attack * 3) {
				const clickPhase = burst.envelopePhase / (attack * 3);
				// Lower frequency sine wave that quickly sweeps down - less squeaky
				const clickFreq = 6000 * pitchMultiplier * (1 - clickPhase * 0.9);
				click = Math.sin(burst.phase * 2 * Math.PI * clickFreq / this.sampleRate) * (1 - clickPhase) * 0.4;
			}
			
			// Sharp, percussive ADSR envelope
			let envelope = 0;
			let decayEndValue = 0;
			
			if (burst.envelopePhase < attack) {
				// Instant attack for sharp transient
				envelope = 1.0; // Full volume immediately
			} else if (burst.envelopePhase < attack + decay) {
				const decayPhase = (burst.envelopePhase - attack) / decay;
				// Very quick exponential decay for sharp clap
				envelope = Math.exp(-decayPhase * 10); // Faster decay
				decayEndValue = envelope; // Track the value continuously during decay
			} else if (burst.envelopePhase < attack + decay + release) {
				// Release: fade from decayEndValue to 0
				// Use the value from the last sample of decay phase for smooth transition
				// If decayEndValue wasn't captured (shouldn't happen), calculate it
				let releaseStartValue = decayEndValue;
				if (releaseStartValue <= 0) {
					// Fallback: calculate what the envelope should be at end of decay
					releaseStartValue = Math.exp(-1.0 * 10); // End of decay phase value
				}
				const releasePhase = (burst.envelopePhase - attack - decay) / release;
				// Use exponential decay for smooth release
				envelope = releaseStartValue * Math.exp(-releasePhase * 4);
			} else if (burst.envelopePhase < extendedDuration) {
				// Extended fade-out
				const fadePhase = (burst.envelopePhase - (attack + decay + release)) / fadeOutSamples;
				const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-12);
				envelope = fadeStartValue * Math.exp(-fadePhase * 15);
			}
			
			envelope = Math.max(0, Math.min(1, envelope));
			
			// Bandpass filtering for clap character (emphasize mid-high frequencies)
			// Initialize filter states for this burst if needed
			if (!burst.hpFilterState) {
				burst.hpFilterState = { x1: 0, y1: 0 };
			}
			if (!burst.lpFilterState) {
				burst.lpFilterState = { x1: 0, y1: 0 };
			}
			
			// High-pass filter for brightness - claps are bright and mid-high focused
			const hpCutoff = 2000 * pitchMultiplier; // Higher for more brightness
			const rcHp = 1.0 / (2.0 * Math.PI * hpCutoff);
			const dt = 1.0 / this.sampleRate;
			const alphaHp = rcHp / (rcHp + dt);
			const hpFiltered = alphaHp * (burst.hpFilterState.y1 + noise - burst.hpFilterState.x1);
			burst.hpFilterState.x1 = noise;
			burst.hpFilterState.y1 = hpFiltered;
			
			// Low-pass filter to cut very high frequencies (bandpass effect)
			// Claps have energy in 2-5kHz range - lower cutoff to remove squeaking
			const lpCutoff = 5000 * pitchMultiplier; // Lower to filter out squeaking
			const rcLp = 1.0 / (2.0 * Math.PI * lpCutoff);
			const alphaLp = dt / (rcLp + dt);
			const lpFiltered = alphaLp * hpFiltered + (1 - alphaLp) * burst.lpFilterState.y1;
			burst.lpFilterState.y1 = lpFiltered;
			
			// Add some raw noise for extra body and punch - more for clap character
			const rawBody = noise * 0.2;
			
			// Filter the click through the low-pass as well to remove high-frequency squeaking
			// Apply low-pass to click to smooth it out
			if (!burst.clickLpState) {
				burst.clickLpState = { y1: 0 };
			}
			const clickFiltered = alphaLp * click + (1 - alphaLp) * burst.clickLpState.y1;
			burst.clickLpState.y1 = clickFiltered;
			
			// Combine filtered noise with filtered click - less emphasis on click
			const finalNoise = lpFiltered * 0.75 + clickFiltered * 0.5 + rawBody;
			
			// Add to sample with envelope and velocity
			if (envelope > 0.001) {
				sample += finalNoise * envelope * burst.velocity;
			}
			
			// Always increment phases
			burst.envelopePhase++;
			burst.phase++;
		}
		
		// Remove finished bursts
		this.bursts = this.bursts.filter(b => b.envelopePhase < extendedDuration);
		if (this.bursts.length === 0) {
			this.isActive = false;
			// Only return 0 if we're truly done, otherwise continue processing
			if (Math.abs(sample) < 0.0001) {
				return 0;
			}
		}
		
		let output = sample * 1.0; // Full gain for maximum clap punch
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		return output;
	}
}



/**
 * Tom Synth
 * Descending pitch envelope for tom-tom character
 */

class TomSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 50;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.4) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Calculate pitch multiplier (base pitch is D3 = MIDI 50)
		const basePitch = 50;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Descending pitch envelope
		const startFreq = 100 * pitchMultiplier;
		const endFreq = 50 * pitchMultiplier;
		const freq = startFreq * Math.exp(-this.envelopePhase / (decay * 0.6));

		const sample = Math.sin(this.phase * 2 * Math.PI * freq / this.sampleRate);

		// Extended total duration with long fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.3); // 100ms minimum fade-out
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// ADSR envelope - FIXED: Release fades from end-of-decay value
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 2.5);
			decayEndValue = envelope; // Track the actual value at end of decay
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			// Use decayEndValue if set, otherwise fallback to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential decay for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.4;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}
}



/**
 * Cymbal Synth
 * High-pass filtered noise for tight, ringing cymbal character
 */

class CymbalSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
		
		// High-pass filter state for thin, high-pitched character
		this.hpFilterState = { x1: 0, y1: 0 };
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Reset filter state for clean retrigger
		if (this.hpFilterState) {
			this.hpFilterState.x1 = 0;
			this.hpFilterState.y1 = 0;
		}
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.25) * this.sampleRate; // Tighter decay
		const release = (this.settings.release || 0.2) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Clean noise source
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Use high-pass filtering with cutoff that scales with pitch
		// This creates a clear pitch shift by moving the spectral content up/down
		// Higher pitch = higher cutoff = brighter, more ringing sound
		const baseCutoff = 3500; // Base cutoff frequency for C4
		const cutoffFreq = baseCutoff * pitchMultiplier;
		
		// Simple one-pole high-pass filter for pitch shifting
		// Initialize filter state if needed
		if (!this.hpFilterState) {
			this.hpFilterState = { x1: 0, y1: 0 };
		}
		
		// High-pass filter coefficient
		const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
		const dt = 1.0 / this.sampleRate;
		const alpha = rc / (rc + dt);
		
		// Apply high-pass filter
		const filtered = alpha * (this.hpFilterState.y1 + noise - this.hpFilterState.x1);
		this.hpFilterState.x1 = noise;
		this.hpFilterState.y1 = filtered;
		
		let sample = filtered;

		// Tighter fade-out for cleaner sound
		const fadeOutSamples = Math.max(0.04 * this.sampleRate, release * 0.25);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			// Faster decay for tighter sound
			envelope = Math.exp(-decayPhase * 5);
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential decay for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 12);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		// Output gain (gain compensation already applied to sample)
		let output = sample * envelope * this.velocity * 0.4;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}
}



/**
 * Shaker Synth
 * Transient-shaped noise for shaker/rattle character
 */

class ShakerSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
		
		// High-pass filter state
		this.hpFilterState = { x1: 0, y1: 0 };
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Reset filter state for clean retrigger
		if (this.hpFilterState) {
			this.hpFilterState.x1 = 0;
			this.hpFilterState.y1 = 0;
		}
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Transient-shaped noise
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Use high-pass filtering with cutoff that scales with pitch
		// This creates a clear pitch shift by moving the spectral content up/down
		// Higher pitch = higher cutoff = brighter, more rattling sound
		const baseCutoff = 2500; // Base cutoff frequency for C4
		const cutoffFreq = baseCutoff * pitchMultiplier;
		
		// Initialize filter state if needed
		if (!this.hpFilterState) {
			this.hpFilterState = { x1: 0, y1: 0 };
		}
		
		// Simple one-pole high-pass filter for pitch shifting
		const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
		const dt = 1.0 / this.sampleRate;
		const alpha = rc / (rc + dt);
		
		// Apply high-pass filter
		const filtered = alpha * (this.hpFilterState.y1 + noise - this.hpFilterState.x1);
		this.hpFilterState.x1 = noise;
		this.hpFilterState.y1 = filtered;
		
		let sample = filtered;

		// Extended fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 4);
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential decay for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.35;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}
}



/**
 * Rimshot Synth
 * Sharp, snappy rimshot sound with bright metallic character
 * Great for accents and fills in electronic music
 */

class RimshotSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
		
		// High-pass filter state
		this.hpFilterState = { x1: 0, y1: 0 };
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Reset filter state for clean retrigger
		if (this.hpFilterState) {
			this.hpFilterState.x1 = 0;
			this.hpFilterState.y1 = 0;
		}
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.001) * this.sampleRate;
		const decay = (this.settings.decay || 0.08) * this.sampleRate;
		const release = (this.settings.release || 0.05) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Rimshot = sharp transient + bright tonal component + filtered noise
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// 1. Sharp tonal "ping" - high frequency sine that quickly decays
		const pingFreq = 800 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.2));
		const pingPhase = this.phase * 2 * Math.PI * pingFreq / this.sampleRate;
		const ping = Math.sin(pingPhase) * 0.4;
		
		// 2. Body tone - lower frequency for character
		const bodyFreq = 200 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.5));
		const bodyPhase = this.phase * 2 * Math.PI * bodyFreq / this.sampleRate;
		const body = Math.sin(bodyPhase) * 0.2;
		
		// 3. Bright filtered noise for snappy character
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Use high-pass filtering with cutoff that scales with pitch
		// This creates a clear pitch shift by moving the spectral content up/down
		// Higher pitch = higher cutoff = brighter, snappier sound
		const baseCutoff = 1800; // Base cutoff frequency for C4
		const cutoffFreq = baseCutoff * pitchMultiplier;
		
		// Initialize filter state if needed
		if (!this.hpFilterState) {
			this.hpFilterState = { x1: 0, y1: 0 };
		}
		
		// Simple one-pole high-pass filter for pitch shifting
		const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
		const dt = 1.0 / this.sampleRate;
		const alpha = rc / (rc + dt);
		
		// Apply high-pass filter
		const filtered = alpha * (this.hpFilterState.y1 + noise - this.hpFilterState.x1);
		this.hpFilterState.x1 = noise;
		this.hpFilterState.y1 = filtered;
		
		const filteredNoise = filtered;
		
		// Mix components (tonal components scale naturally with pitch)
		let sample = ping + body + filteredNoise;

		// ADSR envelope - very quick attack and decay for snappy character
		let envelope = 0;
		let decayEndValue = 0;
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		if (this.envelopePhase < attack) {
			// Very fast attack for sharp transient
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			// Quick exponential decay
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 4);
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential decay for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-8);
			envelope = fadeStartValue * Math.exp(-fadePhase * 12);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.6;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}
}





// ========== MELODIC SYNTH CLASSES ==========

/**
 * Subtractive Synth
 * Two oscillators with detune, low-pass filter, and ADSR envelope
 */

class SubtractiveSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase1 = 0;
		this.phase2 = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Maintain phase continuity - only reset if not active
		if (!this.isActive) {
			this.phase1 = 0;
			this.phase2 = 0;
		}
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const osc1Type = this.settings.osc1Type || 'saw';
		const osc2Type = this.settings.osc2Type || 'saw';
		const detune = (this.settings.osc2Detune || 0) / 12;

		let osc1 = this.oscillator(this.phase1, freq, osc1Type);
		let osc2 = this.oscillator(this.phase2, freq * Math.pow(2, detune), osc2Type);
		let sample = (osc1 + osc2 * 0.5) * 0.5;

		// Simple lowpass filter
		const cutoff = this.settings.filterCutoff || 5000;
		const resonance = this.settings.filterResonance || 0.5;
		sample = this.lowpass(sample, cutoff, resonance);

		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase1 += (freq / this.sampleRate) * 2 * Math.PI;
		this.phase2 += (freq * Math.pow(2, detune) / this.sampleRate) * 2 * Math.PI;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.4;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}

	oscillator(phase, freq, type) {
		const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
		switch (type) {
			case 'sine':
				return Math.sin(phase);
			case 'saw':
				return 2 * normalizedPhase - 1;
			case 'square':
				return normalizedPhase < 0.5 ? 1 : -1;
			case 'triangle':
				return normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
			default:
				return Math.sin(phase);
		}
	}

	lowpass(input, cutoff, resonance) {
		const c = 1.0 / Math.tan(Math.PI * cutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = output;

		return output;
	}
}



/**
 * FM Synth
 * Frequency modulation synthesis with configurable operators
 */

class FMSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || { operators: [{ frequency: 1, amplitude: 1, waveform: 'sine' }] };
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		if (!this.isActive) {
			this.phase = 0;
		}
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const op = (this.settings.operators && this.settings.operators.length > 0) ? this.settings.operators[0] : { frequency: 1, amplitude: 1, waveform: 'sine' };
		
		// Use waveform type for operator
		const opFreq = freq * op.frequency;
		const opPhase = this.phase * 2 * Math.PI * opFreq / this.sampleRate;
		let sample = this.oscillator(opPhase, opFreq, op.waveform) * op.amplitude;

		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase += (freq / this.sampleRate) * 2 * Math.PI;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.3;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}

	oscillator(phase, freq, type) {
		const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
		switch (type) {
			case 'sine':
				return Math.sin(phase);
			case 'saw':
				return 2 * normalizedPhase - 1;
			case 'square':
				return normalizedPhase < 0.5 ? 1 : -1;
			case 'triangle':
				return normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
			default:
				return Math.sin(phase);
		}
	}
}



/**
 * Wavetable Synth
 * Wavetable synthesis with linear interpolation between table entries
 */

class WavetableSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		// Simple wavetable (sine wave)
		this.wavetable = new Float32Array(2048);
		for (let i = 0; i < this.wavetable.length; i++) {
			this.wavetable[i] = Math.sin((i / this.wavetable.length) * 2 * Math.PI);
		}
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		if (!this.isActive) {
			this.phase = 0;
		}
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const tableIndex = (this.phase % (2 * Math.PI)) / (2 * Math.PI) * this.wavetable.length;
		const index1 = Math.floor(tableIndex);
		const index2 = (index1 + 1) % this.wavetable.length;
		const frac = tableIndex - index1;
		const sample = this.wavetable[index1] * (1 - frac) + this.wavetable[index2] * frac;

		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase += (freq / this.sampleRate) * 2 * Math.PI;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.4;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}
}



/**
 * Supersaw Synth
 * Multiple detuned sawtooth oscillators for rich, wide sound
 * Classic trance/EDM lead sound
 */

class SupersawSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = []; // Array of phases for each oscillator
		this.envelopePhase = 0;
		this.isActive = false;
		this.lfoPhase = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Initialize oscillator phases
		const numOscillators = this.settings.numOscillators || 7;
		for (let i = 0; i < numOscillators; i++) {
			this.phase.push(0);
		}
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
		// Resize phase array if number of oscillators changed
		const numOscillators = this.settings.numOscillators || 7;
		while (this.phase.length < numOscillators) {
			this.phase.push(0);
		}
		while (this.phase.length > numOscillators) {
			this.phase.pop();
		}
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Only reset phases if not currently active to prevent clicks
		if (!this.isActive) {
			for (let i = 0; i < this.phase.length; i++) {
				this.phase[i] = 0;
			}
		}
		this.envelopePhase = 0;
		this.lfoPhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const numOscillators = this.settings.numOscillators || 7;
		const detune = this.settings.detune || 0.1; // Detune amount in semitones
		const spread = this.settings.spread || 0.5; // Spread amount (0-1)
		
		// Generate multiple detuned sawtooth oscillators
		let sample = 0;
		const centerIndex = Math.floor(numOscillators / 2);
		
		for (let i = 0; i < numOscillators; i++) {
			// Calculate detune offset: center oscillator is in tune, others detune symmetrically
			const offset = (i - centerIndex) * detune * spread;
			const oscFreq = freq * Math.pow(2, offset / 12);
			
			// Generate sawtooth wave
			const normalizedPhase = (this.phase[i] % (2 * Math.PI)) / (2 * Math.PI);
			const saw = 2 * normalizedPhase - 1;
			
			// Mix oscillators (center gets full volume, outer ones slightly quieter for balance)
			const distanceFromCenter = Math.abs(i - centerIndex);
			const gain = 1.0 - (distanceFromCenter * 0.1); // Slight volume reduction for outer oscillators
			sample += saw * gain;
			
			// Update phase
			this.phase[i] += (oscFreq / this.sampleRate) * 2 * Math.PI;
		}
		
		// Normalize by number of oscillators
		sample = sample / numOscillators;
		
		// Apply low-pass filter
		let cutoff = this.settings.filterCutoff || 8000;
		const resonance = this.settings.filterResonance || 0.5;
		
		// LFO modulation of filter cutoff
		const lfoRate = this.settings.lfoRate || 0; // Hz
		if (lfoRate > 0) {
			const lfoAmount = this.settings.lfoAmount || 0; // Amount in Hz
			const lfo = Math.sin(this.lfoPhase) * lfoAmount;
			cutoff = Math.max(20, Math.min(20000, cutoff + lfo));
			this.lfoPhase += (lfoRate / this.sampleRate) * 2 * Math.PI;
			if (this.lfoPhase >= 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;
		}
		
		sample = this.lowpass(sample, cutoff, resonance);
		
		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.3;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}

	lowpass(input, cutoff, resonance) {
		const c = 1.0 / Math.tan(Math.PI * cutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = output;

		return output;
	}
}



/**
 * Pluck Synth
 * Karplus-Strong plucked string synthesis
 * Creates natural-sounding plucked string tones (guitar, harp, etc.)
 */

class PluckSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.envelopePhase = 0;
		this.isActive = false;
		this.delayLine = null;
		this.delayIndex = 0;
		this.delayLength = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Calculate delay line length based on pitch
		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		// Ensure minimum delay length to prevent aliasing and instability
		const minDelayLength = Math.floor(this.sampleRate / 20000); // Max 20kHz
		this.delayLength = Math.max(minDelayLength, Math.floor(this.sampleRate / freq));
		
		// Initialize delay line with softer excitation
		this.delayLine = new Float32Array(this.delayLength);
		for (let i = 0; i < this.delayLength; i++) {
			// Use smoother noise with envelope for more musical pluck
			const noise = (Math.random() * 2 - 1) * 0.5; // Reduced noise amplitude
			// Apply smoother envelope to excitation
			const excitationPhase = i / this.delayLength;
			// Softer envelope curve
			const excitationEnv = Math.exp(-excitationPhase * 4) * (1 - excitationPhase * 0.5);
			this.delayLine[i] = noise * excitationEnv * 0.3; // Reduced initial amplitude
		}
		
		this.delayIndex = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive || !this.delayLine) return 0;
		
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const sustain = this.settings.sustain || 0.0; // Plucks don't sustain
		const release = (this.settings.release || 0.4) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Karplus-Strong: read from delay line, filter, and feed back
		const readIndex = this.delayIndex;
		let sample = this.delayLine[readIndex];
		
		// Low-pass filter in feedback loop (simulates string damping)
		// Higher damping value = less damping = brighter sound
		// Lower damping value = more damping = darker sound
		const damping = this.settings.damping || 0.96; // 0.9-0.99 range
		
		// Calculate filter cutoff: higher damping = higher cutoff (brighter)
		// Map damping (0.9-0.99) to cutoff (2000-12000 Hz) for musical range
		const filterCutoff = 2000 + (damping - 0.9) * (10000 / 0.09);
		// Clamp to safe range
		const safeCutoff = Math.max(500, Math.min(12000, filterCutoff));
		
		// Apply low-pass filter with lower resonance for stability
		sample = this.lowpass(sample, safeCutoff, 0.2);
		
		// Write filtered sample back to delay line (with damping gain)
		// Clamp to prevent runaway feedback
		this.delayLine[this.delayIndex] = Math.max(-1, Math.min(1, sample * damping));
		
		// Advance delay line index
		this.delayIndex = (this.delayIndex + 1) % this.delayLength;

		// ADSR envelope for overall amplitude
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Very quick attack for pluck character
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			// Exponential decay (plucks don't sustain)
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 2);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: continue exponential decay
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = Math.exp(-(2 + releasePhase * 4));
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		// Reduced output gain for safer levels, clamp to prevent clipping
		let output = sample * envelope * this.velocity * 0.25;
		output = Math.max(-0.95, Math.min(0.95, output)); // Soft clipping
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				this.delayLine = null;
				return 0;
			}
		}
		
		return output;
	}

	lowpass(input, cutoff, resonance) {
		// Clamp cutoff to Nyquist to prevent instability
		const nyquist = this.sampleRate * 0.45;
		const safeCutoff = Math.max(20, Math.min(nyquist, cutoff));
		
		// Prevent division by zero and ensure stability
		if (safeCutoff >= nyquist) {
			return input; // Pass through if cutoff too high
		}
		
		const c = 1.0 / Math.tan(Math.PI * safeCutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		// Clamp filter state to prevent instability
		const clampedOutput = Math.max(-1, Math.min(1, output));

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = clampedOutput;

		return clampedOutput;
	}
}



/**
 * Bass Synth
 * Optimized for bass frequencies with sub-oscillator and bass-focused filtering
 * Perfect for basslines and low-end melodic content
 */

class BassSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase1 = 0; // Main oscillator
		this.phase2 = 0; // Sub oscillator (one octave down)
		this.envelopePhase = 0;
		this.isActive = false;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
		
		// Cached filter coefficients (performance optimization)
		this.filterCoeffs = null;
		this.cachedCutoff = null;
		this.cachedResonance = null;
		
		// Cached frequency and phase increments (performance optimization)
		this.cachedFreq = null;
		this.cachedSubFreq = null;
		this.phase1Increment = 0;
		this.phase2Increment = 0;
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Maintain phase continuity - only reset if not active
		if (!this.isActive) {
			this.phase1 = 0;
			this.phase2 = 0;
		}
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Pre-calculate frequency and phase increments (performance optimization)
		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		this.cachedFreq = freq;
		this.cachedSubFreq = freq * 0.5;
		this.phase1Increment = (freq / this.sampleRate) * 2 * Math.PI;
		this.phase2Increment = (this.cachedSubFreq / this.sampleRate) * 2 * Math.PI;
		
		// Invalidate filter cache to force recalculation
		this.filterCoeffs = null;
		this.cachedCutoff = null;
		this.cachedResonance = null;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		
		// Pre-calculate ADSR parameters once (they don't change during note playback)
		const attack = (this.settings.attack || 0.05) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.8;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Use cached frequency (calculated in trigger) - performance optimization
		const freq = this.cachedFreq || (440 * Math.pow(2, (this.pitch - 69) / 12));
		const osc1Type = this.settings.osc1Type || 'saw';
		const subLevel = this.settings.subLevel || 0.6; // Sub oscillator level (0-1)
		const saturation = this.settings.saturation || 0.3; // Saturation amount (0-1)

		// Main oscillator - use cached phase increment
		let osc1 = this.oscillator(this.phase1, osc1Type);
		
		// Sub oscillator (one octave down for extra low end) - use cached sub frequency
		const subFreq = this.cachedSubFreq || (freq * 0.5);
		let osc2 = this.oscillator(this.phase2, 'sine'); // Sub is always sine for clean low end
		
		// ADSR envelope - optimized for bass (good sustain, smooth release)
		// Calculate envelope FIRST to enable early exit optimization
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));
		
		// Early exit optimization: if envelope is effectively zero, skip expensive processing
		// This prevents unnecessary filter/oscillator work during long release tails
		// Especially important for bass frequencies where release can be very long
		if (envelope < 0.0001 && this.envelopePhase > attack + decay) {
			// In release phase and envelope is effectively zero - skip processing
			// Still update phases and envelope phase to maintain state
			this.phase1 += this.phase1Increment || ((freq / this.sampleRate) * 2 * Math.PI);
			this.phase2 += this.phase2Increment || ((this.cachedSubFreq || freq * 0.5) / this.sampleRate) * 2 * Math.PI;
			if (this.phase1 > 2 * Math.PI * 1000) this.phase1 = this.phase1 % (2 * Math.PI);
			if (this.phase2 > 2 * Math.PI * 1000) this.phase2 = this.phase2 % (2 * Math.PI);
			this.envelopePhase++;
			
			// Check if we should stop completely
			if (this.envelopePhase >= extendedDuration) {
				this.isActive = false;
				this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
				return 0;
			}
			return 0;
		}

		// Mix oscillators: main + sub
		let sample = osc1 + osc2 * subLevel;
		sample = sample * 0.5; // Normalize

		// Subtle saturation for character (soft clipping)
		if (saturation > 0) {
			const drive = 1 + saturation * 2;
			sample = sample * drive;
			// Soft clipping using tanh approximation
			sample = sample / (1 + Math.abs(sample));
		}

		// Low-pass filter optimized for bass (lower default cutoff)
		const cutoff = this.settings.filterCutoff || 2000;
		const resonance = this.settings.filterResonance || 0.3; // Lower resonance for smoother bass
		sample = this.lowpass(sample, cutoff, resonance);

		// Use cached phase increments (performance optimization)
		this.phase1 += this.phase1Increment || ((freq / this.sampleRate) * 2 * Math.PI);
		this.phase2 += this.phase2Increment || ((subFreq / this.sampleRate) * 2 * Math.PI);
		
		// Normalize phases periodically to prevent overflow (performance optimization)
		if (this.phase1 > 2 * Math.PI * 1000) {
			this.phase1 = this.phase1 % (2 * Math.PI);
		}
		if (this.phase2 > 2 * Math.PI * 1000) {
			this.phase2 = this.phase2 % (2 * Math.PI);
		}
		
		this.envelopePhase++;
		
		// Output gain optimized for bass (slightly lower to prevent clipping)
		let output = sample * envelope * this.velocity * 0.35;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Early exit optimization: if envelope is effectively zero, stop processing
		// This prevents unnecessary filter processing during long release tails
		// Especially important for bass frequencies where release can be long
		if (envelope < 0.0001 && this.envelopePhase > attack + decay) {
			// In release phase and envelope is effectively zero - stop processing
			this.isActive = false;
			// Reset filter state to prevent denormal accumulation
			this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
			return 0;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				// Reset filter state to prevent denormal accumulation
				this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
				return 0;
			}
		}
		
		return output;
	}

	oscillator(phase, type) {
		// Optimized phase normalization - only normalize when necessary
		// For low frequencies, phase grows slowly, so we can skip normalization more often
		let normalizedPhase;
		if (phase > 2 * Math.PI) {
			normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
		} else {
			normalizedPhase = phase / (2 * Math.PI);
		}
		
		switch (type) {
			case 'sine':
				return Math.sin(phase);
			case 'saw':
				return 2 * normalizedPhase - 1;
			case 'square':
				return normalizedPhase < 0.5 ? 1 : -1;
			case 'triangle':
				return normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
			default:
				return Math.sin(phase);
		}
	}

	lowpass(input, cutoff, resonance) {
		// CRITICAL PERFORMANCE FIX: Only recalculate filter coefficients when parameters change
		// This was being recalculated every sample (44,100 times per second!), causing massive CPU usage
		if (!this.filterCoeffs || this.cachedCutoff !== cutoff || this.cachedResonance !== resonance) {
			// Clamp cutoff to prevent instability
			const nyquist = this.sampleRate * 0.45;
			const safeCutoff = Math.max(20, Math.min(nyquist, cutoff));
			
			const c = 1.0 / Math.tan(Math.PI * safeCutoff / this.sampleRate);
			const a1 = 1.0 / (1.0 + resonance * c + c * c);
			
			// Cache the coefficients
			this.filterCoeffs = {
				a1: a1,
				a2: 2 * a1,
				a3: a1,
				b1: 2.0 * (1.0 - c * c) * a1,
				b2: (1.0 - resonance * c + c * c) * a1
			};
			this.cachedCutoff = cutoff;
			this.cachedResonance = resonance;
		}

		const coeffs = this.filterCoeffs;
		let output = coeffs.a1 * input + coeffs.a2 * this.filterState.x1 + coeffs.a3 * this.filterState.x2
			- coeffs.b1 * this.filterState.y1 - coeffs.b2 * this.filterState.y2;

		// CRITICAL PERFORMANCE FIX: Flush denormals to prevent CPU slowdown with low frequencies
		// Denormals (subnormal floats) can cause 10-100x CPU slowdown, especially in filter tails
		// This is especially critical for bass frequencies where filter states decay slowly
		output = this._flushDenormals(output);
		this.filterState.x2 = this._flushDenormals(this.filterState.x1);
		this.filterState.x1 = this._flushDenormals(input);
		this.filterState.y2 = this._flushDenormals(this.filterState.y1);
		this.filterState.y1 = output;

		return output;
	}

	/**
	 * Flush extremely small float values to zero to avoid denormals/subnormals
	 * Denormals can severely impact CPU performance in deep tails/low frequencies.
	 * This is critical for bass synths where filter states decay slowly.
	 */
	_flushDenormals(x) {
		return (x > -1e-20 && x < 1e-20) ? 0 : x;
	}
}



/**
 * Pad Synth
 * Atmospheric pad synthesis with multiple detuned oscillators, LFO modulation, and filter sweeps
 * Perfect for ambient textures, evolving pads, and atmospheric soundscapes
 */

class PadSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = []; // Array of phases for each oscillator
		this.envelopePhase = 0;
		this.isActive = false;
		this.lfoPhase = 0;
		this.filterLfoPhase = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Initialize oscillator phases
		const numOscillators = this.settings.numOscillators || 8;
		for (let i = 0; i < numOscillators; i++) {
			this.phase.push(Math.random() * 2 * Math.PI); // Random phase for each oscillator
		}
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
		// Resize phase array if number of oscillators changed
		const numOscillators = this.settings.numOscillators || 8;
		while (this.phase.length < numOscillators) {
			this.phase.push(Math.random() * 2 * Math.PI);
		}
		while (this.phase.length > numOscillators) {
			this.phase.pop();
		}
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Only reset phases if not currently active to prevent clicks
		if (!this.isActive) {
			for (let i = 0; i < this.phase.length; i++) {
				this.phase[i] = Math.random() * 2 * Math.PI; // Random phase for each oscillator
			}
		}
		this.envelopePhase = 0;
		this.lfoPhase = 0;
		this.filterLfoPhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		
		const attack = (this.settings.attack || 0.5) * this.sampleRate; // Slow attack for pads
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const sustain = this.settings.sustain || 0.9; // High sustain for pads
		const release = (this.settings.release || 1.5) * this.sampleRate; // Long release for pads
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const numOscillators = this.settings.numOscillators || 8;
		const detune = this.settings.detune || 0.15; // Detune amount in semitones
		const spread = this.settings.spread || 0.7; // Spread amount (0-1)
		const oscType = this.settings.oscType || 'saw'; // Waveform type
		
		// Generate multiple detuned oscillators
		let sample = 0;
		const centerIndex = Math.floor(numOscillators / 2);
		
		for (let i = 0; i < numOscillators; i++) {
			// Calculate detune offset: center oscillator is in tune, others detune symmetrically
			const offset = (i - centerIndex) * detune * spread;
			const oscFreq = freq * Math.pow(2, offset / 12);
			
			// Add LFO pitch modulation for movement
			const pitchLfoRate = this.settings.pitchLfoRate || 0.5; // Hz
			const pitchLfoAmount = this.settings.pitchLfoAmount || 0.02; // Semitones
			const pitchLfo = Math.sin(this.lfoPhase) * pitchLfoAmount;
			const modulatedFreq = oscFreq * Math.pow(2, pitchLfo / 12);
			
			// Generate waveform
			const normalizedPhase = (this.phase[i] % (2 * Math.PI)) / (2 * Math.PI);
			let osc = 0;
			switch (oscType) {
				case 'saw':
					osc = 2 * normalizedPhase - 1;
					break;
				case 'square':
					osc = normalizedPhase < 0.5 ? 1 : -1;
					break;
				case 'sine':
					osc = Math.sin(this.phase[i]);
					break;
				case 'triangle':
					osc = normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
					break;
				default:
					osc = 2 * normalizedPhase - 1;
			}
			
			// Mix oscillators (center gets full volume, outer ones slightly quieter for balance)
			const distanceFromCenter = Math.abs(i - centerIndex);
			const gain = 1.0 - (distanceFromCenter * 0.08); // Slight volume reduction for outer oscillators
			sample += osc * gain;
			
			// Update phase
			this.phase[i] += (modulatedFreq / this.sampleRate) * 2 * Math.PI;
			if (this.phase[i] >= 2 * Math.PI) this.phase[i] -= 2 * Math.PI;
		}
		
		// Normalize by number of oscillators
		sample = sample / numOscillators;
		
		// Apply low-pass filter with LFO modulation
		let cutoff = this.settings.filterCutoff || 4000;
		const resonance = this.settings.filterResonance || 0.3;
		
		// Filter LFO modulation for evolving texture
		const filterLfoRate = this.settings.filterLfoRate || 0.3; // Hz
		const filterLfoAmount = this.settings.filterLfoAmount || 1000; // Hz
		if (filterLfoRate > 0 && filterLfoAmount > 0) {
			const filterLfo = Math.sin(this.filterLfoPhase) * filterLfoAmount;
			cutoff = Math.max(20, Math.min(20000, cutoff + filterLfo));
			this.filterLfoPhase += (filterLfoRate / this.sampleRate) * 2 * Math.PI;
			if (this.filterLfoPhase >= 2 * Math.PI) this.filterLfoPhase -= 2 * Math.PI;
		}
		
		// Update pitch LFO
		if (this.settings.pitchLfoRate > 0) {
			this.lfoPhase += (this.settings.pitchLfoRate / this.sampleRate) * 2 * Math.PI;
			if (this.lfoPhase >= 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;
		}
		
		sample = this.lowpass(sample, cutoff, resonance);
		
		// ADSR envelope - optimized for pads (slow attack, long release)
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Slow, smooth attack
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 4); // Slower decay for pads
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-4);
			envelope = fadeStartValue * Math.exp(-fadePhase * 8);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.25; // Lower gain for pads
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}

	lowpass(input, cutoff, resonance) {
		// Clamp cutoff to prevent instability
		const nyquist = this.sampleRate * 0.45;
		const safeCutoff = Math.max(20, Math.min(nyquist, cutoff));
		
		const c = 1.0 / Math.tan(Math.PI * safeCutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = output;

		return output;
	}
}



/**
 * Organ Synth
 * Drawbar-style organ synthesis with multiple harmonic oscillators
 * Features rotary speaker simulation (chorus/vibrato) for classic organ sound
 */

class OrganSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = []; // Array of phases for each harmonic
		this.envelopePhase = 0;
		this.isActive = false;
		this.rotaryPhase = 0; // Rotary speaker LFO phase
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Initialize harmonic phases (9 drawbars: 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1')
		// Harmonic ratios: 0.5, 0.75, 1, 2, 3, 4, 5, 6, 8
		const numHarmonics = 9;
		for (let i = 0; i < numHarmonics; i++) {
			this.phase.push(Math.random() * 2 * Math.PI); // Random phase for each harmonic
		}
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Only reset phases if not currently active to prevent clicks
		if (!this.isActive) {
			for (let i = 0; i < this.phase.length; i++) {
				this.phase[i] = Math.random() * 2 * Math.PI; // Random phase for each harmonic
			}
		}
		this.envelopePhase = 0;
		this.rotaryPhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		
		const attack = (this.settings.attack || 0.01) * this.sampleRate; // Fast attack for organ
		const decay = (this.settings.decay || 0.1) * this.sampleRate;
		const sustain = this.settings.sustain || 1.0; // Full sustain for organ
		const release = (this.settings.release || 0.2) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		
		// Drawbar levels (0-1) - default to classic organ sound
		const drawbars = this.settings.drawbars || [0.8, 0.0, 1.0, 0.0, 0.6, 0.0, 0.4, 0.0, 0.2];
		
		// Harmonic ratios for each drawbar (16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1')
		const harmonicRatios = [0.5, 0.75, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0];
		
		// Generate harmonics
		let sample = 0;
		for (let i = 0; i < drawbars.length && i < harmonicRatios.length; i++) {
			if (drawbars[i] > 0) {
				const harmonicFreq = freq * harmonicRatios[i];
				const harmonic = Math.sin(this.phase[i]) * drawbars[i];
				sample += harmonic;
				
				// Update phase
				this.phase[i] += (harmonicFreq / this.sampleRate) * 2 * Math.PI;
				if (this.phase[i] >= 2 * Math.PI) this.phase[i] -= 2 * Math.PI;
			}
		}
		
		// Normalize by sum of active drawbars
		const activeDrawbars = drawbars.filter(d => d > 0).length || 1;
		sample = sample / Math.max(1, activeDrawbars * 0.5); // Scale down for safety
		
		// Rotary speaker simulation (chorus/vibrato effect)
		const rotarySpeed = this.settings.rotarySpeed || 4.0; // Hz (typical rotary speed)
		const rotaryDepth = this.settings.rotaryDepth || 0.3; // Depth (0-1)
		
		// Rotary speaker creates pitch modulation (vibrato) and amplitude modulation (tremolo)
		const rotaryLfo = Math.sin(this.rotaryPhase);
		const vibratoAmount = rotaryLfo * rotaryDepth * 0.05; // Small pitch modulation (5 cents max)
		
		// Apply vibrato by slightly modulating the sample (simplified)
		// In a real rotary speaker, this would affect each harmonic differently
		sample = sample * (1 + vibratoAmount * 0.1);
		
		// Tremolo (amplitude modulation)
		const tremoloAmount = (Math.sin(this.rotaryPhase * 2) * 0.5 + 0.5) * rotaryDepth * 0.2 + (1 - rotaryDepth * 0.2);
		sample = sample * tremoloAmount;
		
		// Update rotary phase
		this.rotaryPhase += (rotarySpeed / this.sampleRate) * 2 * Math.PI;
		if (this.rotaryPhase >= 2 * Math.PI) this.rotaryPhase -= 2 * Math.PI;
		
		// Apply low-pass filter (organ tone control)
		const cutoff = this.settings.filterCutoff || 8000;
		const resonance = this.settings.filterResonance || 0.2;
		sample = this.lowpass(sample, cutoff, resonance);
		
		// ADSR envelope - optimized for organ (fast attack, full sustain)
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Fast attack for organ
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.3;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Only stop when envelope is done and we're very close to zero
		if (this.envelopePhase >= extendedDuration) {
			if (Math.abs(output) < 0.0001) {
				this.isActive = false;
				return 0;
			}
		}
		
		return output;
	}

	lowpass(input, cutoff, resonance) {
		// Clamp cutoff to prevent instability
		const nyquist = this.sampleRate * 0.45;
		const safeCutoff = Math.max(20, Math.min(nyquist, cutoff));
		
		const c = 1.0 / Math.tan(Math.PI * safeCutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = output;

		return output;
	}
}




registerProcessor('engine-worklet-processor', EngineWorkletProcessor);
