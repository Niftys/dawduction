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

	trigger(velocity, pitch, duration = null) {
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
		this.noteDuration = duration; // Store note duration in beats
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
		
		const attack = (this.settings.attack || 0.5) * this.sampleRate * bpmScale; // Slow attack for pads
		const decay = (this.settings.decay || 0.3) * this.sampleRate * bpmScale;
		const sustain = this.settings.sustain || 0.9; // High sustain for pads
		const release = (this.settings.release || 1.5) * this.sampleRate * bpmScale; // Long release for pads
		
		// Calculate hold phase duration: note duration minus attack and decay
		let holdSamples = 0;
		if (this.noteDuration !== null && this.noteDuration !== undefined) {
			const noteDurationSamples = (this.noteDuration / beatsPerSecond) * this.sampleRate;
			holdSamples = Math.max(0, noteDurationSamples - attack - decay);
		}
		
		const totalDuration = attack + decay + holdSamples + release;

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
		
		// ADSR envelope with hold phase - optimized for pads (slow attack, long release)
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Slow, smooth attack
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
			envelope = sustain * Math.exp(-releasePhase * 4); // Slower decay for pads
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + holdSamples + release)) / fadeOutSamples;
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

