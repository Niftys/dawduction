/**
 * TR-808 Ride Cymbal Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableRideSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		// Use crash samples but with different settings to differentiate from crash
		const typeWavetables = allWavetables.crash || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 3.0, // Ride needs very long decay (longer than crash)
			sustain: 0.0,
			release: 1.0,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 36, // C1 - lower pitch than crash for warmer ride sound
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

