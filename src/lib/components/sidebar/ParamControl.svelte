<script lang="ts">
	import { getInputValue } from './sidebarUtils';
	import { automationStore } from '$lib/stores/automationStore';
	import { projectStore } from '$lib/stores/projectStore';

	const fallbackId = `param-${Math.random().toString(36).slice(2)}`;
	export let id: string = fallbackId;
	export let label: string;
	export let value: number;
	export let min: number;
	export let max: number;
	export let step: number;
	export let onUpdate: ((value: number) => void) | undefined = undefined;
	export let onChange: ((value: number) => void) | undefined = undefined;
	export let resetValue: number | undefined = undefined;
	export let onReset: (() => void) | undefined = undefined;
	
	// Automation props
	export let automationTargetType: 'effect' | 'envelope' | null = null;
	export let automationTargetId: string | null = null;
	export let automationParameterKey: string | null = null;
	export let automationTimelineInstanceId: string | null = null;
	export let automationLabel: string | null = null;

	let isDragging = false;

	const handleUpdate = (val: number) => {
		if (typeof onUpdate === 'function') {
			onUpdate(val);
		}
		if (typeof onChange === 'function') {
			onChange(val);
		}
	};

	const handleMouseDown = () => {
		if (!isDragging) {
			isDragging = true;
			projectStore.startBatch();
		}
	};

	const handleMouseUp = () => {
		if (isDragging) {
			isDragging = false;
			projectStore.endBatch();
		}
	};

	function openAutomation() {
		if (!automationTargetType || !automationTargetId || !automationParameterKey) return;
		
		const windowId = `${automationTargetType}:${automationTargetId}:${automationParameterKey}:${automationTimelineInstanceId || 'global'}`;
		const displayLabel = automationLabel || `${automationTargetType} - ${label}`;
		
		automationStore.openWindow({
			id: windowId,
			targetType: automationTargetType,
			targetId: automationTargetId,
			parameterKey: automationParameterKey,
			timelineInstanceId: automationTimelineInstanceId || undefined,
			label: displayLabel
		});
	}
</script>

<div class="param">
	<div class="param-header">
		<label for={id}>{label}</label>
		<div class="param-header-actions">
			{#if automationTargetType && automationTargetId && automationParameterKey}
				<button 
					class="automation-btn" 
					on:click={openAutomation}
					title="Open automation editor"
				>
					📈
				</button>
			{/if}
			{#if onReset && resetValue !== undefined}
				<button class="reset-btn" on:click={onReset}>Reset</button>
			{/if}
		</div>
	</div>
	<div class="param-controls">
		<input
			id={id}
			type="range"
			{min}
			{max}
			{step}
			value={value}
			on:mousedown={handleMouseDown}
			on:mouseup={handleMouseUp}
			on:mouseleave={handleMouseUp}
			on:input={(e) => handleUpdate(Number(getInputValue(e)))}
		/>
		<input
			id={`${id}-number`}
			type="number"
			{min}
			{max}
			{step}
			value={value}
			on:input={(e) => handleUpdate(Number(getInputValue(e)))}
			class="numeric-input"
		/>
	</div>
</div>

