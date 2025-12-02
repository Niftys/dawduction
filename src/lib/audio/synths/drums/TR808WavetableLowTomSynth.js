/**
 * TR-808 Low Tom Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableLowTomSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.lotom || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 1.0, // Low tom needs longer decay
			sustain: 0.0,
			release: 0.4,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 44, // G#1 - standard low tom pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

