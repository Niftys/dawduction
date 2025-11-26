

// ========== MODULES ==========

/**
 * Manages track state (volume, pan, mute, solo)
 * This module handles all per-track audio state
 */

class TrackStateManager {
	constructor() {
		this.trackVolumes = new Map();
		this.trackPans = new Map();
		this.trackMutes = new Map();
		this.trackSolos = new Map();
	}

	initializeTracks(tracks) {
		if (!tracks) return;
		
		for (const track of tracks) {
			this.trackVolumes.set(track.id, track.volume ?? 1.0);
			this.trackPans.set(track.id, track.pan ?? 0.0);
			this.trackMutes.set(track.id, track.mute ?? false);
			this.trackSolos.set(track.id, track.solo ?? false);
		}
	}

	updateTrack(trackId, updatedTrack) {
		if (updatedTrack.volume !== undefined) {
			this.trackVolumes.set(trackId, updatedTrack.volume);
		}
		if (updatedTrack.pan !== undefined) {
			this.trackPans.set(trackId, updatedTrack.pan);
		}
		if (updatedTrack.mute !== undefined) {
			this.trackMutes.set(trackId, updatedTrack.mute);
		}
		if (updatedTrack.solo !== undefined) {
			this.trackSolos.set(trackId, updatedTrack.solo);
		}
	}

	setVolume(trackId, volume) {
		this.trackVolumes.set(trackId, volume);
	}

	setPan(trackId, pan) {
		this.trackPans.set(trackId, pan);
	}

	setMute(trackId, mute) {
		this.trackMutes.set(trackId, mute);
	}

	setSolo(trackId, solo) {
		this.trackSolos.set(trackId, solo);
	}

	getVolume(trackId) {
		return this.trackVolumes.get(trackId) ?? 1.0;
	}

	getPan(trackId) {
		return this.trackPans.get(trackId) ?? 0.0;
	}

	isMuted(trackId) {
		return this.trackMutes.get(trackId) ?? false;
	}

	isSoloed(trackId) {
		return this.trackSolos.get(trackId) ?? false;
	}

	hasAnySoloedTrack() {
		for (const solo of this.trackSolos.values()) {
			if (solo) return true;
		}
		return false;
	}

	removeTrack(trackId) {
		this.trackVolumes.delete(trackId);
		this.trackPans.delete(trackId);
		this.trackMutes.delete(trackId);
		this.trackSolos.delete(trackId);
	}

	clear() {
		this.trackVolumes.clear();
		this.trackPans.clear();
		this.trackMutes.clear();
		this.trackSolos.clear();
	}
}



/**
 * Manages playback state, tempo, and transport control
 * Handles play/stop/pause and tempo changes
 */

class PlaybackController {
	constructor(processor) {
		this.processor = processor;
		this.isPlaying = false;
		this.bpm = 120;
		this.beatsPerSecond = this.bpm / 60;
		this.samplesPerBeat = this.processor.sampleRate / this.beatsPerSecond;
	}

	setTempo(bpm) {
		this.bpm = bpm;
		this.beatsPerSecond = bpm / 60;
		this.samplesPerBeat = this.processor.sampleRate / this.beatsPerSecond;
	}

	setTransport(state, position = 0) {
		this.isPlaying = state === 'play';
		this.processor.currentTime = position * this.samplesPerBeat;
	}

	getCurrentBeat() {
		return this.processor.currentTime / this.samplesPerBeat;
	}

	getBPM() {
		return this.bpm;
	}

	isTransportPlaying() {
		return this.isPlaying;
	}
}



/**
 * Handles event scheduling and timing
 * Manages when events should be triggered based on playback position
 */

class EventScheduler {
	constructor(processor) {
		this.processor = processor;
		this.scheduledEvents = new Map();
	}

	scheduleEvents() {
		const lookaheadTime = 0.15; // 150ms
		const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
		const lookaheadBeat = currentBeat + lookaheadTime * this.processor.playbackController.beatsPerSecond;
		
		// Get pattern length for looping
		const patternLength = this.getPatternLength();
		const isTimelineMode = this.processor.projectManager.isArrangementView && this.processor.projectManager.timeline && this.processor.projectManager.timeline.totalLength;

		// In arrangement view, schedule events more aggressively - look ahead much further
		// For arrangement view, we want to schedule events well ahead so they're ready when needed
		const extendedLookahead = isTimelineMode ? currentBeat + 4.0 : lookaheadBeat; // 4 beats ahead in arrangement view

		// Debug: Log scheduling attempt (throttled to avoid spam)
		if (!this._lastDebugTime || (this.processor.currentTime - this._lastDebugTime) > this.processor.sampleRate * 0.5) {
			this._lastDebugTime = this.processor.currentTime;
			this.processor.port.postMessage({
				type: 'debug',
				message: 'EventScheduler.scheduleEvents',
				data: {
					currentBeat: currentBeat.toFixed(3),
					lookaheadBeat: lookaheadBeat.toFixed(3),
					extendedLookahead: extendedLookahead.toFixed(3),
					isTimelineMode,
					totalEvents: this.processor.projectManager.events.length,
					scheduledCount: this.scheduledEvents.size,
					patternLength,
					timelineLength: this.processor.projectManager.timeline?.totalLength || 0
				}
			});
		}

		let scheduledThisCall = 0;
		// Schedule events in the lookahead window
		for (const event of this.processor.projectManager.events) {
			let eventTime = event.time;
			
			// For timeline/arrangement mode, use absolute times
			if (isTimelineMode) {
				const timelineLength = this.processor.projectManager.timeline.totalLength;
				// In arrangement view, events are at absolute timeline positions
				// For first loop, use absolute times directly
				// For subsequent loops, normalize and add loop offset
				const loopNumber = Math.floor(currentBeat / timelineLength);
				
				if (loopNumber === 0) {
					// First loop: use absolute event time directly (no normalization)
					eventTime = eventTime;
				} else {
					// Subsequent loops: normalize and add loop offset
					const normalizedEventTime = eventTime % timelineLength;
					eventTime = normalizedEventTime + (loopNumber * timelineLength);
				}
				
				// Also check if event should play in next loop (if we're near the end of current loop)
				const beatInCurrentLoop = currentBeat % timelineLength;
				const lookaheadInCurrentLoop = lookaheadBeat % timelineLength;
				const crossesLoopBoundary = lookaheadInCurrentLoop < beatInCurrentLoop || 
				                           lookaheadBeat >= timelineLength * (loopNumber + 1);
				
				if (crossesLoopBoundary && loopNumber === 0) {
					// We're wrapping to next loop, check next loop events
					const normalizedEventTime = eventTime % timelineLength;
					const nextLoopEventTime = normalizedEventTime + timelineLength;
					if (nextLoopEventTime >= currentBeat && nextLoopEventTime < lookaheadBeat) {
						eventTime = nextLoopEventTime;
					}
				} else if (crossesLoopBoundary && loopNumber > 0) {
					// Already in a loop, check next loop
					const normalizedEventTime = eventTime % timelineLength;
					const nextLoopEventTime = normalizedEventTime + ((loopNumber + 1) * timelineLength);
					if (nextLoopEventTime >= currentBeat && nextLoopEventTime < lookaheadBeat) {
						eventTime = nextLoopEventTime;
					}
				}
			} else {
				// For pattern mode, normalize to current pattern loop
				eventTime = event.time % patternLength;
			}
			
			// Check if event is in current lookahead window
			// Use extended lookahead for arrangement view to schedule events further ahead
			const checkLookahead = isTimelineMode ? extendedLookahead : lookaheadBeat;
			// Use <= for lookahead to include events at the exact lookahead boundary
			// Also handle events at time 0.0 specially to ensure they're scheduled
			if (eventTime >= currentBeat && eventTime <= checkLookahead) {
				const eventSampleTime = Math.floor(eventTime * this.processor.playbackController.samplesPerBeat);
				if (!this.scheduledEvents.has(eventSampleTime)) {
					this.scheduledEvents.set(eventSampleTime, []);
				}
				// Only schedule if not already scheduled
				const existing = this.scheduledEvents.get(eventSampleTime);
				if (!existing.some(e => e.instrumentId === event.instrumentId && e.time === event.time && e.pitch === event.pitch)) {
					this.scheduledEvents.get(eventSampleTime).push(event);
					scheduledThisCall++;
					
					// Debug: Log first few scheduled events
					if (scheduledThisCall <= 3) {
						this.processor.port.postMessage({
							type: 'debug',
							message: 'EventScheduler: Event scheduled',
							data: {
								eventTime: eventTime.toFixed(3),
								eventSampleTime,
								instrumentId: event.instrumentId,
								patternId: event.patternId || 'none',
								pitch: event.pitch,
								velocity: event.velocity
							}
						});
					}
				}
			}
		}
		
		// Debug: Log scheduling summary
		if (scheduledThisCall > 0 && (!this._lastScheduledCount || scheduledThisCall !== this._lastScheduledCount)) {
			this._lastScheduledCount = scheduledThisCall;
			this.processor.port.postMessage({
				type: 'debug',
				message: 'EventScheduler: Scheduling summary',
				data: {
					scheduledThisCall,
					totalScheduled: this.scheduledEvents.size
				}
			});
		}
	}

