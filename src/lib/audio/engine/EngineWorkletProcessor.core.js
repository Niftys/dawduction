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

	loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId, timelineTrackToAudioTracks) {
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
		this.projectManager.loadProject(tracks, bpm, events, baseMeterTrackId, timeline, effects, envelopes, viewMode, patternToTrackId, timelineTrackToAudioTracks);
		
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
