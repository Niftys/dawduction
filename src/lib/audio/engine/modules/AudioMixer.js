/**
 * Handles audio mixing with per-track volume, pan, mute, solo, effects, and envelopes
 * Applies constant power panning for smooth stereo imaging
 */

class AudioMixer {
	constructor(trackStateManager, effectsProcessor, envelopesProcessor, processor) {
		this.trackStateManager = trackStateManager;
		this.effectsProcessor = effectsProcessor;
		this.envelopesProcessor = envelopesProcessor;
		this.processor = processor; // Store reference to processor for pattern lookup
		
		// Per-track filter state for filter envelopes
		this.filterStates = new Map(); // trackId -> {x1, x2, y1, y2}
		// Per-track pitch envelope state for pitch shifting
		this.pitchStates = new Map(); // trackId -> {lastSample, phase}
	}

	mixSynths(synths, masterGain = 0.3, currentBeat = 0, isArrangementView = false) {
		let leftSample = 0;
		let rightSample = 0;
		
		const hasSoloedTrack = this.trackStateManager.hasAnySoloedTrack();
		
		for (const [trackId, synth] of synths.entries()) {
			if (synth.process) {
				const isMuted = this.trackStateManager.isMuted(trackId);
				const isSoloed = this.trackStateManager.isSoloed(trackId);
				
				// Skip if muted
				if (isMuted) continue;
				
				// If any track is soloed, only process soloed tracks
				if (hasSoloedTrack && !isSoloed) continue;
				
				// Get base track volume and pan
				let trackVolume = this.trackStateManager.getVolume(trackId);
				let trackPan = this.trackStateManager.getPan(trackId);
				
				// Apply timeline track volume if this audio track belongs to a timeline track
				if (this.processor && this.processor.projectManager && this.processor.projectManager.timelineTrackToAudioTracks) {
					for (const [timelineTrackId, audioTrackIds] of this.processor.projectManager.timelineTrackToAudioTracks.entries()) {
						if (audioTrackIds.includes(trackId)) {
							// This audio track belongs to a timeline track, apply timeline track volume
							const timelineTrack = this.processor.projectManager.timeline?.tracks?.find((t) => t.id === timelineTrackId);
							if (timelineTrack && timelineTrack.volume !== undefined) {
								trackVolume *= timelineTrack.volume;
							}
							break;
						}
					}
				}
				
				// Get pattern ID from track ID (if it's a pattern track)
				// Track ID format: __pattern_{patternId}_{instrumentId}
				// Also check processor's patternToTrackId map for reverse lookup
				// And check if synth has a stored patternId
				let patternId = null;
				if (trackId && trackId.startsWith('__pattern_')) {
					// Extract pattern ID: __pattern_{patternId}_{instrumentId}
					// Pattern ID is the UUID immediately after '__pattern_'
					// UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
					const patternPrefix = '__pattern_';
					const afterPrefix = trackId.substring(patternPrefix.length);
					const uuidMatch = afterPrefix.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
					if (uuidMatch) {
						patternId = uuidMatch[1];
					}
				} else if (this.processor && this.processor.projectManager && this.processor.projectManager.patternToTrackId) {
					// Reverse lookup: find pattern ID for this track ID
					for (const [pid, tid] of this.processor.projectManager.patternToTrackId.entries()) {
						if (tid === trackId) {
							patternId = pid;
							break;
						}
					}
				}
				// Also check if synth has a stored patternId (from event)
				if (!patternId && synth._patternId) {
					patternId = synth._patternId;
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
						isArrangementView,
						patternId
					);
					
					// Apply envelope values
					trackVolume *= envelopeValues.volume;
					trackPan += envelopeValues.pan;
					trackPan = Math.max(-1, Math.min(1, trackPan)); // Clamp pan
				}
				
				// Get synth sample
				let synthSample = synth.process();
				
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
					synthSample = this.applyLowpassFilter(synthSample, cutoff, 0.5, filterState);
					
					// Debug: Log filter envelope application (occasionally)
					if (this.processor && this.processor.port && (!this._lastFilterLog || (currentBeat - this._lastFilterLog) > 4)) {
						this._lastFilterLog = currentBeat;
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Filter envelope being applied',
							data: {
								trackId,
								patternId,
								currentBeat: currentBeat.toFixed(2),
								filterValue: envelopeValues.filter.toFixed(3),
								cutoff: cutoff.toFixed(0)
							}
						});
					}
				}
				
				// Apply pitch envelope (if active)
				if (envelopeValues.pitch !== 1.0) {
					// Pitch envelope modulates pitch
					// envelopeValues.pitch is a multiplier (0.5 = down octave, 2.0 = up octave)
					// Apply as simple frequency modulation
					synthSample = this.applyPitchShift(synthSample, envelopeValues.pitch, trackId);
					
					// Debug: Log pitch envelope application (occasionally)
					if (this.processor && this.processor.port && (!this._lastPitchLog || (currentBeat - this._lastPitchLog) > 4)) {
						this._lastPitchLog = currentBeat;
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Pitch envelope being applied',
							data: {
								trackId,
								patternId,
								currentBeat: currentBeat.toFixed(2),
								pitchMultiplier: envelopeValues.pitch.toFixed(3)
							}
						});
					}
				}
				
				// Apply effects to this track's audio
				if (this.effectsProcessor) {
					// Debug: Log that we're checking for effects (occasionally)
					if (this.processor && this.processor.port && (!this._lastEffectCheckLog || (currentBeat - this._lastEffectCheckLog) > 4)) {
						this._lastEffectCheckLog = currentBeat;
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Checking for effects',
							data: {
								trackId,
								patternId,
								currentBeat: currentBeat.toFixed(2),
								isArrangementView
							}
						});
					}
					
					const activeEffects = this.effectsProcessor.getActiveEffects(
						trackId,
						currentBeat,
						isArrangementView,
						patternId
					);
					
					// Debug: Log when effects are found (occasionally to avoid spam)
					if (activeEffects && activeEffects.length > 0 && this.processor && this.processor.port) {
						// Only log occasionally to avoid console spam
						if (!this._lastEffectLogTime || (currentBeat - this._lastEffectLogTime) > 4) {
							this._lastEffectLogTime = currentBeat;
							this.processor.port.postMessage({
								type: 'debug',
								message: 'Effects being applied',
								data: {
									trackId,
									patternId,
									currentBeat: currentBeat.toFixed(2),
									activeEffectsCount: activeEffects.length,
									effectTypes: activeEffects.map(e => e.type)
								}
							});
						}
					}
					
					synthSample = this.effectsProcessor.processSample(synthSample, activeEffects);
				}
				
				// Apply track volume
				synthSample *= trackVolume;
				
				// Pan calculation using constant power panning
				// -1 = full left, 0 = center, 1 = full right
				// This maintains constant perceived volume across the pan range
				const panRadians = (trackPan + 1) * (Math.PI / 4); // Map -1..1 to 0..π/2
				const leftGain = Math.cos(panRadians);
				const rightGain = Math.sin(panRadians);
				
				leftSample += synthSample * leftGain;
				rightSample += synthSample * rightGain;
			}
		}

		return {
			left: leftSample * masterGain,
			right: rightSample * masterGain,
			mono: (leftSample + rightSample) * 0.5 * masterGain
		};
	}

	/**
	 * Apply a simple lowpass filter
	 * @param {number} input - Input sample
	 * @param {number} cutoff - Cutoff frequency in Hz
	 * @param {number} resonance - Resonance (0-1)
	 * @param {Object} state - Filter state {x1, x2, y1, y2}
	 * @returns {number} Filtered sample
	 */
	applyLowpassFilter(input, cutoff, resonance, state) {
		const sampleRate = this.processor ? this.processor.sampleRate : 44100;
		const c = 1.0 / Math.tan(Math.PI * Math.max(20, Math.min(20000, cutoff)) / sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * state.x1 + a3 * state.x2
			- b1 * state.y1 - b2 * state.y2;

		state.x2 = state.x1;
		state.x1 = input;
		state.y2 = state.y1;
		state.y1 = output;

		return output;
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

