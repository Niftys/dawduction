/**
 * Manages synth instances lifecycle
 * Handles creation, retrieval, and cleanup of synth instances per track
 */

/**
 * Manages synth instances for instruments
 * 
 * TERMINOLOGY: trackId here refers to an INSTRUMENT ID (legacy naming).
 * Instruments are the generated synths that play audio.
 */
class SynthManager {
	constructor(processor) {
		this.processor = processor;
		this.synths = new Map();
	}

	/**
	 * Get or create a synth for an instrument
	 * @param {string} trackId - The instrument ID (legacy name: "trackId")
	 * @param {string} patternId - Optional pattern ID (for effects/envelopes)
	 * @returns {Object|null} The synth instance or null if instrument not found
	 */
	getOrCreateSynth(trackId, patternId = null) {
		let synth = this.synths.get(trackId);
		if (!synth) {
			const track = this.processor.projectManager.getTrack(trackId);
			if (track) {
				// Ensure instrumentType is set - use track's instrumentType or try to get from pattern
				let instrumentType = track.instrumentType;
				if (!instrumentType || instrumentType === '') {
					// Try to get from pattern if patternId is available
					if (patternId && this.processor.projectManager.patternToTrackId) {
						// Could look up pattern, but for now use a default
						instrumentType = 'kick'; // Default fallback
					} else {
						instrumentType = 'kick'; // Default fallback
					}
				}
				
				// Merge settings - use track settings and instrumentSettings
				const settings = Object.assign({}, track.settings || {}, track.instrumentSettings || {});
				
				synth = this.processor.synthFactory.create(instrumentType, settings);
				if (synth) {
					this.synths.set(trackId, synth);
					// Store patternId with synth for effects/envelopes lookup
					if (patternId) {
						synth._patternId = patternId;
					}
					// Debug: Log synth creation
					this.processor.port.postMessage({
						type: 'debug',
						message: 'SynthManager: Created synth',
						data: {
							trackId,
							patternId: patternId || 'none',
							instrumentType: instrumentType,
							totalSynths: this.synths.size
						}
					});
				} else {
					// Debug: Log synth creation failure
					this.processor.port.postMessage({
						type: 'debug',
						message: 'SynthManager: Failed to create synth',
						data: {
							trackId,
							patternId: patternId || 'none',
							instrumentType: instrumentType,
							settings: settings,
							trackInstrumentType: track.instrumentType,
							trackSettings: track.settings,
							trackInstrumentSettings: track.instrumentSettings
						}
					});
				}
			} else {
				// Debug: Log track not found
				this.processor.port.postMessage({
					type: 'debug',
					message: 'SynthManager: Track not found',
					data: {
						trackId,
						patternId: patternId || 'none',
						availableTracks: (this.processor.projectManager.tracks) ? this.processor.projectManager.tracks.map(t => ({ id: t.id, instrumentType: t.instrumentType })) : []
					}
				});
			}
		} else if (patternId && !synth._patternId) {
			// Update patternId if not set
			synth._patternId = patternId;
		}
		return synth;
	}

	/**
	 * Get an existing synth instance
	 * @param {string} trackId - The track ID
	 * @returns {Object|undefined} The synth instance or undefined
	 */
	getSynth(trackId) {
		return this.synths.get(trackId);
	}

	/**
	 * Remove a synth instance
	 * @param {string} trackId - The track ID
	 */
	removeSynth(trackId) {
		this.synths.delete(trackId);
	}

	/**
	 * Clear all synth instances
	 */
	clear() {
		this.synths.clear();
	}

	/**
	 * Update settings for a synth
	 * @param {string} trackId - The track ID
	 * @param {Object} settings - Settings to update
	 */
	updateSynthSettings(trackId, settings) {
		const synth = this.synths.get(trackId);
		if (synth && synth.updateSettings) {
			synth.updateSettings(settings);
		}
	}

	/**
	 * Trigger a note on a synth
	 * @param {string} trackId - The track ID
	 * @param {number} velocity - Note velocity
	 * @param {number} pitch - Note pitch
	 * @param {string} patternId - Optional pattern ID from event
	 */
	triggerNote(trackId, velocity, pitch, patternId = null) {
		const synth = this.getOrCreateSynth(trackId, patternId);
		if (synth && synth.trigger) {
			// Debug: Log synth trigger (disabled for cleaner logs)
			// this.processor.port.postMessage({
			// 	type: 'debug',
			// 	message: 'SynthManager: Triggering note',
			// 	data: {
			// 		trackId,
			// 		patternId: patternId || 'none',
			// 		velocity,
			// 		pitch,
			// 		synthExists: !!synth,
			// 		hasTrigger: !!synth.trigger,
			// 		totalSynths: this.synths.size
			// 	}
			// });
			synth.trigger(velocity, pitch);
		}
	}

	/**
	 * Get all synths (for mixing)
	 * @returns {Map} Map of trackId -> synth instance
	 */
	getAllSynths() {
		return this.synths;
	}
}

