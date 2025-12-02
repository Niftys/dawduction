/**
 * TR-808 Cowbell Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableCowbellSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.cowbell || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.6, // Cowbell decay
			sustain: 0.0,
			release: 0.3,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 36, // C1 - matches typical cowbell pitch range
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

