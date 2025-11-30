<script lang="ts">
	import type { TimelineEnvelope } from '$lib/types/effects';
	import type { Envelope } from '$lib/types/effects';
	import { TIMELINE_CONSTANTS } from '$lib/utils/timelineUtils';
	import { beatToPixel } from '$lib/utils/timelineUtils';
	import { generateEnvelopeCurvePath } from '$lib/utils/envelopeCurve';

	const {
		timelineEnvelope,
		envelope,
		pixelsPerBeat,
		isSelected,
		isDragging,
		onMouseDown,
		onClick,
		onKeyDown,
		onContextMenu,
		onDelete = undefined
	}: {
		timelineEnvelope: TimelineEnvelope;
		envelope: Envelope;
		pixelsPerBeat: number;
		isSelected: boolean;
		isDragging: boolean;
		onMouseDown: (e: MouseEvent) => void;
		onClick: (e: MouseEvent) => void;
		onKeyDown: (e: KeyboardEvent) => void;
		onContextMenu: (e: MouseEvent) => void;
		onDelete?: (() => void) | undefined;
	} = $props();

	const envelopeLeft = $derived(beatToPixel(timelineEnvelope.startBeat, pixelsPerBeat));
	const envelopeWidth = $derived(Math.max(20, Math.min(beatToPixel(timelineEnvelope.duration, pixelsPerBeat), 10000))); // Clamp to prevent extreme values
	const clipHeight = $derived(TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT - 18);
	const curvePath = $derived(generateEnvelopeCurvePath(envelopeWidth, clipHeight, envelope, timelineEnvelope.duration));
</script>

<div
	class="timeline-clip timeline-envelope {isSelected ? 'selected' : ''} {isDragging ? 'dragging' : ''}"
	style="
		left: {envelopeLeft}px;
		width: {envelopeWidth}px;
		background: {envelope.color}40;
		border-color: {envelope.color};
	"
	role="button"
	tabindex="0"
	on:mousedown={onMouseDown}
	on:click={onClick}
	on:keydown={onKeyDown}
	on:contextmenu|stopPropagation={onContextMenu}
	title="Right-click to delete"
>
	<!-- Curve visualization overlay -->
	<svg
		class="envelope-curve-visualization"
		width={envelopeWidth}
		height={clipHeight}
		style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1;"
	>
		<path
			d={curvePath}
			fill={envelope.color}
			opacity="0.7"
		/>
	</svg>
	<div class="clip-resize-handle-left" title="Drag to resize left edge"></div>
	<span class="clip-label">
		{envelope.name}
		{#if timelineEnvelope.targetTrackId}
			<span class="pattern-badge">→ Track</span>
		{:else}
			<span class="pattern-badge global">Global</span>
		{/if}
	</span>
	<div class="clip-resize-handle-right" title="Drag to resize right edge"></div>
</div>

