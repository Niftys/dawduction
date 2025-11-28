

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

		// Debug: Log scheduling attempt (disabled for cleaner logs)
		// if (!this._lastDebugTime || (this.processor.currentTime - this._lastDebugTime) > this.processor.sampleRate * 0.5) {
		// 	this._lastDebugTime = this.processor.currentTime;
		// 	this.processor.port.postMessage({
		// 		type: 'debug',
		// 		message: 'EventScheduler.scheduleEvents',
		// 		data: {
		// 			currentBeat: currentBeat.toFixed(3),
		// 			lookaheadBeat: lookaheadBeat.toFixed(3),
		// 			extendedLookahead: extendedLookahead.toFixed(3),
		// 			isTimelineMode,
		// 			totalEvents: this.processor.projectManager.events.length,
		// 			scheduledCount: this.scheduledEvents.size,
		// 			patternLength,
		// 			timelineLength: this.processor.projectManager.timeline?.totalLength || 0
		// 		}
		// 	});
		// }

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
					
					// Debug: Log first few scheduled events (disabled for cleaner logs)
					// if (scheduledThisCall <= 3) {
					// 	this.processor.port.postMessage({
					// 		type: 'debug',
					// 		message: 'EventScheduler: Event scheduled',
					// 		data: {
					// 			eventTime: eventTime.toFixed(3),
					// 			eventSampleTime,
					// 			instrumentId: event.instrumentId,
					// 			patternId: event.patternId || 'none',
					// 			pitch: event.pitch,
					// 			velocity: event.velocity
					// 		}
					// 	});
					// }
				}
			}
		}
		
		// Debug: Log scheduling summary (disabled for cleaner logs)
		// if (scheduledThisCall > 0 && (!this._lastScheduledCount || scheduledThisCall !== this._lastScheduledCount)) {
		// 	this._lastScheduledCount = scheduledThisCall;
		// 	this.processor.port.postMessage({
		// 		type: 'debug',
		// 		message: 'EventScheduler: Scheduling summary',
		// 		data: {
		// 			scheduledThisCall,
		// 			totalScheduled: this.scheduledEvents.size
		// 		}
		// 	});
		// }
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
		let baseMeter = 4; // Default baseMeter
		
		if (this.processor.projectManager.baseMeterTrackId) {
			const baseTrack = this.processor.projectManager.getTrack(this.processor.projectManager.baseMeterTrackId);
			if (baseTrack) {
				const rootDivision = baseTrack.patternTree?.division || 4;
				
				// Check if this is a pattern instrument (ID starts with __pattern_)
				if (baseTrack.id && baseTrack.id.startsWith('__pattern_')) {
					// Extract pattern ID and get baseMeter
					const lastUnderscore = baseTrack.id.lastIndexOf('_');
					if (lastUnderscore > '__pattern_'.length) {
						const patternId = baseTrack.id.substring('__pattern_'.length, lastUnderscore);
						const pattern = this.processor.projectManager.patterns?.find(p => p.id === patternId);
						if (pattern) {
							baseMeter = pattern.baseMeter || 4;
						}
					}
				}
				
				// Pattern length = baseMeter, which preserves structure when baseMeter = root.division
				// The hierarchical structure is preserved because children split parent's duration proportionally
				patternLength = baseMeter;
			}
		} else if (this.processor.projectManager.tracks?.[0]) {
			const firstTrack = this.processor.projectManager.tracks[0];
			const rootDivision = firstTrack.patternTree?.division || 4;
			
			// Check if this is a pattern instrument
			if (firstTrack.id && firstTrack.id.startsWith('__pattern_')) {
				const lastUnderscore = firstTrack.id.lastIndexOf('_');
				if (lastUnderscore > '__pattern_'.length) {
					const patternId = firstTrack.id.substring('__pattern_'.length, lastUnderscore);
					const pattern = this.processor.projectManager.patterns?.find(p => p.id === patternId);
					if (pattern) {
						baseMeter = pattern.baseMeter || 4;
					}
				}
			}
			
			// Pattern length = baseMeter, which preserves structure when baseMeter = root.division
			// The hierarchical structure is preserved because children split parent's duration proportionally
			patternLength = baseMeter;
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
		this.timelineTrackToAudioTracks = new Map(); // Maps timeline track IDs to audio track IDs
		this.timelineTracks = []; // Timeline tracks (for looking up patternId on pattern tracks)
		this.processor = null; // Reference to processor for accessing ProjectManager
		this.automation = null; // Project automation data
	}

	initialize(effects, timelineEffects, patternToTrackId, timelineTrackToAudioTracks, processor, timelineTracks, automation) {
		this.effects = effects || [];
		this.timelineEffects = timelineEffects || [];
		this.patternToTrackId = patternToTrackId || new Map();
		this.timelineTrackToAudioTracks = timelineTrackToAudioTracks || new Map();
		this.timelineTracks = timelineTracks || [];
		this.processor = processor || null;
		this.automation = automation || null;
		
		// Debug: Log initialization
		if (this.processor && this.processor.port) {
			const automationKeys = automation ? Object.keys(automation) : [];
			this.processor.port.postMessage({
				type: 'debug',
				message: 'EffectsProcessor initialized',
				data: {
					effectsCount: this.effects.length,
					timelineEffectsCount: this.timelineEffects.length,
					timelineTrackMappingSize: this.timelineTrackToAudioTracks.size,
					automationLoaded: !!automation,
					automationKeysCount: automationKeys.length,
					automationKeys: automationKeys.slice(0, 5) // First 5 keys for debugging
				}
			});
		}
	}

	/**
	 * Update effect settings in real-time
	 * @param {string} effectId - The effect ID to update
	 * @param {Object} settings - New settings object (will be merged with existing settings)
	 */
	updateEffect(effectId, settings) {
		const effect = this.effects.find(e => e.id === effectId);
		if (effect) {
			// Update effect settings
			effect.settings = { ...effect.settings, ...settings };
		}
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

		// Find which timeline track this audio track belongs to
		let timelineTrackId = null;
		if (this.timelineTrackToAudioTracks) {
			for (const [tId, audioTrackIds] of this.timelineTrackToAudioTracks.entries()) {
				if (audioTrackIds.includes(trackId)) {
					timelineTrackId = tId;
					break;
				}
			}
		}

		// Debug: Log effect matching details (occasionally)
		if (this.processor && this.processor.port && (!this._lastEffectDebugTime || (currentBeat - this._lastEffectDebugTime) > 8)) {
			this._lastEffectDebugTime = currentBeat;
			const matchingDetails = this.timelineEffects.map(te => {
				const startBeat = te.startBeat || 0;
				const endBeat = startBeat + (te.duration || 0);
				const isActive = currentBeat >= startBeat && currentBeat < endBeat;
				let matchStatus = 'not active';
				if (isActive) {
					if (te.patternId) {
						matchStatus = te.patternId === patternId ? 'MATCH (patternId)' : `NO MATCH: patternId mismatch (effect=${te.patternId}, track=${patternId})`;
					} else if (te.trackId) {
						matchStatus = te.trackId === timelineTrackId ? 'MATCH (trackId)' : `NO MATCH: trackId mismatch (effect=${te.trackId}, audioTrack=${timelineTrackId})`;
					} else {
						matchStatus = 'MATCH (global effect)';
					}
				}
				return {
					effectId: te.effectId,
					trackId: te.trackId,
					patternId: te.patternId,
					startBeat,
					duration: te.duration,
					endBeat,
					isActive,
					matchStatus
				};
			});
			this.processor.port.postMessage({
				type: 'debug',
				message: 'Effect matching debug',
				data: {
					trackId,
					patternId,
					timelineTrackId,
					currentBeat: currentBeat.toFixed(2),
					timelineEffectsCount: this.timelineEffects.length,
					timelineEffects: matchingDetails,
					timelineTrackMapping: Array.from(this.timelineTrackToAudioTracks.entries()).map(([tid, aids]) => ({
						timelineTrackId: tid,
						audioTrackIds: aids,
						includesCurrentTrack: aids.includes(trackId)
					}))
				}
			});
		}

		// Find timeline effects that are active at this position
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);

			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				let shouldApply = false;
				let matchReason = '';

				// Check pattern assignment first
				if (timelineEffect.patternId) {
					// Effect is assigned to a specific pattern
					if (patternId && timelineEffect.patternId === patternId) {
						shouldApply = true;
						matchReason = 'patternId match';
					} else {
						matchReason = `patternId mismatch: effect=${timelineEffect.patternId}, track=${patternId}`;
					}
				} else if (timelineEffect.trackId) {
					// Effect is assigned to a specific timeline track
					// Effects can ONLY be on effect tracks (not pattern or envelope tracks)
					const effectTimelineTrack = this.timelineTracks.find(t => t.id === timelineEffect.trackId);
					if (effectTimelineTrack) {
						if (effectTimelineTrack.type === 'effect') {
							// Effect is on an effect track - apply globally to all tracks
							shouldApply = true;
							matchReason = 'effect track (global)';
						} else {
							// Effect is incorrectly placed on a non-effect track (shouldn't happen, but handle gracefully)
							matchReason = `effect on wrong track type: effect=${timelineEffect.trackId} (type=${effectTimelineTrack.type}, should be 'effect')`;
						}
					} else {
						// Timeline track not found - this shouldn't happen but handle gracefully
						// Debug: Log this case
						if (this.processor && this.processor.port && Math.random() < 0.1) {
							this.processor.port.postMessage({
								type: 'debug',
								message: 'Timeline track not found for effect',
								data: {
									effectTrackId: timelineEffect.trackId,
									availableTrackIds: this.timelineTracks.map(t => t.id),
									timelineTracksCount: this.timelineTracks.length
								}
							});
						}
						matchReason = `trackId mismatch: effect=${timelineEffect.trackId} (track not found), audioTrack=${timelineTrackId}`;
					}
				} else {
					// Global effect (no trackId or patternId) - applies to all tracks
					shouldApply = true;
					matchReason = 'global effect';
				}

				if (shouldApply) {
					const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
					if (effectDef) {
						// Apply automation to effect settings
						const automatedSettings = this.applyAutomationToEffect(
							effectDef,
							timelineEffect.id,
							currentBeat,
							startBeat,
							endBeat
						);
						
						activeEffects.push({
							...effectDef,
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat) // 0-1 progress through effect
						});
					} else {
						// Debug: Effect definition not found (throttled to avoid spam)
						if (this.processor && this.processor.port) {
							// Track last log time per effect ID to avoid spam
							const lastLogKey = `missing_effect_${timelineEffect.effectId}`;
							const lastLogTime = this._missingEffectLogTimes?.[lastLogKey] || 0;
							if (!this._missingEffectLogTimes) {
								this._missingEffectLogTimes = {};
							}
							
							// Only log once every 4 beats to avoid infinite loops
							if (currentBeat - lastLogTime > 4) {
								this._missingEffectLogTimes[lastLogKey] = currentBeat;
								this.processor.port.postMessage({
									type: 'debug',
									message: 'Effect definition not found',
									data: { 
										effectId: timelineEffect.effectId, 
										availableIds: this.effects.map(e => e.id),
										matchReason
									}
								});
							}
						}
					}
				} else {
					// Debug: Log why effect didn't match (occasionally)
					if (this.processor && this.processor.port && Math.random() < 0.1) {
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Effect not matching',
							data: {
								effectId: timelineEffect.effectId,
								matchReason,
								effectTrackId: timelineEffect.trackId,
								effectPatternId: timelineEffect.patternId,
								audioTrackId: trackId,
								audioPatternId: patternId,
								audioTimelineTrackId: timelineTrackId,
								currentBeat: currentBeat.toFixed(2),
								effectTimeRange: `${startBeat.toFixed(2)}-${endBeat.toFixed(2)}`
							}
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

		if (activeEffects && activeEffects.length > 0) {
			for (const effect of activeEffects) {
				processed = this.applyEffect(processed, effect);
			}
		}

		return processed;
	}

	/**
	 * Apply automation curves to effect settings
	 * @param {Object} effectDef - Effect definition
	 * @param {string} timelineEffectId - Timeline effect instance ID
	 * @param {number} currentBeat - Current playback position
	 * @param {number} startBeat - Effect start beat
	 * @param {number} endBeat - Effect end beat
	 * @returns {Object} Effect settings with automation applied
	 */
	applyAutomationToEffect(effectDef, timelineEffectId, currentBeat, startBeat, endBeat) {
		if (!this.automation || !effectDef) {
			return effectDef.settings || {};
		}

		// Start with base settings
		const automatedSettings = { ...(effectDef.settings || {}) };

		// Find all automation curves for this effect instance
		let automationFound = false;
		for (const [automationId, automation] of Object.entries(this.automation)) {
			if (!automation || typeof automation !== 'object') continue;
			
			const auto = automation;
			// Check if this automation is for this effect and timeline instance
			if (auto.targetType === 'effect' && 
			    auto.targetId === effectDef.id && 
			    auto.timelineInstanceId === timelineEffectId) {
				
				automationFound = true;
				
				// Get automation value at current beat
				const value = this.getAutomationValueAtBeat(auto.points || [], currentBeat, auto.min || 0, auto.max || 1);
				
				// Debug: Log automation application (throttled)
				if (this.processor && this.processor.port) {
					const lastLogKey = `automation_${timelineEffectId}_${auto.parameterKey}`;
					const lastLogTime = this._automationLogTimes?.[lastLogKey] || 0;
					if (!this._automationLogTimes) {
						this._automationLogTimes = {};
					}
					
					// Log once every 2 beats to verify automation is working
					if (currentBeat - lastLogTime > 2) {
						this._automationLogTimes[lastLogKey] = currentBeat;
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Automation being applied',
							data: {
								effectId: effectDef.id,
								timelineEffectId,
								parameterKey: auto.parameterKey,
								currentBeat: currentBeat.toFixed(2),
								automatedValue: value.toFixed(3),
								baseValue: (effectDef.settings?.[auto.parameterKey] || 0).toFixed(3),
								pointsCount: auto.points?.length || 0,
								points: auto.points?.map(p => ({ beat: p.beat.toFixed(2), value: p.value.toFixed(3) })) || [],
								automationId
							}
						});
					}
				}
				
				// Apply to the parameter
				automatedSettings[auto.parameterKey] = value;
			}
		}
		
		// Debug: Log automation lookup details (throttled)
		if (this.processor && this.processor.port) {
			const lastLogKey = `automation_lookup_${timelineEffectId}`;
			const lastLogTime = this._automationLogTimes?.[lastLogKey] || 0;
			if (!this._automationLogTimes) {
				this._automationLogTimes = {};
			}
			
			// Log once every 4 beats to debug automation lookup
			if (currentBeat - lastLogTime > 4 && this.automation) {
				this._automationLogTimes[lastLogKey] = currentBeat;
				
				const allAutomationKeys = Object.keys(this.automation || {});
				const effectAutomationKeys = allAutomationKeys.filter(key => {
					const auto = this.automation[key];
					return auto && typeof auto === 'object' && 
					       auto.targetType === 'effect' && 
					       auto.targetId === effectDef.id;
				});
				
				this.processor.port.postMessage({
					type: 'debug',
					message: 'Automation lookup debug',
					data: {
						effectId: effectDef.id,
						timelineEffectId,
						currentBeat: currentBeat.toFixed(2),
						automationFound,
						totalAutomationKeys: allAutomationKeys.length,
						effectAutomationKeys: effectAutomationKeys,
						effectAutomationDetails: effectAutomationKeys.map(key => {
							const auto = this.automation[key];
							return {
								key,
								targetType: auto?.targetType,
								targetId: auto?.targetId,
								timelineInstanceId: auto?.timelineInstanceId,
								parameterKey: auto?.parameterKey,
								pointsCount: auto?.points?.length || 0
							};
						})
					}
				});
			}
		}

		return automatedSettings;
	}

	/**
	 * Get automation value at a specific beat using linear interpolation
	 * @param {Array} points - Automation points array
	 * @param {number} beat - Beat position
	 * @param {number} min - Minimum value
	 * @param {number} max - Maximum value
	 * @returns {number} Interpolated value
	 */
	getAutomationValueAtBeat(points, beat, min, max) {
		if (!points || points.length === 0) {
			return (min + max) / 2; // Default to middle value
		}

		// Sort points by beat
		const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);

		// Before first point
		if (beat <= sortedPoints[0].beat) {
			return sortedPoints[0].value;
		}

		// After last point
		if (beat >= sortedPoints[sortedPoints.length - 1].beat) {
			return sortedPoints[sortedPoints.length - 1].value;
		}

		// Interpolate between points
		for (let i = 0; i < sortedPoints.length - 1; i++) {
			const p1 = sortedPoints[i];
			const p2 = sortedPoints[i + 1];

			if (beat >= p1.beat && beat <= p2.beat) {
				const t = (beat - p1.beat) / (p2.beat - p1.beat);
				return p1.value + (p2.value - p1.value) * t;
			}
		}

		return sortedPoints[0].value;
	}

	/**
	 * Apply a single effect to a sample
	 * @param {number} sample - Input audio sample
	 * @param {Object} effect - Effect definition with settings
	 * @returns {number} Processed audio sample
	 */
	applyEffect(sample, effect) {
		if (!effect || !effect.settings) return sample;

		const settings = effect.settings;
		// Get sample rate from processor if available, otherwise use default
		const sampleRate = (this.processor && this.processor.sampleRate) ? this.processor.sampleRate : 44100;

		switch (effect.type) {
		case 'reverb':
			// Simple reverb using wet/dry mix
			// Real reverb would need delay buffers, but this provides basic effect
			const reverbWet = settings.wet !== undefined ? settings.wet : 0.5;
			const reverbDry = settings.dry !== undefined ? settings.dry : 0.5;
			const reverbRoomSize = settings.roomSize !== undefined ? settings.roomSize : 0.7;
			// Make reverb more noticeable - add some resonance/feedback effect
			const reverbAmount = reverbRoomSize * 0.6; // Increased for more noticeable effect
			// Add harmonic enhancement and slight delay-like effect to make it more audible
			const reverbEnhanced = sample * (1 + reverbWet * reverbAmount);
			// Add slight feedback for more realistic reverb tail
			const reverbFeedback = this._reverbFeedback || 0;
			this._reverbFeedback = reverbEnhanced * 0.3 * reverbRoomSize;
			return sample * reverbDry + (reverbEnhanced + reverbFeedback * 0.5) * reverbWet;

		case 'delay':
			// Delay with proper delay buffer and feedback
			const delayWet = settings.wet !== undefined ? settings.wet : 0.5;
			const delayDry = settings.dry !== undefined ? settings.dry : 0.5;
			const delayFeedback = settings.feedback !== undefined ? settings.feedback : 0.5;
			const delayTime = settings.time !== undefined ? settings.time : 0.25;
			// Use delay buffer for proper echo effect
			if (!this._delayBuffers) {
				this._delayBuffers = new Map(); // trackId -> { buffer, writeIndex }
			}
			const delayKey = 'global'; // Could be per-track if needed
			const maxDelayTime = 2.0; // Maximum delay time in seconds (from UI max)
			const bufferSize = Math.floor(sampleRate * maxDelayTime * 1.5); // Buffer for max delay + safety
			
			if (!this._delayBuffers.has(delayKey)) {
				this._delayBuffers.set(delayKey, {
					buffer: new Float32Array(bufferSize),
					writeIndex: 0
				});
			}
			const delayState = this._delayBuffers.get(delayKey);
			
			// Calculate read position based on delayTime (in samples)
			const delaySamples = Math.floor(delayTime * sampleRate);
			const delayReadIndex = (delayState.writeIndex - delaySamples + bufferSize) % bufferSize;
			
			// Read delayed sample (with linear interpolation for smooth changes)
			const delayReadIndex1 = Math.floor(delayReadIndex);
			const delayReadIndex2 = (delayReadIndex1 + 1) % bufferSize;
			const delayFrac = delayReadIndex - delayReadIndex1;
			const delayedSample1 = delayState.buffer[delayReadIndex1];
			const delayedSample2 = delayState.buffer[delayReadIndex2];
			const delayedSample = delayedSample1 * (1 - delayFrac) + delayedSample2 * delayFrac;
			
			// Write current sample + feedback
			delayState.buffer[delayState.writeIndex] = sample + (delayedSample * delayFeedback);
			delayState.writeIndex = (delayState.writeIndex + 1) % bufferSize;
			
			// Mix dry and wet
			return sample * delayDry + delayedSample * delayWet;

		case 'filter':
			// Simple low-pass filter approximation
			const filterFreq = settings.frequency !== undefined ? settings.frequency : 0.5;
			const filterResonance = settings.resonance !== undefined ? settings.resonance : 0.5;
			// Map frequency (0-1) to a more noticeable filter effect
			// Lower frequency = more filtering (darker sound)
			const filterAmount = filterFreq; // 0 = full filter, 1 = no filter
			// Add resonance boost to make it more audible
			const resonanceBoost = 1 + (filterResonance * 0.3);
			return sample * filterAmount * resonanceBoost;

		case 'distortion':
			// Simple distortion/saturation
			const distortionDrive = settings.drive !== undefined ? settings.drive : 0.5;
			const distortionAmount = settings.amount !== undefined ? settings.amount : 0.3;
			// Apply drive and tanh saturation - make it more aggressive
			const driven = sample * (1 + distortionDrive * 4); // Increased from 2
			const distorted = Math.tanh(driven);
			// Mix between dry and distorted
			return sample * (1 - distortionAmount) + distorted * distortionAmount;

		case 'compressor':
			// Simple compression
			const compThreshold = settings.threshold !== undefined ? settings.threshold : 0.7;
			const compRatio = settings.ratio !== undefined ? settings.ratio : 4;
			const compAttack = settings.attack !== undefined ? settings.attack : 0.01;
			const compRelease = settings.release !== undefined ? settings.release : 0.1;
			const absSample = Math.abs(sample);
			if (absSample > compThreshold) {
				const excess = absSample - compThreshold;
				const compressed = compThreshold + excess / compRatio;
				return Math.sign(sample) * compressed;
			}
			return sample;

		case 'chorus':
			// Chorus would need delay buffers - simple approximation for now
			const chorusWet = settings.wet !== undefined ? settings.wet : 0.5;
			const chorusRate = settings.rate !== undefined ? settings.rate : 0.5;
			const chorusDepth = settings.depth !== undefined ? settings.depth : 0.6;
			const chorusDelay = settings.delay !== undefined ? settings.delay : 0.02;
			// Make chorus more noticeable - use delay buffer with modulation
			if (!this._chorusBuffers) {
				this._chorusBuffers = new Map();
				this._chorusPhases = new Map();
			}
			const chorusKey = 'global';
			if (!this._chorusBuffers.has(chorusKey)) {
				const bufferSize = Math.floor(sampleRate * chorusDelay * 2);
				this._chorusBuffers.set(chorusKey, {
					buffer: new Float32Array(bufferSize),
					writeIndex: 0
				});
				this._chorusPhases.set(chorusKey, 0);
			}
			const chorusState = this._chorusBuffers.get(chorusKey);
			const chorusPhase = this._chorusPhases.get(chorusKey);
			// Write current sample
			chorusState.buffer[chorusState.writeIndex] = sample;
			chorusState.writeIndex = (chorusState.writeIndex + 1) % chorusState.buffer.length;
			// Calculate modulated delay (LFO)
			const lfo = Math.sin(chorusPhase * 2 * Math.PI * chorusRate);
			const modulatedDelay = chorusDelay * (1 + lfo * chorusDepth);
			const chorusReadIndex = (chorusState.writeIndex - Math.floor(modulatedDelay * sampleRate) + chorusState.buffer.length) % chorusState.buffer.length;
			const chorusedSample = chorusState.buffer[chorusReadIndex];
			// Update phase
			this._chorusPhases.set(chorusKey, (chorusPhase + chorusRate / sampleRate) % 1.0);
			// Mix dry and wet
			return sample * (1 - chorusWet) + chorusedSample * chorusWet;

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
		this.timelineTracks = []; // Timeline tracks (for validation)
		this.processor = null; // Reference to processor for debug logging
	}

	initialize(envelopes, timelineEnvelopes, patternToTrackId, timelineTracks, processor = null) {
		this.envelopes = envelopes || [];
		this.timelineEnvelopes = timelineEnvelopes || [];
		this.patternToTrackId = patternToTrackId || new Map();
		this.timelineTracks = timelineTracks || [];
		this.processor = processor || null;
		
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
	 * Update envelope settings in real-time
	 * @param {string} envelopeId - The envelope ID to update
	 * @param {Object} settings - New settings object (will be merged with existing settings)
	 */
	updateEnvelope(envelopeId, settings) {
		const envelope = this.envelopes.find(e => e.id === envelopeId);
		if (envelope) {
			// Update envelope settings
			envelope.settings = { ...envelope.settings, ...settings };
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
							const lastLogTime = this._missingEnvelopeLogTimes?.[lastLogKey] || 0;
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

		// Debug: Log pitch envelope values (occasionally)
		if (envelopeType === 'pitch' && this.processor && this.processor.port) {
			const lastLogKey = `pitch_env_${envelopeDef.id}`;
			const lastLogTime = this._pitchEnvLogTimes?.[lastLogKey] || 0;
			if (!this._pitchEnvLogTimes) {
				this._pitchEnvLogTimes = {};
			}
			if (currentBeat - lastLogTime > 2) {
				this._pitchEnvLogTimes[lastLogKey] = currentBeat;
				const actualStartValue = envelopeDef.settings.startValue !== undefined ? envelopeDef.settings.startValue : (envelopeType === 'pitch' ? 0.5 : 0);
				const actualEndValue = envelopeDef.settings.endValue !== undefined ? envelopeDef.settings.endValue : (envelopeType === 'pitch' ? 0.5 : 1);
				let pitchMultiplier;
				if (value <= 0.5) {
					pitchMultiplier = 0.5 + (value * 1.0);
				} else {
					pitchMultiplier = 1.0 + ((value - 0.5) * 2.0);
				}
				this.processor.port.postMessage({
					type: 'debug',
					message: 'Pitch envelope calculation',
					data: {
						progress: progress.toFixed(3),
						startValue: actualStartValue,
						endValue: actualEndValue,
						rawStartValue: envelopeDef.settings.startValue,
						rawEndValue: envelopeDef.settings.endValue,
						calculatedValue: value.toFixed(3),
						pitchMultiplier: pitchMultiplier.toFixed(3),
						currentBeat: currentBeat.toFixed(2)
					}
				});
			}
		}

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
		this.patterns = []; // Store patterns to access baseMeter
		this.effects = [];
		this.envelopes = [];
		this.baseMeterTrackId = null;
		this.isArrangementView = false;
		this.patternToTrackId = new Map();
		this.timelineTrackToAudioTracks = new Map(); // Maps timeline track ID to array of audio track IDs
	}

	loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId, timelineTrackToAudioTracks, automation, patterns) {
		this.tracks = tracks;
		this.events = events || [];
		this.timeline = timeline || null;
		this.patterns = patterns || []; // Store patterns to access baseMeter
		this.effects = effects || [];
		this.envelopes = envelopes || [];
		this.isArrangementView = viewMode === 'arrangement' && timeline && timeline.clips && timeline.clips.length > 0;
		
		// Build timeline track to audio tracks mapping
		this.timelineTrackToAudioTracks.clear();
		if (timelineTrackToAudioTracks && Array.isArray(timelineTrackToAudioTracks)) {
			for (const [timelineTrackId, audioTrackIds] of timelineTrackToAudioTracks) {
				this.timelineTrackToAudioTracks.set(timelineTrackId, audioTrackIds);
			}
		}
		
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
		const timelineTracks = timeline?.tracks || [];
		// Pass automation data to effects processor
		this.processor.effectsProcessor.initialize(effects || [], timelineEffects, this.patternToTrackId, this.timelineTrackToAudioTracks, this.processor, timelineTracks, automation || null);
		this.processor.envelopesProcessor.initialize(envelopes || [], timelineEnvelopes, this.patternToTrackId, timelineTracks, this.processor);
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
		// Inline flattenTrackPattern function (can't use require in AudioWorklet)
		const flattenTree = (node, parentDuration, startTime, instrumentId) => {
			// Leaf node - create event
			if (!node.children || node.children.length === 0) {
				// Check if this is the root node (empty pattern)
				// If startTime is 0, it's the root node - treat as empty if no velocity/pitch
				if (startTime === 0 && node.velocity === undefined && node.pitch === undefined) {
					return [];
				}
				// Real leaf node - create event
				return [{
					time: startTime,
					velocity: node.velocity !== undefined ? node.velocity : 1.0,
					pitch: node.pitch !== undefined ? node.pitch : 60,
					instrumentId
				}];
			}
			
			// Calculate total division sum for proportional distribution
			const totalDivision = node.children.reduce((sum, child) => sum + (child.division || 1), 0);
			
			if (totalDivision === 0) {
				return [];
			}
			
			// Recursively process children with proportional timing
			let currentTime = startTime;
			const events = [];
			
			for (const child of node.children) {
				const childDivision = child.division || 1;
				const childDuration = parentDuration * (childDivision / totalDivision);
				events.push(...flattenTree(child, childDuration, currentTime, instrumentId));
				currentTime += childDuration;
			}
			
			return events;
		};
		
		const flattenTrackPattern = (rootNode, trackId, baseMeter = 4) => {
			// Pattern length = baseMeter, which preserves structure when baseMeter = root.division
			// The hierarchical structure is preserved because children split parent's duration proportionally
			const patternLength = baseMeter;
			return flattenTree(rootNode, patternLength, 0.0, trackId);
		};
		
		// Determine baseMeter for this track
		let baseMeter = 4; // Default for standalone instruments
		if (trackId && trackId.startsWith('__pattern_')) {
			// Extract pattern ID and get baseMeter from patterns
			const lastUnderscore = trackId.lastIndexOf('_');
			if (lastUnderscore > '__pattern_'.length) {
				const patternId = trackId.substring('__pattern_'.length, lastUnderscore);
				const pattern = this.patterns?.find(p => p.id === patternId);
				if (pattern) {
					baseMeter = pattern.baseMeter || 4;
				}
			}
		}
		
		const newEvents = flattenTrackPattern(track.patternTree, trackId, baseMeter);
		
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

	updateTimelineTrackVolume(trackId, volume) {
		if (this.timeline && this.timeline.tracks) {
			const track = this.timeline.tracks.find(t => t.id === trackId);
			if (track) {
				track.volume = volume;
			}
		}
	}

	updateTimelineTrackMute(trackId, mute) {
		if (this.timeline && this.timeline.tracks) {
			const track = this.timeline.tracks.find(t => t.id === trackId);
			if (track) {
				track.mute = mute;
			}
		}
	}

	updateTimelineTrackSolo(trackId, solo) {
		if (this.timeline && this.timeline.tracks) {
			const track = this.timeline.tracks.find(t => t.id === trackId);
			if (track) {
				track.solo = solo;
			}
		}
	}

	getTimelineTrackVolume(trackId) {
		if (this.timeline && this.timeline.tracks) {
			const track = this.timeline.tracks.find(t => t.id === trackId);
			return track?.volume ?? 1.0;
		}
		return 1.0;
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
		
		// Debug tracking (per-track to avoid infinite loops)
		this._lastDebugStates = new Map(); // trackId_patternId -> {muted, soloed, beat}
	}

	mixSynths(synths, masterGain = 0.3, currentBeat = 0, isArrangementView = false) {
		let leftSample = 0;
		let rightSample = 0;
		
		// Check if any timeline track is soloed (for arrangement view)
		let hasSoloedTimelineTrack = false;
		if (isArrangementView && this.processor && this.processor.projectManager && this.processor.projectManager.timeline?.tracks) {
			hasSoloedTimelineTrack = this.processor.projectManager.timeline.tracks.some((t) => t.type === 'pattern' && t.solo === true);
		}
		
		const hasSoloedTrack = this.trackStateManager.hasAnySoloedTrack();
		
		for (const [trackId, synth] of synths.entries()) {
			if (synth.process) {
				// Find all timeline tracks this audio track belongs to
				const timelineTracks = [];
				if (isArrangementView && this.processor && this.processor.projectManager && this.processor.projectManager.timelineTrackToAudioTracks) {
					for (const [timelineTrackId, audioTrackIds] of this.processor.projectManager.timelineTrackToAudioTracks.entries()) {
						if (audioTrackIds.includes(trackId)) {
							const timelineTrack = this.processor.projectManager.timeline?.tracks?.find((t) => t.id === timelineTrackId);
							if (timelineTrack && timelineTrack.type === 'pattern') {
								timelineTracks.push(timelineTrack);
							}
						}
					}
				}
				
				// Check timeline track mute/solo state (for arrangement view)
				// For mute: Check if there's at least one active clip on a non-muted timeline track
				// For solo: Check if there's at least one active clip on a soloed timeline track
				let isTimelineMuted = false;
				let isTimelineSoloed = false;
				if (isArrangementView && timelineTracks.length > 0) {
					// Get pattern ID to find active clips
					let patternId = null;
					if (trackId && trackId.startsWith('__pattern_')) {
						const patternPrefix = '__pattern_';
						const afterPrefix = trackId.substring(patternPrefix.length);
						const uuidMatch = afterPrefix.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
						if (uuidMatch) {
							patternId = uuidMatch[1];
						}
					}
					
					// Find active clips for this pattern at current beat
					if (patternId && this.processor && this.processor.projectManager && this.processor.projectManager.timeline?.clips) {
						const activeClips = this.processor.projectManager.timeline.clips.filter((clip) => {
							return clip.patternId === patternId &&
							       currentBeat >= clip.startBeat &&
							       currentBeat < clip.startBeat + clip.duration;
						});
						
						if (activeClips.length > 0) {
							// Check if all active clips are on muted timeline tracks
							const allClipsMuted = activeClips.every((clip) => {
								const clipTrack = this.processor.projectManager.timeline?.tracks?.find((t) => t.id === clip.trackId);
								return clipTrack && clipTrack.mute === true;
							});
							
							// If any timeline track is soloed, play if ANY active clip is on a soloed track
							// This allows soloed tracks to play even if other non-soloed clips are active
							if (hasSoloedTimelineTrack) {
								// Solo mode: play if ANY active clip is on a soloed track
								const hasSoloedClip = activeClips.some((clip) => {
									const clipTrack = this.processor.projectManager.timeline?.tracks?.find((t) => t.id === clip.trackId);
									return clipTrack && clipTrack.solo === true;
								});
								isTimelineSoloed = hasSoloedClip;
							} else {
								// No solo mode: check if any active clip is on a soloed timeline track (shouldn't happen, but for safety)
								const hasSoloedClip = activeClips.some((clip) => {
									const clipTrack = this.processor.projectManager.timeline?.tracks?.find((t) => t.id === clip.trackId);
									return clipTrack && clipTrack.solo === true;
								});
								isTimelineSoloed = hasSoloedClip;
							}
							
							isTimelineMuted = allClipsMuted;
							
							// Debug: Log mute/solo decision for this track (track-specific, throttled)
							const debugKey = `${trackId}_${patternId}`;
							const lastDebugState = this._lastDebugStates?.get(debugKey);
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
									const clipTrack = this.processor.projectManager.timeline?.tracks?.find((t) => t.id === clip.trackId);
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
								
								this.processor.port.postMessage({
									type: 'debug',
									message: 'AudioMixer: Mute/Solo Check',
									data: {
										currentBeat: currentBeat.toFixed(3),
										trackId,
										patternId,
										activeClips: clipInfo,
										activeClipsCount: activeClips.length,
										allClipsMuted,
										isTimelineMuted,
										isTimelineSoloed,
										hasSoloedTimelineTrack,
										willSkip: isTimelineMuted || (hasSoloedTimelineTrack && !isTimelineSoloed),
										skipReason: isTimelineMuted ? 'muted' : (hasSoloedTimelineTrack && !isTimelineSoloed ? 'not-soloed' : 'none')
									}
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
				
				// Check audio track mute/solo state (for pattern view or standalone tracks)
				const isMuted = this.trackStateManager.isMuted(trackId);
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
					// Debug: Log event trigger (disabled for cleaner logs)
					// if (!this._lastTriggerTime || (sampleTime - this._lastTriggerTime) > this.processor.sampleRate * 0.1) {
					// 	this._lastTriggerTime = sampleTime;
					// 	this.processor.port.postMessage({
					// 		type: 'debug',
					// 		message: 'AudioProcessor: Triggering event',
					// 		data: {
					// 			sampleTime,
					// 			currentBeat: currentBeat.toFixed(3),
					// 			instrumentId: event.instrumentId,
					// 			patternId: event.patternId || 'none',
					// 			pitch: event.pitch,
					// 			velocity: event.velocity,
					// 			eventTime: event.time
					// 		}
					// 	});
					// }
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
			this.processor.loadProject(message.tracks, message.bpm, message.events, message.baseMeterTrackId, message.timeline, message.effects, message.envelopes, message.viewMode, message.patternToTrackId, message.timelineTrackToAudioTracks, message.automation, message.patterns);
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
		case 'updateTimelineTrackVolume':
			this.processor.updateTimelineTrackVolume(message.trackId, message.volume);
			break;
		case 'updateTimelineTrackMute':
			this.processor.updateTimelineTrackMute(message.trackId, message.mute);
			break;
		case 'updateTimelineTrackSolo':
			this.processor.updateTimelineTrackSolo(message.trackId, message.solo);
			break;
		case 'updateEffect':
			this.processor.updateEffect(message.effectId, message.settings);
			break;
		case 'updateEnvelope':
			this.processor.updateEnvelope(message.envelopeId, message.settings);
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
		case 'pad':
			return new PadSynth(settings, this.sampleRate);
		case 'organ':
			return new OrganSynth(settings, this.sampleRate);
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

	loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId, timelineTrackToAudioTracks, automation, patterns) {
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
		this.projectManager.loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId, timelineTrackToAudioTracks, automation, patterns);
		
		// Initialize track state
		this.trackState.initializeTracks(tracks);
		
		// Don't initialize timeline track mute/solo on audio tracks
		// AudioMixer will check timeline track mute/solo state based on active clips
		// This allows the same pattern on multiple tracks to be muted/soloed independently
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
			
		// If instrument type changed, create new synth to replace old one seamlessly
		if (oldTrack.instrumentType !== updatedTrack.instrumentType) {
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
			
			// Remove old synth first to force creation of new one with new instrument type
			this.synthManager.removeSynth(trackId);
			
			// Create new synth with updated instrument type
			// The track has already been updated in projectManager, so getOrCreateSynth will use the new type
			this.synthManager.getOrCreateSynth(trackId, patternId);
			
			// Update synth settings to match the new track settings
			if (updatedTrack.settings) {
				this.synthManager.updateSynthSettings(trackId, updatedTrack.settings);
			}
		}
			
		// If pattern tree changed, update it in real-time
		if (oldTrack && updatedTrack.patternTree && oldTrack.patternTree !== updatedTrack.patternTree) {
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

	updateTimelineTrackVolume(trackId, volume) {
		this.projectManager.updateTimelineTrackVolume(trackId, volume);
	}

	updateTimelineTrackMute(trackId, mute) {
		this.projectManager.updateTimelineTrackMute(trackId, mute);
		// Don't set mute on audio tracks - AudioMixer will check timeline track mute state based on active clips
		// This allows the same pattern on multiple tracks to be muted independently
	}

	updateTimelineTrackSolo(trackId, solo) {
		this.projectManager.updateTimelineTrackSolo(trackId, solo);
		// Don't set solo on audio tracks - AudioMixer will check timeline track solo state based on active clips
		// This allows the same pattern on multiple tracks to be soloed independently
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

	updateEffect(effectId, settings) {
		this.effectsProcessor.updateEffect(effectId, settings);
	}

	updateEnvelope(envelopeId, settings) {
		this.envelopesProcessor.updateEnvelope(envelopeId, settings);
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
 * Generates an organic, realistic kick drum sound
 * - Multiple oscillators with slight detuning for character
 * - Clean tonal body without noise/rattling or clicks
 * - Realistic pitch envelope (quick drop like real drum head)
 * - Natural compression/saturation characteristics
 */

class KickSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0; // Continuous phase accumulator (0-2π)
		this.phase2 = 0; // Second oscillator phase accumulator (0-2π)
		this.envelopePhase = 0;
		this.isActive = false;
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade for drums
		
		// DC blocking filter to prevent DC offset clicks
		this.dcFilterState = { x1: 0, y1: 0 };
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		// Always reset phase for drums - each hit needs a fresh start
		// Reset to 0 to start from beginning of waveform
		this.phase = 0;
		this.phase2 = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Reset DC filter state on trigger to prevent clicks
		this.dcFilterState.x1 = 0;
		this.dcFilterState.y1 = 0;
		
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

		// Calculate pitch multiplier (base pitch is C4 = MIDI 60, matching default)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Realistic kick drum frequencies
		// Real kick drums have fundamental around 40-60Hz, with quick pitch drop
		// Higher initial frequency for more punch and impact
		const startFreq = 75 * pitchMultiplier; // Initial frequency (higher for more attack punch)
		const fundamentalFreq = 50 * pitchMultiplier; // Main body frequency (typical kick fundamental)
		const endFreq = 40 * pitchMultiplier; // End frequency (slight drop)
		
		// Realistic pitch envelope - quick drop like a real drum head
		// The head tension releases quickly, causing pitch to drop
		// Use smooth continuous curve to prevent clicks
		let freq;
		if (this.envelopePhase < attack + decay) {
			// Smooth pitch drop throughout attack and decay
			const totalPhase = this.envelopePhase / (attack + decay);
			// Use smooth exponential curve for continuous frequency change
			// Start at startFreq, quickly drop to fundamentalFreq, then slowly to endFreq
			if (totalPhase < 0.2) {
				// Quick initial drop (first 20% of total duration)
				const phase = totalPhase / 0.2;
				freq = startFreq * Math.exp(-phase * 3) + fundamentalFreq * (1 - Math.exp(-phase * 3));
			} else {
				// Slower decay to end frequency
				const phase = (totalPhase - 0.2) / 0.8;
				freq = fundamentalFreq * Math.exp(-phase * 1.5) + endFreq * (1 - Math.exp(-phase * 1.5));
			}
		} else {
			// During release, maintain end frequency
			freq = endFreq;
		}

		// Multiple oscillators with slight detuning for organic character
		// Real drums have multiple resonances that create a richer sound
		const detune1 = 1.0; // Main oscillator
		const detune2 = 1.02; // Slightly detuned for character (2% detune)
		
		// Calculate phase increments based on current frequency
		// This ensures smooth phase accumulation even when frequency changes
		const phaseIncrement1 = 2 * Math.PI * freq * detune1 / this.sampleRate;
		const phaseIncrement2 = 2 * Math.PI * freq * detune2 / this.sampleRate;
		
		// Generate sine waves using continuous phase accumulation
		const sine1 = Math.sin(this.phase);
		const sine2 = Math.sin(this.phase2);
		
		// Accumulate phase continuously (wrap to prevent overflow)
		this.phase += phaseIncrement1;
		this.phase2 += phaseIncrement2;
		
		// Wrap phases smoothly using modulo to prevent discontinuities
		// Use larger range (100 * 2π) before wrapping to maintain precision
		const twoPi = 2 * Math.PI;
		const wrapRange = 100 * twoPi;
		if (this.phase > wrapRange) {
			this.phase = this.phase % twoPi;
		}
		if (this.phase2 > wrapRange) {
			this.phase2 = this.phase2 % twoPi;
		}
		
		// Combine oscillators with slight phase offset for more character
		const tonalBody = (sine1 * 0.6 + sine2 * 0.4);

		// Extended total duration with long fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.3); // 100ms minimum fade-out
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// ADSR envelope for clean tonal body
		// Use smoother curves to prevent clicks
		let envelope = 0;
		let decayEndValue = sustain;
		
		if (this.envelopePhase < attack) {
			// More aggressive attack for punch and impact
			const attackPhase = this.envelopePhase / attack;
			// Faster exponential curve for more immediate punch
			envelope = 1 - Math.exp(-attackPhase * 8);
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			
			// Smooth exponential decay - avoid mixing exponential and linear to prevent clicks
			// Use pure exponential decay for smoothness
			envelope = Math.exp(-decayPhase * 3) * (1 - sustain) + sustain;
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : sustain;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : sustain) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
		} else {
			envelope = 0;
		}

		// Ensure envelope is never negative and clamp to [0, 1]
		envelope = Math.max(0, Math.min(1, envelope));

		// Phase accumulation is done above when calculating sine waves
		this.envelopePhase++;
		
		// Apply envelope to clean tonal body
		// Increased gain from 0.7 to 1.0 for more impact and presence
		let output = tonalBody * envelope * this.velocity * 1.0;
		
		// DC blocking filter to remove any DC offset that could cause clicks
		// Simple one-pole high-pass filter
		const dcAlpha = 0.995; // Filter coefficient
		const dcFiltered = output - this.dcFilterState.x1 + dcAlpha * this.dcFilterState.y1;
		this.dcFilterState.x1 = output;
		this.dcFilterState.y1 = dcFiltered;
		output = dcFiltered;
		
		// Subtle saturation for organic character (soft clipping)
		// Real drums have natural compression from the head
		// Increased saturation threshold to allow more headroom for punch
		const saturation = 0.4; // Amount of saturation (increased from 0.3)
		if (Math.abs(output) > saturation) {
			const sign = output > 0 ? 1 : -1;
			output = sign * (saturation + (1 - saturation) * Math.tanh((Math.abs(output) - saturation) / (1 - saturation)));
		}
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			// Use smooth curve for fade (sine curve for smoother transition)
			const smoothFade = 0.5 * (1 - Math.cos(Math.PI * fadeProgress));
			const oldGain = 1 - smoothFade;
			const newGain = smoothFade;
			// Smooth the old output to prevent discontinuities
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05; // Smooth transition
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Additional smoothing: apply a very gentle low-pass to prevent any remaining clicks
		// This helps smooth out any remaining discontinuities
		if (this.envelopePhase < 10) {
			// Very gentle fade-in at the very start (first 10 samples)
			const startFade = this.envelopePhase / 10;
			output *= startFade;
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
 * Based on rimshot structure but with strong snare wire rattle
 * - Sharp tonal components (like rimshot) for punch
 * - Strong snare wire rattle (bandpass filtered noise) for snare character
 * - More transients for the rattling effect
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
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.001) * this.sampleRate;
		const decay = (this.settings.decay || 0.15) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Snare = rimshot structure + strong snare wire rattle
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// 1. Sharp tonal "ping" - high frequency sine that quickly decays (like rimshot)
		const pingFreq = 800 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.2));
		const pingPhase = this.phase * 2 * Math.PI * pingFreq / this.sampleRate;
		const ping = Math.sin(pingPhase) * 0.4;
		
		// 2. Body tone - lower frequency for character (like rimshot)
		const bodyFreq = 200 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.5));
		const bodyPhase = this.phase * 2 * Math.PI * bodyFreq / this.sampleRate;
		const body = Math.sin(bodyPhase) * 0.2;
		
		// 3. SNARE WIRES - bandpass filtered noise for rattle (THIS IS THE KEY DIFFERENCE)
		// This is what makes it a snare, not just a rimshot
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Bandpass filter for snare wire rattle (200-800Hz range)
		// Use multiple bandpass filters at different frequencies for more transients/rattling
		// Scale all frequencies proportionally with pitch
		const snareWireCenter1 = 400 * pitchMultiplier; // Hz - main snare wire resonance
		const snareWireCenter2 = 550 * pitchMultiplier; // Hz - secondary resonance for more transients
		const snareWireBandwidth = 300 * pitchMultiplier; // Hz - bandwidth also scales to maintain character
		
		// Simple bandpass approximation for snare wires
		// Create resonant peaks for rattling effect
		const snarePhase1 = this.phase * 2 * Math.PI * snareWireCenter1 / this.sampleRate;
		const snarePhase2 = this.phase * 2 * Math.PI * snareWireCenter2 / this.sampleRate;
		
		// Modulate noise with resonant frequencies to create snare wire rattle
		const snareWire1 = noise * (0.5 + 0.5 * Math.sin(snarePhase1)) * 0.6;
		const snareWire2 = noise * (0.5 + 0.5 * Math.sin(snarePhase2)) * 0.4;
		const snareWireNoise = snareWire1 + snareWire2;
		
		// 4. Bright filtered noise for snappy character (like rimshot, but less)
		const hpfFreq = 2000 * pitchMultiplier;
		const hpfPhase = this.phase * 2 * Math.PI * hpfFreq / this.sampleRate;
		const filteredNoise = noise * (0.3 + 0.7 * Math.abs(Math.sin(hpfPhase))) * 0.3;
		
		// Separate envelopes for different components
		// Body tone needs to decay very fast to avoid melodic tone
		let bodyEnvelope = 0;
		let mainEnvelope = 0;
		let decayEndValue = 0;
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		if (this.envelopePhase < attack) {
			// Very fast attack for sharp transient
			const attackPhase = this.envelopePhase / attack;
			bodyEnvelope = 0.5 * (1 - Math.cos(Math.PI * attackPhase));
			mainEnvelope = 0.5 * (1 - Math.cos(Math.PI * attackPhase));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			
			// Body: extremely fast decay - only first 10% of decay to avoid melodic tone
			if (decayPhase < 0.1) {
				bodyEnvelope = Math.exp(-decayPhase * 20) * (1 - decayPhase / 0.1);
			} else {
				bodyEnvelope = 0; // Cut off body tone early
			}
			
			// Main envelope: quick exponential decay for other components
			mainEnvelope = Math.exp(-decayPhase * 4);
			decayEndValue = mainEnvelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			bodyEnvelope = 0; // Body is gone by release
			// Use exponential decay for smooth release
			mainEnvelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-8);
			bodyEnvelope = 0;
			mainEnvelope = fadeStartValue * Math.exp(-fadePhase * 12);
		} else {
			bodyEnvelope = 0;
			mainEnvelope = 0;
		}

		bodyEnvelope = Math.max(0, Math.min(1, bodyEnvelope));
		mainEnvelope = Math.max(0, Math.min(1, mainEnvelope));

		// Apply separate envelopes - body decays much faster
		const bodyComponent = body * bodyEnvelope;
		const otherComponents = (ping + snareWireNoise + filteredNoise) * mainEnvelope;
		let sample = bodyComponent + otherComponents;

		this.phase++;
		this.envelopePhase++;
		
		let output = sample * this.velocity * 0.7;
		
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
		
		// High-pass filter state
		this.hpFilterState = { x1: 0, y1: 0 };
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
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Reset filter state for clean retrigger
		if (this.hpFilterState) {
			this.hpFilterState.x1 = 0;
			this.hpFilterState.y1 = 0;
		}
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.001) * this.sampleRate;
		const decay = (this.settings.decay || 0.05) * this.sampleRate;
		const release = (this.settings.release || 0.01) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// High-frequency noise (metallic)
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Use high-pass filtering with cutoff that scales with pitch
		// This creates a clear pitch shift by moving the spectral content up/down
		// Higher pitch = higher cutoff = brighter, more metallic sound
		const baseCutoff = 8000; // Base cutoff frequency for C4
		const cutoffFreq = baseCutoff * pitchMultiplier;
		
		// Simple one-pole high-pass filter for pitch shifting
		// Initialize filter state if needed
		if (!this.hpFilterState) {
			this.hpFilterState = { x1: 0, y1: 0 };
		}
		
		// High-pass filter coefficient
		const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
		const dt = 1.0 / this.sampleRate;
		const alpha = rc / (rc + dt);
		
		// Apply high-pass filter
		const filtered = alpha * (this.hpFilterState.y1 + noise - this.hpFilterState.x1);
		this.hpFilterState.x1 = noise;
		this.hpFilterState.y1 = filtered;
		
		let sample = filtered;

		// Extended fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 5);
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential decay for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-8);
			envelope = fadeStartValue * Math.exp(-fadePhase * 10);
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
 * - 2-3 percussive impacts very close together (1-3ms delays)
 * - Bright, sharp noise bursts with bandpass filtering
 * - Short, percussive envelopes
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
		
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.bursts = [];
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// 2-3 percussive impacts very close together (like hands clapping)
		// Use tight timing to create that characteristic clap sound
		const numBursts = 3;
		for (let i = 0; i < numBursts; i++) {
			// Very tight delays: 1-3ms between impacts for that clapping sound
			const delayMs = 0.001 + (i * 0.001) + (Math.random() * 0.001); // 1-3ms total spread
			this.bursts.push({
				delay: Math.floor(delayMs * this.sampleRate),
				phase: 0,
				envelopePhase: 0,
				velocity: velocity * (1 - i * 0.3), // More velocity reduction for later bursts
				noiseIndex: this.noiseIndex + i * 3000 // More offset for variation
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
		
		// Use settings with defaults for clap (very short, percussive)
		const attack = (this.settings.attack || 0.0005) * this.sampleRate; // Even faster attack
		const decay = (this.settings.decay || 0.02) * this.sampleRate; // Much shorter decay for sharp clap
		const release = (this.settings.release || 0.01) * this.sampleRate; // Very short release
		const totalDuration = attack + decay + release;
		const fadeOutSamples = Math.max(0.005 * this.sampleRate, release * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		let sample = 0;
		for (let burst of this.bursts) {
			// Handle delay - decrement and skip processing but don't increment phase yet
			if (burst.delay > 0) {
				burst.delay--;
				continue;
			}
			
			// Use pre-generated noise buffer
			const noiseIdx = (burst.noiseIndex + burst.phase) % this.noiseBuffer.length;
			let noise = this.noiseBuffer[noiseIdx];
			
			// Add a sharp transient "click" at the very start (like hands smacking together)
			// Use lower frequency to avoid squeaking
			let click = 0;
			if (burst.envelopePhase < attack * 3) {
				const clickPhase = burst.envelopePhase / (attack * 3);
				// Lower frequency sine wave that quickly sweeps down - less squeaky
				const clickFreq = 6000 * pitchMultiplier * (1 - clickPhase * 0.9);
				click = Math.sin(burst.phase * 2 * Math.PI * clickFreq / this.sampleRate) * (1 - clickPhase) * 0.4;
			}
			
			// Sharp, percussive ADSR envelope
			let envelope = 0;
			let decayEndValue = 0;
			
			if (burst.envelopePhase < attack) {
				// Instant attack for sharp transient
				envelope = 1.0; // Full volume immediately
			} else if (burst.envelopePhase < attack + decay) {
				const decayPhase = (burst.envelopePhase - attack) / decay;
				// Very quick exponential decay for sharp clap
				envelope = Math.exp(-decayPhase * 10); // Faster decay
				decayEndValue = envelope; // Track the value continuously during decay
			} else if (burst.envelopePhase < attack + decay + release) {
				// Release: fade from decayEndValue to 0
				// Use the value from the last sample of decay phase for smooth transition
				// If decayEndValue wasn't captured (shouldn't happen), calculate it
				let releaseStartValue = decayEndValue;
				if (releaseStartValue <= 0) {
					// Fallback: calculate what the envelope should be at end of decay
					releaseStartValue = Math.exp(-1.0 * 10); // End of decay phase value
				}
				const releasePhase = (burst.envelopePhase - attack - decay) / release;
				// Use exponential decay for smooth release
				envelope = releaseStartValue * Math.exp(-releasePhase * 4);
			} else if (burst.envelopePhase < extendedDuration) {
				// Extended fade-out
				const fadePhase = (burst.envelopePhase - (attack + decay + release)) / fadeOutSamples;
				const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-12);
				envelope = fadeStartValue * Math.exp(-fadePhase * 15);
			}
			
			envelope = Math.max(0, Math.min(1, envelope));
			
			// Bandpass filtering for clap character (emphasize mid-high frequencies)
			// Initialize filter states for this burst if needed
			if (!burst.hpFilterState) {
				burst.hpFilterState = { x1: 0, y1: 0 };
			}
			if (!burst.lpFilterState) {
				burst.lpFilterState = { x1: 0, y1: 0 };
			}
			
			// High-pass filter for brightness - claps are bright and mid-high focused
			const hpCutoff = 2000 * pitchMultiplier; // Higher for more brightness
			const rcHp = 1.0 / (2.0 * Math.PI * hpCutoff);
			const dt = 1.0 / this.sampleRate;
			const alphaHp = rcHp / (rcHp + dt);
			const hpFiltered = alphaHp * (burst.hpFilterState.y1 + noise - burst.hpFilterState.x1);
			burst.hpFilterState.x1 = noise;
			burst.hpFilterState.y1 = hpFiltered;
			
			// Low-pass filter to cut very high frequencies (bandpass effect)
			// Claps have energy in 2-5kHz range - lower cutoff to remove squeaking
			const lpCutoff = 5000 * pitchMultiplier; // Lower to filter out squeaking
			const rcLp = 1.0 / (2.0 * Math.PI * lpCutoff);
			const alphaLp = dt / (rcLp + dt);
			const lpFiltered = alphaLp * hpFiltered + (1 - alphaLp) * burst.lpFilterState.y1;
			burst.lpFilterState.y1 = lpFiltered;
			
			// Add some raw noise for extra body and punch - more for clap character
			const rawBody = noise * 0.2;
			
			// Filter the click through the low-pass as well to remove high-frequency squeaking
			// Apply low-pass to click to smooth it out
			if (!burst.clickLpState) {
				burst.clickLpState = { y1: 0 };
			}
			const clickFiltered = alphaLp * click + (1 - alphaLp) * burst.clickLpState.y1;
			burst.clickLpState.y1 = clickFiltered;
			
			// Combine filtered noise with filtered click - less emphasis on click
			const finalNoise = lpFiltered * 0.75 + clickFiltered * 0.5 + rawBody;
			
			// Add to sample with envelope and velocity
			if (envelope > 0.001) {
				sample += finalNoise * envelope * burst.velocity;
			}
			
			// Always increment phases
			burst.envelopePhase++;
			burst.phase++;
		}
		
		// Remove finished bursts
		this.bursts = this.bursts.filter(b => b.envelopePhase < extendedDuration);
		if (this.bursts.length === 0) {
			this.isActive = false;
			// Only return 0 if we're truly done, otherwise continue processing
			if (Math.abs(sample) < 0.0001) {
				return 0;
			}
		}
		
		let output = sample * 1.0; // Full gain for maximum clap punch
		
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

		// Calculate pitch multiplier (base pitch is D3 = MIDI 50)
		const basePitch = 50;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Descending pitch envelope
		const startFreq = 100 * pitchMultiplier;
		const endFreq = 50 * pitchMultiplier;
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
			// Use exponential decay for smooth release
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
 * High-pass filtered noise for tight, ringing cymbal character
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
		
		// High-pass filter state for thin, high-pitched character
		this.hpFilterState = { x1: 0, y1: 0 };
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
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Reset filter state for clean retrigger
		if (this.hpFilterState) {
			this.hpFilterState.x1 = 0;
			this.hpFilterState.y1 = 0;
		}
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.25) * this.sampleRate; // Tighter decay
		const release = (this.settings.release || 0.2) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Clean noise source
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Use high-pass filtering with cutoff that scales with pitch
		// This creates a clear pitch shift by moving the spectral content up/down
		// Higher pitch = higher cutoff = brighter, more ringing sound
		const baseCutoff = 3500; // Base cutoff frequency for C4
		const cutoffFreq = baseCutoff * pitchMultiplier;
		
		// Simple one-pole high-pass filter for pitch shifting
		// Initialize filter state if needed
		if (!this.hpFilterState) {
			this.hpFilterState = { x1: 0, y1: 0 };
		}
		
		// High-pass filter coefficient
		const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
		const dt = 1.0 / this.sampleRate;
		const alpha = rc / (rc + dt);
		
		// Apply high-pass filter
		const filtered = alpha * (this.hpFilterState.y1 + noise - this.hpFilterState.x1);
		this.hpFilterState.x1 = noise;
		this.hpFilterState.y1 = filtered;
		
		let sample = filtered;

		// Tighter fade-out for cleaner sound
		const fadeOutSamples = Math.max(0.04 * this.sampleRate, release * 0.25);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			// Faster decay for tighter sound
			envelope = Math.exp(-decayPhase * 5);
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential decay for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = (decayEndValue > 0 ? decayEndValue : 0) * Math.exp(-6);
			envelope = fadeStartValue * Math.exp(-fadePhase * 12);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		// Output gain (gain compensation already applied to sample)
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
		
		// High-pass filter state
		this.hpFilterState = { x1: 0, y1: 0 };
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
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Reset filter state for clean retrigger
		if (this.hpFilterState) {
			this.hpFilterState.x1 = 0;
			this.hpFilterState.y1 = 0;
		}
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive) return 0;
		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Transient-shaped noise
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Use high-pass filtering with cutoff that scales with pitch
		// This creates a clear pitch shift by moving the spectral content up/down
		// Higher pitch = higher cutoff = brighter, more rattling sound
		const baseCutoff = 2500; // Base cutoff frequency for C4
		const cutoffFreq = baseCutoff * pitchMultiplier;
		
		// Initialize filter state if needed
		if (!this.hpFilterState) {
			this.hpFilterState = { x1: 0, y1: 0 };
		}
		
		// Simple one-pole high-pass filter for pitch shifting
		const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
		const dt = 1.0 / this.sampleRate;
		const alpha = rc / (rc + dt);
		
		// Apply high-pass filter
		const filtered = alpha * (this.hpFilterState.y1 + noise - this.hpFilterState.x1);
		this.hpFilterState.x1 = noise;
		this.hpFilterState.y1 = filtered;
		
		let sample = filtered;

		// Extended fade-out to prevent clicks
		const fadeOutSamples = Math.max(0.05 * this.sampleRate, release * 0.3);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		let decayEndValue = 0;
		
		if (this.envelopePhase < attack) {
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = Math.exp(-decayPhase * 4);
			decayEndValue = envelope;
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from decayEndValue to 0
			const releaseStartValue = decayEndValue > 0 ? decayEndValue : 0;
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			// Use exponential decay for smooth release
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
		
		// High-pass filter state
		this.hpFilterState = { x1: 0, y1: 0 };
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
		this.pitch = pitch || 60; // Default to C4 (MIDI 60)
		this.noiseIndex = Math.floor(Math.random() * this.noiseBuffer.length);
		
		// Reset filter state for clean retrigger
		if (this.hpFilterState) {
			this.hpFilterState.x1 = 0;
			this.hpFilterState.y1 = 0;
		}
		
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
		
		// Calculate pitch multiplier (base pitch is C4 = MIDI 60)
		const basePitch = 60;
		const pitchMultiplier = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// 1. Sharp tonal "ping" - high frequency sine that quickly decays
		const pingFreq = 800 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.2));
		const pingPhase = this.phase * 2 * Math.PI * pingFreq / this.sampleRate;
		const ping = Math.sin(pingPhase) * 0.4;
		
		// 2. Body tone - lower frequency for character
		const bodyFreq = 200 * pitchMultiplier * Math.exp(-this.envelopePhase / (decay * 0.5));
		const bodyPhase = this.phase * 2 * Math.PI * bodyFreq / this.sampleRate;
		const body = Math.sin(bodyPhase) * 0.2;
		
		// 3. Bright filtered noise for snappy character
		const noise = this.noiseBuffer[this.noiseIndex % this.noiseBuffer.length];
		this.noiseIndex++;
		
		// Use high-pass filtering with cutoff that scales with pitch
		// This creates a clear pitch shift by moving the spectral content up/down
		// Higher pitch = higher cutoff = brighter, snappier sound
		const baseCutoff = 1800; // Base cutoff frequency for C4
		const cutoffFreq = baseCutoff * pitchMultiplier;
		
		// Initialize filter state if needed
		if (!this.hpFilterState) {
			this.hpFilterState = { x1: 0, y1: 0 };
		}
		
		// Simple one-pole high-pass filter for pitch shifting
		const rc = 1.0 / (2.0 * Math.PI * cutoffFreq);
		const dt = 1.0 / this.sampleRate;
		const alpha = rc / (rc + dt);
		
		// Apply high-pass filter
		const filtered = alpha * (this.hpFilterState.y1 + noise - this.hpFilterState.x1);
		this.hpFilterState.x1 = noise;
		this.hpFilterState.y1 = filtered;
		
		const filteredNoise = filtered;
		
		// Mix components (tonal components scale naturally with pitch)
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
			// Use exponential decay for smooth release
			envelope = releaseStartValue * Math.exp(-releasePhase * 6);
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



/**
 * Pad Synth
 * Atmospheric pad synthesis with multiple detuned oscillators, LFO modulation, and filter sweeps
 * Perfect for ambient textures, evolving pads, and atmospheric soundscapes
 */

class PadSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = []; // Array of phases for each oscillator
		this.envelopePhase = 0;
		this.isActive = false;
		this.lfoPhase = 0;
		this.filterLfoPhase = 0;
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Initialize oscillator phases
		const numOscillators = this.settings.numOscillators || 8;
		for (let i = 0; i < numOscillators; i++) {
			this.phase.push(Math.random() * 2 * Math.PI); // Random phase for each oscillator
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
		const numOscillators = this.settings.numOscillators || 8;
		while (this.phase.length < numOscillators) {
			this.phase.push(Math.random() * 2 * Math.PI);
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
				this.phase[i] = Math.random() * 2 * Math.PI; // Random phase for each oscillator
			}
		}
		this.envelopePhase = 0;
		this.lfoPhase = 0;
		this.filterLfoPhase = 0;
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
		
		const attack = (this.settings.attack || 0.5) * this.sampleRate; // Slow attack for pads
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const sustain = this.settings.sustain || 0.9; // High sustain for pads
		const release = (this.settings.release || 1.5) * this.sampleRate; // Long release for pads
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		const numOscillators = this.settings.numOscillators || 8;
		const detune = this.settings.detune || 0.15; // Detune amount in semitones
		const spread = this.settings.spread || 0.7; // Spread amount (0-1)
		const oscType = this.settings.oscType || 'saw'; // Waveform type
		
		// Generate multiple detuned oscillators
		let sample = 0;
		const centerIndex = Math.floor(numOscillators / 2);
		
		for (let i = 0; i < numOscillators; i++) {
			// Calculate detune offset: center oscillator is in tune, others detune symmetrically
			const offset = (i - centerIndex) * detune * spread;
			const oscFreq = freq * Math.pow(2, offset / 12);
			
			// Add LFO pitch modulation for movement
			const pitchLfoRate = this.settings.pitchLfoRate || 0.5; // Hz
			const pitchLfoAmount = this.settings.pitchLfoAmount || 0.02; // Semitones
			const pitchLfo = Math.sin(this.lfoPhase) * pitchLfoAmount;
			const modulatedFreq = oscFreq * Math.pow(2, pitchLfo / 12);
			
			// Generate waveform
			const normalizedPhase = (this.phase[i] % (2 * Math.PI)) / (2 * Math.PI);
			let osc = 0;
			switch (oscType) {
				case 'saw':
					osc = 2 * normalizedPhase - 1;
					break;
				case 'square':
					osc = normalizedPhase < 0.5 ? 1 : -1;
					break;
				case 'sine':
					osc = Math.sin(this.phase[i]);
					break;
				case 'triangle':
					osc = normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
					break;
				default:
					osc = 2 * normalizedPhase - 1;
			}
			
			// Mix oscillators (center gets full volume, outer ones slightly quieter for balance)
			const distanceFromCenter = Math.abs(i - centerIndex);
			const gain = 1.0 - (distanceFromCenter * 0.08); // Slight volume reduction for outer oscillators
			sample += osc * gain;
			
			// Update phase
			this.phase[i] += (modulatedFreq / this.sampleRate) * 2 * Math.PI;
			if (this.phase[i] >= 2 * Math.PI) this.phase[i] -= 2 * Math.PI;
		}
		
		// Normalize by number of oscillators
		sample = sample / numOscillators;
		
		// Apply low-pass filter with LFO modulation
		let cutoff = this.settings.filterCutoff || 4000;
		const resonance = this.settings.filterResonance || 0.3;
		
		// Filter LFO modulation for evolving texture
		const filterLfoRate = this.settings.filterLfoRate || 0.3; // Hz
		const filterLfoAmount = this.settings.filterLfoAmount || 1000; // Hz
		if (filterLfoRate > 0 && filterLfoAmount > 0) {
			const filterLfo = Math.sin(this.filterLfoPhase) * filterLfoAmount;
			cutoff = Math.max(20, Math.min(20000, cutoff + filterLfo));
			this.filterLfoPhase += (filterLfoRate / this.sampleRate) * 2 * Math.PI;
			if (this.filterLfoPhase >= 2 * Math.PI) this.filterLfoPhase -= 2 * Math.PI;
		}
		
		// Update pitch LFO
		if (this.settings.pitchLfoRate > 0) {
			this.lfoPhase += (this.settings.pitchLfoRate / this.sampleRate) * 2 * Math.PI;
			if (this.lfoPhase >= 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;
		}
		
		sample = this.lowpass(sample, cutoff, resonance);
		
		// ADSR envelope - optimized for pads (slow attack, long release)
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Slow, smooth attack
			envelope = 0.5 * (1 - Math.cos(Math.PI * this.envelopePhase / attack));
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < attack + decay + release) {
			// Release: fade from sustain to 0
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * Math.exp(-releasePhase * 4); // Slower decay for pads
		} else if (this.envelopePhase < extendedDuration) {
			// Extended exponential fade-out
			const fadePhase = (this.envelopePhase - (attack + decay + release)) / fadeOutSamples;
			const fadeStartValue = sustain * Math.exp(-4);
			envelope = fadeStartValue * Math.exp(-fadePhase * 8);
		} else {
			envelope = 0;
		}

		envelope = Math.max(0, Math.min(1, envelope));

		this.envelopePhase++;
		
		let output = sample * envelope * this.velocity * 0.25; // Lower gain for pads
		
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



/**
 * Organ Synth
 * Drawbar-style organ synthesis with multiple harmonic oscillators
 * Features rotary speaker simulation (chorus/vibrato) for classic organ sound
 */

class OrganSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = []; // Array of phases for each harmonic
		this.envelopePhase = 0;
		this.isActive = false;
		this.rotaryPhase = 0; // Rotary speaker LFO phase
		this.filterState = { y1: 0, y2: 0, x1: 0, x2: 0 };
		
		// Initialize harmonic phases (9 drawbars: 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1')
		// Harmonic ratios: 0.5, 0.75, 1, 2, 3, 4, 5, 6, 8
		const numHarmonics = 9;
		for (let i = 0; i < numHarmonics; i++) {
			this.phase.push(Math.random() * 2 * Math.PI); // Random phase for each harmonic
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
		
		// Only reset phases if not currently active to prevent clicks
		if (!this.isActive) {
			for (let i = 0; i < this.phase.length; i++) {
				this.phase[i] = Math.random() * 2 * Math.PI; // Random phase for each harmonic
			}
		}
		this.envelopePhase = 0;
		this.rotaryPhase = 0;
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
		
		const attack = (this.settings.attack || 0.01) * this.sampleRate; // Fast attack for organ
		const decay = (this.settings.decay || 0.1) * this.sampleRate;
		const sustain = this.settings.sustain || 1.0; // Full sustain for organ
		const release = (this.settings.release || 0.2) * this.sampleRate;
		const totalDuration = attack + decay + release;

		const freq = 440 * Math.pow(2, (this.pitch - 69) / 12);
		
		// Drawbar levels (0-1) - default to classic organ sound
		const drawbars = this.settings.drawbars || [0.8, 0.0, 1.0, 0.0, 0.6, 0.0, 0.4, 0.0, 0.2];
		
		// Harmonic ratios for each drawbar (16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1')
		const harmonicRatios = [0.5, 0.75, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0];
		
		// Generate harmonics
		let sample = 0;
		for (let i = 0; i < drawbars.length && i < harmonicRatios.length; i++) {
			if (drawbars[i] > 0) {
				const harmonicFreq = freq * harmonicRatios[i];
				const harmonic = Math.sin(this.phase[i]) * drawbars[i];
				sample += harmonic;
				
				// Update phase
				this.phase[i] += (harmonicFreq / this.sampleRate) * 2 * Math.PI;
				if (this.phase[i] >= 2 * Math.PI) this.phase[i] -= 2 * Math.PI;
			}
		}
		
		// Normalize by sum of active drawbars
		const activeDrawbars = drawbars.filter(d => d > 0).length || 1;
		sample = sample / Math.max(1, activeDrawbars * 0.5); // Scale down for safety
		
		// Rotary speaker simulation (chorus/vibrato effect)
		const rotarySpeed = this.settings.rotarySpeed || 4.0; // Hz (typical rotary speed)
		const rotaryDepth = this.settings.rotaryDepth || 0.3; // Depth (0-1)
		
		// Rotary speaker creates pitch modulation (vibrato) and amplitude modulation (tremolo)
		const rotaryLfo = Math.sin(this.rotaryPhase);
		const vibratoAmount = rotaryLfo * rotaryDepth * 0.05; // Small pitch modulation (5 cents max)
		
		// Apply vibrato by slightly modulating the sample (simplified)
		// In a real rotary speaker, this would affect each harmonic differently
		sample = sample * (1 + vibratoAmount * 0.1);
		
		// Tremolo (amplitude modulation)
		const tremoloAmount = (Math.sin(this.rotaryPhase * 2) * 0.5 + 0.5) * rotaryDepth * 0.2 + (1 - rotaryDepth * 0.2);
		sample = sample * tremoloAmount;
		
		// Update rotary phase
		this.rotaryPhase += (rotarySpeed / this.sampleRate) * 2 * Math.PI;
		if (this.rotaryPhase >= 2 * Math.PI) this.rotaryPhase -= 2 * Math.PI;
		
		// Apply low-pass filter (organ tone control)
		const cutoff = this.settings.filterCutoff || 8000;
		const resonance = this.settings.filterResonance || 0.2;
		sample = this.lowpass(sample, cutoff, resonance);
		
		// ADSR envelope - optimized for organ (fast attack, full sustain)
		const fadeOutSamples = Math.max(0.1 * this.sampleRate, release * 0.5);
		const extendedDuration = totalDuration + fadeOutSamples;
		
		let envelope = 0;
		if (this.envelopePhase < attack) {
			// Fast attack for organ
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
