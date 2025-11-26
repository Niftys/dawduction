/**
 * Shaker Synth
 * Transient-shaped noise for shaker/rattle character
 */

class ShakerSynth {
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
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const totalDuration = attack + decay;

		// Transient-shaped noise
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		let sample = noise;

		// Extended fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, decay * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 4);
			decayEndValue = envelope;
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - totalDuration) / fadeOutSamples;
			envelope = decayEndValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.35;
		
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

