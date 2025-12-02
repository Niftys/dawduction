/**
 * TR-808 Shaker Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableShakerSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.maracas || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.6, // Shaker decay
			sustain: 0.0,
			release: 0.3,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 48, // C2 - standard maracas/shaker pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

