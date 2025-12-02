/**
 * TR-808 Kick Drum Synth (Wavetable-based)
 * Uses pre-recorded samples converted to wavetables
 */

// Wavetables will be injected by build script
// const wavetables = { ... };

class TR808WavetableKickSynth extends WavetableDrumSynth {
	constructor(settings, sampleRate) {
		// Get wavetables from global scope (injected by build script)
		const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
		const kickWavetables = allWavetables.kick || {};
		
		// Debug: Verify wavetables are loaded
		console.log(`[TR808Kick] Wavetables available:`, {
			hasGlobal: typeof wavetables !== 'undefined',
			kickCount: Object.keys(kickWavetables).length,
			kickNames: Object.keys(kickWavetables).sort(),
			firstSampleLength: kickWavetables[Object.keys(kickWavetables)[0]]?.length
		});
		
		const defaultSettings = {
			attack: 0.001,
			decay: 4.0, // Very long decay for authentic 808 kick - allows the deep sub-bass to ring out
			sustain: 0.0,
			release: 0.5, // Not used in simplified envelope, but kept for compatibility
			selectedSample: 0,
			sampleNames: Object.keys(kickWavetables).sort(),
			wavetables: kickWavetables,
			basePitch: 48, // C2 - kick uses C2 as base pitch for normal playback speed
			...settings
		};
		
		super(defaultSettings, sampleRate);
	}
}

