<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
import { projectStore } from '$lib/stores/projectStore';
import { engineStore } from '$lib/stores/engineStore';
import { selectionStore } from '$lib/stores/selectionStore';
import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
import NumericInput from './NumericInput.svelte';
	
	export let selectedTrack: StandaloneInstrument | undefined = undefined;
	export const selectedPattern: Pattern | undefined = undefined;
	export let selectedInstrument: any = undefined;
	
	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));
	
	let project: any = null;
	projectStore.subscribe((p) => (project = p));
	
	let selection: any = null;
	selectionStore.subscribe((s) => (selection = s));

	let isDraggingVolume = false;
	let isDraggingPan = false;

	$: activeItem = selectedInstrument || selectedTrack;
	
	// Read directly from project store using selection IDs to ensure reactivity
	// This ensures we always get the latest values from the store, not stale prop references
	$: itemVolume = (() => {
		if (!project || !selection) return 1.0;
		
		// Check for pattern instrument first
		if (selection.selectedPatternId && selection.selectedInstrumentId) {
			const pattern = project.patterns?.find((p: Pattern) => p.id === selection.selectedPatternId);
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
				const inst = instruments.find((inst: any) => inst.id === selection.selectedInstrumentId);
				return inst?.volume ?? 1.0;
			}
		}
		
		// Check for standalone instrument
		if (selection.selectedTrackId) {
			const track = project.standaloneInstruments?.find((t: StandaloneInstrument) => t.id === selection.selectedTrackId);
			return track?.volume ?? 1.0;
		}
		
		return 1.0;
	})();
	
	$: itemPan = (() => {
		if (!project || !selection) return 0.0;
		
		// Check for pattern instrument first
		if (selection.selectedPatternId && selection.selectedInstrumentId) {
			const pattern = project.patterns?.find((p: Pattern) => p.id === selection.selectedPatternId);
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
				const inst = instruments.find((inst: any) => inst.id === selection.selectedInstrumentId);
				return inst?.pan ?? 0.0;
			}
		}
		
		// Check for standalone instrument
		if (selection.selectedTrackId) {
			const track = project.standaloneInstruments?.find((t: StandaloneInstrument) => t.id === selection.selectedTrackId);
			return track?.pan ?? 0.0;
		}
		
		return 0.0;
	})();

	function getInputValue(e: Event): string {
		const target = e.target as HTMLInputElement;
		return target?.value || '';
	}

	function updateVolume(value: number) {
		const clampedValue = Math.max(0, Math.min(2, isNaN(value) ? 1.0 : value));
		
		// Use selection store IDs directly, not props (props might be undefined or stale)
		if (!selection) {
			return;
		}
		
		if (selection.selectedPatternId && selection.selectedInstrumentId) {
			// Pattern editor: update instrument in pattern's instruments array
			projectStore.updatePatternInstrument(selection.selectedPatternId, selection.selectedInstrumentId, { volume: clampedValue });
			// Update the engine - patterns use temporary track IDs like __pattern_${patternId}_${instrumentId}
			if (engine) {
				const patternTrackId = `__pattern_${selection.selectedPatternId}_${selection.selectedInstrumentId}`;
				engine.updateTrackVolume(patternTrackId, clampedValue);
			}
		} else if (selection.selectedTrackId) {
			// Arrangement view: update standalone instrument
			projectStore.updateStandaloneInstrument(selection.selectedTrackId, { volume: clampedValue });
			if (engine) {
				engine.updateTrackVolume(selection.selectedTrackId, clampedValue);
			}
		}
	}

	function updatePan(value: number) {
		const clampedValue = Math.max(-1, Math.min(1, isNaN(value) ? 0.0 : value));
		
		// Use selection store IDs directly, not props (props might be undefined or stale)
		if (!selection) {
			return;
		}
		
		if (selection.selectedPatternId && selection.selectedInstrumentId) {
			// Pattern editor: update instrument in pattern's instruments array
			projectStore.updatePatternInstrument(selection.selectedPatternId, selection.selectedInstrumentId, { pan: clampedValue });
			// Update the engine - patterns use temporary track IDs like __pattern_${patternId}_${instrumentId}
			if (engine) {
				const patternTrackId = `__pattern_${selection.selectedPatternId}_${selection.selectedInstrumentId}`;
				engine.updateTrackPan(patternTrackId, clampedValue);
			}
		} else if (selection.selectedTrackId) {
			// Arrangement view: update standalone instrument
			projectStore.updateStandaloneInstrument(selection.selectedTrackId, { pan: clampedValue });
			if (engine) {
				engine.updateTrackPan(selection.selectedTrackId, clampedValue);
			}
		}
	}
</script>

<div class="section">
	<div class="param-header">
		<label for="volume-range">Volume</label>
		<button class="reset-btn" on:click={() => updateVolume(1.0)}>Reset</button>
	</div>
	<div class="param-controls">
		<input
			id="volume-range"
			type="range"
			min="0"
			max="2"
			step="0.01"
			value={itemVolume}
			on:mousedown={() => {
				if (!isDraggingVolume) {
					isDraggingVolume = true;
					projectStore.startBatch();
				}
			}}
			on:mouseup={() => {
				if (isDraggingVolume) {
					isDraggingVolume = false;
					projectStore.endBatch();
				}
			}}
			on:mouseleave={() => {
				if (isDraggingVolume) {
					isDraggingVolume = false;
					projectStore.endBatch();
				}
			}}
			on:input={(e) => updateVolume(Number(getInputValue(e)))}
		/>
		<NumericInput
			id="volume-number"
			min={0}
			max={2}
			step={0.01}
			value={itemVolume}
			onInput={updateVolume}
		/>
	</div>
</div>

<div class="section">
	<div class="param-header">
		<label for="pan-range">Pan</label>
		<button class="reset-btn" on:click={() => updatePan(0.0)}>Reset</button>
	</div>
	<div class="param-controls pan-controls">
		<span class="pan-label pan-label-left" title="Left">L</span>
		<input
			id="pan-range"
			type="range"
			min="-1"
			max="1"
			step="0.01"
			value={itemPan}
			on:mousedown={() => {
				if (!isDraggingPan) {
					isDraggingPan = true;
					projectStore.startBatch();
				}
			}}
			on:mouseup={() => {
				if (isDraggingPan) {
					isDraggingPan = false;
					projectStore.endBatch();
				}
			}}
			on:mouseleave={() => {
				if (isDraggingPan) {
					isDraggingPan = false;
					projectStore.endBatch();
				}
			}}
			on:input={(e) => updatePan(Number(getInputValue(e)))}
		/>
		<span class="pan-label pan-label-right" title="Right">R</span>
		<NumericInput
			id="pan-number"
			min={-1}
			max={1}
			step={0.01}
			value={itemPan}
			onInput={updatePan}
		/>
	</div>
</div>

