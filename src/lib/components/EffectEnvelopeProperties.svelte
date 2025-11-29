<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { playbackStore } from '$lib/stores/playbackStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import type { Effect, Envelope } from '$lib/types/effects';
	import ParamControl from '$lib/components/sidebar/ParamControl.svelte';
	import { getAutomationValueAtBeat } from '$lib/utils/automationCurve';
	import '$lib/styles/components/EffectEnvelopeProperties.css';

	export let selectedEffectId: string | null = null;
	export let selectedEnvelopeId: string | null = null;
	export let selectedTimelineEffectId: string | null = null; // Timeline effect instance ID
	export let selectedTimelineEnvelopeId: string | null = null; // Timeline envelope instance ID

	let project: any;
	projectStore.subscribe((p) => (project = p));

	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));

	$: playbackState = $playbackStore;

	$: effects = project?.effects || [];
	$: envelopes = project?.envelopes || [];
	$: timeline = project?.timeline;
	$: patternTracks = timeline?.tracks?.filter((t: any) => t.type === 'pattern') || [];
	
	$: selectedEffect = selectedEffectId ? effects.find((e: Effect) => e.id === selectedEffectId) : null;
	$: selectedEnvelope = selectedEnvelopeId ? envelopes.find((e: Envelope) => e.id === selectedEnvelopeId) : null;
	
	// Get the timeline effect/envelope instance
	$: selectedTimelineEffect = selectedTimelineEffectId && timeline?.effects 
		? timeline.effects.find((te: any) => te.id === selectedTimelineEffectId) 
		: null;
	$: selectedTimelineEnvelope = selectedTimelineEnvelopeId && timeline?.envelopes 
		? timeline.envelopes.find((te: any) => te.id === selectedTimelineEnvelopeId) 
		: null;

	// Helper to get automated value for a parameter
	// This function is called from reactive statements to ensure it updates with playback
	function getAutomatedValue(parameterKey: string, baseValue: number, min: number, max: number, currentBeat: number): number {
		if (!selectedEffect || !selectedTimelineEffect || !project?.automation) {
			return baseValue;
		}

		// Automation ID format: effect:${targetId}:${timelineInstanceId}:${parameterKey}
		const automationId = `effect:${selectedEffect.id}:${selectedTimelineEffect.id}:${parameterKey}`;
		const automation = (project.automation as any)?.[automationId];
		
		if (!automation || !automation.points || automation.points.length === 0) {
			return baseValue;
		}

		const effectStartBeat = selectedTimelineEffect.startBeat || 0;
		const effectEndBeat = effectStartBeat + (selectedTimelineEffect.duration || 0);

		// Only apply automation if we're within the effect's time range
		if (currentBeat < effectStartBeat || currentBeat >= effectEndBeat) {
			return baseValue;
		}

		// Get automation value at current beat
		const automatedValue = getAutomationValueAtBeat(
			automation.points,
			currentBeat,
			automation.min ?? min,
			automation.max ?? max
		);

		return automatedValue;
	}
	
	// Reactive current beat for triggering updates
	$: currentBeat = playbackState.currentTime || 0;

	function updateEffectSetting(key: string, value: any) {
		if (!selectedEffect) return;
		const newSettings = {
			...selectedEffect.settings,
			[key]: value
		};
		
		// Update store
		projectStore.updateEffect(selectedEffect.id, {
			settings: newSettings
		});
		
		// Update engine in real-time
		if (engine) {
			engine.updateEffect(selectedEffect.id, { [key]: value });
		}
	}

	function updateEnvelopeSetting(key: string, value: any) {
		if (!selectedEnvelope) return;
		const newSettings = {
			...selectedEnvelope.settings,
			[key]: value
		};
		
		// Update store
		projectStore.updateEnvelope(selectedEnvelope.id, {
			settings: newSettings
		});
		
		// Update engine in real-time
		if (engine) {
			engine.updateEnvelope(selectedEnvelope.id, { [key]: value });
		}
	}

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

	// Helper to get automation props for effect parameters
	function getEffectAutomationProps(parameterKey: string) {
		if (!selectedEffect) return {};
		return {
			automationTargetType: 'effect' as const,
			automationTargetId: selectedEffect.id,
			automationParameterKey: parameterKey,
			automationTimelineInstanceId: selectedTimelineEffect?.id || null,
			automationLabel: `${selectedEffect.name} - ${parameterKey.charAt(0).toUpperCase() + parameterKey.slice(1)}`
		};
	}

	// Helper to get automation props for envelope parameters
	// Returns empty object to hide automation button (envelopes don't need automation editor)
	function getEnvelopeAutomationProps(parameterKey: string) {
		return {};
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
							on:change={(e) => updateTimelineEffectTargetTrack(e.currentTarget.value || null)}
						>
							<option value="">All Tracks (Global)</option>
							{#each patternTracks as track}
								<option value={track.id}>{track.name}</option>
							{/each}
						</select>
					</label>
					<p class="help-text">Choose a pattern track for this effect, or leave as \"All Tracks\" for a global effect.</p>
				</div>
			{/if}
			{#if selectedTimelineEnvelope}
				<div class="pattern-assignment">
					<label>
						Apply to Track:
						<select
							value={selectedTimelineEnvelope.targetTrackId || ''}
							on:change={(e) => updateTimelineEnvelopeTargetTrack(e.currentTarget.value || null)}
						>
							<option value="">All Tracks (Global)</option>
							{#each patternTracks as track}
								<option value={track.id}>{track.name}</option>
							{/each}
						</select>
					</label>
					<p class="help-text">Choose a pattern track for this envelope, or leave as \"All Tracks\" for a global envelope.</p>
				</div>
			{/if}
			{#if selectedEffect}
				{#if selectedEffect.type === 'reverb'}
					{@const roomSizeValue = getAutomatedValue('roomSize', selectedEffect.settings.roomSize ?? 0.5, 0, 1, currentBeat)}
					{@const dampeningValue = getAutomatedValue('dampening', selectedEffect.settings.dampening ?? 0.5, 0, 1, currentBeat)}
					{@const wetValue = getAutomatedValue('wet', selectedEffect.settings.wet ?? 0.3, 0, 1, currentBeat)}
					{@const dryValue = getAutomatedValue('dry', selectedEffect.settings.dry ?? 0.7, 0, 1, currentBeat)}
					<ParamControl
						label="Room Size"
						value={roomSizeValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('roomSize', v)}
						{...getEffectAutomationProps('roomSize')}
					/>
					<ParamControl
						label="Dampening"
						value={dampeningValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('dampening', v)}
						{...getEffectAutomationProps('dampening')}
					/>
					<ParamControl
						label="Wet"
						value={wetValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('wet', v)}
						{...getEffectAutomationProps('wet')}
					/>
					<ParamControl
						label="Dry"
						value={dryValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('dry', v)}
						{...getEffectAutomationProps('dry')}
					/>
				{:else if selectedEffect.type === 'delay'}
					{@const timeValue = getAutomatedValue('time', selectedEffect.settings.time ?? 0.25, 0, 2, currentBeat)}
					{@const feedbackValue = getAutomatedValue('feedback', selectedEffect.settings.feedback ?? 0.3, 0, 1, currentBeat)}
					{@const delayWetValue = getAutomatedValue('wet', selectedEffect.settings.wet ?? 0.3, 0, 1, currentBeat)}
					{@const delayDryValue = getAutomatedValue('dry', selectedEffect.settings.dry ?? 0.7, 0, 1, currentBeat)}
					<ParamControl
						label="Time"
						value={timeValue}
						min={0}
						max={2}
						step={0.01}
						onChange={(v) => updateEffectSetting('time', v)}
						{...getEffectAutomationProps('time')}
					/>
					<ParamControl
						label="Feedback"
						value={feedbackValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('feedback', v)}
						{...getEffectAutomationProps('feedback')}
					/>
					<ParamControl
						label="Wet"
						value={delayWetValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('wet', v)}
						{...getEffectAutomationProps('wet')}
					/>
					<ParamControl
						label="Dry"
						value={delayDryValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('dry', v)}
						{...getEffectAutomationProps('dry')}
					/>
				{:else if selectedEffect.type === 'filter'}
					{@const frequencyValue = getAutomatedValue('frequency', selectedEffect.settings.frequency ?? 0.5, 0, 1, currentBeat)}
					{@const resonanceValue = getAutomatedValue('resonance', selectedEffect.settings.resonance ?? 0.5, 0, 1, currentBeat)}
					<label>
						Type
						<select
							value={selectedEffect.settings.type ?? 'lowpass'}
							on:change={(e) => updateEffectSetting('type', e.currentTarget.value)}
						>
							<option value="lowpass">Lowpass</option>
							<option value="highpass">Highpass</option>
							<option value="bandpass">Bandpass</option>
						</select>
					</label>
					<ParamControl
						label="Frequency"
						value={frequencyValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('frequency', v)}
						{...getEffectAutomationProps('frequency')}
					/>
					<ParamControl
						label="Resonance"
						value={resonanceValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('resonance', v)}
						{...getEffectAutomationProps('resonance')}
					/>
				{:else if selectedEffect.type === 'distortion'}
					{@const amountValue = getAutomatedValue('amount', selectedEffect.settings.amount ?? 0.3, 0, 1, currentBeat)}
					{@const driveValue = getAutomatedValue('drive', selectedEffect.settings.drive ?? 0.5, 0, 1, currentBeat)}
					<ParamControl
						label="Amount"
						value={amountValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('amount', v)}
						{...getEffectAutomationProps('amount')}
					/>
					<ParamControl
						label="Drive"
						value={driveValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('drive', v)}
						{...getEffectAutomationProps('drive')}
					/>
				{:else if selectedEffect.type === 'compressor'}
					{@const thresholdValue = getAutomatedValue('threshold', selectedEffect.settings.threshold ?? 0.7, 0, 1, currentBeat)}
					{@const ratioValue = getAutomatedValue('ratio', selectedEffect.settings.ratio ?? 4, 1, 20, currentBeat)}
					{@const attackValue = getAutomatedValue('attack', selectedEffect.settings.attack ?? 0.01, 0, 1, currentBeat)}
					{@const releaseValue = getAutomatedValue('release', selectedEffect.settings.release ?? 0.1, 0, 1, currentBeat)}
					<ParamControl
						label="Threshold"
						value={thresholdValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('threshold', v)}
						{...getEffectAutomationProps('threshold')}
					/>
					<ParamControl
						label="Ratio"
						value={ratioValue}
						min={1}
						max={20}
						step={0.1}
						onChange={(v) => updateEffectSetting('ratio', v)}
						{...getEffectAutomationProps('ratio')}
					/>
					<ParamControl
						label="Attack"
						value={attackValue}
						min={0}
						max={1}
						step={0.001}
						onChange={(v) => updateEffectSetting('attack', v)}
						{...getEffectAutomationProps('attack')}
					/>
					<ParamControl
						label="Release"
						value={releaseValue}
						min={0}
						max={1}
						step={0.001}
						onChange={(v) => updateEffectSetting('release', v)}
						{...getEffectAutomationProps('release')}
					/>
				{:else if selectedEffect.type === 'chorus'}
					{@const rateValue = getAutomatedValue('rate', selectedEffect.settings.rate ?? 0.5, 0, 1, currentBeat)}
					{@const depthValue = getAutomatedValue('depth', selectedEffect.settings.depth ?? 0.3, 0, 1, currentBeat)}
					{@const chorusDelayValue = getAutomatedValue('delay', selectedEffect.settings.delay ?? 0.02, 0, 0.1, currentBeat)}
					<ParamControl
						label="Rate"
						value={rateValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('rate', v)}
						{...getEffectAutomationProps('rate')}
					/>
					<ParamControl
						label="Depth"
						value={depthValue}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('depth', v)}
						{...getEffectAutomationProps('depth')}
					/>
					<ParamControl
						label="Delay"
						value={chorusDelayValue}
						min={0}
						max={0.1}
						step={0.001}
						onChange={(v) => updateEffectSetting('delay', v)}
						{...getEffectAutomationProps('delay')}
					/>
					<ParamControl
						label="Wet"
						value={selectedEffect.settings.wet ?? 0.3}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEffectSetting('wet', v)}
						{...getEffectAutomationProps('wet')}
					/>
				{/if}
			{:else if selectedEnvelope}
				{#if selectedEnvelope.type === 'volume'}
					<ParamControl
						label="Volume Start"
						value={selectedEnvelope.settings.startValue ?? 0.5}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEnvelopeSetting('startValue', v)}
						{...getEnvelopeAutomationProps('startValue')}
					/>
					<ParamControl
						label="Volume End"
						value={selectedEnvelope.settings.endValue ?? 1.0}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEnvelopeSetting('endValue', v)}
						{...getEnvelopeAutomationProps('endValue')}
					/>
					<div class="param">
						<label for="volume-curve">Curve Type</label>
						<select
							id="volume-curve"
							value={selectedEnvelope.settings.curve ?? 'linear'}
							on:change={(e) => updateEnvelopeSetting('curve', e.currentTarget.value)}
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
								checked={selectedEnvelope.settings.reverse ?? false}
								on:change={(e) => updateEnvelopeSetting('reverse', e.currentTarget.checked)}
							/>
							<span>Reverse Direction</span>
						</label>
					</div>
				{:else if selectedEnvelope.type === 'filter'}
					<ParamControl
						label="Filter Start"
						value={selectedEnvelope.settings.startValue ?? 0.2}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEnvelopeSetting('startValue', v)}
						{...getEnvelopeAutomationProps('startValue')}
					/>
					<ParamControl
						label="Filter End"
						value={selectedEnvelope.settings.endValue ?? 0.8}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEnvelopeSetting('endValue', v)}
						{...getEnvelopeAutomationProps('endValue')}
					/>
					<div class="param">
						<label for="filter-curve">Curve Type</label>
						<select
							id="filter-curve"
							value={selectedEnvelope.settings.curve ?? 'linear'}
							on:change={(e) => updateEnvelopeSetting('curve', e.currentTarget.value)}
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
								checked={selectedEnvelope.settings.reverse ?? false}
								on:change={(e) => updateEnvelopeSetting('reverse', e.currentTarget.checked)}
							/>
							<span>Reverse Direction</span>
						</label>
					</div>
				{:else if selectedEnvelope.type === 'pitch'}
					<ParamControl
						label="Pitch Start"
						value={selectedEnvelope.settings.startValue ?? 0.5}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEnvelopeSetting('startValue', v)}
						{...getEnvelopeAutomationProps('startValue')}
					/>
					<ParamControl
						label="Pitch End"
						value={selectedEnvelope.settings.endValue ?? 1.0}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEnvelopeSetting('endValue', v)}
						{...getEnvelopeAutomationProps('endValue')}
					/>
					<div class="param">
						<label for="pitch-curve">Curve Type</label>
						<select
							id="pitch-curve"
							value={selectedEnvelope.settings.curve ?? 'linear'}
							on:change={(e) => updateEnvelopeSetting('curve', e.currentTarget.value)}
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
								checked={selectedEnvelope.settings.reverse ?? false}
								on:change={(e) => updateEnvelopeSetting('reverse', e.currentTarget.checked)}
							/>
							<span>Reverse Direction</span>
						</label>
					</div>
				{:else if selectedEnvelope.type === 'pan'}
					<ParamControl
						label="Pan Start"
						value={selectedEnvelope.settings.startValue ?? 0.5}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEnvelopeSetting('startValue', v)}
						{...getEnvelopeAutomationProps('startValue')}
					/>
					<ParamControl
						label="Pan End"
						value={selectedEnvelope.settings.endValue ?? 0.5}
						min={0}
						max={1}
						step={0.01}
						onChange={(v) => updateEnvelopeSetting('endValue', v)}
						{...getEnvelopeAutomationProps('endValue')}
					/>
					<div class="param">
						<label for="pan-curve">Curve Type</label>
						<select
							id="pan-curve"
							value={selectedEnvelope.settings.curve ?? 'linear'}
							on:change={(e) => updateEnvelopeSetting('curve', e.currentTarget.value)}
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
								checked={selectedEnvelope.settings.reverse ?? false}
								on:change={(e) => updateEnvelopeSetting('reverse', e.currentTarget.checked)}
							/>
							<span>Reverse Direction</span>
						</label>
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

