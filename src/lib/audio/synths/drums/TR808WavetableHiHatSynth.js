/**
 * TR-808 Hi-Hat Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableHiHatSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.closedhat || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.5, // Longer decay for hihat
			sustain: 0.0,
			release: 0.2,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