	getEventsAtTime(sampleTime) {
		return this.scheduledEvents.get(sampleTime);
	}

	removeEventsAtTime(sampleTime) {
		this.scheduledEvents.delete(sampleTime);
	}

	getPatternLength() {
		// If timeline exists and we're in arrangement view, use timeline length for looping
		if (this.processor.projectManager.isArrangementView && this.processor.projectManager.timeline && this.processor.projectManager.timeline.totalLength) {
			return this.processor.projectManager.timeline.totalLength;
		}
		
		// Otherwise use pattern-based looping
		let patternLength = 4; // Default fallback
		if (this.processor.projectManager.baseMeterTrackId) {
			const baseTrack = this.processor.projectManager.getTrack(this.processor.projectManager.baseMeterTrackId);
			if (baseTrack) {
				patternLength = baseTrack.patternTree?.division || 4;
			}
		} else if (this.processor.projectManager.tracks?.[0]) {
			patternLength = this.processor.projectManager.tracks[0].patternTree?.division || 4;
		}
		return patternLength;
	}

	checkLoopReset() {
		const patternLength = this.getPatternLength();
		const patternLengthSamples = patternLength * this.processor.playbackController.samplesPerBeat;
		const isTimelineMode = this.processor.projectManager.isArrangementView && this.processor.projectManager.timeline && this.processor.projectManager.timeline.totalLength;
		
		if (this.processor.currentTime >= patternLengthSamples) {
			if (isTimelineMode) {
				// In arrangement view, loop based on timeline length
				// Reset to 0 and clear scheduled events for next loop
				this.processor.currentTime = 0;
				if (this.processor.audioProcessor) {
					this.processor.audioProcessor.lastPlaybackUpdateTime = 0;
				}
				this.scheduledEvents.clear();
				// Re-schedule events for next loop
				this.scheduleEvents();
			} else {
				// Pattern mode: reset to 0
				this.processor.currentTime = 0;
				if (this.processor.audioProcessor) {
					this.processor.audioProcessor.lastPlaybackUpdateTime = 0;
				}
				this.scheduledEvents.clear();
				// Re-schedule events for next loop
				this.scheduleEvents();
			}
		}
	}

	clear() {
		this.scheduledEvents.clear();
	}
}



/**
 * Handles effect processing based on timeline position and pattern assignments
 * Applies effects to audio samples based on active timeline effects and their pattern assignments
 */

class EffectsProcessor {
	constructor() {
		this.effects = []; // Global effect definitions
		this.timelineEffects = []; // Timeline effect instances
		this.patternToTrackId = new Map(); // Maps pattern IDs to track IDs
	}

	initialize(effects, timelineEffects, patternToTrackId) {
		this.effects = effects || [];
		this.timelineEffects = timelineEffects || [];
		this.patternToTrackId = patternToTrackId || new Map();
	}

	/**
	 * Get active effects for a track at a specific timeline position
	 * @param {string} trackId - The track ID to get effects for
	 * @param {number} currentBeat - Current playback position in beats
	 * @param {boolean} isArrangementView - Whether we're in arrangement view
	 * @param {string} patternId - Optional pattern ID for pattern-specific effects
	 * @returns {Array} Array of active effect definitions with their settings
	 */
	getActiveEffects(trackId, currentBeat, isArrangementView, patternId = null) {
		if (!isArrangementView) {
			// In pattern view, return global effects or pattern-specific effects
			// For now, return empty array - pattern view effects can be added later
			return [];
		}

		const activeEffects = [];

		// Find timeline effects that are active at this position
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);

			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				// Check pattern assignment
				if (timelineEffect.patternId) {
					// Effect is assigned to a specific pattern
					if (patternId && timelineEffect.patternId === patternId) {
						// This effect applies to this pattern
						const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
						if (effectDef) {
							activeEffects.push({
								...effectDef,
								progress: (currentBeat - startBeat) / (endBeat - startBeat) // 0-1 progress through effect
							});
						}
					}
				} else {
					// Global effect (applies to all tracks/patterns)
					// Note: trackId matching would require mapping TimelineTrack.id to audio engine trackId
					// For now, apply global effects to all tracks
					const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
					if (effectDef) {
						activeEffects.push({
							...effectDef,
							progress: (currentBeat - startBeat) / (endBeat - startBeat)
						});
					}
				}
			}
		}

		return activeEffects;
	}

	/**
	 * Apply effects to an audio sample
	 * @param {number} sample - Input audio sample
	 * @param {Array} activeEffects - Array of active effects to apply
	 * @returns {number} Processed audio sample
	 */
	processSample(sample, activeEffects) {
		let processed = sample;

		for (const effect of activeEffects) {
			processed = this.applyEffect(processed, effect);
		}

		return processed;
	}

	/**
	 * Apply a single effect to a sample
	 * @param {number} sample - Input audio sample
	 * @param {Object} effect - Effect definition with settings
	 * @returns {number} Processed audio sample
	 */
	applyEffect(sample, effect) {
		if (!effect || !effect.settings) return sample;

		switch (effect.type) {
		case 'reverb':
			// Simple reverb using delay and feedback
			// This is a placeholder - real reverb would need delay buffers
			const reverbAmount = effect.settings.amount || 0;
			return sample * (1 - reverbAmount * 0.3);

		case 'delay':
			// Delay would need delay buffers - placeholder for now
			const delayAmount = effect.settings.amount || 0;
			return sample * (1 + delayAmount * 0.1);

		case 'filter':
			// Simple low-pass filter approximation
			const cutoff = effect.settings.cutoff || 1.0;
			const resonance = effect.settings.resonance || 0.0;
			// Placeholder - real filter needs state
			return sample * Math.min(1.0, cutoff);

		case 'distortion':
			// Simple distortion/saturation
			const drive = effect.settings.drive || 1.0;
			const distorted = Math.tanh(sample * drive);
			const mix = effect.settings.mix || 1.0;
			return sample * (1 - mix) + distorted * mix;

		case 'compressor':
			// Simple compression
			const threshold = effect.settings.threshold || 0.5;
			const ratio = effect.settings.ratio || 4.0;
			const absSample = Math.abs(sample);
			if (absSample > threshold) {
				const excess = absSample - threshold;
				const compressed = threshold + excess / ratio;
				return Math.sign(sample) * compressed;
			}
			return sample;

		case 'chorus':
			// Chorus would need delay buffers - placeholder
			const chorusAmount = effect.settings.amount || 0;
			return sample * (1 + chorusAmount * 0.1);

		default:
			return sample;
		}
	}
}



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



