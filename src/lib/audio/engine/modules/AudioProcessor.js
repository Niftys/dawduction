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
		
		// Quiet period detection for smart reload timing
		this._quietPeriodCheckInterval = processor.sampleRate * 0.1; // Check every 100ms
		this._lastQuietPeriodCheck = 0;
		this._quietPeriodThreshold = 0.02; // Lower threshold (0.02 = ~3% volume) - only trigger on near-silence
		// Adaptive quiet period duration based on BPM (slower songs need longer quiet periods)
		// Default to 120 BPM, will be updated when BPM changes
		this._currentBpm = 120;
		this._quietPeriodMinDuration = processor.sampleRate * 0.3; // Start with 300ms minimum
		this._quietPeriodSamples = 0;
		this._lastQuietPeriodReport = 0;
		this._quietPeriodCooldown = processor.sampleRate * 5; // Don't report more than once every 5 seconds (increased for slow songs)
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

			// Track peak levels for quiet period detection
			// Track overall mixed output level (sum of left and right channels)
			const mixedLevel = Math.abs(mixed.left) + Math.abs(mixed.right);
			
			// Check if any synths are active - if so, don't consider it a quiet period
			// This prevents reloads during long sustained notes even if volume is low
			const hasActiveSynths = this.processor.synthManager.hasActiveSynths();
			
			// Only count as quiet if:
			// 1. Volume is below threshold (near-silence)
			// 2. No synths are active (no notes playing)
			if (mixedLevel < this._quietPeriodThreshold && !hasActiveSynths) {
				this._quietPeriodSamples++;
			} else {
				this._quietPeriodSamples = 0; // Reset if not quiet or synths are active
			}
			
			// Check if we should analyze quiet periods periodically
			const timeSinceLastCheck = (startTime + i) - this._lastQuietPeriodCheck;
			if (timeSinceLastCheck >= this._quietPeriodCheckInterval) {
				this._checkQuietPeriod(currentBeat);
				this._lastQuietPeriodCheck = startTime + i;
			}

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
	
	/**
	 * Check if we're in a quiet period suitable for reloading
	 * Sends a message to main thread when quiet periods are detected
	 */
	_checkQuietPeriod(currentBeat) {
		// Only check in arrangement view
		if (!this.processor.projectManager.isArrangementView) {
			return;
		}
		
		// Update BPM-based quiet period duration if BPM changed
		const currentBpm = this.processor.playbackController.getBPM();
		if (currentBpm !== this._currentBpm) {
			this._currentBpm = currentBpm;
			// Adaptive quiet period: slower BPM = longer required quiet period
			// At 60 BPM, require 1 second of quiet
			// At 120 BPM, require 0.3 seconds of quiet
			// At 180 BPM, require 0.2 seconds of quiet
			const bpmScale = 60 / Math.max(60, currentBpm); // Scale relative to 60 BPM
			this._quietPeriodMinDuration = this.processor.sampleRate * (0.3 * bpmScale);
			// Also adjust cooldown based on BPM
			this._quietPeriodCooldown = this.processor.sampleRate * (5 * bpmScale);
		}
		
		// Double-check that no synths are active before reporting quiet period
		const hasActiveSynths = this.processor.synthManager.hasActiveSynths();
		if (hasActiveSynths) {
			return; // Don't report quiet period if synths are active
		}
		
		// Check if we've had enough quiet samples
		if (this._quietPeriodSamples >= this._quietPeriodMinDuration) {
			// Check cooldown to avoid spamming quiet period messages
			const timeSinceLastReport = this.processor.currentTime - this._lastQuietPeriodReport;
			if (timeSinceLastReport >= this._quietPeriodCooldown) {
				// Send quiet period detection to main thread
				this.processor.port.postMessage({
					type: 'quietPeriod',
					time: currentBeat,
					duration: this._quietPeriodSamples / this.processor.sampleRate
				});
				this._lastQuietPeriodReport = this.processor.currentTime;
			}
		}
	}
}

