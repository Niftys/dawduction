<script lang="ts">
	import { generateRulerMarks, type RulerMark } from '$lib/utils/timelineRuler';
	import { TIMELINE_CONSTANTS, formatZoomDisplay } from '$lib/utils/timelineUtils';
	import { beatToPixel } from '$lib/utils/timelineUtils';

	export let totalLength: number;
	export let pixelsPerBeat: number;
	export let zoomLevel: number;
	export let showAddTrackMenu: boolean;
	export let onZoomWheel: (e: WheelEvent) => void = () => {};
	// Note: onZoomWheel is passed from parent for potential future use
	export let onCreateTrack: (type: 'pattern' | 'effect' | 'envelope') => void;
	export let onToggleAddTrackMenu: () => void;

	$: rulerMarks = generateRulerMarks(totalLength, pixelsPerBeat);
	$: zoomDisplay = formatZoomDisplay(zoomLevel, TIMELINE_CONSTANTS.BASE_ZOOM);
</script>

<div class="timeline-ruler-container">
	<div class="ruler-label-spacer" style="width: {TIMELINE_CONSTANTS.ROW_LABEL_WIDTH}px;">
		{#if Math.round((zoomLevel / TIMELINE_CONSTANTS.BASE_ZOOM) * 100) !== 100}
			<div class="zoom-indicator" title="Zoom: {zoomDisplay} (Ctrl+Wheel to zoom)">
				{zoomDisplay}
			</div>
		{/if}
		<div class="add-track-dropdown-ruler">
			<span 
				class="add-track-trigger"
				on:click={onToggleAddTrackMenu}
				role="button"
				tabindex="0"
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onToggleAddTrackMenu();
					}
				}}
			>
				+ Add Track
			</span>
			{#if showAddTrackMenu}
				<div class="add-track-menu">
					<button on:click={() => onCreateTrack('pattern')}>
						Pattern Track
					</button>
					<button on:click={() => onCreateTrack('effect')}>
						Effect Track
					</button>
					<button on:click={() => onCreateTrack('envelope')}>
						Envelope Track
					</button>
				</div>
			{/if}
		</div>
	</div>
	<div class="timeline-ruler" style="height: {TIMELINE_CONSTANTS.RULER_HEIGHT}px; width: {beatToPixel(totalLength, pixelsPerBeat)}px;">
		{#each rulerMarks as mark}
			<div 
				class="ruler-mark {mark.isBar ? 'bar' : 'beat'}"
				style="left: {mark.x}px;"
			>
				{#if mark.isBar}
					<span class="ruler-label bar-label">{mark.barNumber + 1}</span>
				{:else if mark.beatInBar > 0}
					<span class="ruler-label beat-label">{mark.beatInBar + 1}</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

