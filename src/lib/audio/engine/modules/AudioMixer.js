/**
 * Handles audio mixing with per-track volume, pan, mute, solo, effects, and envelopes
 * Applies constant power panning for smooth stereo imaging
 */

/**
 * @typedef {Object} BiquadState
 * @property {number} x1
 * @property {number} x2
 * @property {number} y1
 * @property {number} y2
 */

class AudioMixer {
	/**
	 * @param {*} trackStateManager
	 * @param {*} effectsProcessor
	 * @param {*} envelopesProcessor
	 * @param {*} processor
	 */
	constructor(trackStateManager, effectsProcessor, envelopesProcessor, processor) {
		this.trackStateManager = trackStateManager;
		this.effectsProcessor = effectsProcessor;
		this.envelopesProcessor = envelopesProcessor;
		this.processor = processor; // Store reference to processor for pattern lookup
		
		// Per-track filter state for filter envelopes
		this.filterStates = new Map(); // trackId -> {x1, x2, y1, y2}
		// Per-track pitch envelope state for pitch shifting
		this.pitchStates = new Map(); // trackId -> {lastSample, phase}
		
		// Debug tracking (per-track to avoid infinite loops)
		this._lastDebugStates = new Map(); // trackId_patternId -> {muted, soloed, beat}
		
		// Performance optimization caches
		this._trackToTimelineTracks = new Map(); // trackId -> timelineTrack[]
		this._trackToPatternId = new Map(); // trackId -> patternId
		this._trackToTimelineVolume = new Map(); // trackId -> volume multiplier
		this._activeClipsCache = new Map(); // patternId -> {beat: number, clips: clip[]}
		this._lastCacheUpdateBeat = -1;
		this._cacheUpdateInterval = 0.1; // Update cache every 0.1 beats (~100ms at 120 BPM)
		this._panGainsCache = new Map(); // trackId -> {pan: number, leftGain: number, rightGain: number}

		// Cache biquad coefficients per track to avoid recompute every sample
		this._filterCoeffCache = new Map(); // trackId -> {cutoff, q, sampleRate, coeffs}
	}

