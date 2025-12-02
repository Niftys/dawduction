/**
 * Wavetable Drum Synth
 * Plays back pre-recorded samples as wavetables
 * Supports multiple variations and pitch shifting
 */

class WavetableDrumSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		
		// Wavetable data (should be set via updateSettings)
		this.wavetables = this.settings.wavetables || {};
		this.currentWavetable = null;
		this.wavetableLength = 0; // Will be set when wavetable is selected
		
		// Debug: Log wavetable info on construction
		if (this.wavetables && Object.keys(this.wavetables).length > 0) {
			const firstKey = Object.keys(this.wavetables)[0];
			const firstWavetable = this.wavetables[firstKey];
			console.log(`[WavetableDrumSynth] Constructed with ${Object.keys(this.wavetables).length} wavetables, first: ${firstKey}, length: ${firstWavetable?.length || 'N/A'}`);
		} else {
			console.warn(`[WavetableDrumSynth] Constructed with NO wavetables!`);
		}
		
		// Playback state
		this.phase = 0; // Phase accumulator for wavetable playback
		this.envelopePhase = 0;
		this.isActive = false;
		this.playbackSpeed = 1.0; // For pitch shifting
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade
		
		// DC blocking filter
		this.dcFilterState = { x1: 0, y1: 0 };
		
		// Per-note ADSR parameters
		/** @type {{attack: number, decay: number, sustain: number, release: number}|null} */
		this.perNoteADSR = null;
		/** @type {{attack: number, decay: number, sustain: number, release: number}|null} */
		this.rootADSRAtTrigger = null;
		
		// Sample selection
		this.selectedSample = this.settings.selectedSample || 0; // Index or name
		this.sampleNames = this.settings.sampleNames || [];
		
		// Select initial wavetable
		this.selectWavetable();
	}

	/**
	 * @param {Object} settings - Settings object
	 * @param {number} [settings.attack] - Attack time in seconds
	 * @param {number} [settings.decay] - Decay time in seconds
	 * @param {number} [settings.sustain] - Sustain level (0-1)
	 * @param {number} [settings.release] - Release time in seconds
	 * @param {Object} [settings.wavetables] - Wavetable data object
	 * @param {number|string} [settings.selectedSample] - Selected sample index or name
	 * @param {Array<string>} [settings.sampleNames] - Array of sample names for selection
	 */
	updateSettings(settings) {
		const oldSettings = { ...this.settings };
		
		// Validate and sanitize settings before merging
		const sanitizedSettings = { ...settings };
		
		// Ensure ADSR parameters are valid numbers (allow 0 values, only validate if undefined/invalid)
		if (sanitizedSettings.attack !== undefined) {
			const val = Number(sanitizedSettings.attack);
			if (!isNaN(val)) {
				sanitizedSettings.attack = Math.max(0, Math.min(1, val));
			}
		}
		if (sanitizedSettings.decay !== undefined) {
			const val = Number(sanitizedSettings.decay);
			if (!isNaN(val)) {
				sanitizedSettings.decay = Math.max(0, Math.min(10, val));
			}
		}
		if (sanitizedSettings.sustain !== undefined) {
			const val = Number(sanitizedSettings.sustain);
			if (!isNaN(val)) {
				sanitizedSettings.sustain = Math.max(0, Math.min(1, val));
			}
		}
		if (sanitizedSettings.release !== undefined) {
			const val = Number(sanitizedSettings.release);
			if (!isNaN(val)) {
				sanitizedSettings.release = Math.max(0, Math.min(5, val));
			}
		}
		
		// Merge settings
		this.settings = { ...this.settings, ...sanitizedSettings };
		
		// Debug: Log parameter updates
		if (settings.attack !== undefined || settings.decay !== undefined || 
		    settings.sustain !== undefined || settings.release !== undefined) {
			console.log(`[WavetableDrumSynth] Settings updated:`, {
				attack: this.settings.attack,
				decay: this.settings.decay,
				sustain: this.settings.sustain,
				release: this.settings.release,
				oldDecay: oldSettings.decay,
				newDecay: this.settings.decay,
				decayChanged: oldSettings.decay !== this.settings.decay
			});
		}
		
		// Update wavetables if provided
		if (settings.wavetables) {
			this.wavetables = settings.wavetables;
		}
		
		// Update selected sample
		if (settings.selectedSample !== undefined) {
			this.selectedSample = settings.selectedSample;
		}
		
		if (settings.sampleNames) {
			this.sampleNames = settings.sampleNames;
		}
		
		// Select current wavetable
		this.selectWavetable();
		
		// If per-note ADSR exists and root ADSR changed, update per-note values relative to root
		// Use the same ratio-based approach as regular drum synths for consistency
		if (this.perNoteADSR && this.rootADSRAtTrigger && this.isActive) {
			/** @type {{attack: number, decay: number, sustain: number, release: number}} */
			const newRootADSR = {
				attack: (this.settings.attack !== undefined ? this.settings.attack : 0.005),
				decay: (this.settings.decay !== undefined ? this.settings.decay : 0.4),
				sustain: (this.settings.sustain !== undefined ? this.settings.sustain : 0.0),
				release: (this.settings.release !== undefined ? this.settings.release : 0.15)
			};
			
			/** @type {{attack: number, decay: number, sustain: number, release: number}} */
			const oldRootADSR = this.rootADSRAtTrigger;
			
			// Calculate ratios and apply to per-note values (same as KickSynth/SnareSynth)
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
	 * Select the current wavetable based on selectedSample
	 */
	selectWavetable() {
		if (!this.wavetables || Object.keys(this.wavetables).length === 0) {
			this.currentWavetable = null;
			return;
		}
		
		const sampleNames = this.sampleNames.length > 0 
			? this.sampleNames 
			: Object.keys(this.wavetables).sort();
		
		// Get sample name by index or direct name
		let sampleName;
		if (typeof this.selectedSample === 'number') {
			if (this.selectedSample >= 0 && this.selectedSample < sampleNames.length) {
				sampleName = sampleNames[this.selectedSample];
			} else {
				sampleName = sampleNames[0]; // Fallback to first
			}
		} else {
			sampleName = this.selectedSample;
		}
		
		// Get wavetable
		if (this.wavetables[sampleName]) {
			this.currentWavetable = this.wavetables[sampleName];
			this.wavetableLength = this.currentWavetable.length;
			// Debug: Log sample length to verify it's loading correctly
			console.log(`[WavetableDrumSynth] Loaded wavetable: ${sampleName}, length: ${this.wavetableLength} samples (${(this.wavetableLength / this.sampleRate).toFixed(3)}s), first sample: ${this.currentWavetable[0]?.toFixed(6)}, peak: ${Math.max(...Array.from(this.currentWavetable).slice(0, 1000).map(s => Math.abs(s))).toFixed(6)}`);
		} else {
			// Fallback to first available
			const firstKey = Object.keys(this.wavetables)[0];
			this.currentWavetable = this.wavetables[firstKey];
			this.wavetableLength = this.currentWavetable ? this.currentWavetable.length : 2048;
			// console.log(`Using fallback wavetable: ${firstKey}, length: ${this.wavetableLength} samples`);
		}
	}

	/**
	 * Trigger a note
	 * @param {number} velocity - Velocity (0-1)
	 * @param {number} pitch - MIDI pitch
	 * @param {Object|number} adsrParamsOrDuration - ADSR params or duration
	 */
	trigger(velocity, pitch, adsrParamsOrDuration = null) {
		if (!this.currentWavetable) {
			this.selectWavetable();
			if (!this.currentWavetable) {
				return; // No wavetable available
			}
		}
		
		this.velocity = velocity;
		this.pitch = pitch;
		this.isActive = true;
		this.envelopePhase = 0;
		this.phase = 0; // Reset phase
		
		// Calculate playback speed based on pitch
		// For drums, use C1 (36) as base pitch - this ensures normal playback speed
		// for typical drum pitches (kick=36, snare=38, etc.)
		// Wavetables are resampled to match the worklet sample rate (44.1kHz),
		// so playbackSpeed = 1.0 means we play 1 wavetable sample per audio sample
		// Individual instruments can override basePitch to match their standard MIDI pitch
		const basePitch = this.settings.basePitch !== undefined ? this.settings.basePitch : 36; // C1 (default for most drums)
		this.playbackSpeed = Math.pow(2, (pitch - basePitch) / 12);
		
		// Handle ADSR parameters
		// For wavetable drums, ALWAYS use root settings (from sidebar) - ignore per-note ADSR
		// This ensures sidebar parameters always work correctly for TR808 drums
		// Per-note ADSR from pattern nodes can have stale/wrong values, so we ignore them
		const rootADSR = {
			attack: (this.settings.attack !== undefined ? this.settings.attack : 0.005),
			decay: (this.settings.decay !== undefined ? this.settings.decay : 0.4),
			sustain: (this.settings.sustain !== undefined ? this.settings.sustain : 0.0),
			release: (this.settings.release !== undefined ? this.settings.release : 0.15)
		};
		
		// Always store root ADSR for potential relative updates during playback
		this.rootADSRAtTrigger = rootADSR;
		
		// For wavetable drums, ignore per-note ADSR and always use root settings
		// This ensures sidebar parameters work correctly
		this.perNoteADSR = null;
		
		// Retrigger fade handling
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	/**
	 * Process one sample
	 * @returns {number} Sample value
	 */
	process() {
		if (!this.isActive || !this.currentWavetable) return 0;
		
		// Use per-note ADSR if available, otherwise use root settings
		// Keep values in seconds for envelope calculation (don't convert to samples)
		let attackSamples, decaySeconds, sustain, releaseSamples;
		if (this.perNoteADSR) {
			attackSamples = (this.perNoteADSR.attack || 0.005) * this.sampleRate;
			decaySeconds = this.perNoteADSR.decay !== undefined ? this.perNoteADSR.decay : 0.4; // Keep in seconds for time constant
			sustain = this.perNoteADSR.sustain !== undefined ? this.perNoteADSR.sustain : 0.0;
			releaseSamples = (this.perNoteADSR.release || 0.15) * this.sampleRate;
		} else {
			// Read from settings - these should be updated via updateSettings()
			// Use the actual settings values, with safe fallbacks only if truly undefined
			attackSamples = (this.settings.attack !== undefined ? this.settings.attack : 0.005) * this.sampleRate;
			decaySeconds = this.settings.decay !== undefined ? this.settings.decay : 0.4; // Keep in seconds for time constant
			sustain = this.settings.sustain !== undefined ? this.settings.sustain : 0.0;
			releaseSamples = (this.settings.release !== undefined ? this.settings.release : 0.15) * this.sampleRate;
		}
		
		// Ensure all ADSR parameters are valid positive numbers
		if (typeof attackSamples !== 'number' || isNaN(attackSamples) || attackSamples < 0) {
			attackSamples = 0.005 * this.sampleRate;
		}
		if (typeof decaySeconds !== 'number' || isNaN(decaySeconds) || decaySeconds < 0) {
			console.warn(`[WavetableDrumSynth] Invalid decay value: ${decaySeconds}, using default 0.4`);
			decaySeconds = 0.4; // Fallback to default
		}
		if (typeof sustain !== 'number' || isNaN(sustain) || sustain < 0) {
			sustain = 0.0;
		}
		if (typeof releaseSamples !== 'number' || isNaN(releaseSamples) || releaseSamples < 0) {
			releaseSamples = 0.15 * this.sampleRate;
		}
		
		// Debug: Log current settings on first sample of new note (to verify they're being used)
		if (this.envelopePhase === 0 && this.phase === 0) {
			console.log(`[WavetableDrumSynth] Processing with settings:`, {
				attack: this.settings.attack,
				decay: decaySeconds,
				sustain: sustain,
				release: this.settings.release,
				usingPerNote: !!this.perNoteADSR
			});
		}
		
		// Check if we've reached the end of the wavetable (drum samples play once, don't loop)
		// Stop when phase reaches or exceeds the wavetable length
		if (this.phase >= this.wavetableLength) {
			this.isActive = false;
			this.wasActive = true;
			return 0;
		}
		
		// Calculate envelope with exponential decay
		// Uses ADSR envelope: Attack → Decay → Sustain
		let envelope = 1.0;
		
		// Attack phase: linear ramp from 0 to 1
		if (attackSamples > 0 && this.envelopePhase < attackSamples) {
			envelope = Math.min(1.0, this.envelopePhase / attackSamples);
		} else {
			// Decay phase: exponential decay from 1.0 to sustain level
			// Calculate time since attack phase ended (in seconds)
			const samplesSinceAttack = Math.max(0, this.envelopePhase - attackSamples);
			const timeSinceAttack = samplesSinceAttack / this.sampleRate;
			
			// Apply exponential decay
			if (decaySeconds > 0.001) { // Only apply decay if decay time is meaningful
				// Exponential decay: envelope = sustain + (1 - sustain) * exp(-time / decay)
				// At time=0: envelope = 1.0
				// At time=decay: envelope ≈ sustain + (1-sustain) * 0.368 (about 37% of way to sustain)
				// As time→∞: envelope → sustain
				const decayFactor = Math.exp(-timeSinceAttack / decaySeconds);
				envelope = sustain + (1.0 - sustain) * decayFactor;
				
				// Debug: Log decay calculation occasionally (every 1000 samples to avoid spam)
				if (this.envelopePhase % 1000 === 0 && timeSinceAttack < decaySeconds * 2) {
					console.log(`[WavetableDrumSynth] Decay envelope: time=${timeSinceAttack.toFixed(3)}s, decay=${decaySeconds.toFixed(3)}s, envelope=${envelope.toFixed(4)}, decayFactor=${decayFactor.toFixed(4)}`);
				}
			} else {
				// If decay is very short or zero, immediately go to sustain
				envelope = sustain;
			}
			
			// Apply a gentle fade at the very end of the sample to prevent clicks
			// This only affects the last 1% of the sample
			const sampleProgress = this.phase / Math.max(this.wavetableLength, 1);
			if (sampleProgress > 0.99) {
				const fadeProgress = (sampleProgress - 0.99) / 0.01; // 0 to 1 over last 1%
				envelope *= (1.0 - fadeProgress * 0.3); // Gentle fade to prevent clicks
			}
			
			// Stop playback if envelope gets too low (below 0.001 = -60dB)
			// This prevents processing samples that are inaudible
			if (envelope < 0.001) {
				this.isActive = false;
				this.wasActive = true;
				return 0;
			}
		}
		
		// Read from wavetable with linear interpolation
		// phase directly indexes into the wavetable (0 to wavetableLength-1)
		// Clamp phase to ensure we don't read past the end
		const phaseIndex = Math.min(this.phase, this.wavetableLength - 1);
		const index1 = Math.floor(phaseIndex);
		const index2 = Math.min(index1 + 1, this.wavetableLength - 1); // Don't wrap, clamp to end
		const frac = phaseIndex - index1;
		
		// Get sample values
		const sample1 = this.currentWavetable[index1];
		const sample2 = this.currentWavetable[index2];
		const sample = sample1 * (1 - frac) + sample2 * frac;
		
		// Apply envelope and velocity
		// Add a small gain boost for drum samples (they tend to be quieter)
		const gainBoost = 1.5;
		let output = sample * envelope * this.velocity * gainBoost;
		
		// Retrigger fade (smooth transition when retriggering)
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeRatio = this.retriggerFadePhase / this.retriggerFadeSamples;
			output = output * fadeRatio + this.lastOutput * (1 - fadeRatio);
			this.retriggerFadePhase++;
		} else {
			this.wasActive = false;
		}
		
		// DC blocking filter
		const filtered = output - this.dcFilterState.x1 + 0.995 * this.dcFilterState.y1;
		this.dcFilterState.x1 = output;
		this.dcFilterState.y1 = filtered;
		
		// Update phase: advance by playbackSpeed wavetable samples per audio sample
		this.phase += this.playbackSpeed;
		
		// Update envelope phase
		this.envelopePhase++;
		
		this.lastOutput = filtered;
		return filtered;
	}
}

