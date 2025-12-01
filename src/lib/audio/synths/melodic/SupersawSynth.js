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
		this.triggerTime = 0; // Time when current note was triggered (for choke calculation)
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

	trigger(velocity, pitch, duration = null) {
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
		
		const attack = (this.settings.attack || 0.1) * this.sampleRate * bpmScale;
		const decay = (this.settings.decay || 0.2) * this.sampleRate * bpmScale;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate * bpmScale;
		
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
		
		// ADSR envelope with hold phase - FIXED: Release fades from sustain properly
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