/**
 * Manages project state, instruments, timeline tracks, effects, and envelopes
 * Handles project loading and view mode configuration
 * 
 * TERMINOLOGY CLARIFICATION:
 * - INSTRUMENT: A generated synth with a pattern tree (what goes into pattern canvas)
 *   - Stored as Track (standalone) or Pattern (reusable)
 *   - Has instrumentType, patternTree, settings
 * - PATTERN: Currently stores a single instrument (future: container for multiple instruments)
 *   - Patterns can be loaded into timeline tracks
 *   - All instruments in a pattern play simultaneously (when pattern supports multiple)
 * - TRACK (TimelineTrack): Where patterns, effects, and envelopes are arranged
 *   - Exists ONLY in arrangement view timeline
 *   - Can be type 'pattern', 'effect', or 'envelope'
 */

class ProjectManager {
	constructor(processor) {
		this.processor = processor;
		this.tracks = null;
		this.events = [];
		this.timeline = null;
		this.effects = [];
		this.envelopes = [];
		this.baseMeterTrackId = null;
		this.isArrangementView = false;
		this.patternToTrackId = new Map();
	}

	loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId) {
		this.tracks = tracks;
		this.events = events || [];
		this.timeline = timeline || null;
		this.effects = effects || [];
		this.envelopes = envelopes || [];
		this.isArrangementView = viewMode === 'arrangement' && timeline && timeline.clips && timeline.clips.length > 0;
		
		// Debug: Log project load
		this.processor.port.postMessage({
			type: 'debug',
			message: 'ProjectManager.loadProject',
			data: {
				viewMode,
				isArrangementView: this.isArrangementView,
				tracksCount: tracks?.length || 0,
				eventsCount: this.events.length,
				timelineLength: timeline?.totalLength || 0,
				clipsCount: timeline?.clips?.length || 0,
				firstEvent: this.events[0] || null,
				firstTrack: tracks?.[0] || null
			}
		});
		
		// Set base meter track (defaults to first track if not specified)
		this.baseMeterTrackId = baseMeterTrackId || (tracks?.[0]?.id);
		
		// Build pattern to track ID mapping for effect/envelope assignment
		this.patternToTrackId.clear();
		if (this.isArrangementView) {
			// Use provided mapping if available, otherwise build from tracks
			if (patternToTrackId && Array.isArray(patternToTrackId)) {
				for (const [patternId, trackId] of patternToTrackId) {
					this.patternToTrackId.set(patternId, trackId);
				}
			} else if (timeline && timeline.clips) {
				// Fallback: build from tracks
				for (const clip of timeline.clips) {
					if (clip.patternId && !this.patternToTrackId.has(clip.patternId)) {
						// Find the track ID for this pattern
						const track = tracks.find(t => t.id && t.id.startsWith(`__pattern_${clip.patternId}`));
						if (track) {
							this.patternToTrackId.set(clip.patternId, track.id);
						}
					}
				}
			}
		}
		
		// Initialize effects and envelopes processors
		const timelineEffects = timeline?.effects || [];
		const timelineEnvelopes = timeline?.envelopes || [];
		this.processor.effectsProcessor.initialize(effects || [], timelineEffects, this.patternToTrackId);
		this.processor.envelopesProcessor.initialize(envelopes || [], timelineEnvelopes, this.patternToTrackId);
	}

	getTrack(trackId) {
		return this.tracks?.find(t => t.id === trackId);
	}

	updatePatternTree(trackId, patternTree) {
		const track = this.getTrack(trackId);
		if (track) {
			track.patternTree = patternTree;
			// Re-flatten events for this track in real-time
			this.updateTrackEvents(trackId);
		}
	}
	
	updateTrackEvents(trackId) {
		// Remove old events for this track
		this.events = this.events.filter(e => e.instrumentId !== trackId);
		
		// Get the track
		const track = this.getTrack(trackId);
		if (!track || !track.patternTree) return;
		
		// Re-flatten events for this track
		const { flattenTrackPattern } = require('../utils/eventFlatten');
		const newEvents = flattenTrackPattern(track.patternTree, trackId);
		
		// Add new events
		this.events.push(...newEvents);
		
		// Re-sort events by time
		this.events.sort((a, b) => a.time - b.time);
		
		// Notify processor to clear future scheduled events and re-schedule
		if (this.processor && this.processor.eventScheduler) {
			// Clear scheduled events for future times (keep past ones that are already playing)
			const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
			const currentSampleTime = Math.floor(this.processor.currentTime);
			
			// Remove scheduled events that are in the future
			for (const [sampleTime, events] of this.processor.eventScheduler.scheduledEvents.entries()) {
				if (sampleTime > currentSampleTime) {
					// Filter out events for this track
					const filteredEvents = events.filter(e => e.instrumentId !== trackId);
					if (filteredEvents.length === 0) {
						this.processor.eventScheduler.scheduledEvents.delete(sampleTime);
					} else {
						this.processor.eventScheduler.scheduledEvents.set(sampleTime, filteredEvents);
					}
				}
			}
		}
	}

	updateTrackSettings(trackId, settings) {
		const track = this.getTrack(trackId);
		if (track) {
			track.settings = { ...track.settings, ...settings };
		}
	}

	updateTrack(trackId, updatedTrack) {
		if (!this.tracks) return null;
		const index = this.tracks.findIndex(t => t.id === trackId);
		if (index !== -1) {
			const oldTrack = this.tracks[index];
			this.tracks[index] = updatedTrack;
			return oldTrack;
		}
		return null;
	}

	addTrack(track) {
		if (!this.tracks) {
			this.tracks = [];
		}
		// Check if track already exists
		const existingIndex = this.tracks.findIndex(t => t.id === track.id);
		if (existingIndex !== -1) {
			this.tracks[existingIndex] = track;
		} else {
			this.tracks.push(track);
		}
	}
}



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
				const settings = {
					...(track.settings || {}),
					...(track.instrumentSettings || {})
				};
				
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
						availableTracks: this.processor.projectManager.tracks?.map(t => ({ id: t.id, instrumentType: t.instrumentType })) || []
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
			// Debug: Log synth trigger
			this.processor.port.postMessage({
				type: 'debug',
				message: 'SynthManager: Triggering note',
				data: {
					trackId,
					patternId: patternId || 'none',
					velocity,
					pitch,
					synthExists: !!synth,
					hasTrigger: !!synth.trigger,
					totalSynths: this.synths.size
				}
			});
			synth.trigger(velocity, pitch);
		} else {
			// Debug: Log synth creation failure
			const track = this.processor.projectManager.getTrack(trackId);
			this.processor.port.postMessage({
				type: 'debug',
				message: 'SynthManager: Failed to trigger note',
				data: {
					trackId,
					patternId: patternId || 'none',
					velocity,
					pitch,
					trackExists: !!track,
					trackInstrumentType: track?.instrumentType || 'none',
					synthExists: !!synth,
					hasTrigger: synth ? !!synth.trigger : false
				}
			});
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
				
				// Get pattern ID from track ID (if it's a pattern track)
				// Also check processor's patternToTrackId map for reverse lookup
				// And check if synth has a stored patternId
				let patternId = null;
				if (trackId && trackId.startsWith('__pattern_')) {
					patternId = trackId.replace('__pattern_', '');
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
				if (this.envelopesProcessor) {
					const envelopeValues = this.envelopesProcessor.getActiveEnvelopeValues(
						trackId,
						currentBeat,
						isArrangementView,
						patternId
					);
					
					// Apply envelope values
					trackVolume *= envelopeValues.volume;
					trackPan += envelopeValues.pan;
					trackPan = Math.max(-1, Math.min(1, trackPan)); // Clamp pan
					
					// Note: filter and pitch envelopes would need to be applied to the synth itself
					// For now, we only apply volume and pan envelopes here
				}
				
				// Get synth sample
				let synthSample = synth.process();
				
				// Apply effects to this track's audio
				if (this.effectsProcessor) {
					const activeEffects = this.effectsProcessor.getActiveEffects(
						trackId,
						currentBeat,
						isArrangementView,
						patternId
					);
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
}



/**
 * Handles the main audio processing loop
 * Processes audio samples, triggers events, and mixes output
 */

class AudioProcessor {
	constructor(processor) {
		this.processor = processor;
		this.lastPlaybackUpdateTime = 0;
		this.playbackUpdateInterval = processor.sampleRate * 0.05; // Update every 50ms
	}

	/**
	 * Process a single audio buffer
	 * @param {AudioWorkletProcessor} inputs - Audio inputs
	 * @param {AudioWorkletProcessor} outputs - Audio outputs
	 * @param {AudioWorkletProcessor} parameters - Audio parameters
	 * @returns {boolean} Whether to keep processing
	 */
	process(inputs, outputs, parameters) {
		if (!this.processor.playbackController.isTransportPlaying()) {
			return true;
		}

		const output = outputs[0];
		const bufferLength = output[0].length;

		// Schedule events ahead of time
		this.processor.eventScheduler.scheduleEvents();

		// Process audio
		for (let i = 0; i < bufferLength; i++) {
			const sampleTime = Math.floor(this.processor.currentTime + i);
			const currentBeat = (this.processor.currentTime + i) / this.processor.playbackController.samplesPerBeat;

			// Check for events at this sample time
			const eventsAtTime = this.processor.eventScheduler.getEventsAtTime(sampleTime);
			if (eventsAtTime) {
				const eventIds = [];
				for (const event of eventsAtTime) {
					// Debug: Log event trigger
					if (!this._lastTriggerTime || (sampleTime - this._lastTriggerTime) > this.processor.sampleRate * 0.1) {
						this._lastTriggerTime = sampleTime;
						this.processor.port.postMessage({
							type: 'debug',
							message: 'AudioProcessor: Triggering event',
							data: {
								sampleTime,
								currentBeat: currentBeat.toFixed(3),
								instrumentId: event.instrumentId,
								patternId: event.patternId || 'none',
								pitch: event.pitch,
								velocity: event.velocity,
								eventTime: event.time
							}
						});
					}
					this.processor.triggerEvent(event);
					// Track event IDs for visual feedback
					eventIds.push(event.instrumentId + ':' + (event.time || 0));
				}
				this.processor.eventScheduler.removeEventsAtTime(sampleTime);
				
				// Send playback update to UI
				if (eventIds.length > 0) {
					this.processor.port.postMessage({
						type: 'playbackUpdate',
						time: currentBeat,
						eventIds: eventIds
					});
				}
			}

			// Mix all synths with per-track volume, pan, effects, and envelopes
			const mixed = this.processor.audioMixer.mixSynths(
				this.processor.synthManager.getAllSynths(),
				0.3, // master gain
				currentBeat,
				this.processor.projectManager.isArrangementView
			);

			// Write to output
			if (output.length >= 2) {
				output[0][i] = mixed.left;
				output[1][i] = mixed.right;
			} else {
				// Mono output
				output[0][i] = mixed.mono;
			}
		}

		this.processor.currentTime += bufferLength;

		// Send periodic playback position updates
		if (this.processor.currentTime - this.lastPlaybackUpdateTime >= this.playbackUpdateInterval) {
			const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
			this.processor.port.postMessage({
				type: 'playbackPosition',
				time: currentBeat
			});
			this.lastPlaybackUpdateTime = this.processor.currentTime;
		}

		// Check for loop reset
		this.processor.eventScheduler.checkLoopReset();

		return true;
	}
}



/**
 * Handles incoming messages from the main thread
 * Routes messages to appropriate handlers
 */

class MessageHandler {
	constructor(processor) {
		this.processor = processor;
	}

	handle(message) {
		switch (message.type) {
		case 'loadProject':
			this.processor.loadProject(message.tracks, message.bpm, message.events, message.baseMeterTrackId, message.timeline, message.effects, message.envelopes, message.viewMode, message.patternToTrackId);
			break;
			case 'setTransport':
				this.processor.setTransport(message.state, message.position);
				break;
			case 'setTempo':
				this.processor.setTempo(message.bpm);
				break;
			case 'updatePatternTree':
				this.processor.updatePatternTree(message.trackId, message.patternTree);
				break;
			case 'updateTrackSettings':
				this.processor.updateTrackSettings(message.trackId, message.settings);
				break;
			case 'updateTrack':
				this.processor.updateTrack(message.trackId, message.track);
				break;
			case 'updateTrackVolume':
				this.processor.updateTrackVolume(message.trackId, message.volume);
				break;
			case 'updateTrackPan':
				this.processor.updateTrackPan(message.trackId, message.pan);
				break;
			case 'updateTrackMute':
				this.processor.updateTrackMute(message.trackId, message.mute);
				break;
		case 'updateTrackSolo':
			this.processor.updateTrackSolo(message.trackId, message.solo);
			break;
		case 'updateTrackEvents':
			this.processor.updateTrackEvents(message.trackId, message.events);
			break;
		case 'removeTrack':
			this.processor.removeTrack(message.trackId);
			break;
		}
	}
}



/**
 * Factory for creating synth instances based on instrument type
 * Centralizes synth creation logic
 */

class SynthFactory {
	constructor(sampleRate) {
		this.sampleRate = sampleRate;
	}

	create(instrumentType, settings) {
		switch (instrumentType) {
			case 'kick':
				return new KickSynth(settings, this.sampleRate);
			case 'snare':
				return new SnareSynth(settings, this.sampleRate);
			case 'hihat':
				return new HiHatSynth(settings, this.sampleRate);
			case 'clap':
				return new ClapSynth(settings, this.sampleRate);
			case 'tom':
				return new TomSynth(settings, this.sampleRate);
			case 'cymbal':
				return new CymbalSynth(settings, this.sampleRate);
		case 'shaker':
			return new ShakerSynth(settings, this.sampleRate);
		case 'rimshot':
			return new RimshotSynth(settings, this.sampleRate);
		case 'subtractive':
			return new SubtractiveSynth(settings, this.sampleRate);
			case 'fm':
				return new FMSynth(settings, this.sampleRate);
			case 'wavetable':
				return new WavetableSynth(settings, this.sampleRate);
		case 'supersaw':
			return new SupersawSynth(settings, this.sampleRate);
		case 'pluck':
			return new PluckSynth(settings, this.sampleRate);
		case 'bass':
			return new BassSynth(settings, this.sampleRate);
		default:
			return null;
		}
	}
}



/**
 * AudioWorklet Processor for the DAW engine
 * Runs in a separate thread for sample-accurate timing
 * 
 * This is the core processor - synth classes are added by the build script
 * 
 * The processor is now modularized into separate concerns:
 * - TrackStateManager: Manages track volume, pan, mute, solo
 * - PlaybackController: Manages playback state, tempo, and transport control
 * - EventScheduler: Handles event scheduling and timing
 * - EffectsProcessor: Applies effects based on timeline position
 * - EnvelopesProcessor: Applies envelopes based on timeline position
 * - ProjectManager: Manages project state, tracks, timeline, effects, and envelopes
 * - SynthManager: Manages synth instances lifecycle
 * - AudioMixer: Handles audio mixing with panning, effects, and envelopes
 * - AudioProcessor: Handles the main audio processing loop
 * - MessageHandler: Routes incoming messages
 * - SynthFactory: Creates synth instances
 */

class EngineWorkletProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.currentTime = 0;
		this.sampleRate = sampleRate;
		
		
		// Initialize modules
		this.trackState = new TrackStateManager();
		this.eventScheduler = new EventScheduler(this);
		this.effectsProcessor = new EffectsProcessor();
		this.envelopesProcessor = new EnvelopesProcessor();
		this.audioMixer = new AudioMixer(this.trackState, this.effectsProcessor, this.envelopesProcessor, this);
		this.messageHandler = new MessageHandler(this);
		this.synthFactory = new SynthFactory(this.sampleRate);
		this.projectManager = new ProjectManager(this);
		this.synthManager = new SynthManager(this);
		this.playbackController = new PlaybackController(this);
		this.audioProcessor = new AudioProcessor(this);
		
		this.port.onmessage = (event) => {
			this.messageHandler.handle(event.data);
		};
	}

	loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId) {
		this.playbackController.setTempo(bpm);
		this.eventScheduler.clear();
		// Clear old synths when reloading
		this.synthManager.clear();
		
		// Reset playback position when loading new project
		this.currentTime = 0;
		if (this.audioProcessor) {
			this.audioProcessor.lastPlaybackUpdateTime = 0;
		}
		
		// Delegate to ProjectManager
		this.projectManager.loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId);
		
		// Initialize track state
		this.trackState.initializeTracks(tracks);
	}

	setTempo(bpm) {
		this.playbackController.setTempo(bpm);
	}

	setTransport(state, position = 0) {
		this.playbackController.setTransport(state, position);
	}

	updatePatternTree(trackId, patternTree) {
		this.projectManager.updatePatternTree(trackId, patternTree);
	}

	updateTrackSettings(trackId, settings) {
		this.projectManager.updateTrackSettings(trackId, settings);
		this.synthManager.updateSynthSettings(trackId, settings);
	}

	updateTrack(trackId, updatedTrack) {
		const oldTrack = this.projectManager.updateTrack(trackId, updatedTrack);
		if (oldTrack) {
			// Update track state
			this.trackState.updateTrack(trackId, updatedTrack);
			
			// If instrument type changed, remove old synth and create new one immediately
			if (oldTrack.instrumentType !== updatedTrack.instrumentType) {
				this.synthManager.removeSynth(trackId);
				
				// Create new synth immediately to avoid audio gaps during playback
				// Extract patternId from trackId if it's a pattern track
				// Format: __pattern_{patternId}_{instrumentId}
				let patternId = null;
				if (trackId && trackId.startsWith('__pattern_')) {
					// Remove '__pattern_' prefix to get '{patternId}_{instrumentId}'
					const withoutPrefix = trackId.substring('__pattern_'.length);
					// Split by '_' to get [patternId, instrumentId]
					const parts = withoutPrefix.split('_');
					if (parts.length >= 1) {
						patternId = parts[0]; // patternId is the first part after prefix
					}
				}
				
				// Force creation of new synth with updated instrument type
				this.synthManager.getOrCreateSynth(trackId, patternId);
			}
			
			// If pattern tree changed, update it in real-time
			if (updatedTrack.patternTree && oldTrack.patternTree !== updatedTrack.patternTree) {
				this.updatePatternTree(trackId, updatedTrack.patternTree);
			}
		} else {
			// Track doesn't exist yet, add it
			this.projectManager.addTrack(updatedTrack);
			this.trackState.updateTrack(trackId, updatedTrack);
			
			// Extract patternId from trackId if it's a pattern track
			let patternId = null;
			if (trackId && trackId.startsWith('__pattern_')) {
				const withoutPrefix = trackId.substring('__pattern_'.length);
				const parts = withoutPrefix.split('_');
				if (parts.length >= 1) {
					patternId = parts[0];
				}
			}
			
			// Create synth for new track
			this.synthManager.getOrCreateSynth(trackId, patternId);
			
			// If pattern tree exists, update events
			if (updatedTrack.patternTree) {
				this.updatePatternTree(trackId, updatedTrack.patternTree);
			}
		}
	}

	updateTrackVolume(trackId, volume) {
		this.trackState.setVolume(trackId, volume);
	}

	updateTrackEvents(trackId, events) {
		// Remove old events for this track
		this.projectManager.events = this.projectManager.events.filter(e => e.instrumentId !== trackId);
		
		// Add new events
		this.projectManager.events.push(...events);
		
		// Re-sort events by time
		this.projectManager.events.sort((a, b) => a.time - b.time);
		
		// Clear scheduled events for this track in the future
		const currentBeat = this.currentTime / this.playbackController.samplesPerBeat;
		const currentSampleTime = Math.floor(this.currentTime);
		
		// Remove scheduled events that are in the future
		for (const [sampleTime, scheduledEvents] of this.eventScheduler.scheduledEvents.entries()) {
			if (sampleTime > currentSampleTime) {
				// Filter out events for this track
				const filteredEvents = scheduledEvents.filter(e => e.instrumentId !== trackId);
				if (filteredEvents.length === 0) {
					this.eventScheduler.scheduledEvents.delete(sampleTime);
				} else {
					this.eventScheduler.scheduledEvents.set(sampleTime, filteredEvents);
				}
			}
		}
	}

	removeTrack(trackId) {
		// Remove from project manager
		if (this.projectManager.tracks) {
			this.projectManager.tracks = this.projectManager.tracks.filter(t => t.id !== trackId);
		}
		
		// Remove from track state
		this.trackState.removeTrack(trackId);
		
		// Remove synth
		this.synthManager.removeSynth(trackId);
		
		// Remove events
		this.projectManager.events = this.projectManager.events.filter(e => e.instrumentId !== trackId);
		
		// Clear scheduled events for this track
		const currentSampleTime = Math.floor(this.currentTime);
		for (const [sampleTime, scheduledEvents] of this.eventScheduler.scheduledEvents.entries()) {
			if (sampleTime > currentSampleTime) {
				const filteredEvents = scheduledEvents.filter(e => e.instrumentId !== trackId);
				if (filteredEvents.length === 0) {
					this.eventScheduler.scheduledEvents.delete(sampleTime);
				} else {
					this.eventScheduler.scheduledEvents.set(sampleTime, filteredEvents);
				}
			}
		}
	}

	updateTrackPan(trackId, pan) {
		this.trackState.setPan(trackId, pan);
	}

	updateTrackMute(trackId, mute) {
		this.trackState.setMute(trackId, mute);
	}

	updateTrackSolo(trackId, solo) {
		this.trackState.setSolo(trackId, solo);
	}

	process(inputs, outputs, parameters) {
		return this.audioProcessor.process(inputs, outputs, parameters);
	}

	triggerEvent(event) {
		// Extract patternId from event if available (for effects/envelopes)
		const patternId = event.patternId || null;
		this.synthManager.triggerNote(event.instrumentId, event.velocity, event.pitch, patternId);
	}
}


