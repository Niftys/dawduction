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

