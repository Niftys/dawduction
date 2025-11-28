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

