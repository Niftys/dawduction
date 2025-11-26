/**
 * Pluck Synth
 * Karplus-Strong plucked string synthesis
 * Creates natural-sounding plucked string tones (guitar, harp, etc.)
 */

class PluckSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.envelopePhase = 0;
		this.isActive = false;
		this.delayLine = null;
		this.delayIndex = 0;
		this.delayLength = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
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
		
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Calculate delay line length based on pitch
		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		// Ensure minimum delay length to prevent aliasing and instability
		const minDelayLength = Math.floor(this.sampleRate / 20000); // Max 20kHz
		this.delayLength = Math.max(minDelayLength, Math.floor(this.sampleRate / freq));
		
		// Initialize delay line with softer excitation
		this.delayLine = new Float32Array(this.delayLength);
		for (let i = 0; i < this.delayLength; i++) {
			// Use smoother noise with envelope for more musical pluck
			const noise = (Math.random() * 2 - 1) * 0.5; // Reduced noise amplitude
			// Apply smoother envelope to excitation
			const excitationPhase = i / this.delayLength;
			// Softer envelope curve
			const excitationEnv = Math.exp(-excitationPhase * 4) * (1 - excitationPhase * 0.5);
			this.delayLine[i] = noise * excitationEnv * 0.3; // Reduced initial amplitude
		}
		
		this.delayIndex = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive || !this.delayLine) return 0;
		
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const sustain = this.settings.sustain || 0.0; // Plucks don't sustain
		const release = (this.settings.release || 0.4) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Karplus-Strong: read from delay line, filter, and feed back
		const readIndex = this.delayIndex;
		let sample = this.delayLine[readIndex];
		
		// Low-pass filter in feedback loop (simulates string damping)
		// Higher damping value = less damping = brighter sound
		// Lower damping value = more damping = darker sound
		const damping = this.settings.damping || 0.96; // 0.9-0.99 range
		
		// Calculate filter cutoff: higher damping = higher cutoff (brighter)
		// Map damping (0.9-0.99) to cutoff (2000-12000 Hz) for musical range
		const filterCutoff = 2000 + (damping - 0.9) * (10000 / 0.09);
		// Clamp to safe range
		const safeCutoff = Math.max(500, Math.min(12000, filterCutoff));
		
		// Apply low-pass filter with lower resonance for stability
		sample = this.lowpass(sample, safeCutoff, 0.2);
		
		// Write filtered sample back to delay line (with damping gain)
		// Clamp to prevent runaway feedback
		this.delayLine[this.delayIndex] = Math.max(-1, Math.min(1, sample * damping));
		
		// Advance delay line index
		this.delayIndex = (this.delayIndex + 1) % this.delayLength;

		// ADSR envelope for overall amplitude
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Very quick attack for pluck character
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			// Exponential decay (plucks don't sustain)
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 2);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: continue exponential decay
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = Math.exp(-(2 + releasePhase * 4));
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		// Reduced output gain for safer levels, clamp to prevent clipping
		let output = sample * envelope * this.velocity * 0.25;
		output = Math.max(-0.95, Math.min(0.95, output)); // Soft clipping
		
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
				this.delayLine = null;
				return 0;
			}
		}
		
		return output;
	}

	lowpass(input, cutoff, resonance) {
		// Clamp cutoff to Nyquist to prevent instability
		const nyquist = this.sampleRate * 0.45;
		const safeCutoff = Math.max(20, Math.min(nyquist, cutoff));
		
		// Prevent division by zero and ensure stability
		if (safeCutoff >= nyquist) {
			return input; // Pass through if cutoff too high
		}
		
		const c = 1.0 / Math.tan(Math.PI * safeCutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		// Clamp filter state to prevent instability
		const clampedOutput = Math.max(-1, Math.min(1, output));

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = clampedOutput;

		return clampedOutput;
	}
}

