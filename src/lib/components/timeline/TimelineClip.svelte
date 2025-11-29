<script lang="ts">
	import type { TimelineClip, TimelineTrack } from '$lib/stores/projectStore';
	import type { Pattern } from '$lib/types/pattern';
	import { TIMELINE_CONSTANTS } from '$lib/utils/timelineUtils';
	import { beatToPixel } from '$lib/utils/timelineUtils';

	export let clip: TimelineClip;
	export let pattern: Pattern | null;
	export let pixelsPerBeat: number;
	export let isDragging: boolean;
	export let isGreyedOut: boolean;
	export let onMouseDown: (e: MouseEvent) => void;
	export let onClick: (e: MouseEvent) => void;
	export let onContextMenu: (e: MouseEvent) => void;
	export let onDelete: (() => void) | undefined = undefined;

	$: clipLeft = beatToPixel(clip.startBeat, pixelsPerBeat);
	$: clipWidth = Math.max(20, beatToPixel(clip.duration, pixelsPerBeat));
</script>

{#if pattern}
	<div
		class="timeline-clip {isDragging ? 'dragging' : ''} {isGreyedOut ? 'greyed-out' : ''}"
		style="
			left: {clipLeft}px;
			width: {clipWidth}px;
			background: {isGreyedOut ? '#666666' : pattern.color}CC;
			border-color: {isGreyedOut ? '#666666' : pattern.color};
			opacity: {isGreyedOut ? 0.5 : 1};
		"
		role="button"
		tabindex="0"
		aria-label="Timeline clip: {pattern.name}"
		on:mousedown={onMouseDown}
		on:click|stopPropagation={onClick}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onClick(e);
			} else if (e.key === 'Delete' || e.key === 'Backspace') {
				e.preventDefault();
				onContextMenu(e);
			}
		}}
		on:contextmenu|stopPropagation={onContextMenu}
		title="Right-click to delete"
	>
		<div class="clip-resize-handle-left" title="Drag to resize left edge"></div>
		<span class="clip-label">{pattern.name}</span>
		<div class="clip-resize-handle-right" title="Drag to resize right edge"></div>
	</div>
{/if}

