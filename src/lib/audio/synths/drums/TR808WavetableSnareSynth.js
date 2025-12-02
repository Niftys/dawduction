/**
 * TR-808 Snare Drum Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

class TR808WavetableSnareSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const typeWavetables = allWavetables.snare || {};
		
		const defaultSettings = {
			attack: 0.001,
			decay: 0.6, // Classic 808 snare decay - allows the characteristic snap and tail
			sustain: 0.0,
			release: 0.3, // Standard release for 808 snare
			selectedSample: 0,
			sampleNames: Object.keys(typeWavetables).sort(),
			wavetables: typeWavetables,
			basePitch: 38, // D1 - standard snare pitch
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

