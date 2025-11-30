<script lang="ts">
	import type { TimelineEffect } from '$lib/types/effects';
	import type { Effect } from '$lib/types/effects';
	import { TIMELINE_CONSTANTS } from '$lib/utils/timelineUtils';
	import { beatToPixel } from '$lib/utils/timelineUtils';
	import { generateAutomationCurvePath } from '$lib/utils/automationCurve';

	const {
		timelineEffect,
		effect,
		pixelsPerBeat,
		isSelected,
		isDragging,
		automationCurves,
		onMouseDown,
		onClick,
		onKeyDown,
		onContextMenu,
		onDelete = undefined
	}: {
		timelineEffect: TimelineEffect;
		effect: Effect;
		pixelsPerBeat: number;
		isSelected: boolean;
		isDragging: boolean;
		automationCurves: Array<{ automation: any; parameterKey: string }>;
		onMouseDown: (e: MouseEvent) => void;
		onClick: (e: MouseEvent) => void;
		onKeyDown: (e: KeyboardEvent) => void;
		onContextMenu: (e: MouseEvent) => void;
		onDelete?: (() => void) | undefined;
	} = $props();

	const effectLeft = $derived(beatToPixel(timelineEffect.startBeat, pixelsPerBeat));
	const effectWidth = $derived(Math.max(20, Math.min(beatToPixel(timelineEffect.duration, pixelsPerBeat), 10000))); // Clamp to prevent extreme values
	const clipHeight = $derived(TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT - 18);
</script>

<div
	class="timeline-clip timeline-effect {isSelected ? 'selected' : ''} {isDragging ? 'dragging' : ''}"
	style="
		left: {effectLeft}px;
		width: {effectWidth}px;
		background: {effect.color}80;
		border-color: {effect.color};
	"
	role="button"
	tabindex="0"
	on:mousedown={onMouseDown}
	on:click={onClick}
	on:keydown={onKeyDown}
	on:contextmenu|stopPropagation={onContextMenu}
	title="Right-click to delete"
>
	<!-- Automation curve visualization overlay -->
	{#if automationCurves.length > 0}
		<svg
			class="envelope-curve-visualization"
			width={effectWidth}
			height={clipHeight}
			style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1;"
		>
			{#each automationCurves as curveItem}
				{@const curvePath = generateAutomationCurvePath(effectWidth, clipHeight, curveItem.automation, timelineEffect.startBeat, timelineEffect.duration)}
				{#if curvePath}
					<path d={curvePath} fill={effect.color} fill-opacity="0.5" />
				{/if}
			{/each}
		</svg>
	{/if}
	<div class="clip-resize-handle-left" title="Drag to resize left edge"></div>
	<span class="clip-label">
		{effect.name}
		{#if timelineEffect.targetTrackId}
			<span class="pattern-badge">→ Track</span>
		{:else}
			<span class="pattern-badge global">Global</span>
		{/if}
	</span>
	<div class="clip-resize-handle-right" title="Drag to resize right edge"></div>
</div>