// ========== DRUM SYNTH CLASSES ==========

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



/**
 * Snare Drum Synth
 * Combines tonal body with filtered noise for snare wire character
 */

class SnareSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
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
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.005) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Real snare = tonal body + filtered noise (snare wires)
		
		// 1. Tonal component (drum body) - like a tom
		const bodyFreq = 180 * Math.exp(-this.envelopePhase / (decay * 0.4));
		const bodyPhase = this.phase * 2 * Math.PI * bodyFreq / this.sampleRate;
		const bodyTone = Math.sin(bodyPhase) * 0.3;
		
		// 2. Snare wires - bandpass filtered noise
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Simple bandpass filter (centered around 200-800 Hz for snare character)
		// Use a simple resonant filter approximation
		const centerFreq = 400;
		const bandwidth = 300;
		const filterPhase = this.phase * 2 * Math.PI * centerFreq / this.sampleRate;
		const filteredNoise = noise * (0.5 + 0.5 * Math.sin(filterPhase)) * 0.7;
		
		// Mix body and snare wires
		let sample = bodyTone + filteredNoise;

		// ADSR envelope - FIXED: Release fades from end-of-decay value
		let envelope = 0;
		let decayEndValue = 0;
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 3);
			decayEndValue = envelope; // Track the actual value at end of decay
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			// Use decayEndValue if set, otherwise fallback to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.5;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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



