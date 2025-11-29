/**
 * Handles event scheduling and timing
 * Manages when events should be triggered based on playback position
 */

class EventScheduler {
	constructor(processor) {
		this.processor = processor;
		this.scheduledEvents = new Map();
		this._lastScheduledBeat = -1;
		// Adaptive scheduling interval: smaller for dense timelines, larger for sparse ones
		// This reduces unnecessary iterations when there are many events
		this._scheduleInterval = 0.1; // Only schedule every 0.1 beats (~83ms at 120 BPM)
		// Track which events have been scheduled to avoid re-checking them
		this._scheduledEventKeys = new Set(); // Format: "eventIndex_sampleTime"
		// Track the last event index we've checked to enable incremental scheduling
		this._lastCheckedEventIndex = -1;
		// Cleanup threshold: remove scheduled events older than this (in samples)
		this._cleanupThresholdSamples = processor.sampleRate * 0.5; // 500ms lookback
		// Track event count to adapt scheduling interval
		this._lastEventCount = 0;
	}

	scheduleEvents() {
		const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
		const currentSampleTime = this.processor.currentTime;
		
		// Clean up old scheduled events that have already passed
		this._cleanupOldEvents(currentSampleTime);
		
		// Adaptive scheduling interval based on event density
		const events = this.processor.projectManager.events;
		const eventCount = events ? events.length : 0;
		if (eventCount !== this._lastEventCount) {
			// Adjust interval based on event count: more events = less frequent scheduling
			// This prevents excessive iterations when there are many events
			if (eventCount > 1000) {
				this._scheduleInterval = 0.2; // 200ms for very dense timelines
			} else if (eventCount > 500) {
				this._scheduleInterval = 0.15; // 150ms for dense timelines
			} else {
				this._scheduleInterval = 0.1; // 100ms for normal timelines
			}
			this._lastEventCount = eventCount;
		}
		
		// Only schedule if we've moved forward enough (optimization)
		if (this._lastScheduledBeat >= 0 && (currentBeat - this._lastScheduledBeat) < this._scheduleInterval) {
			return; // Skip scheduling if we haven't moved forward enough
		}
		this._lastScheduledBeat = currentBeat;
		
		const lookaheadTime = 0.15; // 150ms
		const lookaheadBeat = currentBeat + lookaheadTime * this.processor.playbackController.beatsPerSecond;
		
		// Get pattern length for looping
		const patternLength = this.getPatternLength();
		const isTimelineMode = this.processor.projectManager.isArrangementView && this.processor.projectManager.timeline && this.processor.projectManager.timeline.totalLength;

		// In arrangement view, schedule events more aggressively - look ahead much further
		// For arrangement view, we want to schedule events well ahead so they're ready when needed
		// But limit lookahead to prevent scheduling too many events at once
		// Use a more conservative lookahead that scales with timeline length
		const timelineLength = isTimelineMode ? this.processor.projectManager.timeline.totalLength : 0;
		const maxLookahead = isTimelineMode ? Math.min(currentBeat + 2.0, timelineLength * 0.1) : lookaheadBeat;
		const extendedLookahead = isTimelineMode ? maxLookahead : lookaheadBeat;

		const events = this.processor.projectManager.events;
		if (!events || events.length === 0) return;

		let scheduledThisCall = 0;
		// Optimized: Only check events that haven't been scheduled yet or are in the lookahead window
		// Start from where we left off for incremental scheduling
		const startIndex = Math.max(0, this._lastCheckedEventIndex);
		
		// Schedule events in the lookahead window
		for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
			const event = events[eventIndex];
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
				const eventKey = `${eventIndex}_${eventSampleTime}`;
				
				// Skip if already scheduled
				if (this._scheduledEventKeys.has(eventKey)) {
					continue;
				}
				
				if (!this.scheduledEvents.has(eventSampleTime)) {
					this.scheduledEvents.set(eventSampleTime, []);
				}
				// Only schedule if not already scheduled (double-check for duplicates)
				const existing = this.scheduledEvents.get(eventSampleTime);
				if (!existing.some(e => e.instrumentId === event.instrumentId && e.time === event.time && e.pitch === event.pitch)) {
					this.scheduledEvents.get(eventSampleTime).push(event);
					this._scheduledEventKeys.add(eventKey);
					scheduledThisCall++;
				}
			} else if (eventTime > checkLookahead) {
				// Events are sorted by time, so we can break early if we've passed the lookahead window
				// But only if we're not in timeline mode with looping (where events might wrap)
				if (!isTimelineMode) {
					break;
				}
			}
		}
		
		// Update last checked index for incremental scheduling
		this._lastCheckedEventIndex = events.length - 1;
		
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
		if (this.scheduledEvents.has(sampleTime)) {
			// Clean up the scheduled event keys for this sample time
			// We need to find and remove all keys that match this sampleTime
			for (const key of this._scheduledEventKeys) {
				if (key.endsWith(`_${sampleTime}`)) {
					this._scheduledEventKeys.delete(key);
				}
			}
			this.scheduledEvents.delete(sampleTime);
		}
	}
	
	/**
	 * Clean up old scheduled events that have already passed
	 * This prevents the Map from growing indefinitely
	 */
	_cleanupOldEvents(currentSampleTime) {
		const cleanupThreshold = currentSampleTime - this._cleanupThresholdSamples;
		const keysToDelete = [];
		
		// Find all sample times that are too old
		for (const sampleTime of this.scheduledEvents.keys()) {
			if (sampleTime < cleanupThreshold) {
				keysToDelete.push(sampleTime);
			}
		}
		
		// Remove old events
		for (const sampleTime of keysToDelete) {
			// Clean up scheduled event keys
			for (const key of this._scheduledEventKeys) {
				if (key.endsWith(`_${sampleTime}`)) {
					this._scheduledEventKeys.delete(key);
				}
			}
			this.scheduledEvents.delete(sampleTime);
		}
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
				this._scheduledEventKeys.clear();
				this._lastCheckedEventIndex = -1;
				// Re-schedule events for next loop
				this.scheduleEvents();
			} else {
				// Pattern mode: reset to 0
				this.processor.currentTime = 0;
				if (this.processor.audioProcessor) {
					this.processor.audioProcessor.lastPlaybackUpdateTime = 0;
				}
				this.scheduledEvents.clear();
				this._scheduledEventKeys.clear();
				this._lastCheckedEventIndex = -1;
				// Re-schedule events for next loop
				this.scheduleEvents();
			}
		}
	}

		clear() {
		this.scheduledEvents.clear();
		this._scheduledEventKeys.clear();
		this._lastScheduledBeat = -1; // Reset scheduling state
		this._lastCheckedEventIndex = -1; // Reset event index tracking
		this._lastEventCount = 0; // Reset event count
	}
}

