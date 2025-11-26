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

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		if (!this.isActive) {
			this.phase = 0;
		}
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const tableIndex = (this.phase % (2 * Math.PI)) / (2 * Math.PI) * this.wavetable.length;
		const index1 = Math.floor(tableIndex);
		const index2 = (index1 + 1) % this.wavetable.length;
		const frac = tableIndex - index1;
		const sample = this.wavetable[index1] * (1 - frac) + this.wavetable[index2] * frac;

		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

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

