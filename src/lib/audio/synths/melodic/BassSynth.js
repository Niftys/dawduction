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
		this.triggerTime = 0; // Time when current note was triggered (for choke calculation)
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
		
		// Per-note ADSR parameters (stored as absolute values)
		/** @type {{attack: number, decay: number, sustain: number, release: number}|null} */
		this.perNoteADSR = null;
		// Root ADSR values at trigger time (for relative updates)
		/** @type {{attack: number, decay: number, sustain: number, release: number}|null} */
		this.rootADSRAtTrigger = null;
	}

	/**
	 * @param {Object} settings - Settings object
	 * @param {number} [settings.attack] - Attack time in seconds
	 * @param {number} [settings.decay] - Decay time in seconds
	 * @param {number} [settings.sustain] - Sustain level (0-1)
	 * @param {number} [settings.release] - Release time in seconds
	 */
	updateSettings(settings) {
		const oldSettings = { ...this.settings };
		this.settings = { ...this.settings, ...settings };
		
		// If per-note ADSR exists and root ADSR changed, update per-note values relative to root
		if (this.perNoteADSR && this.rootADSRAtTrigger && this.isActive) {
			/** @type {{attack: number, decay: number, sustain: number, release: number}} */
			const newRootADSR = {
				attack: /** @type {number|undefined} */ (this.settings.attack) || 0.05,
				decay: /** @type {number|undefined} */ (this.settings.decay) || 0.2,
				sustain: /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.8,
				release: /** @type {number|undefined} */ (this.settings.release) || 0.3
			};
			
			/** @type {{attack: number, decay: number, sustain: number, release: number}} */
			const oldRootADSR = this.rootADSRAtTrigger;
			
			// Calculate ratios and apply to per-note values
			if (oldRootADSR.attack > 0) {
				const ratio = newRootADSR.attack / oldRootADSR.attack;
				this.perNoteADSR.attack = this.perNoteADSR.attack * ratio;
			}
			if (oldRootADSR.decay > 0) {
				const ratio = newRootADSR.decay / oldRootADSR.decay;
				this.perNoteADSR.decay = this.perNoteADSR.decay * ratio;
			}
			if (oldRootADSR.sustain !== undefined && oldRootADSR.sustain !== newRootADSR.sustain) {
				// For sustain, maintain the offset from root
				const oldOffset = this.perNoteADSR.sustain - oldRootADSR.sustain;
				this.perNoteADSR.sustain = newRootADSR.sustain + oldOffset;
				// Clamp sustain to valid range [0, 1]
				this.perNoteADSR.sustain = Math.max(0, Math.min(1, this.perNoteADSR.sustain));
			}
			if (oldRootADSR.release > 0) {
				const ratio = newRootADSR.release / oldRootADSR.release;
				this.perNoteADSR.release = this.perNoteADSR.release * ratio;
			}
			
			// Update root ADSR reference for future relative updates
			this.rootADSRAtTrigger = newRootADSR;
		}
	}

	/**
	 * @param {number} velocity
	 * @param {number} pitch
	 * @param {Object|number|null} adsrParamsOrDuration - Optional per-note ADSR parameters (object) or duration (number, for backward compatibility)
	 * @param {Object} [adsrParamsOrDuration] - Optional per-note ADSR parameters
	 * @param {number} [adsrParamsOrDuration.attack] - Attack time in seconds
	 * @param {number} [adsrParamsOrDuration.decay] - Decay time in seconds
	 * @param {number} [adsrParamsOrDuration.sustain] - Sustain level (0-1)
	 * @param {number} [adsrParamsOrDuration.release] - Release time in seconds
	 */
	trigger(velocity, pitch, adsrParamsOrDuration = null) {
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
		
		// Handle duration parameter (for backward compatibility) or ADSR params
		if (typeof adsrParamsOrDuration === 'number') {
			this.noteDuration = adsrParamsOrDuration;
		} else {
			this.noteDuration = null;
		}
		
		this.triggerTime = 0; // Store when this note was triggered (for choke calculation)
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
		
		// Store root ADSR values at trigger time (for relative updates)
		/** @type {{attack: number, decay: number, sustain: number, release: number}} */
		const rootADSR = {
			attack: /** @type {number|undefined} */ (this.settings.attack) || 0.05,
			decay: /** @type {number|undefined} */ (this.settings.decay) || 0.2,
			sustain: /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.8,
			release: /** @type {number|undefined} */ (this.settings.release) || 0.3
		};
		this.rootADSRAtTrigger = rootADSR;
		
		// Store per-note ADSR parameters if provided
		if (adsrParamsOrDuration && typeof adsrParamsOrDuration === 'object' && adsrParamsOrDuration !== null) {
			/** @type {{attack: number, decay: number, sustain: number, release: number}} */
			const root = this.rootADSRAtTrigger;
			/** @type {any} */
			const params = adsrParamsOrDuration;
			this.perNoteADSR = {
				attack: params.attack !== undefined ? params.attack : root.attack,
				decay: params.decay !== undefined ? params.decay : root.decay,
				sustain: params.sustain !== undefined ? params.sustain : root.sustain,
				release: params.release !== undefined ? params.release : root.release
			};
		} else {
			// No per-note ADSR, use root values
			this.perNoteADSR = null;
		}
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		
		// Pre-calculate ADSR parameters once (they don't change during note playback)
		// Get BPM from settings or use default 120
		const bpm = this.settings.bpm || 120;
		const beatsPerSecond = bpm / 60;
		
		// Scale envelope parameters with BPM (slower BPM = longer envelope times)
		const bpmScale = 120 / bpm;
		
		// Use per-note ADSR if available, otherwise use root settings
		let attack, decay, sustain, release;
		if (this.perNoteADSR) {
			/** @type {{attack: number, decay: number, sustain: number, release: number}} */
			const perNote = this.perNoteADSR;
			attack = perNote.attack * this.sampleRate * bpmScale;
			decay = perNote.decay * this.sampleRate * bpmScale;
			sustain = perNote.sustain;
			release = perNote.release * this.sampleRate * bpmScale;
		} else {
			attack = (/** @type {number|undefined} */ (this.settings.attack) || 0.05) * this.sampleRate * bpmScale;
			decay = (/** @type {number|undefined} */ (this.settings.decay) || 0.2) * this.sampleRate * bpmScale;
			sustain = /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.8;
			release = (/** @type {number|undefined} */ (this.settings.release) || 0.3) * this.sampleRate * bpmScale;
		}
		
		// Calculate hold phase duration: note duration minus attack and decay
		let holdSamples = 0;
		if (this.noteDuration !== null && this.noteDuration !== undefined) {
			const noteDurationSamples = (this.noteDuration / beatsPerSecond) * this.sampleRate;
			holdSamples = Math.max(0, noteDurationSamples - attack - decay);
		}
		
		// Calculate total note length from ADSR envelope
		const totalNoteLength = attack + decay + holdSamples + release;
		
		
		const totalDuration = totalNoteLength;

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
		
		// ADSR envelope with hold phase - optimized for bass (good sustain, smooth release)
		// Calculate envelope FIRST to enable early exit optimization
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// Calculate envelope normally based on actual envelope phase (not affected by choke)
		let envelope = 0;
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + holdSamples) {
			// Hold phase: maintain sustain level for the note duration
			envelope = sustain;
		} else if (this.envelopePhase < attack + decay + holdSamples + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay - holdSamples) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + holdSamples + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		// Apply choke fade-out if choke time has elapsed
		// Choke cuts off the note at a specific time point, regardless of envelope phase
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

