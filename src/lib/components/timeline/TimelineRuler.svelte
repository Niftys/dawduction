<script lang="ts">
	import { generateRulerMarks, type RulerMark } from '$lib/utils/timelineRuler';
	import { TIMELINE_CONSTANTS, formatZoomDisplay } from '$lib/utils/timelineUtils';
	import { beatToPixel } from '$lib/utils/timelineUtils';
	import { tick } from 'svelte';

	export let totalLength: number;
	export let pixelsPerBeat: number;
	export let zoomLevel: number;
	export let showAddTrackMenu: boolean;
	export let onZoomWheel: (e: WheelEvent) => void = () => {};
	// Note: onZoomWheel is passed from parent for potential future use
	export let onCreateTrack: (type: 'pattern' | 'effect' | 'envelope') => void;
	export let onToggleAddTrackMenu: () => void;
	export let onRulerClick: ((e: MouseEvent) => void) | undefined = undefined;

	$: rulerMarks = generateRulerMarks(totalLength, pixelsPerBeat);
	$: zoomDisplay = formatZoomDisplay(zoomLevel, TIMELINE_CONSTANTS.BASE_ZOOM);

	let triggerElement: HTMLElement;
	let menuElement: HTMLDivElement;
	let menuPosition = { top: 0, left: 0 };

	async function updateMenuPosition() {
		await tick();
		if (triggerElement && menuElement && typeof window !== 'undefined') {
			const rect = triggerElement.getBoundingClientRect();
			menuPosition = {
				top: rect.bottom + 4,
				left: rect.left
			};
			console.log('[TimelineRuler] Menu position updated:', menuPosition);
			// Force a reflow to ensure menu is positioned correctly
			menuElement.offsetHeight;
		}
	}

	$: if (showAddTrackMenu) {
		console.log('[TimelineRuler] Menu should be visible, showAddTrackMenu =', showAddTrackMenu);
		// Update position when menu opens
		updateMenuPosition();
	}
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
				bind:this={triggerElement}
				on:click={(e) => {
					console.log('[TimelineRuler] Trigger clicked, current showAddTrackMenu:', showAddTrackMenu);
					e.stopPropagation();
					onToggleAddTrackMenu();
				}}
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
				<div 
					class="add-track-menu"
					bind:this={menuElement}
					style="top: {menuPosition.top}px; left: {menuPosition.left}px;"
					on:mousedown|stopPropagation={(e) => {
						console.log('[TimelineRuler] Menu mousedown');
						e.stopPropagation();
						e.stopImmediatePropagation();
					}}
					on:click|stopPropagation={(e) => {
						console.log('[TimelineRuler] Menu click');
						e.stopPropagation();
						e.stopImmediatePropagation();
					}}
					on:mouseenter={() => console.log('[TimelineRuler] Menu mouseenter')}
					on:mouseleave={() => console.log('[TimelineRuler] Menu mouseleave')}
				>
					<button 
						type="button"
						on:mousedown={(e) => {
							console.log('[TimelineRuler] Pattern Track button mousedown - event:', e);
							e.preventDefault();
							e.stopPropagation();
							e.stopImmediatePropagation();
							console.log('[TimelineRuler] Calling onCreateTrack with pattern');
							if (onCreateTrack) {
								onCreateTrack('pattern');
							} else {
								console.error('[TimelineRuler] onCreateTrack is not defined!');
							}
						}}
						on:click={(e) => {
							console.log('[TimelineRuler] Pattern Track button click - event:', e);
							e.preventDefault();
							e.stopPropagation();
							e.stopImmediatePropagation();
							if (onCreateTrack) {
								onCreateTrack('pattern');
							}
						}}
						style="position: relative; z-index: 100001;"
					>
						Pattern Track
					</button>
					<button 
						type="button"
						on:mousedown={(e) => {
							console.log('[TimelineRuler] Effect Track button mousedown - event:', e);
							e.preventDefault();
							e.stopPropagation();
							e.stopImmediatePropagation();
							console.log('[TimelineRuler] Calling onCreateTrack with effect');
							if (onCreateTrack) {
								onCreateTrack('effect');
							} else {
								console.error('[TimelineRuler] onCreateTrack is not defined!');
							}
						}}
						on:click={(e) => {
							console.log('[TimelineRuler] Effect Track button click - event:', e);
							e.preventDefault();
							e.stopPropagation();
							e.stopImmediatePropagation();
							if (onCreateTrack) {
								onCreateTrack('effect');
							}
						}}
						style="position: relative; z-index: 100001;"
					>
						Effect Track
					</button>
					<button 
						type="button"
						on:mousedown={(e) => {
							console.log('[TimelineRuler] Envelope Track button mousedown - event:', e);
							e.preventDefault();
							e.stopPropagation();
							e.stopImmediatePropagation();
							console.log('[TimelineRuler] Calling onCreateTrack with envelope');
							if (onCreateTrack) {
								onCreateTrack('envelope');
							} else {
								console.error('[TimelineRuler] onCreateTrack is not defined!');
							}
						}}
						on:click={(e) => {
							console.log('[TimelineRuler] Envelope Track button click - event:', e);
							e.preventDefault();
							e.stopPropagation();
							e.stopImmediatePropagation();
							if (onCreateTrack) {
								onCreateTrack('envelope');
							}
						}}
						style="position: relative; z-index: 100001;"
					>
						Envelope Track
					</button>
				</div>
			{/if}
		</div>
	</div>
	<div 
		class="timeline-ruler" 
		style="height: {TIMELINE_CONSTANTS.RULER_HEIGHT}px; width: {beatToPixel(totalLength, pixelsPerBeat)}px;"
		on:click={onRulerClick}
		role="button"
		tabindex="0"
		on:keydown={(e) => {
			if (onRulerClick && (e.key === 'Enter' || e.key === ' ')) {
				e.preventDefault();
				// For keyboard navigation, we can't easily determine the click position
				// So we'll just skip keyboard support for now
				// Users can use mouse clicks on the ruler
			}
		}}
		title="Click to jump to position"
	>
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

