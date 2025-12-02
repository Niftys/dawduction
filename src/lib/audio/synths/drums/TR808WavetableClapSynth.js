/**
 * TR-808 Clap Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableClapSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.clap || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.8, // Clap needs longer decay
			sustain: 0.0,
			release: 0.3,
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 39, // D#1 - standard clap pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