	/**
	 * @param {Map<string, any>} synths
	 * @param {number} masterGain
	 * @param {number} currentBeat
	 * @param {boolean} isArrangementView
	 */
	mixSynths(synths, masterGain = 0.3, currentBeat = 0, isArrangementView = false) {
		let leftSample = 0;
		let rightSample = 0;
		
		// Update caches periodically (not every sample)
		const shouldUpdateCache = Math.abs(currentBeat - this._lastCacheUpdateBeat) >= this._cacheUpdateInterval;
		if (shouldUpdateCache) {
			this._updateCaches(isArrangementView);
			this._lastCacheUpdateBeat = currentBeat;
		}
		
		// Check if any timeline track is soloed (for arrangement view)
		let hasSoloedTimelineTrack = false;
		if (isArrangementView && this.processor && this.processor.projectManager && this.processor.projectManager.timeline && this.processor.projectManager.timeline.tracks) {
			hasSoloedTimelineTrack = this.processor.projectManager.timeline.tracks.some((t) => t.type === 'pattern' && t.solo === true);
		}
		
		const hasSoloedTrack = this.trackStateManager.hasAnySoloedTrack();
		
		for (const [trackId, synthOrVoices] of synths.entries()) {
			// Handle voice pools (polyphonic) vs single synth (monophonic)
			const isVoicePool = Array.isArray(synthOrVoices);
			const voices = isVoicePool ? synthOrVoices : [synthOrVoices];
			
			// Early mute check - skip expensive lookups if already muted (pattern view only)
			const isMuted = this.trackStateManager.isMuted(trackId);
			if (isMuted && !isArrangementView) {
				continue; // Skip muted tracks in pattern view
			}
			
			// Mix all voices for this track
			let trackSample = 0;
			for (const synth of voices) {
				if (synth && synth.process) {
					trackSample += synth.process();
				}
			}
			
			// Skip if no active voices
			if (trackSample === 0 && voices.every(v => !v || !v.isActive)) {
				continue;
			}
			
			// Use cached timeline tracks lookup
			const timelineTracks = this._trackToTimelineTracks.get(trackId) || [];
				
			// Check timeline track mute/solo state (for arrangement view)
			// For mute: Check if there's at least one active clip on a non-muted timeline track
			// For solo: Check if there's at least one active clip on a soloed timeline track
			let isTimelineMuted = false;
			let isTimelineSoloed = false;
			if (isArrangementView && timelineTracks.length > 0) {
				// Use cached pattern ID
				const patternId = this._trackToPatternId.get(trackId);
				
				// Cache timeline reference to avoid repeated property access
				const timeline = this.processor?.projectManager?.timeline;
				const timelineTracksArray = timeline?.tracks;
				
				// Use cached active clips (updated periodically)
				let activeClips = [];
				if (patternId) {
					const cached = this._activeClipsCache.get(patternId);
					if (cached && Math.abs(currentBeat - cached.beat) < this._cacheUpdateInterval * 2) {
						activeClips = cached.clips;
					} else if (timeline?.clips) {
						// Fallback: calculate if cache is stale
						activeClips = timeline.clips.filter((clip) => {
							return clip.patternId === patternId &&
							       currentBeat >= clip.startBeat &&
							       currentBeat < clip.startBeat + clip.duration;
						});
					}
					
					if (activeClips.length > 0 && timelineTracksArray) {
						// Check if all active clips are on muted timeline tracks
						const allClipsMuted = activeClips.every((clip) => {
							const clipTrack = timelineTracksArray.find((t) => t.id === clip.trackId);
							return clipTrack?.mute === true;
						});
						
						// If any timeline track is soloed, play if ANY active clip is on a soloed track
						// This allows soloed tracks to play even if other non-soloed clips are active
						if (hasSoloedTimelineTrack) {
							// Solo mode: play if ANY active clip is on a soloed track
							const hasSoloedClip = activeClips.some((clip) => {
								const clipTrack = timelineTracksArray.find((t) => t.id === clip.trackId);
								return clipTrack?.solo === true;
							});
							isTimelineSoloed = hasSoloedClip;
						} else {
							// No solo mode: check if any active clip is on a soloed timeline track (shouldn't happen, but for safety)
							const hasSoloedClip = activeClips.some((clip) => {
								const clipTrack = timelineTracksArray.find((t) => t.id === clip.trackId);
								return clipTrack?.solo === true;
							});
							isTimelineSoloed = hasSoloedClip;
						}
						
						isTimelineMuted = allClipsMuted;
						
						// Debug: Log mute/solo decision for this track (track-specific, throttled)
						const debugKey = `${trackId}_${patternId}`;
						const lastDebugState = (this._lastDebugStates) ? this._lastDebugStates.get(debugKey) : null;
						const stateChanged = !lastDebugState || 
						                    lastDebugState.muted !== isTimelineMuted || 
						                    lastDebugState.soloed !== isTimelineSoloed ||
						                    (currentBeat - lastDebugState.beat) > 1.0; // Log at most once per beat per track
						
						if (stateChanged) {
							if (!this._lastDebugStates) {
								this._lastDebugStates = new Map();
							}
							this._lastDebugStates.set(debugKey, {
								muted: isTimelineMuted,
								soloed: isTimelineSoloed,
								beat: currentBeat
							});
							
							const clipInfo = activeClips.map((clip) => {
								const clipTrack = timelineTracksArray?.find((t) => t.id === clip.trackId);
								return {
									clipId: clip.id,
									trackId: clip.trackId,
									trackName: clipTrack?.name || 'unknown',
									mute: clipTrack?.mute || false,
									solo: clipTrack?.solo || false,
									startBeat: clip.startBeat,
									duration: clip.duration,
									clipEndBeat: clip.startBeat + clip.duration
								};
							});
							
						}
					} else {
						// No active clips - mute this audio track
						isTimelineMuted = true;
					}
				} else {
					// Fallback: If any timeline track is muted, mute this audio track
					isTimelineMuted = timelineTracks.some((t) => t.mute === true);
					// If any timeline track is soloed, this audio track is soloed
					isTimelineSoloed = timelineTracks.some((t) => t.solo === true);
				}
			}
			
			// Get solo state (isMuted already declared above)
			const isSoloed = this.trackStateManager.isSoloed(trackId);
			
			// Combine mute states: muted if audio track is muted OR any timeline track is muted
			const shouldMute = isMuted || isTimelineMuted;
			
			// Skip if muted
			if (shouldMute) continue;
			
			// Solo logic: if any timeline track is soloed, only play if this audio track belongs to a soloed timeline track
			// Otherwise, use audio track solo state
			if (isArrangementView && hasSoloedTimelineTrack) {
				if (!isTimelineSoloed) continue;
			} else if (hasSoloedTrack && !isSoloed) {
				continue;
			}
			
			// Get base track volume and pan
			let trackVolume = this.trackStateManager.getVolume(trackId);
			let trackPan = this.trackStateManager.getPan(trackId);
			
			// Apply cached timeline track volume
			const timelineVolume = this._trackToTimelineVolume.get(trackId);
			if (timelineVolume !== undefined) {
				trackVolume *= timelineVolume;
			}
			
			// Use cached pattern ID
			let patternId = this._trackToPatternId.get(trackId);
			// Fallback: check if first voice has a stored patternId (from event)
			if (!patternId && voices[0] && voices[0]._patternId) {
				patternId = voices[0]._patternId;
			}
			
			// Get envelope values for this track at current position
			// Initialize with default values
			let envelopeValues = {
				volume: 1.0,
				filter: 1.0,
				pitch: 1.0,
				pan: 0.0
			};
			
			if (this.envelopesProcessor) {
				envelopeValues = this.envelopesProcessor.getActiveEnvelopeValues(
					trackId,
					currentBeat,
					isArrangementView
				);

				// Apply envelope values
				trackVolume *= envelopeValues.volume;
				trackPan += envelopeValues.pan;
				trackPan = Math.max(-1, Math.min(1, trackPan)); // Clamp pan
			}
			
			// Use the mixed track sample (already calculated above)
			let synthSample = trackSample;
			
			// Apply filter envelope (if active)
			if (envelopeValues.filter !== 1.0) {
					// Filter envelope modulates filter cutoff
					// envelopeValues.filter is 0-1, map to cutoff frequency
					// Lower filter value = lower cutoff (darker sound)
					const baseCutoff = 20000; // Full frequency range
					const cutoff = baseCutoff * envelopeValues.filter;
					
					// Initialize filter state if needed
					if (!this.filterStates.has(trackId)) {
						this.filterStates.set(trackId, { x1: 0, x2: 0, y1: 0, y2: 0 });
					}
					const filterState = this.filterStates.get(trackId);
					
					// Apply simple lowpass filter
					synthSample = this.applyLowpassFilter(synthSample, cutoff, 0.5, filterState, trackId);
					
				}
			
			// Apply pitch envelope (if active)
			if (envelopeValues.pitch !== 1.0) {
					// Pitch envelope modulates pitch
					// envelopeValues.pitch is a multiplier (0.5 = down octave, 2.0 = up octave)
					// Apply as simple frequency modulation
					synthSample = this.applyPitchShift(synthSample, envelopeValues.pitch, trackId);
					
				}
			
			// Apply effects to this track's audio
			if (this.effectsProcessor) {
				
				const activeEffects = this.effectsProcessor.getActiveEffects(
					trackId,
					currentBeat,
					isArrangementView
				);
				
				
				synthSample = this.effectsProcessor.processSample(synthSample, activeEffects);
			}
				
			// Apply track volume
			synthSample *= trackVolume;
			
			// Pan calculation using constant power panning
			// -1 = full left, 0 = center, 1 = full right
			// This maintains constant perceived volume across the pan range
			// Cache pan calculations per track to avoid recalculating every sample
			let panGains = this._panGainsCache?.get(trackId);
			if (!this._panGainsCache) {
				this._panGainsCache = new Map();
			}
			if (!panGains || panGains.pan !== trackPan) {
				const panRadians = (trackPan + 1) * (Math.PI / 4); // Map -1..1 to 0..π/2
				panGains = {
					pan: trackPan,
					leftGain: Math.cos(panRadians),
					rightGain: Math.sin(panRadians)
				};
				this._panGainsCache.set(trackId, panGains);
			}
			
			leftSample += synthSample * panGains.leftGain;
			rightSample += synthSample * panGains.rightGain;
		}

		return {
			left: leftSample * masterGain,
			right: rightSample * masterGain,
			mono: (leftSample + rightSample) * 0.5 * masterGain
		};
	}

