/**
 * Handles envelope processing based on timeline position and pattern assignments
 * Applies envelopes to control parameters (volume, filter, pitch, pan) over time
 */

class EnvelopesProcessor {
	constructor() {
		this.envelopes = []; // Global envelope definitions
		this.timelineEnvelopes = []; // Timeline envelope instances
		this.patternToTrackId = new Map(); // Maps pattern IDs to track IDs
		this.timelineTracks = []; // Timeline tracks (for validation)
		this.processor = null; // Reference to processor for debug logging
		
		// Performance optimization caches
		this._activeEnvelopeValuesCache = new Map(); // trackId_patternId_beat -> envelopeValues
		this._lastCacheUpdateBeat = -1;
		this._cacheUpdateInterval = 0.1; // Update cache every 0.1 beats (~100ms at 120 BPM)
	}

	initialize(envelopes, timelineEnvelopes, patternToTrackId, timelineTracks, processor = null) {
		this.envelopes = envelopes || [];
		this.timelineEnvelopes = timelineEnvelopes || [];
		this.patternToTrackId = patternToTrackId || new Map();
		this.timelineTracks = timelineTracks || [];
		this.processor = processor || null;
		
		// Clear caches when reinitializing
		this.clearCaches();
		
		// Debug: Log initialization
		if (this.processor && this.processor.port) {
			this.processor.port.postMessage({
				type: 'debug',
				message: 'EnvelopesProcessor initialized',
				data: {
					envelopesCount: this.envelopes.length,
					timelineEnvelopesCount: this.timelineEnvelopes.length,
					envelopeIds: this.envelopes.map(e => e.id),
					timelineEnvelopeIds: this.timelineEnvelopes.map(te => te.envelopeId)
				}
			});
		}
	}

	/**
	 * Clear all performance caches (call when project changes)
	 */
	clearCaches() {
		this._activeEnvelopeValuesCache.clear();
		this._lastCacheUpdateBeat = -1;
	}

	/**
	 * Update envelope settings in real-time
	 * @param {string} envelopeId - The envelope ID to update
	 * @param {Object} settings - New settings object (will be merged with existing settings)
	 */
	updateEnvelope(envelopeId, settings) {
		const envelope = this.envelopes.find(e => e.id === envelopeId);
		if (envelope) {
			// Update envelope settings
			envelope.settings = Object.assign({}, envelope.settings || {}, settings);
		}
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

		// Update caches periodically (not every sample)
		const shouldUpdateCache = Math.abs(currentBeat - this._lastCacheUpdateBeat) >= this._cacheUpdateInterval;
		if (shouldUpdateCache) {
			this._updateCaches(currentBeat);
			this._lastCacheUpdateBeat = currentBeat;
		}

		// Check cache first
		const cacheKey = `${trackId}_${patternId || 'null'}_${Math.floor(currentBeat / this._cacheUpdateInterval)}`;
		const cached = this._activeEnvelopeValuesCache.get(cacheKey);
		if (cached && Math.abs(currentBeat - cached.beat) < this._cacheUpdateInterval * 2) {
			return cached.values;
		}

		// Cache miss - calculate envelope values
		const envelopeValues = this._calculateEnvelopeValues(trackId, currentBeat, patternId);

		// Store in cache
		this._activeEnvelopeValuesCache.set(cacheKey, {
			beat: currentBeat,
			values: envelopeValues
		});

		return envelopeValues;
	}

