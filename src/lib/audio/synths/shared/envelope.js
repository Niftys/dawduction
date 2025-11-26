/**
 * Shared envelope utilities for all synths
 * Provides smooth ADSR envelope calculation with extended fade-out
 */

/**
 * Calculate ADSR envelope with smooth fade-out to prevent clicks
 * @param {number} envelopePhase - Current phase in samples
 * @param {number} attack - Attack time in samples
 * @param {number} decay - Decay time in samples
 * @param {number} sustain - Sustain level (0-1)
 * @param {number} release - Release time in samples
 * @param {number} sampleRate - Sample rate
 * @returns {number} Envelope value (0-1) or -1 if note should stop
 */
export function calculateEnvelope(envelopePhase, attack, decay, sustain, release, sampleRate) {
	const totalDuration = attack + decay + release;
	const fadeOutSamples = Math.max(0.1 * sampleRate, release * 0.3); // 100ms minimum fade-out
	const extendedDuration = totalDuration + fadeOutSamples;
	
	let envelope = 0;
	if (envelopePhase < attack) {
		// Smooth attack using cosine curve
		envelope = 0.5 * (1 - Math.cos(Math.PI * envelopePhase / attack));
	} else if (envelopePhase < attack + decay) {
		const decayPhase = (envelopePhase - attack) / decay;
		envelope = 1 - decayPhase * (1 - sustain);
	} else if (envelopePhase < attack + decay + release) {
		const releasePhase = (envelopePhase - attack - decay) / release;
		envelope = sustain * (1 - releasePhase);
	} else if (envelopePhase < extendedDuration) {
		// Extended smooth fade-out using Hann window
		const fadePhase = (envelopePhase - (attack + decay + release)) / fadeOutSamples;
		envelope = 0.5 * (1 - Math.cos(Math.PI * fadePhase));
	} else {
		return -1; // Signal to stop
	}

	// Ensure envelope is never negative and clamp to [0, 1]
	return Math.max(0, Math.min(1, envelope));
}

