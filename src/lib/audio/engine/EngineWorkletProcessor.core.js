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
		// Clear audio mixer caches when reloading
		this.audioMixer.clearCaches();
		
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
		// If playing, preserve the current beat position when BPM changes
		const wasPlaying = this.playbackController.isTransportPlaying();
		let currentBeat = 0;
		
		if (wasPlaying && this.currentTime > 0) {
			// Calculate current beat position before changing BPM
			currentBeat = this.currentTime / this.playbackController.samplesPerBeat;
		}
		
		// Update BPM
		this.playbackController.setTempo(bpm);
		
		// If playing, adjust currentTime to maintain the same beat position
		if (wasPlaying && currentBeat > 0) {
			this.currentTime = currentBeat * this.playbackController.samplesPerBeat;
		}
		
		// Clear scheduled events and reset scheduler state
		// This ensures events are re-scheduled with the new BPM
		if (this.eventScheduler) {
			this.eventScheduler.clear();
			// Force immediate re-scheduling on next process call
			this.eventScheduler._lastScheduledBeat = -1;
			this.eventScheduler._lastCheckedEventIndex = -1;
		}
	}

	setTransport(state, position = 0) {
		// Check if we're in pattern editor mode (not arrangement view)
		const isArrangementView = this.projectManager.isArrangementView && this.projectManager.timeline && this.projectManager.timeline.totalLength;
		
		if (state === 'stop') {
			// When stopping in pattern editor mode, stop all active synths
			// This ensures clean stops without lingering sounds
			if (!isArrangementView) {
				this.synthManager.stopAllSynths();
			}
		}
		
		// When starting playback in pattern editor mode, always start from position 0
		// In arrangement view, preserve the position for pause/resume functionality
		const finalPosition = (state === 'play' && !isArrangementView) ? 0 : position;
		
		this.playbackController.setTransport(state, finalPosition);
	}

	updatePatternTree(trackId, patternTree, baseMeter = 4) {
		this.projectManager.updatePatternTree(trackId, patternTree, baseMeter);
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
			// Determine baseMeter for this track
			let baseMeter = 4; // Default for standalone instruments
			if (trackId && trackId.startsWith('__pattern_')) {
				const lastUnderscore = trackId.lastIndexOf('_');
				if (lastUnderscore > '__pattern_'.length) {
					const patternId = trackId.substring('__pattern_'.length, lastUnderscore);
					if (this.projectManager.patterns) {
						const pattern = this.projectManager.patterns.find(p => p.id === patternId);
						if (pattern) {
							baseMeter = pattern.baseMeter || 4;
						}
					}
				}
			}
			this.updatePatternTree(trackId, updatedTrack.patternTree, baseMeter);
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
				// Determine baseMeter for this track
				let baseMeter = 4; // Default for standalone instruments
				if (trackId && trackId.startsWith('__pattern_')) {
					const lastUnderscore = trackId.lastIndexOf('_');
					if (lastUnderscore > '__pattern_'.length) {
						const patternId = trackId.substring('__pattern_'.length, lastUnderscore);
						if (this.projectManager.patterns) {
							const pattern = this.projectManager.patterns.find(p => p.id === patternId);
							if (pattern) {
								baseMeter = pattern.baseMeter || 4;
							}
						}
					}
				}
				this.updatePatternTree(trackId, updatedTrack.patternTree, baseMeter);
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

	loadSample(trackId, sampleData, sampleRate) {
		// Convert ArrayBuffer to Float32Array
		const audioBuffer = new Float32Array(sampleData);
		
		// Store the buffer in SynthManager (it will be applied when synth is created)
		this.synthManager.loadSample(trackId, audioBuffer, sampleRate);
	}

	process(inputs, outputs, parameters) {
		return this.audioProcessor.process(inputs, outputs, parameters);
	}

	triggerEvent(event) {
		// Extract patternId from event if available (for effects/envelopes)
		const patternId = event.patternId || null;
		const duration = event.duration || null;
		this.synthManager.triggerNote(event.instrumentId, event.velocity, event.pitch, patternId, duration);
	}
}
