<script lang="ts">
	import type { Effect } from '$lib/types/effects';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import ParamControl from '../sidebar/ParamControl.svelte';
	import '$lib/styles/components/SynthPluginWindow.css';

	const { selectedEffect }: { selectedEffect: Effect } = $props();
	
	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));

	function updateSetting(key: string, value: any) {
		if (!selectedEffect) return;
		const processedValue = typeof value === 'number' ? parseFloat(value.toFixed(3)) : value;
		const newSettings = {
			...selectedEffect.settings,
			[key]: processedValue
		};
		
		projectStore.updateEffect(selectedEffect.id, {
			settings: newSettings
		});
		
		if (engine) {
			engine.updateEffect(selectedEffect.id, { [key]: processedValue });
		}
	}
</script>

<div class="synth-plugin">
	<div class="param-group">
		<div class="param-group-title">Saturation</div>
		<ParamControl
			label="Amount"
			value={selectedEffect.settings.amount ?? 0.3}
			min={0}
			max={1}
			step={0.01}
			onChange={(v) => updateSetting('amount', v)}
		/>
		<ParamControl
			label="Drive"
			value={selectedEffect.settings.drive ?? 0.5}
			min={0}
			max={1}
			step={0.01}
			onChange={(v) => updateSetting('drive', v)}
		/>
		<ParamControl
			label="Tone"
			value={selectedEffect.settings.tone ?? 0.5}
			min={0}
			max={1}
			step={0.01}
			onChange={(v) => updateSetting('tone', v)}
		/>
	</div>
	
	<div class="param-group">
		<div class="param-group-title">Mix</div>
		<ParamControl
			label="Wet"
			value={selectedEffect.settings.wet ?? 0.5}
			min={0}
			max={1}
			step={0.01}
			onChange={(v) => updateSetting('wet', v)}
		/>
	</div>
</div>

