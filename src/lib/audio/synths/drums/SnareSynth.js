/**
 * Snare Drum Synth
 * Combines tonal body with filtered noise for snare wire character
 */

class SnareSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
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
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.005) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Real snare = tonal body + filtered noise (snare wires)
		
		// 1. Tonal component (drum body) - like a tom
		const bodyFreq = 180 * Math.exp(-this.envelopePhase / (decay * 0.4));
		const bodyPhase = this.phase * 2 * Math.PI * bodyFreq / this.sampleRate;
		const bodyTone = Math.sin(bodyPhase) * 0.3;
		
		// 2. Snare wires - bandpass filtered noise
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Simple bandpass filter (centered around 200-800 Hz for snare character)
		// Use a simple resonant filter approximation
		const centerFreq = 400;
		const bandwidth = 300;
		const filterPhase = this.phase * 2 * Math.PI * centerFreq / this.sampleRate;
		const filteredNoise = noise * (0.5 + 0.5 * Math.sin(filterPhase)) * 0.7;
		
		// Mix body and snare wires
		let sample = bodyTone + filteredNoise;

		// ADSR envelope - FIXED: Release fades from end-of-decay value
		let envelope = 0;
		let decayEndValue = 0;
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 3);
			decayEndValue = envelope; // Track the actual value at end of decay
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			// Use decayEndValue if set, otherwise fallback to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.5;
		
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

