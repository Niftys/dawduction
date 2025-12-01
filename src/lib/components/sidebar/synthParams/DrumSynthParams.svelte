<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import { getInputValue } from '../sidebarUtils';
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
	
	// Get default values for this instrument type
	const instrumentDefaults = $derived({
		kick: { attack: 0.005, decay: 0.4, release: 0.15 },
		snare: { attack: 0.005, decay: 0.2, release: 0.1 },
		hihat: { attack: 0.001, decay: 0.05, release: 0.01 },
		clap: { attack: 0.01, decay: 0.15, release: 0.05 },
		tom: { attack: 0.01, decay: 0.4, release: 0.1 },
		cymbal: { attack: 0.01, decay: 0.5, release: 0.2 },
		shaker: { attack: 0.01, decay: 0.3, release: 0.1 },
		rimshot: { attack: 0.001, decay: 0.08, release: 0.05 }
	});
	
	const defaults = $derived(activeItem?.instrumentType ? instrumentDefaults[activeItem.instrumentType as keyof typeof instrumentDefaults] : null);

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
			} else {
				processedValue = parseFloat(value.toFixed(2));
			}
		}
		
		if (selectedPattern && selectedInstrument) {
			// Get the latest instrument from the project store
			const pattern = currentProject.patterns?.find((p: any) => p.id === selectedPattern.id);
			if (!pattern) {
				console.log('Pattern not found', selectedPattern.id);
				return;
			}
			
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
			
			// Update the selected instrument's settings
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
</script>

<ParamControl
	id="attack-range-1"
	label="Attack"
	value={trackSettings.attack ?? 0.01}
	min={0}
	max={1}
	step={0.01}
	resetValue={defaults?.attack ?? 0.01}
	onReset={() => updateSetting('attack', defaults?.attack ?? 0.01)}
	onUpdate={(v) => updateSetting('attack', v)}
/>
<ParamControl
	id="decay-range-1"
	label="Decay"
	value={trackSettings.decay ?? 0.3}
	min={0}
	max={1}
	step={0.01}
	resetValue={defaults?.decay ?? 0.3}
	onReset={() => updateSetting('decay', defaults?.decay ?? 0.3)}
	onUpdate={(v) => updateSetting('decay', v)}
/>
<ParamControl
	id="release-range-1"
	label="Release"
	value={trackSettings.release ?? 0.1}
	min={0}
	max={1}
	step={0.01}
	resetValue={defaults?.release ?? 0.1}
	onReset={() => updateSetting('release', defaults?.release ?? 0.1)}
	onUpdate={(v) => updateSetting('release', v)}
/>

