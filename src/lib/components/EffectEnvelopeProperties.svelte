<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { Effect, Envelope } from '$lib/types/effects';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import { effectPluginStore } from '$lib/stores/effectPluginStore';
	import ParamControl from './sidebar/ParamControl.svelte';
	import { getAutomationValueAtBeat } from '$lib/utils/automationCurve';
	import { playbackStore } from '$lib/stores/playbackStore';
	import '$lib/styles/components/EffectEnvelopeProperties.css';

	const {
		selectedEffectId = null,
		selectedEnvelopeId = null,
		selectedTimelineEffectId = null,
		selectedTimelineEnvelopeId = null
	}: {
		selectedEffectId?: string | null;
		selectedEnvelopeId?: string | null;
		selectedTimelineEffectId?: string | null;
		selectedTimelineEnvelopeId?: string | null;
	} = $props();

	let project: any = $state(null);
	projectStore.subscribe((p) => (project = p));

	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));

	let playbackState: any = $state(null);
	playbackStore.subscribe((p) => (playbackState = p));

	const timeline = $derived(project?.timeline);
	const patternTracks = $derived(timeline?.tracks?.filter((t: any) => t.type === 'pattern') || []);
	
	const effects = $derived(project?.effects || []);
	const envelopes = $derived(project?.envelopes || []);
	
	const selectedEffect = $derived(selectedEffectId ? effects.find((e: Effect) => e.id === selectedEffectId) : null);
	const selectedEnvelope = $derived(selectedEnvelopeId ? envelopes.find((e: Envelope) => e.id === selectedEnvelopeId) : null);

	// Get the timeline effect/envelope instance
	const selectedTimelineEffect = $derived(selectedTimelineEffectId && timeline?.effects 
		? timeline.effects.find((te: any) => te.id === selectedTimelineEffectId) 
		: null);
	const selectedTimelineEnvelope = $derived(selectedTimelineEnvelopeId && timeline?.envelopes 
		? timeline.envelopes.find((te: any) => te.id === selectedTimelineEnvelopeId) 
		: null);

	function updateTimelineEffectTargetTrack(trackId: string | null) {
		if (!selectedTimelineEffect) return;
		projectStore.updateTimelineEffect(selectedTimelineEffect.id, {
			targetTrackId: trackId || undefined
		});
		window.dispatchEvent(new CustomEvent('reloadProject'));
	}

	function updateTimelineEnvelopeTargetTrack(trackId: string | null) {
		if (!selectedTimelineEnvelope) return;
		projectStore.updateTimelineEnvelope(selectedTimelineEnvelope.id, {
			targetTrackId: trackId || undefined
		});
		window.dispatchEvent(new CustomEvent('reloadProject'));
	}

	function openPluginWindow() {
		if (!selectedEffect) return;
		
		// Only equalizer has a plugin currently
		if (selectedEffect.type === 'equalizer') {
			effectPluginStore.openWindow({
				id: selectedEffect.id,
				effectType: 'equalizer',
				effectId: selectedEffect.id,
				label: selectedEffect.name
			});
		}
	}

	function updateEffectSetting(key: string, value: number) {
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

	function getEffectValue(key: string, defaultValue: number): number {
		if (!selectedEffect) return defaultValue;
		const currentBeat = playbackState?.currentBeat || 0;
		
		// Get automation points from project
		const automationId = selectedTimelineEffect?.id
			? `effect:${selectedEffect.id}:${selectedTimelineEffect.id}:${key}`
			: `effect:${selectedEffect.id}:${key}`;
		
		const automation = project?.automation?.[automationId] as any;
		
		if (automation && automation.points && automation.points.length > 0) {
			const min = automation.min ?? 0;
			const max = automation.max ?? 1;
			return getAutomationValueAtBeat(automation.points, currentBeat, min, max);
		}
		
		return selectedEffect.settings[key] ?? defaultValue;
	}

	function updateEnvelopeSetting(key: string, value: number | string | boolean) {
		if (!selectedEnvelope) return;
		const processedValue = typeof value === 'number' ? parseFloat(value.toFixed(3)) : value;
		const newSettings = {
			...selectedEnvelope.settings,
			[key]: processedValue
		};
		
		projectStore.updateEnvelope(selectedEnvelope.id, {
			settings: newSettings
		});
		
		if (engine) {
			engine.updateEnvelope(selectedEnvelope.id, { [key]: processedValue });
		}
	}

	function getEnvelopeValue(key: string, defaultValue: number): number {
		if (!selectedEnvelope) return defaultValue;
		const currentBeat = playbackState?.currentBeat || 0;
		
		// Get automation points from project
		const automationId = selectedTimelineEnvelope?.id
			? `envelope:${selectedEnvelope.id}:${selectedTimelineEnvelope.id}:${key}`
			: `envelope:${selectedEnvelope.id}:${key}`;
		
		const automation = project?.automation?.[automationId] as any;
		
		if (automation && automation.points && automation.points.length > 0) {
			const min = automation.min ?? 0;
			const max = automation.max ?? 1;
			return getAutomationValueAtBeat(automation.points, currentBeat, min, max);
		}
		
		return selectedEnvelope.settings[key] ?? defaultValue;
	}
</script>

{#if selectedEffect || selectedEnvelope}
	<div class="effect-envelope-properties">
		<div class="properties-header">
			<h3>{selectedEffect?.name || selectedEnvelope?.name}</h3>
			<span class="properties-type">{selectedEffect?.type || selectedEnvelope?.type}</span>
		</div>
		<div class="properties-content">
			{#if selectedTimelineEffect}
				<div class="pattern-assignment">
					<label>
						Apply to Track:
						<select
							value={selectedTimelineEffect.targetTrackId || ''}
							onchange={(e) => updateTimelineEffectTargetTrack(e.currentTarget.value || null)}
						>
							<option value="">All Tracks (Global)</option>
							{#each patternTracks as track}
								<option value={track.id}>{track.name}</option>
							{/each}
						</select>
					</label>
					<p class="help-text">Choose a pattern track for this effect, or leave as "All Tracks" for a global effect.</p>
				</div>
			{/if}
			{#if selectedTimelineEnvelope}
				<div class="pattern-assignment">
					<label>
						Apply to Track:
						<select
							value={selectedTimelineEnvelope.targetTrackId || ''}
							onchange={(e) => updateTimelineEnvelopeTargetTrack(e.currentTarget.value || null)}
						>
							<option value="">All Tracks (Global)</option>
							{#each patternTracks as track}
								<option value={track.id}>{track.name}</option>
							{/each}
						</select>
					</label>
					<p class="help-text">Choose a pattern track for this envelope, or leave as "All Tracks" for a global envelope.</p>
				</div>
			{/if}
			{#if selectedEnvelope}
				<!-- Envelope Parameters -->
				<div class="envelope-parameters">
					<ParamControl
						label="Start Value"
						value={getEnvelopeValue('startValue', selectedEnvelope.type === 'pitch' ? 0.5 : 0)}
						min={0}
						max={1}
						step={0.01}
						onUpdate={(v) => updateEnvelopeSetting('startValue', v)}
						automationTargetType="envelope"
						automationTargetId={selectedEnvelope.id}
						automationParameterKey="startValue"
						automationTimelineInstanceId={selectedTimelineEnvelope?.id}
						automationLabel={`${selectedEnvelope.name} - Start Value`}
					/>
					<ParamControl
						label="End Value"
						value={getEnvelopeValue('endValue', selectedEnvelope.type === 'pitch' ? 0.5 : 1)}
						min={0}
						max={1}
						step={0.01}
						onUpdate={(v) => updateEnvelopeSetting('endValue', v)}
						automationTargetType="envelope"
						automationTargetId={selectedEnvelope.id}
						automationParameterKey="endValue"
						automationTimelineInstanceId={selectedTimelineEnvelope?.id}
						automationLabel={`${selectedEnvelope.name} - End Value`}
					/>
					<div class="param">
						<label for="envelope-curve">Curve Type</label>
						<select
							id="envelope-curve"
							value={selectedEnvelope.settings?.curve ?? 'linear'}
							onchange={(e) => updateEnvelopeSetting('curve', e.currentTarget.value)}
						>
							<option value="linear">Linear</option>
							<option value="exponential">Exponential</option>
							<option value="logarithmic">Logarithmic</option>
						</select>
					</div>
					<div class="param param-checkbox">
						<label class="checkbox-label">
							<input
								type="checkbox"
								class="styled-checkbox"
								checked={selectedEnvelope.settings?.reverse ?? false}
								onchange={(e) => updateEnvelopeSetting('reverse', e.currentTarget.checked)}
							/>
							<span>Reverse Direction</span>
						</label>
					</div>
				</div>
			{/if}
			{#if selectedEffect && selectedEffect.type === 'equalizer'}
				<div class="plugin-button-container">
					<button class="open-plugin-button" onclick={openPluginWindow}>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M8 2L2 6L8 10L14 6L8 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M2 12L8 16L14 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M2 8L8 12L14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>Open Plugin</span>
					</button>
					<p class="help-text">Open the EQ Eight plugin to adjust frequency bands and view the frequency response curve.</p>
				</div>
			{:else if selectedEffect}
				<!-- Effect Parameters -->
				<div class="effect-parameters">
					{#if selectedEffect.type === 'reverb'}
						<ParamControl
							label="Room Size"
							value={getEffectValue('roomSize', 0.7)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('roomSize', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="roomSize"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Room Size`}
						/>
						<ParamControl
							label="Dampening"
							value={getEffectValue('dampening', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('dampening', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="dampening"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Dampening`}
						/>
						<ParamControl
							label="Wet"
							value={getEffectValue('wet', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('wet', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="wet"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Wet`}
						/>
						<ParamControl
							label="Dry"
							value={getEffectValue('dry', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('dry', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="dry"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Dry`}
						/>
					{:else if selectedEffect.type === 'delay'}
						<ParamControl
							label="Time"
							value={getEffectValue('time', 0.25)}
							min={0}
							max={2}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('time', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="time"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Time`}
						/>
						<ParamControl
							label="Feedback"
							value={getEffectValue('feedback', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('feedback', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="feedback"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Feedback`}
						/>
						<ParamControl
							label="Wet"
							value={getEffectValue('wet', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('wet', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="wet"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Wet`}
						/>
						<ParamControl
							label="Dry"
							value={getEffectValue('dry', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('dry', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="dry"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Dry`}
						/>
					{:else if selectedEffect.type === 'filter'}
						<ParamControl
							label="Frequency"
							value={getEffectValue('frequency', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('frequency', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="frequency"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Frequency`}
						/>
						<ParamControl
							label="Resonance"
							value={getEffectValue('resonance', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('resonance', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="resonance"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Resonance`}
						/>
					{:else if selectedEffect.type === 'distortion'}
						<ParamControl
							label="Amount"
							value={getEffectValue('amount', 0.3)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('amount', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="amount"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Amount`}
						/>
						<ParamControl
							label="Drive"
							value={getEffectValue('drive', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('drive', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="drive"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Drive`}
						/>
					{:else if selectedEffect.type === 'compressor'}
						<ParamControl
							label="Threshold"
							value={getEffectValue('threshold', 0.7)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('threshold', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="threshold"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Threshold`}
						/>
						<ParamControl
							label="Ratio"
							value={getEffectValue('ratio', 4)}
							min={1}
							max={20}
							step={0.1}
							onUpdate={(v) => updateEffectSetting('ratio', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="ratio"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Ratio`}
						/>
						<ParamControl
							label="Attack"
							value={getEffectValue('attack', 0.01)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('attack', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="attack"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Attack`}
						/>
						<ParamControl
							label="Release"
							value={getEffectValue('release', 0.1)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('release', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="release"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Release`}
						/>
					{:else if selectedEffect.type === 'chorus'}
						<ParamControl
							label="Rate"
							value={getEffectValue('rate', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('rate', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="rate"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Rate`}
						/>
						<ParamControl
							label="Depth"
							value={getEffectValue('depth', 0.6)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('depth', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="depth"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Depth`}
						/>
						<ParamControl
							label="Delay"
							value={getEffectValue('delay', 0.02)}
							min={0}
							max={0.1}
							step={0.001}
							onUpdate={(v) => updateEffectSetting('delay', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="delay"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Delay`}
						/>
						<ParamControl
							label="Wet"
							value={getEffectValue('wet', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('wet', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="wet"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Wet`}
						/>
					{:else if selectedEffect.type === 'saturator'}
						<ParamControl
							label="Amount"
							value={getEffectValue('amount', 0.3)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('amount', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="amount"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Amount`}
						/>
						<ParamControl
							label="Drive"
							value={getEffectValue('drive', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('drive', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="drive"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Drive`}
						/>
						<ParamControl
							label="Tone"
							value={getEffectValue('tone', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('tone', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="tone"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Tone`}
						/>
						<ParamControl
							label="Wet"
							value={getEffectValue('wet', 0.5)}
							min={0}
							max={1}
							step={0.01}
							onUpdate={(v) => updateEffectSetting('wet', v)}
							automationTargetType="effect"
							automationTargetId={selectedEffect.id}
							automationParameterKey="wet"
							automationTimelineInstanceId={selectedTimelineEffect?.id}
							automationLabel={`${selectedEffect.name} - Wet`}
						/>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

