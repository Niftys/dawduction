<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import { getSelectValue } from '../sidebar/sidebarUtils';
	import ParamControl from '../sidebar/ParamControl.svelte';
	import '$lib/styles/components/SynthPluginWindow.css';

	export let selectedTrack: StandaloneInstrument | undefined = undefined;
	export let selectedPattern: Pattern | undefined = undefined;
	export let selectedInstrument: any = undefined;
	export let trackSettings: Record<string, any>;
	
	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));

	$: activeItem = selectedInstrument || selectedTrack;

	function updateSetting(key: string, value: any) {
		if (!activeItem) return;
		let processedValue = value;
		if (typeof value === 'number') {
			if (isNaN(value)) return;
			if (key === 'attack' || key === 'decay') {
				processedValue = Math.max(0, Math.min(1, parseFloat(value.toFixed(2))));
			} else if (key === 'release') {
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

<div class="synth-plugin">
	<!-- Oscillator Section -->
	<div class="param-group">
		<div class="param-group-title">Oscillator</div>
		<div class="param-grid two-column">
			<div class="param">
				<label for="pad-osc-type">Waveform</label>
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
				label="Oscillators"
				value={trackSettings.numOscillators ?? 8}
				min={4}
				max={16}
				step={1}
				onUpdate={(v) => updateSetting('numOscillators', v)}
			/>
		</div>
		<div class="param-grid three-column">
			<ParamControl
				id="pad-detune"
				label="Detune"
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
		</div>
	</div>

	<!-- Filter Section -->
	<div class="param-group">
		<div class="param-group-title">Filter</div>
		<div class="param-grid two-column">
			<ParamControl
				id="pad-filter-cutoff"
				label="Cutoff (Hz)"
				value={trackSettings.filterCutoff ?? 4000}
				min={20}
				max={20000}
				step={10}
				onUpdate={(v) => updateSetting('filterCutoff', v)}
			/>
			<ParamControl
				id="pad-filter-resonance"
				label="Resonance"
				value={trackSettings.filterResonance ?? 0.3}
				min={0}
				max={1}
				step={0.01}
				onUpdate={(v) => updateSetting('filterResonance', v)}
			/>
		</div>
	</div>

	<!-- LFO Section -->
	<div class="param-group">
		<div class="param-group-title">LFO Modulation</div>
		<div class="param-grid">
			<div class="param-grid two-column">
				<ParamControl
					id="pad-pitch-lfo-rate"
					label="Pitch LFO Rate"
					value={trackSettings.pitchLfoRate ?? 0.5}
					min={0}
					max={10}
					step={0.1}
					onUpdate={(v) => updateSetting('pitchLfoRate', v)}
				/>
				<ParamControl
					id="pad-pitch-lfo-amount"
					label="Pitch LFO Amount"
					value={trackSettings.pitchLfoAmount ?? 0.02}
					min={0}
					max={0.5}
					step={0.01}
					onUpdate={(v) => updateSetting('pitchLfoAmount', v)}
				/>
			</div>
			<div class="param-grid two-column">
				<ParamControl
					id="pad-filter-lfo-rate"
					label="Filter LFO Rate"
					value={trackSettings.filterLfoRate ?? 0.3}
					min={0}
					max={5}
					step={0.1}
					onUpdate={(v) => updateSetting('filterLfoRate', v)}
				/>
				<ParamControl
					id="pad-filter-lfo-amount"
					label="Filter LFO Amount"
					value={trackSettings.filterLfoAmount ?? 1000}
					min={0}
					max={5000}
					step={10}
					onUpdate={(v) => updateSetting('filterLfoAmount', v)}
				/>
			</div>
		</div>
	</div>

	<!-- Envelope Section -->
	<div class="param-group">
		<div class="param-group-title">Envelope</div>
		<div class="param-grid four-column">
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
		</div>
	</div>
</div>

<style>
	.param-grid.four-column {
		grid-template-columns: repeat(4, 1fr);
	}
</style>

