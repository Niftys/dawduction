/**
 * TR-808 Cymbal Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableCymbalSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.crash || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 2.0, // Crash cymbal decay
			sustain: 0.0,
			release: 1.0,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 40, // E1 - higher pitch than ride for brighter crash
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

