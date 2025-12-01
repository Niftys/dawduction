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
		this.triggerTime = 0; // Time when current note was triggered (for choke calculation)
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
				attack: /** @type {number|undefined} */ (this.settings.attack) || 0.001,
				decay: /** @type {number|undefined} */ (this.settings.decay) || 0.1,
				sustain: /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0,
				release: /** @type {number|undefined} */ (this.settings.release) || 0.05
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
		
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		
		// Store root ADSR values at trigger time (for relative updates)
		/** @type {{attack: number, decay: number, sustain: number, release: number}} */
		const rootADSR = {
			attack: /** @type {number|undefined} */ (this.settings.attack) || 0.001,
			decay: /** @type {number|undefined} */ (this.settings.decay) || 0.1,
			sustain: /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0,
			release: /** @type {number|undefined} */ (this.settings.release) || 0.05
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
		
		this.bursts = [];
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		this.triggerTime = 0; // Reset trigger time on new note
		
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
			attack = (/** @type {number|undefined} */ (this.settings.attack) || 0.001) * this.sampleRate;
			decay = (/** @type {number|undefined} */ (this.settings.decay) || 0.1) * this.sampleRate;
			sustain = /** @type {number|undefined} */ (this.settings.sustain) !== undefined ? /** @type {number} */ (this.settings.sustain) : 0.0;
			release = (/** @type {number|undefined} */ (this.settings.release) || 0.05) * this.sampleRate;
		}
		
		// Calculate total note length from ADSR envelope
		const totalNoteLength = attack + decay + release;
		
		
		const totalDuration = totalNoteLength;
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
			// Calculate envelope normally based on actual envelope phase (not affected by choke)
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
			
			// Apply choke fade-out if choke time has elapsed
			// Choke cuts off the note at a specific time point, regardless of envelope phase
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
		
		// Increment global trigger time for choke calculation
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