	/**
	 * Clear all performance caches (call when project changes)
	 */
	clearCaches() {
		this._trackToTimelineTracks.clear();
		this._trackToPatternId.clear();
		this._trackToTimelineVolume.clear();
		this._activeClipsCache.clear();
		this._lastCacheUpdateBeat = -1;
		if (this._panGainsCache) {
			this._panGainsCache.clear();
		}
	}

	/**
	 * Update performance caches to avoid expensive lookups per-sample
	 * Called periodically (every ~0.1 beats) instead of every sample
	 */
	/**
	 * @param {boolean} isArrangementView
	 */
	_updateCaches(isArrangementView) {
		// Clear old caches
		this._trackToTimelineTracks.clear();
		this._trackToPatternId.clear();
		this._trackToTimelineVolume.clear();
		
		if (!this.processor || !this.processor.projectManager) {
			return;
		}
		
		const projectManager = this.processor.projectManager;
		const synths = this.processor.synthManager.getAllSynths();
		const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
		
		// Build reverse lookup: audioTrackId -> timelineTracks[]
		if (isArrangementView && projectManager.timelineTrackToAudioTracks) {
			for (const [timelineTrackId, audioTrackIds] of projectManager.timelineTrackToAudioTracks.entries()) {
				const timeline = projectManager.timeline;
				const timelineTrack = (timeline && timeline.tracks) ? timeline.tracks.find((t) => t.id === timelineTrackId) : null;
				if (timelineTrack && timelineTrack.type === 'pattern') {
					for (const audioTrackId of audioTrackIds) {
						if (!this._trackToTimelineTracks.has(audioTrackId)) {
							this._trackToTimelineTracks.set(audioTrackId, []);
						}
						this._trackToTimelineTracks.get(audioTrackId).push(timelineTrack);
					}
				}
			}
		}
		
		// Build trackId -> patternId map and trackId -> timelineVolume map
		for (const [trackId] of synths.entries()) {
			// Extract pattern ID from track ID
			let patternId = null;
			if (trackId && trackId.startsWith('__pattern_')) {
				const patternPrefix = '__pattern_';
				const afterPrefix = trackId.substring(patternPrefix.length);
				const uuidMatch = afterPrefix.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
				if (uuidMatch) {
					patternId = uuidMatch[1];
					this._trackToPatternId.set(trackId, patternId);
				}
			} else if (projectManager.patternToTrackId) {
				// Reverse lookup: find pattern ID for this track ID
				for (const [pid, tid] of projectManager.patternToTrackId.entries()) {
					if (tid === trackId) {
						patternId = pid;
						this._trackToPatternId.set(trackId, patternId);
						break;
					}
				}
			}
			
			// Build timeline volume cache
			if (isArrangementView && projectManager.timelineTrackToAudioTracks) {
				for (const [timelineTrackId, audioTrackIds] of projectManager.timelineTrackToAudioTracks.entries()) {
					if (audioTrackIds.includes(trackId)) {
						const timeline = projectManager.timeline;
						const timelineTrack = (timeline && timeline.tracks) ? timeline.tracks.find((t) => t.id === timelineTrackId) : null;
						if (timelineTrack && timelineTrack.volume !== undefined) {
							this._trackToTimelineVolume.set(trackId, timelineTrack.volume);
						}
						break;
					}
				}
			}
		}
		
		// Cache active clips per pattern (for current beat)
		if (isArrangementView && projectManager.timeline && projectManager.timeline.clips) {
			this._activeClipsCache.clear();
			const allPatternIds = new Set(this._trackToPatternId.values());
			
			for (const patternId of allPatternIds) {
				const activeClips = projectManager.timeline.clips.filter((clip) => {
					return clip.patternId === patternId &&
					       currentBeat >= clip.startBeat &&
					       currentBeat < clip.startBeat + clip.duration;
				});
				
				if (activeClips.length > 0) {
					this._activeClipsCache.set(patternId, {
						beat: currentBeat,
						clips: activeClips
					});
				}
			}
		}
	}

