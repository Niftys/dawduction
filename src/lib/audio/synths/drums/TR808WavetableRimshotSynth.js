/**
 * TR-808 Rimshot Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableRimshotSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.rim || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.5, // Rimshot decay
			sustain: 0.0,
			release: 0.2,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 37, // C#1 - standard rimshot pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

