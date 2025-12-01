<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import ParamControl from '../ParamControl.svelte';
	import { onMount, onDestroy } from 'svelte';

	const {
		selectedTrack = undefined,
		selectedPattern = undefined,
		selectedInstrument = undefined,
		trackSettings
	}: {
		selectedTrack?: StandaloneInstrument | undefined;
		selectedPattern?: Pattern | undefined;
		selectedInstrument?: any;
		trackSettings: Record<string, any>;
	} = $props();
	
	let engine: EngineWorklet | null = $state(null);
	let project: any = $state(null);
	
	let unsubscribeEngine: () => void;
	let unsubscribeProject: () => void;
	
	onMount(() => {
		unsubscribeEngine = engineStore.subscribe((e) => (engine = e));
		unsubscribeProject = projectStore.subscribe((p) => (project = p));
		
		return () => {
			unsubscribeEngine();
			unsubscribeProject();
		};
	});

	const activeItem = $derived(selectedInstrument || selectedTrack);
	
	// Drawbar labels (16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1')
	const drawbarLabels = $derived(['16\'', '5 1/3\'', '8\'', '4\'', '2 2/3\'', '2\'', '1 3/5\'', '1 1/3\'', '1\'']);
	const drawbars = $derived(trackSettings.drawbars ?? [0.8, 0.0, 1.0, 0.0, 0.6, 0.0, 0.4, 0.0, 0.2]);

	function updateSetting(key: string, value: any) {
		// Get fresh data from store to avoid stale closures
		let currentProject: any = null;
		projectStore.subscribe((p) => (currentProject = p))();
		
		if (!currentProject) return;
		
		let processedValue = value;
		if (typeof value === 'number') {
			if (isNaN(value)) return;
			if (key === 'attack' || key === 'decay' || key === 'release') {
				processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
			} else if (key === 'sustain') {
				processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
			} else if (key === 'filterCutoff') {
				processedValue = Math.max(20, Math.min(20000, parseFloat(value.toFixed(0))));
			} else if (key === 'filterResonance') {
				processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
			} else if (key.startsWith('drawbar')) {
				processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
			} else {
				processedValue = parseFloat(value.toFixed(2));
			}
		}
		
		if (selectedPattern && selectedInstrument) {
			// Get the latest instrument from the project store
			const pattern = currentProject.patterns?.find((p: any) => p.id === selectedPattern.id);
			if (!pattern) return;
			
			const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
				? pattern.instruments
				: [];
			const instrument = instruments.find((inst: any) => inst.id === selectedInstrument.id);
			if (!instrument) return;
			
			// Get current settings from the latest instrument
			const currentSettings = instrument.settings || {};
			const newSettings = { ...currentSettings, [key]: processedValue };
			const instrumentSettings = instrument.instrumentSettings || {};
			if (instrument.instrumentType) {
				instrumentSettings[instrument.instrumentType] = { ...newSettings };
			}
			
			projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
				settings: newSettings,
				instrumentSettings: instrumentSettings
			});
			// Update engine directly for real-time parameter changes
			if (engine) {
				const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
				engine.updateTrackSettings(patternTrackId, newSettings);
			}
		} else if (selectedTrack) {
			// Get the latest track from the project store
			const track = currentProject.standaloneInstruments?.find((t: any) => t.id === selectedTrack.id);
			if (!track) return;
			
			// Get current settings from the latest track
			const currentSettings = track.settings || {};
			const newSettings = { ...currentSettings, [key]: processedValue };
			const instrumentSettings = track.instrumentSettings || {};
			if (track.instrumentType) {
				instrumentSettings[track.instrumentType] = { ...newSettings };
			}
			
			projectStore.updateStandaloneInstrument(selectedTrack.id, {
				settings: newSettings,
				instrumentSettings: instrumentSettings
			});
			if (engine) {
				engine.updateTrackSettings(selectedTrack.id, newSettings);
			}
		}
	}
	
	function updateDrawbar(index: number, value: number) {
		if (!activeItem) return;
		const newDrawbars = [...drawbars];
		newDrawbars[index] = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
		updateSetting('drawbars', newDrawbars);
	}
</script>

<div class="param-section">
	<h4>Drawbars</h4>
	{#each drawbars as drawbar, i}
		<ParamControl
			id="organ-drawbar-{i}"
			label={drawbarLabels[i]}
			value={drawbar}
			min={0}
			max={1}
			step={0.01}
			onUpdate={(v) => updateDrawbar(i, v)}
		/>
	{/each}
</div>

<ParamControl
	id="organ-rotary-speed"
	label="Rotary Speed (Hz)"
	value={trackSettings.rotarySpeed ?? 4.0}
	min={0}
	max={10}
	step={0.1}
	onUpdate={(v) => updateSetting('rotarySpeed', v)}
/>
<ParamControl
	id="organ-rotary-depth"
	label="Rotary Depth"
	value={trackSettings.rotaryDepth ?? 0.3}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('rotaryDepth', v)}
/>
<ParamControl
	id="organ-filter-cutoff"
	label="Filter Cutoff (Hz)"
	value={trackSettings.filterCutoff ?? 8000}
	min={20}
	max={20000}
	step={10}
	onUpdate={(v) => updateSetting('filterCutoff', v)}
/>
<ParamControl
	id="organ-filter-resonance"
	label="Filter Resonance"
	value={trackSettings.filterResonance ?? 0.2}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('filterResonance', v)}
/>
<ParamControl
	id="organ-attack"
	label="Attack"
	value={trackSettings.attack ?? 0.01}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('attack', v)}
/>
<ParamControl
	id="organ-decay"
	label="Decay"
	value={trackSettings.decay ?? 0.1}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('decay', v)}
/>
<ParamControl
	id="organ-sustain"
	label="Sustain"
	value={trackSettings.sustain ?? 1.0}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('sustain', v)}
/>
<ParamControl
	id="organ-release"
	label="Release"
	value={trackSettings.release ?? 0.2}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('release', v)}
/>