/**
 * Hi-Hat Synth
 * High-frequency filtered noise for metallic cymbal character
 */

class HiHatSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
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
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.001) * this.sampleRate;
		const decay = (this.settings.decay || 0.05) * this.sampleRate;
		const totalDuration = attack + decay;

		// High-frequency noise (metallic)
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// High-pass filter simulation (emphasize high frequencies)
		let sample = noise * (1 + Math.sin(this.phase * 2 * Math.PI * 10000 / this.sampleRate) * 0.3);

		// Extended fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, decay * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 5);
			decayEndValue = envelope;
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - totalDuration) / fadeOutSamples;
			envelope = decayEndValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.3;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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



/**
 * Clap Synth
 * Multiple delayed noise bursts to simulate multiple hands clapping
 */

class ClapSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.bursts = [];
		this.isActive = false;
		// Pre-generated noise buffer for consistent sound
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
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
		
		this.bursts = [];
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		// Multiple bursts with pre-delay (like multiple hands clapping)
		for (let i = 0; i < 5; i++) {
			this.bursts.push({
				delay: i * 0.008 * this.sampleRate, // Slight delay between bursts
				phase: 0,
				envelopePhase: 0,
				velocity: velocity * (1 - i * 0.12),
				noiseIndex: this.noiseIndex + i * 1000 // Offset noise for variation
			});
		}
		this.isActive = true;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive || this.bursts.length === 0) return 0;
		
		let sample = 0;
		for (let burst of this.bursts) {
			if (burst.delay > 0) {
				burst.delay--;
				continue;
			}
			
			// Use pre-generated noise buffer
			const noiseIdx = (burst.noiseIndex + burst.envelopePhase) % this.noiseBuffer.length;
			let noise = this.noiseBuffer[noiseIdx];
			
			// High-pass emphasis for clap character (bright, sharp)
			// Simple high-pass: emphasize high frequencies
			const highFreq = 5000;
			const filterPhase = burst.phase * 2 * Math.PI * highFreq / this.sampleRate;
			noise = noise * (0.3 + 0.7 * (1 + Math.sin(filterPhase)) * 0.5);
			
			// Sharp, short envelope with extended fade-out
			const decay = 0.08 * this.sampleRate;
			const fadeOutSamples = decay * 0.3;
			const totalBurstDuration = decay + fadeOutSamples;
			
			let envelope = 0;
			if (burst.envelopePhase < decay) {
				envelope = Math.exp(-burst.envelopePhase / (decay * 0.25));
			} else if (burst.envelopePhase < totalBurstDuration) {
				// Extended fade-out
				const fadePhase = (burst.envelopePhase - decay) / fadeOutSamples;
				const fadeStartValue = Math.exp(-decay / (decay * 0.25));
				envelope = fadeStartValue * Math.exp(-fadePhase * 10);
			}
			
			if (envelope > 0.001) {
				sample += noise * envelope * burst.velocity;
				burst.envelopePhase++;
				burst.phase++;
			}
		}
		
		const maxBurstDuration = 0.08 * this.sampleRate * 1.3; // Include fade-out
		this.bursts = this.bursts.filter(b => b.envelopePhase < maxBurstDuration);
		if (this.bursts.length === 0) {
			this.isActive = false;
			return 0;
		}
		
		let output = sample * 0.4;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		return output;
	}
}



