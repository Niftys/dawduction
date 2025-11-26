/**
 * Kick Drum Synth (procedural)
 * Generates a punchy kick drum with pitch envelope and transient click
 */

class KickSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
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
		this.pitch = pitch || 60;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;

		const attack = (this.settings.attack || 0.005) * this.sampleRate;
		const decay = (this.settings.decay || 0.4) * this.sampleRate;
		const sustain = this.settings.sustain || 0.0;
		const release = (this.settings.release || 0.15) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Beefier kick: wider frequency range with punch
		const startFreq = 80; // Higher initial frequency for punch
		const midFreq = 50; // Mid frequency
		const endFreq = 35; // Lower end frequency for body
		
		// Two-stage pitch envelope for more character
		let freq;
		if (this.envelopePhase < decay * 0.3) {
			// Initial punch - quick drop
			const phase = this.envelopePhase / (decay * 0.3);
			freq = startFreq * (1 - phase) + midFreq * phase;
		} else {
			// Body - slower decay
			const phase = (this.envelopePhase - decay * 0.3) / (decay * 0.7);
			freq = midFreq * Math.exp(-phase * 2) + endFreq * (1 - Math.exp(-phase * 2));
		}

		// Generate sine wave with pitch envelope
		const sine = Math.sin(this.phase * 2 * Math.PI * freq / this.sampleRate);
		
		// Add a subtle click/punch at the start (high frequency transient)
		let click = 0;
		if (this.envelopePhase < attack * 2) {
			const clickPhase = this.envelopePhase / (attack * 2);
			const clickFreq = 200 * (1 - clickPhase * 0.8); // Quick high frequency sweep
			click = Math.sin(this.phase * 2 * Math.PI * clickFreq / this.sampleRate) * (1 - clickPhase) * 0.3;
		}
		
		// Combine sine and click
		const sample = sine + click;

		// Extended total duration with long fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.3); // 100ms minimum fade-out
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// ADSR envelope - FIXED: Release fades from end-of-decay value, not sustain
		let envelope = 0;
		let decayEndValue = sustain; // Value at end of decay phase (will be updated in decay phase)
		
		if (this.envelopePhase < attack) {
			// Smooth attack using cosine curve
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
			decayEndValue = envelope; // Track the actual value at end of decay
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0 (not from sustain!)
			// If decayEndValue wasn't set (shouldn't happen), use sustain as fallback
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : sustain;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential curve for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended smooth fade-out using exponential decay to zero
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			// Continue exponential decay from very small value
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : sustain) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		// Ensure envelope is never negative and clamp to [0, 1]
		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		// Apply envelope
		let output = sample * envelope * this.velocity * 0.7;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			// Fade out old sound, fade in new sound
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			// Smooth the old output to prevent discontinuities
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05; // Smooth transition
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

