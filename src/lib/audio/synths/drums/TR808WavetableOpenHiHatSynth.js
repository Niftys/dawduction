/**
 * TR-808 Open Hi-Hat Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableOpenHiHatSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.openhat || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 1.5, // Open hihat needs longer decay
			sustain: 0.0,
			release: 0.5,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 46, // A#1 - standard open hi-hat pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