/**
 * Tom Synth
 * Descending pitch envelope for tom-tom character
 */

class TomSynth {
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
		this.pitch = pitch || 50;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.4) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Descending pitch envelope
		const startFreq = 100;
		const endFreq = 50;
		const freq = startFreq * Math.exp(-this.envelopePhase / (decay * 0.6));

		const sample = Math.sin(this.phase * 2 * Math.PI * freq / this.sampleRate);

		// Extended total duration with long fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.3); // 100ms minimum fade-out
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// ADSR envelope - FIXED: Release fades from end-of-decay value
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 2.5);
			decayEndValue = envelope; // Track the actual value at end of decay
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			// Use decayEndValue if set, otherwise fallback to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.4;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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



/**
 * Cymbal Synth
 * Ring-modulated noise for cymbal shimmer
 */

class CymbalSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
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
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.5) * this.sampleRate;
		const totalDuration = attack + decay;

		// Ring-modulated noise
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		const modFreq = 200;
		const modulator = Math.sin(this.phase * 2 * Math.PI * modFreq / this.sampleRate);
		let sample = noise * (1 + modulator * 0.5);

		// Extended fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, decay * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 3);
			decayEndValue = envelope;
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - totalDuration) / fadeOutSamples;
			envelope = decayEndValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.3;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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



/**
 * Shaker Synth
 * Transient-shaped noise for shaker/rattle character
 */

class ShakerSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
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
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const totalDuration = attack + decay;

		// Transient-shaped noise
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		let sample = noise;

		// Extended fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, decay * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 4);
			decayEndValue = envelope;
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - totalDuration) / fadeOutSamples;
			envelope = decayEndValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.35;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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



/**
 * Rimshot Synth
 * Sharp, snappy rimshot sound with bright metallic character
 * Great for accents and fills in electronic music
 */

class RimshotSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.noiseBuffer = new Float32Array(44100);
		for (let i = 0; i < this.noiseBuffer.length; i++) {
			this.noiseBuffer[i] = Math.random() * 2 - 1;
		}
		this.noiseIndex = 0;
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
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.001) * this.sampleRate;
		const decay = (this.settings.decay || 0.08) * this.sampleRate;
		const release = (this.settings.release || 0.05) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Rimshot = sharp transient + bright tonal component + filtered noise
		
		// 1. Sharp tonal "ping" - high frequency sine that quickly decays
		const pingFreq = 800 * Math.exp(-this.envelopePhase / (decay * 0.2));
		const pingPhase = this.phase * 2 * Math.PI * pingFreq / this.sampleRate;
		const ping = Math.sin(pingPhase) * 0.4;
		
		// 2. Body tone - lower frequency for character
		const bodyFreq = 200 * Math.exp(-this.envelopePhase / (decay * 0.5));
		const bodyPhase = this.phase * 2 * Math.PI * bodyFreq / this.sampleRate;
		const body = Math.sin(bodyPhase) * 0.2;
		
		// 3. Bright filtered noise for snappy character
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// High-pass filtered noise for brightness
		// Simple HPF approximation using phase modulation
		const hpfFreq = 2000;
		const hpfPhase = this.phase * 2 * Math.PI * hpfFreq / this.sampleRate;
		const filteredNoise = noise * (0.3 + 0.7 * Math.abs(Math.sin(hpfPhase))) * 0.5;
		
		// Mix components
		let sample = ping + body + filteredNoise;

		// ADSR envelope - very quick attack and decay for snappy character
		let envelope = 0;
		let decayEndValue = 0;
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		if (this.envelopePhase < attack) {
			// Very fast attack for sharp transient
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			// Quick exponential decay
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 4);
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = releaseStartValue * Math.exp(-releasePhase * 8);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-8);
			envelope = fadeStartValue * Math.exp(-fadePhase * 12);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.6;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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





