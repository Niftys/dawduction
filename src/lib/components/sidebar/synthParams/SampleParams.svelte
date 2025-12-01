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
	
	// Get sample duration for calculating max values
	const sampleDuration = $derived(activeItem?.settings?.duration || 0);
	const sampleRate = $derived(activeItem?.settings?.sampleRate || 44100);
	const maxSamples = $derived(sampleDuration * sampleRate);
	
	// Convert samples to seconds for display
	function samplesToSeconds(samples: number): number {
		return samples / sampleRate;
	}
	
	// Convert seconds to samples
	function secondsToSamples(seconds: number): number {
		return Math.floor(seconds * sampleRate);
	}

	function updateSetting(key: string, value: any) {
		if (!activeItem) return;
		let processedValue = value;
		if (typeof value === 'number') {
			if (isNaN(value)) return;
			if (key === 'startPoint' || key === 'endPoint') {
				// Clamp to valid range
				const maxVal = maxSamples;
				processedValue = Math.max(0, Math.min(maxVal, Math.floor(value)));
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
			projectStore.updateStandaloneInstrument(selectedTrack.id, {
				settings: newSettings,
				instrumentSettings: instrumentSettings
			});
			if (engine) {
				engine.updateTrackSettings(selectedTrack.id, newSettings);
			}
		}
	}
	
	function toggleLoop() {
		const currentLoop = trackSettings.loop ?? false;
		updateSetting('loop', !currentLoop);
	}
</script>

<ParamControl
	id="sample-start-point"
	label="Start Point (s)"
	value={samplesToSeconds(trackSettings.startPoint ?? 0)}
	min={0}
	max={sampleDuration}
	step={0.001}
	resetValue={0}
	onReset={() => updateSetting('startPoint', 0)}
	onUpdate={(v) => updateSetting('startPoint', secondsToSamples(v))}
/>

<ParamControl
	id="sample-end-point"
	label="End Point (s)"
	value={trackSettings.endPoint !== null && trackSettings.endPoint !== undefined ? samplesToSeconds(trackSettings.endPoint) : sampleDuration}
	min={0}
	max={sampleDuration}
	step={0.001}
	resetValue={sampleDuration}
	onReset={() => updateSetting('endPoint', null)}
	onUpdate={(v) => {
		const samples = secondsToSamples(v);
		// If at max, set to null (end of sample)
		if (samples >= maxSamples - 1) {
			updateSetting('endPoint', null);
		} else {
			updateSetting('endPoint', samples);
		}
	}}
/>

<div class="loop-control">
	<label class="loop-label">
		<input
			type="checkbox"
			checked={trackSettings.loop ?? false}
			onchange={(e) => updateSetting('loop', (e.target as HTMLInputElement).checked)}
		/>
		<span>Loop</span>
	</label>
</div>

<style>
	.loop-control {
		margin-top: 12px;
		padding: 8px 0;
	}
	
	.loop-label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		color: #e8e8e8;
		font-size: 13px;
	}
	
	.loop-label input[type="checkbox"] {
		cursor: pointer;
		width: 16px;
		height: 16px;
	}
</style>

