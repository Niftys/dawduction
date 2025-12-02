/**
 * TR-808 Closed Hi-Hat Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableClosedHiHatSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.closedhat || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.3, // Closed hihat is shorter
			sustain: 0.0,
			release: 0.1,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 42, // F#1 - standard closed hi-hat pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

