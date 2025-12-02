/**
 * TR-808 Mid Tom Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableMidTomSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.midtom || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.8, // Mid tom decay
			sustain: 0.0,
			release: 0.3,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 45, // A1 - standard mid tom pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

