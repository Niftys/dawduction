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
		this.sampleBuffers = new Map(); // Store sample buffers by trackId
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
				
				// Add BPM to settings so synths can scale envelope parameters
				if (this.processor.playbackController) {
					const bpm = this.processor.playbackController.getBPM();
					if (bpm) {
						settings.bpm = bpm;
					}
				}
				
				synth = this.processor.synthFactory.create(instrumentType, settings);
				if (synth) {
					this.synths.set(trackId, synth);
					// Store patternId with synth for effects/envelopes lookup
					if (patternId) {
						synth._patternId = patternId;
					}
					// If there's a stored sample buffer for this track, set it on the synth
					const storedBuffer = this.sampleBuffers.get(trackId);
					if (storedBuffer && synth.setAudioBuffer) {
						synth.setAudioBuffer(storedBuffer);
					}
					// Debug: Log synth creation
					this.processor.port.postMessage({
						type: 'debug',
						message: 'SynthManager: Created synth',
						data: {
							trackId,
							patternId: patternId || 'none',
							instrumentType: instrumentType,
							totalSynths: this.synths.size,
							hasSampleBuffer: !!storedBuffer
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
	 * @param {number} duration - Optional note duration in beats
	 */
	triggerNote(trackId, velocity, pitch, patternId = null, duration = null) {
		const synth = this.getOrCreateSynth(trackId, patternId);
		if (synth && synth.trigger) {
			// Update synth settings with current BPM if available
			if (this.processor.playbackController) {
				const bpm = this.processor.playbackController.getBPM();
				if (bpm && synth.updateSettings) {
					synth.updateSettings({ bpm });
				}
			}
			
			// Debug: Log synth trigger (disabled for cleaner logs)
			// this.processor.port.postMessage({
			// 	type: 'debug',
			// 	message: 'SynthManager: Triggering note',
			// 	data: {
			// 		trackId,
			// 		patternId: patternId || 'none',
			// 		velocity,
			// 		pitch,
			// 		duration,
			// 		synthExists: !!synth,
			// 		hasTrigger: !!synth.trigger,
			// 		totalSynths: this.synths.size
			// 	}
			// });
			synth.trigger(velocity, pitch, duration);
		}
	}

	/**
	 * Get all synths (for mixing)
	 * @returns {Map} Map of trackId -> synth instance
	 */
	getAllSynths() {
		return this.synths;
	}

	/**
	 * Stop all active synths (set isActive to false)
	 * Useful for pattern editor mode where we want to stop all sounds when stopping playback
	 */
	stopAllSynths() {
		for (const synth of this.synths.values()) {
			if (synth && synth.isActive !== undefined) {
				synth.isActive = false;
			}
		}
	}

	/**
	 * Check if any synths are currently active
	 * @returns {boolean} True if any synth is active
	 */
	hasActiveSynths() {
		for (const synth of this.synths.values()) {
			if (synth && synth.isActive === true) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Load a sample buffer for a track
	 * @param {string} trackId - The track ID
	 * @param {Float32Array} buffer - The audio buffer
	 * @param {number} sampleRate - The sample rate
	 */
	loadSample(trackId, buffer, sampleRate) {
		// Store the buffer
		this.sampleBuffers.set(trackId, buffer);
		
		// If a synth already exists for this track, update its buffer
		const synth = this.synths.get(trackId);
		if (synth && synth.setAudioBuffer) {
			synth.setAudioBuffer(buffer);
		}
	}
}

