/**
 * TR-808 High Tom Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableHighTomSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.hitom || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.6, // High tom decay
			sustain: 0.0,
			release: 0.2,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 47, // B1 - standard high tom pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

