/**
 * Handles the main audio processing loop
 * Processes audio samples, triggers events, and mixes output
 */

class AudioProcessor {
	constructor(processor) {
		this.processor = processor;
		this.lastPlaybackUpdateTime = 0;
		this.playbackUpdateInterval = processor.sampleRate * 0.05; // Update every 50ms
		// Batch event IDs for playback updates to reduce message frequency
		this._batchedEventIds = [];
		this._lastBatchedSampleTime = 0;
		this._batchInterval = processor.sampleRate * 0.02; // Batch events for 20ms before sending
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

		// Pre-calculate samples per beat for efficiency
		const samplesPerBeat = this.processor.playbackController.samplesPerBeat;
		const startTime = this.processor.currentTime;
		
		// Process audio
		for (let i = 0; i < bufferLength; i++) {
			const sampleTime = Math.floor(startTime + i);
			// Calculate currentBeat more efficiently (avoid division every sample)
			const currentBeat = (startTime + i) / samplesPerBeat;

			// Check for events at this sample time
			const eventsAtTime = this.processor.eventScheduler.getEventsAtTime(sampleTime);
			if (eventsAtTime) {
				// Get pattern length once for all events in this batch
				const patternLength = this.processor.eventScheduler.getPatternLength();
				for (const event of eventsAtTime) {
					this.processor.triggerEvent(event);
					// Batch event IDs for visual feedback instead of sending immediately
					// Use normalized time (within pattern) for matching with node times
					// This ensures events match correctly even when patterns loop
					const normalizedTime = (event.time || 0) % patternLength;
					this._batchedEventIds.push(event.instrumentId + ':' + normalizedTime.toFixed(6));
				}
				this.processor.eventScheduler.removeEventsAtTime(sampleTime);
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

		// Send batched playback updates periodically
		const timeSinceLastBatch = this.processor.currentTime - this._lastBatchedSampleTime;
		if (this._batchedEventIds.length > 0 && timeSinceLastBatch >= this._batchInterval) {
			const currentBeat = this.processor.currentTime / this.processor.playbackController.samplesPerBeat;
			this.processor.port.postMessage({
				type: 'playbackUpdate',
				time: currentBeat,
				eventIds: this._batchedEventIds
			});
			this._batchedEventIds = [];
			this._lastBatchedSampleTime = this.processor.currentTime;
		}

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

