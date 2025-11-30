<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getInputValue } from './sidebarUtils';
	import { automationStore } from '$lib/stores/automationStore';
	import { projectStore } from '$lib/stores/projectStore';
	import NumericInput from './NumericInput.svelte';

	const fallbackId = `param-${Math.random().toString(36).slice(2)}`;
	const {
		id = fallbackId,
		label,
		value,
		min,
		max,
		step,
		onUpdate = undefined,
		onChange = undefined,
		resetValue = undefined,
		onReset = undefined,
		automationTargetType = null,
		automationTargetId = null,
		automationParameterKey = null,
		automationTimelineInstanceId = null,
		automationLabel = null
	}: {
		id?: string;
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		onUpdate?: ((value: number) => void) | undefined;
		onChange?: ((value: number) => void) | undefined;
		resetValue?: number | undefined;
		onReset?: (() => void) | undefined;
		automationTargetType?: 'effect' | 'envelope' | null;
		automationTargetId?: string | null;
		automationParameterKey?: string | null;
		automationTimelineInstanceId?: string | null;
		automationLabel?: string | null;
	} = $props();

	let isDragging = false;
	let sliderElement: HTMLInputElement;
	let globalMouseUpHandler: (() => void) | null = null;

	// Enforce minimum value - prevent sliders from going to 0
	const MIN_VALUE = 0.01;
	const effectiveMin = min === 0 ? MIN_VALUE : min;
	
	const handleUpdate = (val: number) => {
		// Clamp value to prevent going below effective minimum
		const clampedVal = Math.max(effectiveMin, val);
		if (typeof onUpdate === 'function') {
			onUpdate(clampedVal);
		}
		if (typeof onChange === 'function') {
			onChange(clampedVal);
		}
	};

	const handleMouseDown = () => {
		if (!isDragging) {
			isDragging = true;
			projectStore.startBatch();
			
			// Add global mouseup listener to stop dragging when mouse is released anywhere
			const handleGlobalMouseUp = () => {
				if (isDragging) {
					isDragging = false;
					projectStore.endBatch();
					if (globalMouseUpHandler) {
						window.removeEventListener('mouseup', globalMouseUpHandler);
						globalMouseUpHandler = null;
					}
				}
			};
			
			globalMouseUpHandler = handleGlobalMouseUp;
			window.addEventListener('mouseup', globalMouseUpHandler);
		}
	};

	// Cleanup on component destroy
	onDestroy(() => {
		if (globalMouseUpHandler) {
			window.removeEventListener('mouseup', globalMouseUpHandler);
			globalMouseUpHandler = null;
		}
		if (isDragging) {
			isDragging = false;
			projectStore.endBatch();
		}
	});

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
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
						<circle cx="2" cy="10" r="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
						<circle cx="10" cy="2" r="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
						<line x1="3.5" y1="10" x2="8.5" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			{/if}
			{#if onReset && resetValue !== undefined}
				<button class="reset-btn" on:click={onReset}>Reset</button>
			{/if}
		</div>
	</div>
	<div class="param-controls">
		<input
			bind:this={sliderElement}
			id={id}
			type="range"
			min={effectiveMin}
			{max}
			{step}
			value={Math.max(effectiveMin, value)}
			on:mousedown={handleMouseDown}
			on:input={(e) => handleUpdate(Number(getInputValue(e)))}
		/>
		<NumericInput
			id={`${id}-number`}
			min={effectiveMin}
			{max}
			{step}
			value={Math.max(effectiveMin, value)}
			onInput={handleUpdate}
		/>
	</div>
</div>

