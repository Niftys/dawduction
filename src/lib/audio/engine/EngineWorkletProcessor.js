// @ts-nocheck
/**
 * AudioWorklet Processor for the DAW engine
 * Runs in a separate thread for sample-accurate timing
 * This file runs in AudioWorklet context, not main thread
 */

class EngineWorkletProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.events = [];
		this.currentTime = 0;
		this.isPlaying = false;
		this.bpm = 120;
		this.sampleRate = sampleRate;
		this.beatsPerSecond = this.bpm / 60;
		this.samplesPerBeat = this.sampleRate / this.beatsPerSecond;
		this.scheduledEvents = new Map(); // Track scheduled events by time
		
		// Synth instances (will be populated per track)
		this.synths = new Map();
		
		this.port.onmessage = (event) => {
			this.handleMessage(event.data);
		};
	}

	handleMessage(message) {
		switch (message.type) {
			case 'loadProject':
				this.loadProject(message.tracks, message.bpm);
				break;
			case 'setTransport':
				this.setTransport(message.state, message.position);
				break;
			case 'setTempo':
				this.setTempo(message.bpm);
				break;
		case 'updatePatternTree':
			this.updatePatternTree(message.trackId, message.patternTree, message.baseMeter);
			break;
			case 'updateTrackSettings':
				this.updateTrackSettings(message.trackId, message.settings);
				break;
		}
	}

	loadProject(tracks, bpm, events) {
		this.tracks = tracks;
		this.setTempo(bpm);
		this.events = events || [];
		this.scheduledEvents.clear();
	}

	setTempo(bpm) {
		this.bpm = bpm;
		this.beatsPerSecond = bpm / 60;
		this.samplesPerBeat = this.sampleRate / this.beatsPerSecond;
		// Re-flatten if we have tracks
		if (this.tracks) {
			this.flattenAllPatterns();
		}
	}

	setTransport(state, position = 0) {
		this.isPlaying = state === 'play';
		this.currentTime = position * this.samplesPerBeat;
		
		if (this.isPlaying) {
			this.flattenAllPatterns();
		}
	}

	flattenAllPatterns() {
		// This will be called from the main thread with flattened events
		// For now, we'll receive events via message
	}

	updatePatternTree(trackId, patternTree, baseMeter = 4) {
		// Update pattern and re-flatten
		const track = this.tracks?.find(t => t.id === trackId);
		if (track) {
			track.patternTree = patternTree;
			// Re-flatten will be handled by main thread
		}
	}

	updateTrackSettings(trackId, settings) {
		const track = this.tracks?.find(t => t.id === trackId);
		if (track) {
			track.settings = { ...track.settings, ...settings };
			// Update synth parameters if synth exists
			const synth = this.synths.get(trackId);
			if (synth && synth.updateSettings) {
				synth.updateSettings(settings);
			}
		}
	}

	// Schedule events 100-150ms ahead
	scheduleEvents() {
		const lookaheadTime = 0.15; // 150ms
		const currentBeat = this.currentTime / this.samplesPerBeat;
		const lookaheadBeat = currentBeat + lookaheadTime * this.beatsPerSecond;

		// Schedule events in the lookahead window
		for (const event of this.events) {
			if (event.time >= currentBeat && event.time < lookaheadBeat) {
				const eventSampleTime = event.time * this.samplesPerBeat;
				if (!this.scheduledEvents.has(eventSampleTime)) {
					this.scheduledEvents.set(eventSampleTime, []);
				}
				this.scheduledEvents.get(eventSampleTime).push(event);
			}
		}
	}

	process(inputs, outputs, parameters) {
		if (!this.isPlaying) {
			return true;
		}

		const output = outputs[0];
		const bufferLength = output[0].length;

		// Schedule events ahead of time
		this.scheduleEvents();

		// Process audio
		for (let i = 0; i < bufferLength; i++) {
			const sampleTime = this.currentTime + i;

			// Check for events at this sample time
			const eventsAtTime = this.scheduledEvents.get(sampleTime);
			if (eventsAtTime) {
				for (const event of eventsAtTime) {
					this.triggerEvent(event);
				}
				this.scheduledEvents.delete(sampleTime);
			}

			// Mix all synths
			let sample = 0;
			for (const synth of this.synths.values()) {
				if (synth.process) {
					sample += synth.process();
				}
			}

			// Write to output
			for (let channel = 0; channel < output.length; channel++) {
				output[channel][i] = sample * 0.3; // Master gain
			}
		}

		this.currentTime += bufferLength;

		// Loop pattern
		const patternLength = this.tracks?.[0]?.patternTree?.division || 4;
		const patternLengthSamples = patternLength * this.samplesPerBeat;
		if (this.currentTime >= patternLengthSamples) {
			this.currentTime = 0;
			this.scheduledEvents.clear();
			// Re-schedule events for next loop
			this.scheduleEvents();
		}

		return true;
	}

	triggerEvent(event) {
		// Get or create synth for this instrument
		let synth = this.synths.get(event.instrumentId);
		if (!synth) {
			const track = this.tracks?.find(t => t.id === event.instrumentId);
			if (track) {
				synth = this.createSynth(track.instrumentType, track.settings);
				this.synths.set(event.instrumentId, synth);
			}
		}

		if (synth && synth.trigger) {
			synth.trigger(event.velocity, event.pitch);
		}
	}

	createSynth(instrumentType, settings) {
		// This will be implemented per synth type
		// For MVP, we'll create a kick drum
		if (instrumentType === 'kick') {
			return new KickSynth(settings, this.sampleRate);
		}
		return null;
	}
}

// Kick Drum Synth (procedural)
class KickSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = false;
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
	}

	trigger(velocity, pitch) {
		this.phase = 0;
		this.envelopePhase = 0;
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60; // Default kick pitch
	}

	process() {
		if (!this.isActive) return 0;

		const attack = (this.settings.attack || 0.01) * this.sampleRate;
		const decay = (this.settings.decay || 0.3) * this.sampleRate;
		const sustain = this.settings.sustain || 0.0;
		const release = (this.settings.release || 0.1) * this.sampleRate;
		const totalDuration = attack + decay + release;

		// Exponential pitch envelope (kick characteristic)
		const startFreq = 60; // Hz
		const endFreq = 30; // Hz
		const freq = startFreq * Math.exp(-this.envelopePhase / (decay * 0.5));

		// Generate sine wave with pitch envelope
		const sample = Math.sin(this.phase * 2 * Math.PI * freq / this.sampleRate);

		// ADSR envelope
		let envelope = 0;
		if (this.envelopePhase < attack) {
			envelope = this.envelopePhase / attack;
		} else if (this.envelopePhase < attack + decay) {
			const decayPhase = (this.envelopePhase - attack) / decay;
			envelope = 1 - decayPhase * (1 - sustain);
		} else if (this.envelopePhase < totalDuration) {
			const releasePhase = (this.envelopePhase - attack - decay) / release;
			envelope = sustain * (1 - releasePhase);
		} else {
			this.isActive = false;
			return 0;
		}

		this.phase++;
		this.envelopePhase++;

		return sample * envelope * this.velocity * 0.5;
	}
}

registerProcessor('engine-worklet-processor', EngineWorkletProcessor);

