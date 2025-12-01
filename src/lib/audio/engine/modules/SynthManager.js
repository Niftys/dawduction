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
		this.voicePools = new Map(); // Map of trackId -> array of synth voices for polyphony
		this.maxVoices = 8; // Maximum number of simultaneous voices per track
	}
	
	/**
	 * Get base meter for a track
	 * @param {string} trackId - The track ID
	 * @returns {number} Base meter (default: 4)
	 */
	getBaseMeterForTrack(trackId) {
		const track = this.processor.projectManager.getTrack(trackId);
		if (!track) return 4;
		
		// Check if this is a pattern instrument (ID starts with __pattern_)
		if (track.id && track.id.startsWith('__pattern_')) {
			const lastUnderscore = track.id.lastIndexOf('_');
			if (lastUnderscore > '__pattern_'.length) {
				const patternId = track.id.substring('__pattern_'.length, lastUnderscore);
				const patterns = this.processor.projectManager.patterns;
				const pattern = (patterns) ? patterns.find(p => p.id === patternId) : null;
				if (pattern) {
					return pattern.baseMeter || 4;
				}
			}
		}
		
		// Default fallback
		return 4;
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
				}
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
		// Stop all active voices before removing (if using voice pool)
		if (this.voicePools.has(trackId)) {
			const voicePool = this.voicePools.get(trackId);
			for (const voice of voicePool) {
				if (voice && voice.release) {
					voice.release();
				} else if (voice && voice.stop) {
					voice.stop();
				}
			}
			this.voicePools.delete(trackId);
		}
		
		// Stop the main synth if it exists
		const synth = this.synths.get(trackId);
		if (synth) {
			if (synth.release) {
				synth.release();
			} else if (synth.stop) {
				synth.stop();
			} else if (synth.stopAllVoices) {
				synth.stopAllVoices();
			}
		}
		
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
		// Add BPM to settings if available
		if (this.processor.playbackController) {
			const bpm = this.processor.playbackController.getBPM();
			if (bpm) {
				settings.bpm = bpm;
			}
		}
		
		// Update main synth if it exists
		const synth = this.synths.get(trackId);
		if (synth && synth.updateSettings) {
			synth.updateSettings(settings);
		}
		
		// Also update all voices in the voice pool (for polyphonic synths with overlap)
		if (this.voicePools.has(trackId)) {
			const voicePool = this.voicePools.get(trackId);
			for (const voice of voicePool) {
				if (voice && voice.updateSettings) {
					voice.updateSettings(settings);
				}
			}
		}
	}

	/**
	 * Trigger a note on a synth
	 * @param {string} trackId - The track ID
	 * @param {number} velocity - Note velocity
	 * @param {number} pitch - Note pitch
	 * @param {string} patternId - Optional pattern ID from event
	 * @param {number} duration - Optional note duration in beats
	 * @param {number|null} eventChoke - DEPRECATED: Choke functionality removed
	 */
	triggerNote(trackId, velocity, pitch, patternId = null, duration = null, eventChoke = null) {
		const track = this.processor.projectManager.getTrack(trackId);
		if (!track) {
			return;
		}
		
		// Always use polyphonic voices (overlap always enabled)
		{
			// Get or create voice pool for this track
			if (!this.voicePools.has(trackId)) {
				this.voicePools.set(trackId, []);
			}
			const voicePool = this.voicePools.get(trackId);
			
			// Find an inactive voice or create a new one
			let voice = voicePool.find(v => !v.isActive);
			
			if (!voice && voicePool.length < this.maxVoices) {
				// Create a new voice
				const settings = Object.assign({}, track.settings || {}, track.instrumentSettings || {});
				if (this.processor.playbackController) {
					const bpm = this.processor.playbackController.getBPM();
					if (bpm) {
						settings.bpm = bpm;
					}
				}
				voice = this.processor.synthFactory.create(track.instrumentType, settings);
				if (voice) {
					// Set sample buffer if available
					const storedBuffer = this.sampleBuffers.get(trackId);
					if (storedBuffer && voice.setAudioBuffer) {
						voice.setAudioBuffer(storedBuffer);
					}
					voicePool.push(voice);
				}
			}
			
			// If no voice available, use the oldest active voice (steal it)
			// OR if pool is empty and we couldn't create one, try to create one anyway (shouldn't happen, but safety check)
			if (!voice) {
				if (voicePool.length > 0) {
					voice = voicePool[0]; // Use first voice (oldest)
				} else {
					// Pool is empty and we couldn't create one - try one more time
					// This shouldn't happen, but ensures we always have a voice if possible
					const settings = Object.assign({}, track.settings || {}, track.instrumentSettings || {});
					if (this.processor.playbackController) {
						const bpm = this.processor.playbackController.getBPM();
						if (bpm) {
							settings.bpm = bpm;
						}
					}
					voice = this.processor.synthFactory.create(track.instrumentType, settings);
					if (voice) {
						const storedBuffer = this.sampleBuffers.get(trackId);
						if (storedBuffer && voice.setAudioBuffer) {
							voice.setAudioBuffer(storedBuffer);
						}
						voicePool.push(voice);
					}
				}
			}
			
			if (voice && voice.trigger) {
				// Update settings with current BPM
				if (this.processor.playbackController) {
					const bpm = this.processor.playbackController.getBPM();
					if (bpm && voice.updateSettings) {
						voice.updateSettings({ bpm });
					}
				}
				voice.trigger(velocity, pitch, duration);
			}
		}
	}

	/**
	 * Get all synths (for mixing)
	 * @returns {Map} Map of trackId -> synth instance or array of voices
	 */
	getAllSynths() {
		const allSynths = new Map();
		
		// Always use voice pools (polyphonic with overlap)
		for (const [trackId, voicePool] of this.voicePools.entries()) {
			// Mix all active voices together
			allSynths.set(trackId, voicePool);
		}
		
		return allSynths;
	}

	/**
	 * Stop all active synths (set isActive to false)
	 * Useful for pattern editor mode where we want to stop all sounds when stopping playback
	 */
	stopAllSynths() {
		// Stop regular synths
		for (const synth of this.synths.values()) {
			if (synth && synth.isActive !== undefined) {
				synth.isActive = false;
			}
		}
		// Stop all voices in voice pools
		for (const voicePool of this.voicePools.values()) {
			for (const voice of voicePool) {
				if (voice && voice.isActive !== undefined) {
					voice.isActive = false;
				}
			}
		}
	}

	/**
	 * Check if any synths are currently active
	 * @returns {boolean} True if any synth is active
	 */
	hasActiveSynths() {
		// Check regular synths
		for (const synth of this.synths.values()) {
			if (synth && synth.isActive === true) {
				return true;
			}
		}
		// Check voice pools
		for (const voicePool of this.voicePools.values()) {
			for (const voice of voicePool) {
				if (voice && voice.isActive === true) {
					return true;
				}
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

