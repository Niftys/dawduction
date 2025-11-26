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

