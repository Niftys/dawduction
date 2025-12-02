/**
 * TR-808 Clave Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableClaveSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.clave || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.3, // Clave decay (short, percussive)
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

