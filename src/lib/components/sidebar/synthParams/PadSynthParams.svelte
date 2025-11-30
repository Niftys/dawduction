<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import { getSelectValue } from '../sidebarUtils';
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

	function updateSetting(key: string, value: any) {
		if (!activeItem) return;
		let processedValue = value;
		if (typeof value === 'number') {
			if (isNaN(value)) return;
			if (key === 'attack' || key === 'decay') {
				processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
			} else if (key === 'release') {
				// Allow longer release times for pads (up to 3 seconds)
				processedValue = Math.max(0, Math.min(3, parseFloat(value.toFixed(2))));
			} else if (key === 'sustain') {
				processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
			} else if (key === 'filterCutoff') {
				processedValue = Math.max(20, Math.min(20000, parseFloat(value.toFixed(0))));
			} else if (key === 'filterResonance') {
				processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
			} else if (key === 'filterLfoAmount') {
				processedValue = Math.max(0, Math.min(5000, parseFloat(value.toFixed(0))));
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
</script>

<div class="param">
	<label for="pad-osc-type">Oscillator Type</label>
	<select
		id="pad-osc-type"
		value={trackSettings.oscType ?? 'saw'}
		on:change={(e) => updateSetting('oscType', getSelectValue(e) || 'saw')}
	>
		<option value="saw">Sawtooth</option>
		<option value="square">Square</option>
		<option value="sine">Sine</option>
		<option value="triangle">Triangle</option>
	</select>
</div>
<ParamControl
	id="pad-num-osc"
	label="Number of Oscillators"
	value={trackSettings.numOscillators ?? 8}
	min={4}
	max={16}
	step={1}
	onUpdate={(v) => updateSetting('numOscillators', v)}
/>
<ParamControl
	id="pad-detune"
	label="Detune (semitones)"
	value={trackSettings.detune ?? 0.15}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('detune', v)}
/>
<ParamControl
	id="pad-spread"
	label="Spread"
	value={trackSettings.spread ?? 0.7}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('spread', v)}
/>
<ParamControl
	id="pad-filter-cutoff"
	label="Filter Cutoff (Hz)"
	value={trackSettings.filterCutoff ?? 4000}
	min={20}
	max={20000}
	step={10}
	onUpdate={(v) => updateSetting('filterCutoff', v)}
/>
<ParamControl
	id="pad-filter-resonance"
	label="Filter Resonance"
	value={trackSettings.filterResonance ?? 0.3}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('filterResonance', v)}
/>
<ParamControl
	id="pad-pitch-lfo-rate"
	label="Pitch LFO Rate (Hz)"
	value={trackSettings.pitchLfoRate ?? 0.5}
	min={0}
	max={10}
	step={0.1}
	onUpdate={(v) => updateSetting('pitchLfoRate', v)}
/>
<ParamControl
	id="pad-pitch-lfo-amount"
	label="Pitch LFO Amount (semitones)"
	value={trackSettings.pitchLfoAmount ?? 0.02}
	min={0}
	max={0.5}
	step={0.01}
	onUpdate={(v) => updateSetting('pitchLfoAmount', v)}
/>
<ParamControl
	id="pad-filter-lfo-rate"
	label="Filter LFO Rate (Hz)"
	value={trackSettings.filterLfoRate ?? 0.3}
	min={0}
	max={5}
	step={0.1}
	onUpdate={(v) => updateSetting('filterLfoRate', v)}
/>
<ParamControl
	id="pad-filter-lfo-amount"
	label="Filter LFO Amount (Hz)"
	value={trackSettings.filterLfoAmount ?? 1000}
	min={0}
	max={5000}
	step={10}
	onUpdate={(v) => updateSetting('filterLfoAmount', v)}
/>
<ParamControl
	id="pad-attack"
	label="Attack"
	value={trackSettings.attack ?? 0.5}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('attack', v)}
/>
<ParamControl
	id="pad-decay"
	label="Decay"
	value={trackSettings.decay ?? 0.3}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('decay', v)}
/>
<ParamControl
	id="pad-sustain"
	label="Sustain"
	value={trackSettings.sustain ?? 0.9}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('sustain', v)}
/>
<ParamControl
	id="pad-release"
	label="Release"
	value={trackSettings.release ?? 1.5}
	min={0}
	max={3}
	step={0.01}
	onUpdate={(v) => updateSetting('release', v)}
/>

