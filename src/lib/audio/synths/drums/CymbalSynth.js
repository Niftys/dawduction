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
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
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
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.25) * this.sampleRate; // Tighter decay
		const release = (this.settings.release || 0.2) * this.sampleRate;
		const totalDuration = attack + decay + release;

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