	/**
	 * Apply a simple lowpass filter
	 * @param {number} input - Input sample
	 * @param {number} cutoff - Cutoff frequency in Hz
	 * @param {number} resonance - Resonance (0-1)
	 * @param {BiquadState} state - Filter state {x1, x2, y1, y2}
	 * @param {string} trackId - Track ID for coeff caching
	 * @returns {number} Filtered sample
	 */
	applyLowpassFilter(input, cutoff, resonance, state, trackId) {
		const sampleRate = this.processor ? this.processor.sampleRate : 44100;

		// Clamp cutoff to safe audible range to avoid extreme sub-lows
		const clampedCutoff = Math.max(20, Math.min(20000, cutoff));

		// Retrieve cached coeffs
		let cache = this._filterCoeffCache.get(trackId);
		if (!cache || cache.cutoff !== clampedCutoff || cache.q !== resonance || cache.sampleRate !== sampleRate) {
			const c = 1.0 / Math.tan(Math.PI * clampedCutoff / sampleRate);
			const a1 = 1.0 / (1.0 + resonance * c + c * c);
			cache = {
				cutoff: clampedCutoff,
				q: resonance,
				sampleRate,
				coeffs: {
					a1: a1,
					a2: 2 * a1,
					a3: a1,
					b1: 2.0 * (1.0 - c * c) * a1,
					b2: (1.0 - resonance * c + c * c) * a1
				}
			};
			this._filterCoeffCache.set(trackId, cache);
		}

		const coeffs = cache.coeffs;
		let output = coeffs.a1 * input + coeffs.a2 * state.x1 + coeffs.a3 * state.x2
			- coeffs.b1 * state.y1 - coeffs.b2 * state.y2;

		// Flush denormals to zero
		output = this._flushDenormals(output);
		state.x2 = this._flushDenormals(state.x1);
		state.x1 = this._flushDenormals(input);
		state.y2 = this._flushDenormals(state.y1);
		state.y1 = output;

		return output;
	}

