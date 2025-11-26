/**
 * Handles envelope processing based on timeline position and pattern assignments
 * Applies envelopes to control parameters (volume, filter, pitch, pan) over time
 */

class EnvelopesProcessor {
	constructor() {
		this.envelopes = []; // Global envelope definitions
		this.timelineEnvelopes = []; // Timeline envelope instances
		this.patternToTrackId = new Map(); // Maps pattern IDs to track IDs
	}

	initialize(envelopes, timelineEnvelopes, patternToTrackId) {
		this.envelopes = envelopes || [];
		this.timelineEnvelopes = timelineEnvelopes || [];
		this.patternToTrackId = patternToTrackId || new Map();
	}

	/**
	 * Get active envelopes for a track at a specific timeline position
	 * @param {string} trackId - The track ID to get envelopes for
	 * @param {number} currentBeat - Current playback position in beats
	 * @param {boolean} isArrangementView - Whether we're in arrangement view
	 * @param {string} patternId - Optional pattern ID for pattern-specific envelopes
	 * @returns {Object} Object with envelope values for each envelope type
	 */
	getActiveEnvelopeValues(trackId, currentBeat, isArrangementView, patternId = null) {
		if (!isArrangementView) {
			// In pattern view, return default values
			// Pattern view envelopes can be added later if needed
			return {
				volume: 1.0,
				filter: 1.0,
				pitch: 1.0,
				pan: 0.0
			};
		}

		const envelopeValues = {
			volume: 1.0,
			filter: 1.0,
			pitch: 1.0,
			pan: 0.0
		};

		// Find timeline envelopes that are active at this position
		for (const timelineEnvelope of this.timelineEnvelopes) {
			const startBeat = timelineEnvelope.startBeat || 0;
			const endBeat = startBeat + (timelineEnvelope.duration || 0);

			// Check if envelope is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				// Check pattern assignment
				if (timelineEnvelope.patternId) {
					// Envelope is assigned to a specific pattern
					if (patternId && timelineEnvelope.patternId === patternId) {
						// This envelope applies to this pattern
						const envelopeDef = this.envelopes.find(e => e.id === timelineEnvelope.envelopeId);
						if (envelopeDef) {
							this.applyEnvelope(envelopeValues, envelopeDef, currentBeat, startBeat, endBeat);
						}
					}
				} else {
					// Global envelope (applies to all tracks/patterns)
					// Note: trackId matching would require mapping TimelineTrack.id to audio engine trackId
					// For now, apply global envelopes to all tracks
					const envelopeDef = this.envelopes.find(e => e.id === timelineEnvelope.envelopeId);
					if (envelopeDef) {
						this.applyEnvelope(envelopeValues, envelopeDef, currentBeat, startBeat, endBeat);
					}
				}
			}
		}

		return envelopeValues;
	}

	/**
	 * Apply envelope values to the envelope values object
	 * @param {Object} envelopeValues - Object to modify
	 * @param {Object} envelopeDef - Envelope definition
	 * @param {number} currentBeat - Current playback position
	 * @param {number} startBeat - Envelope start position
	 * @param {number} endBeat - Envelope end position
	 */
	applyEnvelope(envelopeValues, envelopeDef, currentBeat, startBeat, endBeat) {
		if (!envelopeDef || !envelopeDef.settings) return;

		const progress = (currentBeat - startBeat) / (endBeat - startBeat); // 0-1
		const envelopeType = envelopeDef.type;

		// Get envelope curve value based on settings
		const value = this.calculateEnvelopeValue(progress, envelopeDef.settings);

		// Apply to appropriate parameter
		switch (envelopeType) {
		case 'volume':
			envelopeValues.volume *= value;
			break;
		case 'filter':
			envelopeValues.filter *= value;
			break;
		case 'pitch':
			envelopeValues.pitch *= value;
			break;
		case 'pan':
			// Pan is additive (can be -1 to 1)
			const panValue = (value - 0.5) * 2; // Convert 0-1 to -1 to 1
			envelopeValues.pan += panValue;
			envelopeValues.pan = Math.max(-1, Math.min(1, envelopeValues.pan)); // Clamp
			break;
		}
	}

	/**
	 * Calculate envelope value at a given progress (0-1)
	 * @param {number} progress - Progress through envelope (0-1)
	 * @param {Object} settings - Envelope settings
	 * @returns {number} Envelope value (typically 0-1)
	 */
	calculateEnvelopeValue(progress, settings) {
		// Simple linear envelope for now
		// Can be enhanced with curves, attack/decay/sustain/release, etc.
		const startValue = settings.startValue !== undefined ? settings.startValue : 0;
		const endValue = settings.endValue !== undefined ? settings.endValue : 1;
		const curve = settings.curve || 'linear'; // linear, exponential, logarithmic

		let value;
		switch (curve) {
		case 'exponential':
			value = startValue + (endValue - startValue) * (Math.exp(progress * 5) - 1) / (Math.exp(5) - 1);
			break;
		case 'logarithmic':
			value = startValue + (endValue - startValue) * Math.log(progress * 9 + 1) / Math.log(10);
			break;
		case 'linear':
		default:
			value = startValue + (endValue - startValue) * progress;
			break;
		}

		return Math.max(0, Math.min(1, value)); // Clamp to 0-1
	}
}

