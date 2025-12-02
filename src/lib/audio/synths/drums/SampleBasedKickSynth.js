/**
 * Sample-Based Kick Drum Synth
 * Uses pre-recorded WAV samples converted to wavetables
 * This is an example implementation showing how to use WavetableDrumSynth
 * with samples from lloydstellar.nl
 * 
 * To use this:
 * 1. Download samples using download-808-samples.ps1
 * 2. Convert to wavetables: node scripts/convert-wav-to-wavetable.js 808-samples/kick src/lib/audio/synths/drums/wavetables/kickWavetables.js
 * 3. Include wavetables file in build-worklet.js and pass wavetables to this synth
 * 
 * Note: WavetableDrumSynth must be defined before this class
 */

class SampleBasedKickSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		// Default settings with wavetables
		const defaultSettings = {
			attack: 0.001,
			decay: 0.3,
			sustain: 0.0,
			release: 0.1,
			selectedSample: 0,
			sampleNames: [], // Will be populated from wavetables
			wavetables: settings?.wavetables || {},
			...settings
		};
		
		// Extract sample names from wavetables
		if (defaultSettings.wavetables && Object.keys(defaultSettings.wavetables).length > 0) {
			defaultSettings.sampleNames = Object.keys(defaultSettings.wavetables).sort();
		}
		
		super(defaultSettings, sampleRate);
	}
	
	/**
	 * Update settings, including wavetable selection
	 */
	updateSettings(settings) {
		// If wavetables are provided, extract sample names
		if (settings.wavetables && Object.keys(settings.wavetables).length > 0) {
			settings.sampleNames = Object.keys(settings.wavetables).sort();
		}
		
		super.updateSettings(settings);
	}
}

// For use in AudioWorklet (no ES6 imports)
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { SampleBasedKickSynth };
}

