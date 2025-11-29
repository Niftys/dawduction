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
		const timelineData = this._normalizeTimeline(timeline, this.events);
		this.timeline = timelineData;
		this.patterns = patterns || []; // Store patterns to access baseMeter
		this.effects = effects || [];
		this.envelopes = envelopes || [];
		this.isArrangementView = viewMode === 'arrangement' && timelineData && timelineData.clips && timelineData.clips.length > 0;
		
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
				tracksCount: (tracks && tracks.length) ? tracks.length : 0,
				eventsCount: this.events.length,
				timelineLength: (timelineData && timelineData.totalLength) ? timelineData.totalLength : 0,
				clipsCount: (timelineData && timelineData.clips && timelineData.clips.length) ? timelineData.clips.length : 0,
				firstEvent: this.events[0] || null,
				firstTrack: (tracks && tracks.length > 0) ? tracks[0] : null
			}
		});
		
		// Set base meter track (defaults to first track if not specified)
		this.baseMeterTrackId = baseMeterTrackId || ((tracks && tracks.length > 0 && tracks[0] && tracks[0].id) ? tracks[0].id : null);
		
		// Build pattern to track ID mapping for effect/envelope assignment
		this.patternToTrackId.clear();
		if (this.isArrangementView) {
			// Use provided mapping if available, otherwise build from tracks
			if (patternToTrackId && Array.isArray(patternToTrackId)) {
				for (const [patternId, trackId] of patternToTrackId) {
					this.patternToTrackId.set(patternId, trackId);
				}
			} else if (timelineData && timelineData.clips) {
				// Fallback: build from tracks
				for (const clip of timelineData.clips) {
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
		const timelineEffects = (timelineData && timelineData.effects) ? timelineData.effects : [];
		const timelineEnvelopes = (timelineData && timelineData.envelopes) ? timelineData.envelopes : [];
		const timelineTracks = (timelineData && timelineData.tracks) ? timelineData.tracks : [];
		// Pass automation data to effects processor
		this.processor.effectsProcessor.initialize(effects || [], timelineEffects, this.patternToTrackId, this.timelineTrackToAudioTracks, this.processor, timelineTracks, automation || null);
		this.processor.envelopesProcessor.initialize(envelopes || [], timelineEnvelopes, this.patternToTrackId, timelineTracks, this.processor);
	}

	getTrack(trackId) {
		if (this.tracks) {
			return this.tracks.find(t => t.id === trackId);
		}
		return null;
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
				if (this.patterns) {
					const pattern = this.patterns.find(p => p.id === patternId);
					if (pattern) {
						baseMeter = pattern.baseMeter || 4;
					}
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
			track.settings = Object.assign({}, track.settings || {}, settings);
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
			if (track && track.volume !== undefined && track.volume !== null) {
				return track.volume;
			}
			return 1.0;
		}
		return 1.0;
	}
	
	_normalizeTimeline(timeline, events) {
		if (!timeline) return null;
		let totalLength = (timeline.totalLength && typeof timeline.totalLength === 'number') ? timeline.totalLength : 0;
		
		const updateMaxLength = (start, duration) => {
			const startBeat = typeof start === 'number' ? start : parseFloat(start) || 0;
			const durationBeats = typeof duration === 'number' ? duration : parseFloat(duration) || 0;
			if (!Number.isFinite(startBeat) || !Number.isFinite(durationBeats)) {
				return;
			}
			const rangeEnd = startBeat + Math.max(durationBeats, 0);
			if (rangeEnd > totalLength) {
				totalLength = rangeEnd;
			}
		};
		
		if (Array.isArray(timeline.clips)) {
			for (const clip of timeline.clips) {
				if (clip) {
					updateMaxLength(clip.startBeat || 0, clip.duration || 0);
				}
			}
		}
		
		if (Array.isArray(timeline.effects)) {
			for (const effect of timeline.effects) {
				if (effect) {
					updateMaxLength(effect.startBeat || 0, effect.duration || 0);
				}
			}
		}
		
		if (Array.isArray(timeline.envelopes)) {
			for (const envelope of timeline.envelopes) {
				if (envelope) {
					updateMaxLength(envelope.startBeat || 0, envelope.duration || 0);
				}
			}
		}
		
		if (Array.isArray(events) && events.length > 0) {
			const lastEvent = events[events.length - 1];
			if (lastEvent && typeof lastEvent.time === 'number' && lastEvent.time > totalLength) {
				totalLength = lastEvent.time;
			}
		}
		
		if (!totalLength || totalLength < 4) {
			totalLength = 4;
		}
		
		// Add a tiny guard so scheduling lookahead can cross the loop boundary cleanly
		const bufferedLength = totalLength + 0.0001;
		
		return Object.assign({}, timeline, {
			totalLength: bufferedLength
		});
	}
}
