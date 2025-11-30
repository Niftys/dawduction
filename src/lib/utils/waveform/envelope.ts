/**
 * ADSR Envelope Processing for Waveform Visualization
 * Handles envelope calculations for note generation
 */

import { VISUALIZATION_SAMPLE_RATE } from './constants';

export interface EnvelopeParams {
	attack: number;
	decay: number;
	sustain: number;
	release: number;
}

/**
 * Get envelope parameters from settings with defaults
 */
export function getEnvelopeParams(settings: Record<string, unknown>): EnvelopeParams {
	return {
		attack: ((typeof settings.attack === 'number' ? settings.attack : 0.1) || 0.1) * VISUALIZATION_SAMPLE_RATE,
		decay: ((typeof settings.decay === 'number' ? settings.decay : 0.2) || 0.2) * VISUALIZATION_SAMPLE_RATE,
		sustain: (typeof settings.sustain === 'number' ? settings.sustain : 0.7) ?? 0.7,
		release: ((typeof settings.release === 'number' ? settings.release : 0.3) || 0.3) * VISUALIZATION_SAMPLE_RATE
	};
}

/**
 * Calculate envelope value at a given sample offset
 * @param sampleOffset - Sample offset from note start
 * @param params - Envelope parameters
 * @param cutOffAt - Sample where note was cut off (if any)
 * @param cutOffOffset - Offset from note start where cut-off occurred
 * @param totalDuration - Total duration of envelope phases
 * @param fadeOutSamples - Additional fade-out samples after release
 */
export function calculateEnvelope(
	sampleOffset: number,
	params: EnvelopeParams,
	cutOffAt?: number,
	cutOffOffset?: number,
	totalDuration?: number,
	fadeOutSamples?: number
): number {
	const { attack, decay, sustain, release } = params;
	
	// If note was cut off, transition to release phase from the cut-off point
	if (cutOffAt !== undefined && cutOffOffset !== undefined && sampleOffset >= cutOffAt) {
		// Note was cut off - calculate release phase from cut-off point
		const releaseOffset = sampleOffset - cutOffOffset; // Time since cut-off
		
		// Get the envelope value at the cut-off point
		let cutOffEnvelope = sustain;
		if (cutOffOffset < attack) {
			cutOffEnvelope = 0.5 * (1 - Math.cos(Math.PI * cutOffOffset / attack));
		} else if (cutOffOffset < attack + decay) {
			const decayPhase = (cutOffOffset - attack) / decay;
			cutOffEnvelope = 1 - decayPhase * (1 - sustain);
		} else {
			// Already in sustain
			cutOffEnvelope = sustain;
		}
		
		// Apply release envelope from cut-off point
		if (release > 0) {
			const releasePhase = releaseOffset / release;
			return cutOffEnvelope * Math.exp(-releasePhase * 6);
		} else {
			return cutOffEnvelope * Math.exp(-releaseOffset * 10);
		}
	}
	
	// Normal ADSR envelope calculation
	if (sampleOffset < attack) {
		return 0.5 * (1 - Math.cos(Math.PI * sampleOffset / attack));
	} else if (sampleOffset < attack + decay) {
		const decayPhase = (sampleOffset - attack) / decay;
		return 1 - decayPhase * (1 - sustain);
	} else if (sampleOffset < attack + decay + release) {
		const releasePhase = (sampleOffset - attack - decay) / release;
		return sustain * Math.exp(-releasePhase * 6);
	} else if (totalDuration !== undefined && fadeOutSamples !== undefined && sampleOffset < totalDuration + fadeOutSamples) {
		// Fade-out phase after release
		const fadePhase = (sampleOffset - (attack + decay + release)) / fadeOutSamples;
		const fadeStartValue = sustain * Math.exp(-6);
		return fadeStartValue * Math.exp(-fadePhase * 10);
	}
	
	return 0;
}

