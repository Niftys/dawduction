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
		this.triggerTime = 0; // Time when current note was triggered (for choke calculation)
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
				attack: /** @type {number|undefined} */ (this.settings.attack) || 0.01,
				decay: /** @type {number|undefined} */ (this.settings.decay) || 0.5,
				sustain: /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0,
				release: /** @type {number|undefined} */ (this.settings.release) || 0.2
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
		
		// Always reset phase for drums - each hit needs a fresh start
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.triggerTime = 0; // Reset trigger time on new note
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Store root ADSR values at trigger time (for relative updates)
		/** @type {{attack: number, decay: number, sustain: number, release: number}} */
		const rootADSR = {
			attack: /** @type {number|undefined} */ (this.settings.attack) || 0.01,
			decay: /** @type {number|undefined} */ (this.settings.decay) || 0.5,
			sustain: /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0,
			release: /** @type {number|undefined} */ (this.settings.release) || 0.2
		};
		this.rootADSRAtTrigger = rootADSR;
		
		// Store per-note ADSR parameters if provided
		// Handle both object (ADSR params) and number (duration, for backward compatibility)
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
			// No per-note ADSR, use root values (duration parameter is ignored for drum synths)
			this.perNoteADSR = null;
		}
		
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
		
		// Use per-note ADSR if available, otherwise use root settings
		let attack, decay, sustain, release;
		if (this.perNoteADSR) {
			/** @type {{attack: number, decay: number, sustain: number, release: number}} */
			const perNote = this.perNoteADSR;
			attack = perNote.attack * this.sampleRate;
			decay = perNote.decay * this.sampleRate;
			sustain = perNote.sustain;
			release = perNote.release * this.sampleRate;
		} else {
			attack = (/** @type {number|undefined} */ (this.settings.attack) || 0.01) * this.sampleRate;
			decay = (/** @type {number|undefined} */ (this.settings.decay) || 0.5) * this.sampleRate;
			sustain = /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0;
			release = (/** @type {number|undefined} */ (this.settings.release) || 0.2) * this.sampleRate;
		}
		
		// Calculate total note length from ADSR envelope
		const totalNoteLength = attack + decay + release;
		
		const totalDuration = totalNoteLength;

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
		
		// Calculate envelope normally based on actual envelope phase (not affected by choke)
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

