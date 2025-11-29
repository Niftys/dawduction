<script lang="ts">
	import type { TimelineEnvelope } from '$lib/types/effects';
	import type { Envelope, Pattern } from '$lib/types/effects';
	import { TIMELINE_CONSTANTS } from '$lib/utils/timelineUtils';
	import { beatToPixel } from '$lib/utils/timelineUtils';
	import { generateEnvelopeCurvePath } from '$lib/utils/envelopeCurve';

	export let timelineEnvelope: TimelineEnvelope;
	export let envelope: Envelope;
	export let assignedPattern: Pattern | null;
	export let pixelsPerBeat: number;
	export let isSelected: boolean;
	export let isDragging: boolean;
	export let onMouseDown: (e: MouseEvent) => void;
	export let onClick: (e: MouseEvent) => void;
	export let onKeyDown: (e: KeyboardEvent) => void;
	export let onContextMenu: (e: MouseEvent) => void;
	export let onDelete: (() => void) | undefined = undefined;

	$: envelopeLeft = beatToPixel(timelineEnvelope.startBeat, pixelsPerBeat);
	$: envelopeWidth = Math.max(20, beatToPixel(timelineEnvelope.duration, pixelsPerBeat));
	$: clipHeight = TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT - 18;
	$: curvePath = generateEnvelopeCurvePath(envelopeWidth, clipHeight, envelope, timelineEnvelope.duration);
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
		{#if assignedPattern}
			<span class="pattern-badge">→ {assignedPattern.name}</span>
		{:else}
			<span class="pattern-badge global">Global</span>
		{/if}
	</span>
	<div class="clip-resize-handle-right" title="Drag to resize right edge"></div>
</div>

