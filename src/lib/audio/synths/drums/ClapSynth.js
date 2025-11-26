/**
 * Clap Synth
 * Multiple delayed noise bursts to simulate multiple hands clapping
 */

class ClapSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.bursts = [];
		this.isActive = false;
		// Pre-generated noise buffer for consistent sound
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
		
		this.bursts = [];
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		// Multiple bursts with pre-delay (like multiple hands clapping)
		for (let i = 0; i < 5; i++) {
			this.bursts.push({
				delay: i * 0.008 * this.sampleRate, // Slight delay between bursts
				phase: 0,
				envelopePhase: 0,
				velocity: velocity * (1 - i * 0.12),
				noiseIndex: this.noiseIndex + i * 1000 // Offset noise for variation
			});
		}
		this.isActive = true;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive || this.bursts.length === 0) return 0;
		
		let sample = 0;
		for (let burst of this.bursts) {
			if (burst.delay > 0) {
				burst.delay--;
				continue;
			}
			
			// Use pre-generated noise buffer
			const noiseIdx = (burst.noiseIndex + burst.envelopePhase) % this.noiseBuffer.length;
			let noise = this.noiseBuffer[noiseIdx];
			
			// High-pass emphasis for clap character (bright, sharp)
			// Simple high-pass: emphasize high frequencies
			const highFreq = 5000;
			const filterPhase = burst.phase * 2 * Math.PI * highFreq / this.sampleRate;
			noise = noise * (0.3 + 0.7 * (1 + Math.sin(filterPhase)) * 0.5);
			
			// Sharp, short envelope with extended fade-out
			const decay = 0.08 * this.sampleRate;
			const fadeOutSamples = decay * 0.3;
			const totalBurstDuration = decay + fadeOutSamples;
			
			let envelope = 0;
			if (burst.envelopePhase < decay) {
				envelope = Math.exp(-burst.envelopePhase / (decay * 0.25));
			} else if (burst.envelopePhase < totalBurstDuration) {
				// Extended fade-out
				const fadePhase = (burst.envelopePhase - decay) / fadeOutSamples;
				const fadeStartValue = Math.exp(-decay / (decay * 0.25));
				envelope = fadeStartValue * Math.exp(-fadePhase * 10);
			}
			
			if (envelope > 0.001) {
				sample += noise * envelope * burst.velocity;
				burst.envelopePhase++;
				burst.phase++;
			}
		}
		
		const maxBurstDuration = 0.08 * this.sampleRate * 1.3; // Include fade-out
		this.bursts = this.bursts.filter(b => b.envelopePhase < maxBurstDuration);
		if (this.bursts.length === 0) {
			this.isActive = false;
			return 0;
		}
		
		let output = sample * 0.4;
		
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
		
		return output;
	}
}

