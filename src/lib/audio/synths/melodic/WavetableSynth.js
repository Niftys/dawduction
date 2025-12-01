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
		this.triggerTime = 0; // Time when current note was triggered (for choke calculation)
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

	trigger(velocity, pitch, duration = null) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		if (!this.isActive) {
			this.phase = 0;
		}
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.noteDuration = duration; // Store note duration in beats
		this.triggerTime = 0; // Reset trigger time on new note
		
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
		const tableIndex = (this.phase % (2 * Math.PI)) / (2 * Math.PI) * this.wavetable.length;
		const index1 = Math.floor(tableIndex);
		const index2 = (index1 + 1) % this.wavetable.length;
		const frac = tableIndex - index1;
		const sample = this.wavetable[index1] * (1 - frac) + this.wavetable[index2] * frac;

		// ADSR envelope with hold phase - allows notes to sustain for full duration
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

