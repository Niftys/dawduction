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
		const wasPlaying = this.isPlaying;
		this.isPlaying = state === 'play';
		const newPosition = position * this.samplesPerBeat;
		const isStartingFromBeginning = newPosition === 0 || newPosition < this.samplesPerBeat * 0.1;
		
		// When starting playback from the beginning (not resuming), stop all synths for a clean start
		// This ensures no lingering sounds interfere with the first notes
		if (state === 'play' && !wasPlaying && isStartingFromBeginning && this.processor.synthManager) {
			// Only stop regular synths, not voice pools (polyphonic with overlap)
			// Voice pools will naturally stop when their notes finish, and we want to preserve them for overlap
			for (const synth of this.processor.synthManager.synths.values()) {
				if (synth && synth.isActive !== undefined) {
					synth.isActive = false;
				}
			}
		}
		
		this.processor.currentTime = newPosition;
		
		// When starting playback, force immediate scheduling of events at the start position
		// This ensures events at time 0 (or the start position) are scheduled before the first buffer is processed
		if (state === 'play' && !wasPlaying && this.processor.eventScheduler) {
			// Reset scheduling state to force immediate scheduling
			this.processor.eventScheduler._lastScheduledBeat = -1;
			// Clear any old scheduled events to start fresh
			this.processor.eventScheduler.scheduledEvents.clear();
			this.processor.eventScheduler._scheduledEventKeys.clear();
			this.processor.eventScheduler._lastCheckedEventIndex = -1;
			// Schedule events immediately for the start position
			this.processor.eventScheduler.scheduleEvents();
		}
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

