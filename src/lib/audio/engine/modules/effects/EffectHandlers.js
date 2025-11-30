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

