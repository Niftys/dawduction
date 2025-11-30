<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import ParamControl from '../ParamControl.svelte';

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
	
	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));

	const activeItem = $derived(selectedInstrument || selectedTrack);
	
	// Drawbar labels (16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1')
	const drawbarLabels = $derived(['16\'', '5 1/3\'', '8\'', '4\'', '2 2/3\'', '2\'', '1 3/5\'', '1 1/3\'', '1\'']);
	const drawbars = $derived(trackSettings.drawbars ?? [0.8, 0.0, 1.0, 0.0, 0.6, 0.0, 0.4, 0.0, 0.2]);

	function updateSetting(key: string, value: any) {
		if (!activeItem) return;
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
		const newSettings = { ...activeItem.settings, [key]: processedValue };
		const instrumentSettings = activeItem.instrumentSettings || {};
		if (activeItem.instrumentType) {
			instrumentSettings[activeItem.instrumentType] = { ...newSettings };
		}
		
		if (selectedPattern && selectedInstrument) {
			projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, {
				settings: newSettings,
				instrumentSettings: instrumentSettings
			});
			// Update engine directly for real-time parameter changes (no instrument type change)
			if (engine) {
				const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
				engine.updateTrackSettings(patternTrackId, newSettings);
			}
		} else if (selectedTrack) {
			projectStore.updateTrack(selectedTrack.id, {
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

