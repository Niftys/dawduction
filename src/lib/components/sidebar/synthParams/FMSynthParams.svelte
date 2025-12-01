<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import { getInputValue, getSelectValue } from '../sidebarUtils';
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

	function updateOperatorFrequency(value: number) {
		if (isNaN(value)) return;
		const operators = trackSettings.operators || [{ frequency: 1, amplitude: 1, waveform: 'sine' }];
		operators[0] = { ...operators[0], frequency: value };
		updateSetting('operators', operators);
	}

	function updateOperatorAmplitude(value: number) {
		if (isNaN(value)) return;
		const operators = trackSettings.operators || [{ frequency: 1, amplitude: 1, waveform: 'sine' }];
		operators[0] = { ...operators[0], amplitude: value };
		updateSetting('operators', operators);
	}

	function updateOperatorWaveform(value: string) {
		const operators = trackSettings.operators || [{ frequency: 1, amplitude: 1, waveform: 'sine' }];
		operators[0] = { ...operators[0], waveform: value };
		updateSetting('operators', operators);
	}
</script>

<ParamControl
	id="fm-op-freq"
	label="Operator Frequency Ratio"
	value={trackSettings.operators?.[0]?.frequency ?? 1}
	min={0.1}
	max={10}
	step={0.1}
	onUpdate={updateOperatorFrequency}
/>
<ParamControl
	id="fm-op-amp"
	label="Operator Amplitude"
	value={trackSettings.operators?.[0]?.amplitude ?? 1}
	min={0}
	max={2}
	step={0.01}
	onUpdate={updateOperatorAmplitude}
/>
<div class="param">
	<label for="fm-op-waveform">Operator Waveform</label>
	<select
		id="fm-op-waveform"
		value={trackSettings.operators?.[0]?.waveform ?? 'sine'}
		on:change={(e) => updateOperatorWaveform(getSelectValue(e) || 'sine')}
	>
		<option value="sine">Sine</option>
		<option value="saw">Saw</option>
		<option value="square">Square</option>
		<option value="triangle">Triangle</option>
	</select>
</div>
<ParamControl
	id="attack-range-fm"
	label="Attack"
	value={trackSettings.attack ?? 0.1}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('attack', v)}
/>
<ParamControl
	id="decay-range-fm"
	label="Decay"
	value={trackSettings.decay ?? 0.2}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('decay', v)}
/>
<ParamControl
	id="sustain-range-fm"
	label="Sustain"
	value={trackSettings.sustain ?? 0.7}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('sustain', v)}
/>
<ParamControl
	id="release-range-fm"
	label="Release"
	value={trackSettings.release ?? 0.3}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('release', v)}
/>

