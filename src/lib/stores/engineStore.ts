import { writable } from 'svelte/store';
import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';

function createEngineStore() {
	const { subscribe, set } = writable<EngineWorklet | null>(null);

	return {
		subscribe,
		set,
		updateTrack: async (trackId: string, updates: any) => {
			let engine: EngineWorklet | null = null;
			subscribe((e) => (engine = e))();
			
			if (engine) {
				// Update track settings in real-time
				if (updates.settings) {
					engine.updateTrackSettings(trackId, updates.settings);
				}
				
				// Update volume in real-time
				if (updates.volume !== undefined) {
					engine.updateTrackVolume(trackId, updates.volume);
				}
				
				// Update pan in real-time
				if (updates.pan !== undefined) {
					engine.updateTrackPan(trackId, updates.pan);
				}
				
				// Update mute in real-time
				if (updates.mute !== undefined) {
					engine.updateTrackMute(trackId, updates.mute);
				}
				
				// Update solo in real-time
				if (updates.solo !== undefined) {
					engine.updateTrackSolo(trackId, updates.solo);
				}
				
				// If instrument type changed, update the track directly (handles synth recreation seamlessly)
				if (updates.instrumentType) {
					// Get current track from project store to get full track data
					const { projectStore } = await import('./projectStore');
					let project: any;
					projectStore.subscribe((p) => (project = p))();
					
					if (project) {
						// Find the track in standalone instruments or patterns
						let track = project.standaloneInstruments?.find((t: any) => t.id === trackId);
						
						// If not found, check if it's a pattern track
						if (!track && trackId.startsWith('__pattern_')) {
							const withoutPrefix = trackId.substring('__pattern_'.length);
							const parts = withoutPrefix.split('_');
							if (parts.length >= 2) {
								const patternId = parts[0];
								const instrumentId = parts.slice(1).join('_'); // Handle IDs that might contain underscores
								const pattern = project.patterns?.find((p: any) => p.id === patternId);
								if (pattern) {
									const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
										? pattern.instruments
										: (pattern.instrumentType && pattern.patternTree ? [{
											id: pattern.id,
											instrumentType: pattern.instrumentType,
											patternTree: pattern.patternTree,
											settings: pattern.settings || {},
											instrumentSettings: pattern.instrumentSettings,
											color: pattern.color || '#7ab8ff',
											volume: pattern.volume ?? 1.0,
											pan: pattern.pan ?? 0.0,
											mute: pattern.mute,
											solo: pattern.solo
										}] : []);
									track = instruments.find((inst: any) => inst.id === instrumentId);
									if (track) {
										// Create full track object for engine
										track = {
											id: trackId,
											projectId: pattern.projectId,
											instrumentType: updates.instrumentType,
											patternTree: track.patternTree,
											settings: updates.settings || track.settings || {},
											instrumentSettings: updates.instrumentSettings || track.instrumentSettings,
											volume: track.volume ?? 1.0,
											pan: track.pan ?? 0.0,
											color: track.color || '#7ab8ff',
											mute: track.mute ?? false,
											solo: track.solo ?? false
										};
									}
								}
							}
						}
						
						if (track) {
							// Update track with new instrument type - this will seamlessly recreate the synth
							engine.updateTrack(trackId, { ...track, ...updates });
						}
					}
				}
				
				// If pattern tree changed, update it in real-time
				if (updates.patternTree) {
					engine.updatePatternTree(trackId, updates.patternTree);
				}
			}
		}
	};
}

export const engineStore = createEngineStore();

