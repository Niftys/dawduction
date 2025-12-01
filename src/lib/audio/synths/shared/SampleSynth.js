/**
 * mplemple Playback Synth
 * Plays back pre-recorded audio samples with pitch shifting and velocity control
 * 
 * Unlike procedural synths, this loads audio buffers and plays them back.
 * Audio buffers are transferred from the main thread via MessagePort.
 */


class SampleSynth {
	constructor(settings, sampleRate) {
		this.sampleRate = sampleRate;
		this.settings = settings || {};
		this.audioBuffer = null; // Float32Array of audio samples (mono)
		this.playbackPosition = 0; // Current playback position (can be fractional for pitch shifting)
		this.isActive = false;
		this.velocity = 1.0;
		this.pitch = 60; // MIDI note (default: Middle C)
		this.playbackRate = 1.0; // For pitch shifting
		
		// Sample trimming and looping
		this.startPoint = 0; // Start position in samples (0 = beginning)
		this.endPoint = null; // End position in samples (null = end of buffer)
		this.loop = false; // Whether to loop the sample
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade
		
		// DC blocking filter
		this.dcFilterState = { x1: 0, y1: 0 };
		
		// Initialize settings
		this._initSettings();
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
		// If audio buffer is provided in settings, set it
		if (settings.audioBuffer && settings.audioBuffer instanceof Float32Array) {
			this.setAudioBuffer(settings.audioBuffer);
		}
		// Update trimming and loop settings
		if (settings.startPoint !== undefined) {
			this.startPoint = Math.max(0, Math.floor(settings.startPoint));
		}
		if (settings.endPoint !== undefined) {
			this.endPoint = settings.endPoint === null ? null : Math.max(0, Math.floor(settings.endPoint));
		}
		if (settings.loop !== undefined) {
			this.loop = settings.loop;
		}
	}
	
	// Initialize settings from constructor settings
	_initSettings() {
		if (this.settings.startPoint !== undefined) {
			this.startPoint = Math.max(0, Math.floor(this.settings.startPoint));
		}
		if (this.settings.endPoint !== undefined) {
			this.endPoint = this.settings.endPoint === null ? null : Math.max(0, Math.floor(this.settings.endPoint));
		}
		if (this.settings.loop !== undefined) {
			this.loop = this.settings.loop;
		}
	}

	/**
	 * Set the audio buffer to play back
	 * @param {Float32Array} buffer - Mono audio buffer
	 */
	setAudioBuffer(buffer) {
		this.audioBuffer = buffer;
	}

	trigger(velocity, pitch) {
		// Check if we're retriggering while still active
		this.wasActive = this.isActive;
		
		this.isActive = true;
		this.velocity = velocity;
		this.pitch = pitch || 60;
		
		// Calculate playback rate for pitch shifting
		// Base pitch is Middle C (MIDI 60)
		const basePitch = 60;
		this.playbackRate = Math.pow(2, (this.pitch - basePitch) / 12);
		
		// Set playback position to start point
		this.playbackPosition = this.startPoint;
		
		// Reset DC filter state on trigger
		this.dcFilterState.x1 = 0;
		this.dcFilterState.y1 = 0;
		
		// Start retrigger fade if was already active
		if (this.wasActive) {
			this.retriggerFadePhase = 0;
		}
	}

	process() {
		if (!this.isActive || !this.audioBuffer || this.audioBuffer.length === 0) {
			return 0;
		}
		
		// Calculate total note length from sample buffer and settings
		// For samples, the note length is determined by the buffer length and any trimming
		const startPoint = this.settings.startPoint || 0;
		const endPoint = this.settings.endPoint !== undefined && this.settings.endPoint !== null 
			? this.settings.endPoint 
			: (this.audioBuffer ? this.audioBuffer.length : 0);
		const effectiveBufferLength = Math.max(0, endPoint - startPoint);
		const totalNoteLength = effectiveBufferLength; // In samples
		
		
		// Calculate effective buffer bounds
		const effectiveStart = this.startPoint;
		const effectiveEnd = this.endPoint !== null ? this.endPoint : this.audioBuffer.length;
		const effectiveLength = effectiveEnd - effectiveStart;
		
		// Check if we've reached the end
		if (this.playbackPosition >= effectiveEnd) {
			if (this.loop) {
				// Loop: wrap back to start point
				this.playbackPosition = effectiveStart + (this.playbackPosition - effectiveEnd);
			} else {
				// One-shot: stop playback
				this.isActive = false;
				return 0;
			}
		}
		
		// Ensure we're within bounds (for safety)
		if (this.playbackPosition < effectiveStart) {
			this.playbackPosition = effectiveStart;
		}
		if (this.playbackPosition >= effectiveEnd) {
			if (this.loop) {
				this.playbackPosition = effectiveStart;
			} else {
				this.isActive = false;
				return 0;
			}
		}
		
		// Linear interpolation for smooth playback with pitch shifting
		const position = Math.floor(this.playbackPosition);
		const fraction = this.playbackPosition - position;
		
		// Get samples for interpolation (clamp to buffer bounds)
		const clampedPos = Math.max(effectiveStart, Math.min(effectiveEnd - 1, position));
		const sample1 = this.audioBuffer[clampedPos] || 0;
		const nextPos = Math.max(effectiveStart, Math.min(effectiveEnd - 1, position + 1));
		const sample2 = this.audioBuffer[nextPos] || sample1;
		
		// Linear interpolation
		const sample = sample1 + (sample2 - sample1) * fraction;
		
		// Apply velocity
		let output = sample * this.velocity;
		
		// DC blocking filter to prevent DC offset clicks
		const dcAlpha = 0.995;
		const dcFiltered = output - this.dcFilterState.x1 + dcAlpha * this.dcFilterState.y1;
		this.dcFilterState.x1 = output;
		this.dcFilterState.y1 = dcFiltered;
		output = dcFiltered;
		
		// Handle retrigger fade: crossfade from old sound to new sound
		if (this.wasActive && this.retriggerFadePhase < this.retriggerFadeSamples) {
			const fadeProgress = this.retriggerFadePhase / this.retriggerFadeSamples;
			const smoothFade = 0.5 * (1 - Math.cos(Math.PI * fadeProgress));
			const oldGain = 1 - smoothFade;
			const newGain = smoothFade;
			this.lastOutput = this.lastOutput * 0.95 + output * 0.05;
			output = this.lastOutput * oldGain + output * newGain;
			this.retriggerFadePhase++;
		} else {
			this.lastOutput = output;
			this.wasActive = false;
		}
		
		// Advance playback position
		this.playbackPosition += this.playbackRate;
		
		// Handle end of sample (for one-shot mode)
		if (!this.loop && this.playbackPosition >= effectiveEnd) {
			// Smooth fade-out at the end to prevent clicks
			const remainingSamples = effectiveEnd - Math.floor(this.playbackPosition - this.playbackRate);
			const fadeOutSamples = Math.min(remainingSamples, Math.floor(0.01 * this.sampleRate)); // 10ms fade
			if (fadeOutSamples > 0) {
				const fadeProgress = (effectiveEnd - this.playbackPosition) / (fadeOutSamples * this.playbackRate);
				const fadeOutGain = Math.max(0, Math.min(1, fadeProgress));
				output *= fadeOutGain;
			}
			
			if (this.playbackPosition >= effectiveEnd) {
				this.isActive = false;
				this.dcFilterState.x1 = 0;
				this.dcFilterState.y1 = 0;
				return 0;
			}
		}
		
		return output;
	}
}

