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
				attack: /** @type {number|undefined} */ (this.settings.attack) || 0.005,
				decay: /** @type {number|undefined} */ (this.settings.decay) || 0.4,
				sustain: /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0,
				release: /** @type {number|undefined} */ (this.settings.release) || 0.15
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
		// Reset to 0 to start from beginning of waveform
		this.phase = 0;
		this.phase2 = 0;
		this.phase3 = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Store root ADSR values at trigger time (for relative updates)
		/** @type {{attack: number, decay: number, sustain: number, release: number}} */
		const rootADSR = {
			attack: /** @type {number|undefined} */ (this.settings.attack) || 0.005,
			decay: /** @type {number|undefined} */ (this.settings.decay) || 0.4,
			sustain: /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0,
			release: /** @type {number|undefined} */ (this.settings.release) || 0.15
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
			attack = (/** @type {number|undefined} */ (this.settings.attack) || 0.005) * this.sampleRate;
			decay = (/** @type {number|undefined} */ (this.settings.decay) || 0.4) * this.sampleRate;
			sustain = /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0;
			release = (/** @type {number|undefined} */ (this.settings.release) || 0.15) * this.sampleRate;
		}
		
		// Calculate total note length from ADSR envelope (still used for envelope phases)
		const totalNoteLength = attack + decay + release;
		
		const totalDuration = totalNoteLength;

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
		// Calculate envelope normally based on actual envelope phase (not affected by choke)
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
		this.triggerTime++;
		
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

