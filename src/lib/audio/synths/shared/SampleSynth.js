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
		
		// Retrigger fade state
		this.wasActive = false;
		this.retriggerFadePhase = 0;
		this.lastOutput = 0;
		this.retriggerFadeSamples = Math.floor(0.005 * sampleRate); // 5ms fade
		
		// DC blocking filter
		this.dcFilterState = { x1: 0, y1: 0 };
	}

	updateSettings(settings) {
		this.settings = { ...this.settings, ...settings };
		// If audio buffer is provided in settings, set it
		if (settings.audioBuffer && settings.audioBuffer instanceof Float32Array) {
			this.setAudioBuffer(settings.audioBuffer);
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
		this.playbackPosition = 0;
		
		// Calculate playback rate for pitch shifting
		// Base pitch is Middle C (MIDI 60)
		const basePitch = 60;
		this.playbackRate = Math.pow(2, (this.pitch - basePitch) / 12);
		
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
		
		// Check if we've reached the end of the buffer
		if (this.playbackPosition >= this.audioBuffer.length) {
			this.isActive = false;
			return 0;
		}
		
		// Linear interpolation for smooth playback with pitch shifting
		const position = Math.floor(this.playbackPosition);
		const fraction = this.playbackPosition - position;
		
		// Get samples for interpolation
		const sample1 = this.audioBuffer[position] || 0;
		const sample2 = position + 1 < this.audioBuffer.length 
			? this.audioBuffer[position + 1] 
			: sample1;
		
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
		
		// Stop if we've reached the end
		if (this.playbackPosition >= this.audioBuffer.length) {
			// Smooth fade-out at the end to prevent clicks
			const remainingSamples = this.audioBuffer.length - Math.floor(this.playbackPosition - this.playbackRate);
			const fadeOutSamples = Math.min(remainingSamples, Math.floor(0.01 * this.sampleRate)); // 10ms fade
			if (fadeOutSamples > 0) {
				const fadeProgress = (this.audioBuffer.length - this.playbackPosition) / (fadeOutSamples * this.playbackRate);
				const fadeOutGain = Math.max(0, Math.min(1, fadeProgress));
				output *= fadeOutGain;
			}
			
			if (this.playbackPosition >= this.audioBuffer.length) {
				this.isActive = false;
				this.dcFilterState.x1 = 0;
				this.dcFilterState.y1 = 0;
				return 0;
			}
		}
		
		return output;
	}
}

