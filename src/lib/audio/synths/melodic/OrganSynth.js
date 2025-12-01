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
		this.triggerTime = 0; // Time when current note was triggered (for choke calculation)
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

	trigger(velocity, pitch, duration = null) {
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
		this.noteDuration = duration; // Store note duration in beats
		this.triggerTime = 0; // Reset trigger time on new note
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		
		// Get BPM from settings or use default 120
		const bpm = this.settings.bpm || 120;
		const beatsPerSecond = bpm / 60;
		
		// Scale envelope parameters with BPM (slower BPM = longer envelope times)
		const bpmScale = 120 / bpm;
		
		const attack = (this.settings.attack || 0.01) * this.sampleRate * bpmScale; // Fast attack for organ
		const decay = (this.settings.decay || 0.1) * this.sampleRate * bpmScale;
		const sustain = this.settings.sustain || 1.0; // Full sustain for organ
		const release = (this.settings.release || 0.2) * this.sampleRate * bpmScale;
		
		// Calculate hold phase duration: note duration minus attack and decay
		let holdSamples = 0;
		if (this.noteDuration !== null && this.noteDuration !== undefined) {
			const noteDurationSamples = (this.noteDuration / beatsPerSecond) * this.sampleRate;
			holdSamples = Math.max(0, noteDurationSamples - attack - decay);
		}
		
		// Calculate total note length from ADSR envelope
		const totalNoteLength = attack + decay + holdSamples + release;
		
		const totalDuration = totalNoteLength;

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
		
		// ADSR envelope with hold phase - optimized for organ (fast attack, full sustain)
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// Calculate envelope normally based on actual envelope phase (not affected by choke)
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Fast attack for organ
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