// ========== MELODIC SYNTH CLASSES ==========

/**
 * Subtractive Synth
 * Two oscillators with detune, low-pass filter, and ADSR envelope
 */

class SubtractiveSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase1 = 0;
		this.phase2 = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Maintain phase continuity - only reset if not active
		if (!this.isActive) {
			this.phase1 = 0;
			this.phase2 = 0;
		}
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const osc1Type = this.settings.osc1Type || 'saw';
		const osc2Type = this.settings.osc2Type || 'saw';
		const detune = (this.settings.osc2Detune || 0) / 12;

		let osc1 = this.oscillator(this.phase1, freq, osc1Type);
		let osc2 = this.oscillator(this.phase2, freq * Math.pow(2, detune), osc2Type);
		let sample = (osc1 + osc2 * 0.5) * 0.5;

		// Simple lowpass filter
		const cutoff = this.settings.filterCutoff || 5000;
		const resonance = this.settings.filterResonance || 0.5;
		sample = this.lowpass(sample, cutoff, resonance);

		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase1 += (freq / this.sampleRate) * 2 * Math.PI;
		this.phase2 += (freq * Math.pow(2, detune) / this.sampleRate) * 2 * Math.PI;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.4;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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

	oscillator(phase, freq, type) {
		const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
		switch (type) {
			case 'sine':
				return Math.sin(phase);
			case 'saw':
				return 2 * normalizedPhase - 1;
			case 'square':
				return normalizedPhase < 0.5 ? 1 : -1;
			case 'triangle':
				return normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
			default:
				return Math.sin(phase);
		}
	}

	lowpass(input, cutoff, resonance) {
		const c = 1.0 / Math.tan(Math.PI * cutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = output;

		return output;
	}
}



/**
 * FM Synth
 * Frequency modulation synthesis with configurable operators
 */

class FMSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || { operators: [{ frequency: 1, amplitude: 1, waveform: 'sine' }] };
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		if (!this.isActive) {
			this.phase = 0;
		}
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
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const op = this.settings.operators?.[0] || { frequency: 1, amplitude: 1, waveform: 'sine' };
		
		// Use waveform type for operator
		const opFreq = freq * op.frequency;
		const opPhase = this.phase * 2 * Math.PI * opFreq / this.sampleRate;
		let sample = this.oscillator(opPhase, opFreq, op.waveform) * op.amplitude;

		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase += (freq / this.sampleRate) * 2 * Math.PI;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.3;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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

	oscillator(phase, freq, type) {
		const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
		switch (type) {
			case 'sine':
				return Math.sin(phase);
			case 'saw':
				return 2 * normalizedPhase - 1;
			case 'square':
				return normalizedPhase < 0.5 ? 1 : -1;
			case 'triangle':
				return normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
			default:
				return Math.sin(phase);
		}
	}
}



/**
 * Wavetable Synth
 * Wavetable synthesis with linear interpolation between table entries
 */

class WavetableSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
		// Simple wavetable (sine wave)
		this.wavetable = new Float32Array(2048);
		for (let i = 0; i < this.wavetable.length; i++) {
			this.wavetable[i] = Math.sin((i / this.wavetable.length) * 2 * Math.PI);
		}
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		if (!this.isActive) {
			this.phase = 0;
		}
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
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const tableIndex = (this.phase % (2 * Math.PI)) / (2 * Math.PI) * this.wavetable.length;
		const index1 = Math.floor(tableIndex);
		const index2 = (index1 + 1) % this.wavetable.length;
		const frac = tableIndex - index1;
		const sample = this.wavetable[index1] * (1 - frac) + this.wavetable[index2] * frac;

		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase += (freq / this.sampleRate) * 2 * Math.PI;
		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.4;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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



/**
 * Supersaw Synth
 * Multiple detuned sawtooth oscillators for rich, wide sound
 * Classic trance/EDM lead sound
 */

class SupersawSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = []; // Array of phases for each oscillator
		this.envelopePhase = 0;
		this.isActive = false;
		this.lfoPhase = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Initialize oscillator phases
		const numOscillators = this.settings.numOscillators || 7;
		for (let i = 0; i < numOscillators; i++) {
			this.phase.push(0);
		}
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
		// Resize phase array if number of oscillators changed
		const numOscillators = this.settings.numOscillators || 7;
		while (this.phase.length < numOscillators) {
			this.phase.push(0);
		}
		while (this.phase.length > numOscillators) {
			this.phase.pop();
		}
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Only reset phases if not currently active to prevent clicks
		if (!this.isActive) {
			for (let i = 0; i < this.phase.length; i++) {
				this.phase[i] = 0;
			}
		}
		this.envelopePhase = 0;
		this.lfoPhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		
		const attack = (this.settings.attack || 0.1) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.7;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const numOscillators = this.settings.numOscillators || 7;
		const detune = this.settings.detune || 0.1; // Detune amount in semitones
		const spread = this.settings.spread || 0.5; // Spread amount (0-1)
		
		// Generate multiple detuned sawtooth oscillators
		let sample = 0;
		const centerIndex = Math.floor(numOscillators / 2);
		
		for (let i = 0; i < numOscillators; i++) {
			// Calculate detune offset: center oscillator is in tune, others detune symmetrically
			const offset = (i - centerIndex) * detune * spread;
			const oscFreq = freq * Math.pow(2, offset / 12);
			
			// Generate sawtooth wave
			const normalizedPhase = (this.phase[i] % (2 * Math.PI)) / (2 * Math.PI);
			const saw = 2 * normalizedPhase - 1;
			
			// Mix oscillators (center gets full volume, outer ones slightly quieter for balance)
			const distanceFromCenter = Math.abs(i - centerIndex);
			const gain = 1.0 - (distanceFromCenter * 0.1); // Slight volume reduction for outer oscillators
			sample += saw * gain;
			
			// Update phase
			this.phase[i] += (oscFreq / this.sampleRate) * 2 * Math.PI;
		}
		
		// Normalize by number of oscillators
		sample = sample / numOscillators;
		
		// Apply low-pass filter
		let cutoff = this.settings.filterCutoff || 8000;
		const resonance = this.settings.filterResonance || 0.5;
		
		// LFO modulation of filter cutoff
		const lfoRate = this.settings.lfoRate || 0; // Hz
		if (lfoRate > 0) {
			const lfoAmount = this.settings.lfoAmount || 0; // Amount in Hz
			const lfo = Math.sin(this.lfoPhase) * lfoAmount;
			cutoff = Math.max(20, Math.min(20000, cutoff + lfo));
			this.lfoPhase += (lfoRate / this.sampleRate) * 2 * Math.PI;
			if (this.lfoPhase >= 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;
		}
		
		sample = this.lowpass(sample, cutoff, resonance);
		
		// ADSR envelope - FIXED: Release fades from sustain properly
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.3;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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

	lowpass(input, cutoff, resonance) {
		const c = 1.0 / Math.tan(Math.PI * cutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = output;

		return output;
	}
}



/**
 * Pluck Synth
 * Karplus-Strong plucked string synthesis
 * Creates natural-sounding plucked string tones (guitar, harp, etc.)
 */

class PluckSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.envelopePhase = 0;
		this.isActive = false;
		this.delayLine = null;
		this.delayIndex = 0;
		this.delayLength = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Calculate delay line length based on pitch
		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		// Ensure minimum delay length to prevent aliasing and instability
		const minDelayLength = Math.floor(this.sampleRate / 20000); // Max 20kHz
		this.delayLength = Math.max(minDelayLength, Math.floor(this.sampleRate / freq));
		
		// Initialize delay line with softer excitation
		this.delayLine = new Float32Array(this.delayLength);
		for (let i = 0; i < this.delayLength; i++) {
			// Use smoother noise with envelope for more musical pluck
			const noise = (Math.random() * 2 - 1) * 0.5; // Reduced noise amplitude
			// Apply smoother envelope to excitation
			const excitationPhase = i / this.delayLength;
			// Softer envelope curve
			const excitationEnv = Math.exp(-excitationPhase * 4) * (1 - excitationPhase * 0.5);
			this.delayLine[i] = noise * excitationEnv * 0.3; // Reduced initial amplitude
		}
		
		this.delayIndex = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive || !this.delayLine) return 0;
		
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const sustain = this.settings.sustain || 0.0; // Plucks don't sustain
		const release = (this.settings.release || 0.4) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Karplus-Strong: read from delay line, filter, and feed back
		const readIndex = this.delayIndex;
		let sample = this.delayLine[readIndex];
		
		// Low-pass filter in feedback loop (simulates string damping)
		// Higher damping value = less damping = brighter sound
		// Lower damping value = more damping = darker sound
		const damping = this.settings.damping || 0.96; // 0.9-0.99 range
		
		// Calculate filter cutoff: higher damping = higher cutoff (brighter)
		// Map damping (0.9-0.99) to cutoff (2000-12000 Hz) for musical range
		const filterCutoff = 2000 + (damping - 0.9) * (10000 / 0.09);
		// Clamp to safe range
		const safeCutoff = Math.max(500, Math.min(12000, filterCutoff));
		
		// Apply low-pass filter with lower resonance for stability
		sample = this.lowpass(sample, safeCutoff, 0.2);
		
		// Write filtered sample back to delay line (with damping gain)
		// Clamp to prevent runaway feedback
		this.delayLine[this.delayIndex] = Math.max(-1, Math.min(1, sample * damping));
		
		// Advance delay line index
		this.delayIndex = (this.delayIndex + 1) % this.delayLength;

		// ADSR envelope for overall amplitude
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Very quick attack for pluck character
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			// Exponential decay (plucks don't sustain)
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 2);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: continue exponential decay
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = Math.exp(-(2 + releasePhase * 4));
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		// Reduced output gain for safer levels, clamp to prevent clipping
		let output = sample * envelope * this.velocity * 0.25;
		output = Math.max(-0.95, Math.min(0.95, output)); // Soft clipping
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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
				this.delayLine = null;
				return 0;
			}
		}
		
		return output;
	}

	lowpass(input, cutoff, resonance) {
		// Clamp cutoff to Nyquist to prevent instability
		const nyquist = this.sampleRate * 0.45;
		const safeCutoff = Math.max(20, Math.min(nyquist, cutoff));
		
		// Prevent division by zero and ensure stability
		if (safeCutoff >= nyquist) {
			return input; // Pass through if cutoff too high
		}
		
		const c = 1.0 / Math.tan(Math.PI * safeCutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		// Clamp filter state to prevent instability
		const clampedOutput = Math.max(-1, Math.min(1, output));

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = clampedOutput;

		return clampedOutput;
	}
}



/**
 * Bass Synth
 * Optimized for bass frequencies with sub-oscillator and bass-focused filtering
 * Perfect for basslines and low-end melodic content
 */

class BassSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase1 = 0; // Main oscillator
		this.phase2 = 0; // Sub oscillator (one octave down)
		this.envelopePhase = 0;
		this.isActive = false;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.01 * sampleRate); // 10ms fade for melodic synths
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Maintain phase continuity - only reset if not active
		if (!this.isActive) {
			this.phase1 = 0;
			this.phase2 = 0;
		}
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.05) * this.sampleRate;
		const decay = (this.settings.decay || 0.2) * this.sampleRate;
		const sustain = this.settings.sustain || 0.8;
		const release = (this.settings.release || 0.3) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const osc1Type = this.settings.osc1Type || 'saw';
		const subLevel = this.settings.subLevel || 0.6; // Sub oscillator level (0-1)
		const saturation = this.settings.saturation || 0.3; // Saturation amount (0-1)

		// Main oscillator
		let osc1 = this.oscillator(this.phase1, freq, osc1Type);
		
		// Sub oscillator (one octave down for extra low end)
		const subFreq = freq * 0.5;
		let osc2 = this.oscillator(this.phase2, subFreq, 'sine'); // Sub is always sine for clean low end
		
		// Mix oscillators: main + sub
		let sample = osc1 + osc2 * subLevel;
		sample = sample * 0.5; // Normalize

		// Subtle saturation for character (soft clipping)
		if (saturation > 0) {
			const drive = 1 + saturation * 2;
			sample = sample * drive;
			// Soft clipping using tanh approximation
			sample = sample / (1 + Math.abs(sample));
		}

		// Low-pass filter optimized for bass (lower default cutoff)
		const cutoff = this.settings.filterCutoff || 2000;
		const resonance = this.settings.filterResonance || 0.3; // Lower resonance for smoother bass
		sample = this.lowpass(sample, cutoff, resonance);

		// ADSR envelope - optimized for bass (good sustain, smooth release)
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.phase1 += (freq / this.sampleRate) * 2 * Math.PI;
		this.phase2 += (subFreq / this.sampleRate) * 2 * Math.PI;
		this.envelopePhase++;
		
		// Output gain optimized for bass (slightly lower to prevent clipping)
		let output = sample * envelope * this.velocity * 0.35;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const oldGain = 1 - fadeProgress;
			const newGain = fadeProgress;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
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

	oscillator(phase, freq, type) {
		const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
		switch (type) {
			case 'sine':
				return Math.sin(phase);
			case 'saw':
				return 2 * normalizedPhase - 1;
			case 'square':
				return normalizedPhase < 0.5 ? 1 : -1;
			case 'triangle':
				return normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
			default:
				return Math.sin(phase);
		}
	}

	lowpass(input, cutoff, resonance) {
		// Clamp cutoff to prevent instability
		const nyquist = this.sampleRate * 0.45;
		const safeCutoff = Math.max(20, Math.min(nyquist, cutoff));
		
		const c = 1.0 / Math.tan(Math.PI * safeCutoff / this.sampleRate);
		const a1 = 1.0 / (1.0 + resonance * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - resonance * c + c * c) * a1;

		const output = a1 * input + a2 * this.filterState.x1 + a3 * this.filterState.x2
			- b1 * this.filterState.y1 - b2 * this.filterState.y2;

		this.filterState.x2 = this.filterState.x1;
		this.filterState.x1 = input;
		this.filterState.y2 = this.filterState.y1;
		this.filterState.y1 = output;

		return output;
	}
}




registerProcessor('engine-worklet-processor', EngineWorkletProcessor);