	/**
	 * Flush extremely small float values to zero to avoid denormals/subnormals
	 */
	_flushDenormals(x) {
		return (x > -1e-20 && x < 1e-20) ? 0 : x;
	}

	/**
	 * Apply pitch shift using delay buffer with variable read speed
	 * @param {number} input - Input sample
	 * @param {number} pitchMultiplier - Pitch multiplier (1.0 = no change, 2.0 = up octave, 0.5 = down octave)
	 * @param {string} trackId - Track ID for state management
	 * @returns {number} Pitch-shifted sample
	 */
	applyPitchShift(input, pitchMultiplier, trackId) {
		// Clamp pitch multiplier to reasonable range (0.25 to 4.0 = 2 octaves down/up)
		const clampedMultiplier = Math.max(0.25, Math.min(4.0, pitchMultiplier));
		
		// If multiplier is exactly 1.0, no pitch change needed
		if (Math.abs(clampedMultiplier - 1.0) < 0.001) {
			return input;
		}
		
		// Initialize pitch state if needed
		if (!this.pitchStates.has(trackId)) {
			const bufferSize = 4096; // Larger buffer for better quality
			this.pitchStates.set(trackId, { 
				buffer: new Float32Array(bufferSize),
				writeIndex: 0,
				readIndex: 0,
				readPhase: 0, // Fractional part for interpolation
				bufferSize: bufferSize,
				initialized: false
			});
		}
		const pitchState = this.pitchStates.get(trackId);
		
		// Write current sample to buffer
		pitchState.buffer[pitchState.writeIndex] = input;
		pitchState.writeIndex = (pitchState.writeIndex + 1) % pitchState.bufferSize;
		
		// Wait for buffer to fill before reading (need at least half buffer for proper shifting)
		if (!pitchState.initialized) {
			if (pitchState.writeIndex < pitchState.bufferSize / 2) {
				return input; // Return original until buffer is ready
			}
			pitchState.initialized = true;
			// Initialize read index to be behind write index
			pitchState.readIndex = (pitchState.writeIndex - pitchState.bufferSize / 2 + pitchState.bufferSize) % pitchState.bufferSize;
			pitchState.readPhase = 0;
		}
		
		// Calculate read step based on pitch multiplier
		// pitchMultiplier > 1 = read faster (higher pitch) = step < 1
		// pitchMultiplier < 1 = read slower (lower pitch) = step > 1
		const readStep = 1.0 / clampedMultiplier;
		
		// Update read position
		pitchState.readPhase += readStep;
		
		// When readPhase >= 1, advance readIndex
		while (pitchState.readPhase >= 1.0) {
			pitchState.readIndex = (pitchState.readIndex + 1) % pitchState.bufferSize;
			pitchState.readPhase -= 1.0;
		}
		
		// Read from buffer with linear interpolation
		const index1 = pitchState.readIndex;
		const index2 = (pitchState.readIndex + 1) % pitchState.bufferSize;
		const frac = pitchState.readPhase;
		
		const sample1 = pitchState.buffer[index1];
		const sample2 = pitchState.buffer[index2];
		const output = sample1 * (1 - frac) + sample2 * frac;
		
		// Prevent read index from catching up to write index (would cause glitches)
		const distance = (pitchState.writeIndex - pitchState.readIndex + pitchState.bufferSize) % pitchState.bufferSize;
		if (distance < 128 || distance > pitchState.bufferSize - 128) {
			// Too close or too far, reset read position to maintain safe distance
			pitchState.readIndex = (pitchState.writeIndex - pitchState.bufferSize / 2 + pitchState.bufferSize) % pitchState.bufferSize;
			pitchState.readPhase = 0;
		}
		
		// Smooth the output to reduce crackling
		// Use a simple one-pole lowpass filter on the output
		if (!pitchState.lastOutput) {
			pitchState.lastOutput = output;
		}
		const smoothed = pitchState.lastOutput * 0.7 + output * 0.3;
		pitchState.lastOutput = smoothed;
		
		return smoothed;
	}
}

