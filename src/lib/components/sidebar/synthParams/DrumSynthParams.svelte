<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import { getInputValue } from '../sidebarUtils';
	import ParamControl from '../ParamControl.svelte';

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
			if (key === 'attack' || key === 'decay' || key === 'release') {
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
			// Update the selected instrument's settings
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

<ParamControl
	id="attack-range-1"
	label="Attack"
	value={trackSettings.attack ?? 0.01}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('attack', v)}
/>
<ParamControl
	id="decay-range-1"
	label="Decay"
	value={trackSettings.decay ?? 0.3}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('decay', v)}
/>
<ParamControl
	id="release-range-1"
	label="Release"
	value={trackSettings.release ?? 0.1}
	min={0}
	max={1}
	step={0.01}
	onUpdate={(v) => updateSetting('release', v)}
/>

