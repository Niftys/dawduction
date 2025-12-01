/**
 * Snare Drum Synth
 * Based on rimshot structure but with strong snare wire rattle
 * - Sharp tonal components (like rimshot) for punch
 * - Strong snare wire rattle (bandpass filtered noise) for snare character
 * - More transients for the rattling effect
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
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
				this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.001) * this.sampleRate;
		const decay = (this.settings.decay || 0.15) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		
		// Calculate total note length from ADSR envelope
		const totalNoteLength = attack + decay + release;
		
		
		const totalDuration = totalNoteLength;

		// Snare = rimshot structure + strong snare wire rattle
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// 1. Sharp tonal "ping" - high frequency sine that quickly decays (like rimshot)
		const pingFreq = 800 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.2));
		const pingPhase = this.phase * 2 * Math.PI * pingFreq / this.sampleRate;
		const ping = Math.sin(pingPhase) * 0.4;
		
		// 2. Body tone - lower frequency for character (like rimshot)
		const bodyFreq = 200 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.5));
		const bodyPhase = this.phase * 2 * Math.PI * bodyFreq / this.sampleRate;
		const body = Math.sin(bodyPhase) * 0.2;
		
		// 3. SNARE WIRES - bandpass filtered noise for rattle (THIS IS THE KEY DIFFERENCE)
		// This is what makes it a snare, not just a rimshot
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Bandpass filter for snare wire rattle (200-800Hz range)
		// Use multiple bandpass filters at different frequencies for more transients/rattling
		// Scale all frequencies proportionally with pitch
		const snareWireCenter1 = 400 * pitchMultiplier; // Hz - main snare wire resonance
		const snareWireCenter2 = 550 * pitchMultiplier; // Hz - secondary resonance for more transients
		const snareWireBandwidth = 300 * pitchMultiplier; // Hz - bandwidth also scales to maintain character
		
		// Simple bandpass approximation for snare wires
		// Create resonant peaks for rattling effect
		const snarePhase1 = this.phase * 2 * Math.PI * snareWireCenter1 / this.sampleRate;
		const snarePhase2 = this.phase * 2 * Math.PI * snareWireCenter2 / this.sampleRate;
		
		// Modulate noise with resonant frequencies to create snare wire rattle
		const snareWire1 = noise * (0.5 + 0.5 * Math.sin(snarePhase1)) * 0.6;
		const snareWire2 = noise * (0.5 + 0.5 * Math.sin(snarePhase2)) * 0.4;
		const snareWireNoise = snareWire1 + snareWire2;
		
		// 4. Bright filtered noise for snappy character (like rimshot, but less)
		const hpfFreq = 2000 * pitchMultiplier;
		const hpfPhase = this.phase * 2 * Math.PI * hpfFreq / this.sampleRate;
		const filteredNoise = noise * (0.3 + 0.7 * Math.abs(Math.sin(hpfPhase))) * 0.3;
		
		// Separate envelopes for different components
		// Body tone needs to decay very fast to avoid melodic tone
		let bodyEnvelope = 0;
		let mainEnvelope = 0;
		let decayEndValue = 0;
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// Calculate envelope normally based on actual envelope phase (not affected by choke)
		if (this.envelopePhase < attack) {
			// Very fast attack for sharp transient
			const attackPhase = this.envelopePhase / attack;
			bodyEnvelope = 0.5 * (1 - Math.cos(Math.PI * attackPhase));
			mainEnvelope = 0.5 * (1 - Math.cos(Math.PI * attackPhase));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			
			// Body: extremely fast decay - only first 10% of decay to avoid melodic tone
			if (decayPhase < 0.1) {
				bodyEnvelope = Math.exp(-decayPhase * 20) * (1 - decayPhase / 0.1);
			} else {
				bodyEnvelope = 0; // Cut off body tone early
			}
			
			// Main envelope: quick exponential decay for other components
			mainEnvelope = Math.exp(-decayPhase * 4);
			decayEndValue = mainEnvelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			bodyEnvelope = 0; // Body is gone by release
			// Use exponential decay for smooth release
			mainEnvelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-8);
			bodyEnvelope = 0;
			mainEnvelope = fadeStartValue * Math.exp(-fadePhase * 12);
		} else {
			bodyEnvelope = 0;
			mainEnvelope = 0;
		}

		bodyEnvelope = Math.max(0, Math.min(1, bodyEnvelope));
		mainEnvelope = Math.max(0, Math.min(1, mainEnvelope));

		// Apply separate envelopes - body decays much faster
		// Apply choke fade-out to both envelopes
		const bodyComponent = body * bodyEnvelope;
		const otherComponents = (ping + snareWireNoise + filteredNoise) * mainEnvelope ;
		let sample = bodyComponent + otherComponents;

		this.phase++;
		this.envelopePhase++;
				let output = sample * this.velocity * 0.7;
		
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