	/**
	 * Calculate envelope values (uncached version)
	 */
	_calculateEnvelopeValues(trackId, currentBeat, patternId = null) {
		const envelopeValues = {
			volume: 1.0,
			filter: 1.0,
			pitch: 1.0,
			pan: 0.0
		};

		// Find timeline envelopes that are active at this position
		// Envelopes can ONLY be on envelope tracks and apply globally
		for (const timelineEnvelope of this.timelineEnvelopes) {
			const startBeat = timelineEnvelope.startBeat || 0;
			const endBeat = startBeat + (timelineEnvelope.duration || 0);

			// Check if envelope is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				// CRITICAL: Envelopes can ONLY be on 'envelope' type tracks
				// Find the timeline track this envelope belongs to
				const envelopeTrack = this.timelineTracks.find(t => t.id === timelineEnvelope.trackId);
				if (!envelopeTrack || envelopeTrack.type !== 'envelope') {
					// Envelope is not on an envelope track - skip it
					continue;
				}
				
				// Envelopes on envelope tracks apply globally to all tracks
				// Check pattern assignment if specified
				let shouldApply = true;
				if (timelineEnvelope.patternId) {
					// Envelope is assigned to a specific pattern
					shouldApply = patternId && timelineEnvelope.patternId === patternId;
				}
				// If no patternId, apply globally
				
				if (shouldApply) {
					const envelopeDef = this.envelopes.find(e => e.id === timelineEnvelope.envelopeId);
					if (envelopeDef) {
						this.applyEnvelope(envelopeValues, envelopeDef, currentBeat, startBeat, endBeat);
					} else {
						// Debug: Envelope definition not found (throttled to avoid spam)
						if (this.processor && this.processor.port) {
							// Track last log time per envelope ID to avoid spam
							const lastLogKey = `missing_envelope_${timelineEnvelope.envelopeId}`;
							if (!this._missingEnvelopeLogTimes) {
								this._missingEnvelopeLogTimes = {};
							}
							const lastLogTime = (this._missingEnvelopeLogTimes && this._missingEnvelopeLogTimes[lastLogKey]) ? this._missingEnvelopeLogTimes[lastLogKey] : 0;
							if (!this._missingEnvelopeLogTimes) {
								this._missingEnvelopeLogTimes = {};
							}
							
							// Only log once every 4 beats to avoid infinite loops
							if (currentBeat - lastLogTime > 4) {
								this._missingEnvelopeLogTimes[lastLogKey] = currentBeat;
								this.processor.port.postMessage({
									type: 'debug',
									message: 'Envelope definition not found',
									data: { 
										envelopeId: timelineEnvelope.envelopeId, 
										availableIds: this.envelopes.map(e => e.id),
										timelineEnvelopeTrackId: timelineEnvelope.trackId,
										timelineEnvelopePatternId: timelineEnvelope.patternId
									}
								});
							}
						}
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

		let progress = (currentBeat - startBeat) / (endBeat - startBeat); // 0-1
		const envelopeType = envelopeDef.type;

		// Check if envelope should be reversed
		const reverse = envelopeDef.settings.reverse === true;
		if (reverse) {
			progress = 1.0 - progress; // Invert progress: 0→1 becomes 1→0
		}

		// Get envelope curve value based on settings
		const value = this.calculateEnvelopeValue(progress, envelopeDef.settings, envelopeType);

		// Debug logging removed

		// Apply to appropriate parameter
		switch (envelopeType) {
		case 'volume':
			envelopeValues.volume *= value;
			break;
		case 'filter':
			envelopeValues.filter *= value;
			break;
		case 'pitch':
			// Pitch envelope: value is 0-1, map to pitch multiplier
			// The pitch shifter appears to be inverted, so we invert the value
			// 0.0 should map to 2.0x (up octave), 0.5 to 1.0x (normal), 1.0 to 0.5x (down octave)
			// So we use: invertedValue = 1.0 - value, then map that
			const invertedValue = 1.0 - value;
			let pitchMultiplier;
			if (invertedValue <= 0.5) {
				// Map 0.0-0.5 to 0.5-1.0 (down octave to normal)
				pitchMultiplier = 0.5 + (invertedValue * 1.0); // 0.0→0.5, 0.5→1.0
			} else {
				// Map 0.5-1.0 to 1.0-2.0 (normal to up octave)
				pitchMultiplier = 1.0 + ((invertedValue - 0.5) * 2.0); // 0.5→1.0, 1.0→2.0
			}
			envelopeValues.pitch *= pitchMultiplier;
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
	calculateEnvelopeValue(progress, settings, envelopeType = null) {
		// Simple linear envelope for now
		// Can be enhanced with curves, attack/decay/sustain/release, etc.
		// For pitch envelopes, default to 0.5 (normal pitch, center of range) instead of 0
		let defaultStart = 0;
		let defaultEnd = 1;
		if (envelopeType === 'pitch') {
			defaultStart = 0.5; // Default to center (normal pitch, 1.0x multiplier)
			defaultEnd = 0.5;   // Default to center (normal pitch, 1.0x multiplier)
		}
		
		// Handle undefined values - use defaults
		const startValue = (settings.startValue !== undefined && settings.startValue !== null) ? settings.startValue : defaultStart;
		const endValue = (settings.endValue !== undefined && settings.endValue !== null) ? settings.endValue : defaultEnd;
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

	/**
	 * Update performance caches to avoid expensive lookups per-sample
	 * Called periodically (every ~0.1 beats) instead of every sample
	 */
	_updateCaches(currentBeat) {
		// Clear old cache entries (keep only recent ones)
		const cacheKeysToDelete = [];
		for (const [key, cached] of this._activeEnvelopeValuesCache.entries()) {
			if (Math.abs(currentBeat - cached.beat) > this._cacheUpdateInterval * 4) {
				cacheKeysToDelete.push(key);
			}
		}
		for (const key of cacheKeysToDelete) {
			this._activeEnvelopeValuesCache.delete(key);
		}
	}
}

