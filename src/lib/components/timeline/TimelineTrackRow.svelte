<script lang="ts">
	import { tick } from 'svelte';
	import type { TimelineTrack, TimelineClip } from '$lib/stores/projectStore';
	import type { TimelineEffect, TimelineEnvelope } from '$lib/types/effects';
	import type { Pattern, Effect, Envelope } from '$lib/types/effects';
	import { TIMELINE_CONSTANTS, beatToPixel, pixelToBeat, snapToBeat } from '$lib/utils/timelineUtils';
	import { generateGridLines, calculateVisibleBeatRange, type GridLine } from '$lib/utils/timelineRuler';
	import TimelineClipComponent from './TimelineClip.svelte';
	import TimelineEffectClip from './TimelineEffectClip.svelte';
	import TimelineEnvelopeClip from './TimelineEnvelopeClip.svelte';
	
	const {
		track,
		trackClips,
		trackEffects,
		trackEnvelopes,
		trackPattern,
		patterns = [],
		effects,
		envelopes,
		timeline,
		pixelsPerBeat,
		totalLength,
		viewportElement,
		dragOverRow,
		dragOverTrackId,
		draggedTrackId,
		isResizing,
		isDraggingClip,
		selectedEffectId,
		selectedEnvelopeId,
		getAutomationCurvesForEffect,
		onTrackDragStart,
		onTrackDragOver,
		onTrackDragLeave,
		onTrackDrop,
		onRowDragOver,
		onRowDragLeave,
		onRowDrop,
		onRowClick,
		onRowTouchEnd = undefined,
		onTrackVolumeMouseDown,
		onToggleTrackMute,
		onToggleTrackSolo,
		onToggleTrackCollapse,
		onDeleteTrack,
		onChangeTrackColor = () => {},
		onClipMouseDown,
		onClipTouchStart = undefined,
		onClipTouchMove = undefined,
		onClipTouchEnd = undefined,
		onClipClick,
		onClipKeyDown,
		onDeleteClip,
		onAddClipToTimeline = () => {},
		onAddEffectToTimeline = () => {},
		onAddEnvelopeToTimeline = () => {},
		findPatternById,
		onUpdateTrackName = () => {}
	}: {
		track: TimelineTrack;
		trackClips: TimelineClip[];
		trackEffects: TimelineEffect[];
		trackEnvelopes: TimelineEnvelope[];
		trackPattern: Pattern | null;
		patterns?: Pattern[];
		effects: Effect[];
		envelopes: Envelope[];
		timeline: any;
		pixelsPerBeat: number;
		totalLength: number;
		viewportElement?: HTMLElement | null;
		dragOverRow: string | null;
		dragOverTrackId: string | null;
		draggedTrackId: string | null;
		isResizing: any;
		isDraggingClip: any;
		selectedEffectId: string | null;
		selectedEnvelopeId: string | null;
		getAutomationCurvesForEffect: (effectId: string, timelineEffectId: string) => Array<{ automation: any; parameterKey: string }>;
		onTrackDragStart: (e: DragEvent, trackId: string) => void;
		onTrackDragOver: (e: DragEvent, trackId: string) => void;
		onTrackDragLeave: (e: DragEvent) => void;
		onTrackDrop: (e: DragEvent, trackId: string) => void;
		onRowDragOver: (e: DragEvent) => void;
		onRowDragLeave: (e: DragEvent) => void;
		onRowDrop: (e: DragEvent) => void;
		onRowClick: (e: MouseEvent) => void;
		onRowTouchEnd?: ((e: TouchEvent) => void) | undefined;
		onTrackVolumeMouseDown: (e: MouseEvent, trackId: string) => void;
	onToggleTrackMute: (trackId: string) => void;
	onToggleTrackSolo: (trackId: string) => void;
	onToggleTrackCollapse: (trackId: string) => void;
	onDeleteTrack: (trackId: string) => void;
		onChangeTrackColor?: (trackId: string, color: string) => void;
		onClipMouseDown: (e: MouseEvent, clip: TimelineClip | TimelineEffect | TimelineEnvelope, type: 'clip' | 'effect' | 'envelope') => void;
		onClipTouchStart?: ((e: TouchEvent, clip: TimelineClip | TimelineEffect | TimelineEnvelope, type: 'clip' | 'effect' | 'envelope') => void) | undefined;
		onClipTouchMove?: ((e: TouchEvent) => void) | undefined;
		onClipTouchEnd?: (() => void) | undefined;
		onClipClick: (clipId: string, type: 'effect' | 'envelope') => void;
		onClipKeyDown: (clipId: string, type: 'effect' | 'envelope') => void;
		onDeleteClip: (clipId: string, type: 'clip' | 'effect' | 'envelope') => void;
		onAddClipToTimeline?: (patternId: string, beat: number, trackId?: string) => void;
		onAddEffectToTimeline?: (effectId: string, beat: number, trackId?: string) => void;
		onAddEnvelopeToTimeline?: (envelopeId: string, beat: number, trackId?: string) => void;
		findPatternById: (patternId: string | undefined) => Pattern | null;
		onUpdateTrackName?: (trackId: string, name: string) => void;
	} = $props();

	let isEditingName = $state(false);
	let editingName = $state('');
	let nameInput: HTMLInputElement | null = $state(null);

	$effect(() => {
		if (!isEditingName) {
			editingName = track.name;
		}
	});

	// Track viewport scroll position for performance optimization
	let scrollLeft = $state(0);
	let viewportWidth = $state(0);

	// Calculate visible beat range based on viewport
	const viewportRange = $derived.by(() => {
		if (!viewportElement || viewportWidth === 0) {
			// If no viewport element, generate all lines (for short timelines)
			return totalLength <= 2000 ? undefined : { startBeat: 0, endBeat: Math.min(2000, totalLength) };
		}
		return calculateVisibleBeatRange(scrollLeft, viewportWidth, pixelsPerBeat, totalLength);
	});

	// Only generate grid lines for visible range
	const gridLines = $derived(generateGridLines(totalLength, pixelsPerBeat, viewportRange));

	// Filter clips/effects/envelopes to only render visible ones
	// Use a more generous range to prevent flickering
	const visibleClips = $derived.by(() => {
		if (!viewportRange || trackClips.length === 0) return trackClips;
		
		// Performance limit: Don't render more than 100 clips per track
		if (trackClips.length > 100) {
			console.warn(`[TimelineTrackRow] Track ${track.id} has ${trackClips.length} clips, limiting to 100 for performance`);
			return trackClips.slice(0, 100);
		}
		
		// Filter clips that intersect with visible range (with generous padding to prevent flickering)
		// Add extra padding to prevent clips from disappearing too early
		const padding = 8; // Extra beats of padding
		const expandedStart = viewportRange.startBeat - padding;
		const expandedEnd = viewportRange.endBeat + padding;
		
		return trackClips.filter(clip => {
			const clipEnd = clip.startBeat + clip.duration;
			return clipEnd >= expandedStart && clip.startBeat <= expandedEnd;
		});
	});

	const visibleEffects = $derived.by(() => {
		if (!viewportRange || trackEffects.length === 0) return trackEffects;
		
		// Performance limit: Don't render more than 100 effects per track
		if (trackEffects.length > 100) {
			console.warn(`[TimelineTrackRow] Track ${track.id} has ${trackEffects.length} effects, limiting to 100 for performance`);
			return trackEffects.slice(0, 100);
		}
		
		// Filter effects that intersect with visible range (with generous padding)
		const padding = 8;
		const expandedStart = viewportRange.startBeat - padding;
		const expandedEnd = viewportRange.endBeat + padding;
		
		return trackEffects.filter(effect => {
			const effectEnd = effect.startBeat + effect.duration;
			return effectEnd >= expandedStart && effect.startBeat <= expandedEnd;
		});
	});

	const visibleEnvelopes = $derived.by(() => {
		if (!viewportRange || trackEnvelopes.length === 0) return trackEnvelopes;
		
		// Performance limit: Don't render more than 100 envelopes per track
		if (trackEnvelopes.length > 100) {
			console.warn(`[TimelineTrackRow] Track ${track.id} has ${trackEnvelopes.length} envelopes, limiting to 100 for performance`);
			return trackEnvelopes.slice(0, 100);
		}
		
		// Filter envelopes that intersect with visible range (with generous padding)
		const padding = 8;
		const expandedStart = viewportRange.startBeat - padding;
		const expandedEnd = viewportRange.endBeat + padding;
		
		return trackEnvelopes.filter(envelope => {
			const envelopeEnd = envelope.startBeat + envelope.duration;
			return envelopeEnd >= expandedStart && envelope.startBeat <= expandedEnd;
		});
	});

	// Debounce viewport updates to prevent excessive recalculations
	let viewportUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	
	// Update viewport tracking on scroll
	function updateViewport() {
		if (viewportElement) {
			scrollLeft = viewportElement.scrollLeft;
			viewportWidth = viewportElement.clientWidth;
		}
	}
	
	// Debounced viewport update
	function debouncedUpdateViewport() {
		if (viewportUpdateTimeout) {
			clearTimeout(viewportUpdateTimeout);
		}
		viewportUpdateTimeout = setTimeout(() => {
			updateViewport();
			viewportUpdateTimeout = null;
		}, 16); // ~60fps update rate
	}

	// Set up scroll listener with debouncing
	$effect(() => {
		if (!viewportElement) return;
		
		updateViewport();
		
		const handleScroll = () => debouncedUpdateViewport();
		const handleResize = () => debouncedUpdateViewport();
		
		viewportElement.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('resize', handleResize, { passive: true });
		
		// Use ResizeObserver for more accurate viewport tracking
		const resizeObserver = new ResizeObserver(() => debouncedUpdateViewport());
		resizeObserver.observe(viewportElement);
		
		return () => {
			if (viewportUpdateTimeout) {
				clearTimeout(viewportUpdateTimeout);
			}
			viewportElement.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', handleResize);
			resizeObserver.disconnect();
		};
	});
	const defaultColors = $derived({
		pattern: '#7ab8ff',
		effect: '#9b59b6',
		envelope: '#2ecc71'
	});
	const trackColor = $derived(track.color || defaultColors[track.type]);
	const rowLabelBackground = $derived(trackColor + '20');
	const hasSoloedTrack = $derived(timeline.tracks?.some((t: any) => t.type === 'pattern' && t.solo === true) || false);
	const isGreyedOut = $derived(track.mute || (hasSoloedTrack && !track.solo));
	const isCollapsed = $derived(track.collapsed ?? false);
	const trackHeight = $derived(isCollapsed ? TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT / 4 : TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT);
	
	// Available color swatches matching the theme
	const colorSwatches = [
		'#7ab8ff', // Blue (main accent)
		'#ff00ff', // Magenta
		'#00ffcc', // Cyan/Teal
		'#ff6600', // Orange
		'#00ff00', // Green
		'#ff0066', // Pink
		'#6600ff', // Purple
		'#ffff00'  // Yellow
	];
	
	// Context menu state
	let contextMenuOpen = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let contextMenuElement: HTMLElement | null = $state(null);
	
	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		contextMenuX = e.clientX;
		contextMenuY = e.clientY;
		contextMenuOpen = true;
		contextMenuElement = e.currentTarget as HTMLElement;
	}
	
	function closeContextMenu() {
		contextMenuOpen = false;
	}
	
	function handleColorChange(newColor: string) {
		if (onChangeTrackColor) {
			onChangeTrackColor(track.id, newColor);
		}
		closeContextMenu();
	}
	
	function handleDelete() {
		onDeleteTrack(track.id);
		closeContextMenu();
	}

	function handleRowDrop(e: DragEvent) {
		// Check if this is a track reorder operation first
		if (draggedTrackId && draggedTrackId !== track.id) {
			onTrackDrop(e, track.id);
			return;
		}
		onRowDrop(e);
	}

	function handleRowDragOver(e: DragEvent) {
		// Check if this is a track reorder first
		if (draggedTrackId && draggedTrackId !== track.id) {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			onTrackDragOver(e, track.id);
			return;
		}
		onRowDragOver(e);
	}
</script>

<div 
	class="pattern-row {track.type}-row {dragOverRow === track.id ? 'drag-over' : ''} {dragOverTrackId === track.id ? 'drag-over-track' : ''} {isCollapsed ? 'collapsed' : ''}" 
	style="height: {trackHeight}px;"
	role="region"
	aria-label="{track.type} timeline track"
	on:dragover={handleRowDragOver}
	on:dragleave={onRowDragLeave}
	on:drop={handleRowDrop}
	on:touchend={onRowTouchEnd}
	on:touchcancel={onRowTouchEnd}
>
	<div 
		class="row-label" 
		style="background: {rowLabelBackground};"
		draggable="true"
		role="button"
		tabindex="0"
		on:dragstart={(e) => onTrackDragStart(e, track.id)}
		on:dragover={(e) => onTrackDragOver(e, track.id)}
		on:dragleave={onTrackDragLeave}
		on:drop={(e) => onTrackDrop(e, track.id)}
		on:contextmenu={handleContextMenu}
	>
		<button 
			class="track-collapse {isCollapsed ? 'collapsed' : ''}"
			on:click|stopPropagation={() => onToggleTrackCollapse(track.id)}
			on:dragstart|stopPropagation
			title={isCollapsed ? 'Expand track' : 'Collapse track'}
		>
			{isCollapsed ? '▲' : '▼'}
		</button>
		{#if track.type === 'pattern'}
			<div class="track-controls-group">
				<div 
					class="track-volume-control"
					role="slider"
					aria-label="Track volume"
					aria-valuemin="0"
					aria-valuemax="200"
					aria-valuenow={Math.round((track.volume ?? 1.0) * 100)}
					tabindex="0"
					on:mousedown={(e) => onTrackVolumeMouseDown(e, track.id)}
					title="Drag to adjust volume: {Math.round((track.volume ?? 1.0) * 100)}%"
				>
					<div class="track-volume-bar">
						<div 
							class="track-volume-fill"
							style="height: {((track.volume ?? 1.0) / 2.0) * 100}%"
						></div>
					</div>
				</div>
				<div class="track-buttons-vertical">
					<button 
						class="track-mute {track.mute ? 'active' : ''}"
						on:click|stopPropagation={() => onToggleTrackMute(track.id)}
						on:dragstart|stopPropagation
						title={track.mute ? 'Unmute track' : 'Mute track'}
					>
						M
					</button>
					<button 
						class="track-solo {track.solo ? 'active' : ''}"
						on:click|stopPropagation={() => onToggleTrackSolo(track.id)}
						on:dragstart|stopPropagation
						title={track.solo ? 'Unsolo track' : 'Solo track'}
					>
						S
					</button>
				</div>
			</div>
		{/if}
		<span class="track-name">
			{#if track.type === 'pattern'}
				{#if isEditingName}
					<input
						type="text"
						bind:value={editingName}
						bind:this={nameInput}
						on:click|stopPropagation
						on:blur={() => {
							onUpdateTrackName(track.id, editingName);
							isEditingName = false;
						}}
						on:keydown={(e) => {
							if (e.key === 'Enter') {
								onUpdateTrackName(track.id, editingName);
								isEditingName = false;
							} else if (e.key === 'Escape') {
								editingName = track.name;
								isEditingName = false;
							}
						}}
						title="Rename pattern track"
					/>
				{:else}
					<span
						role="button"
						tabindex="0"
						on:dblclick|stopPropagation={async () => {
							isEditingName = true;
							editingName = track.name;
							await tick();
							nameInput?.focus();
							nameInput?.select();
						}}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								isEditingName = true;
								editingName = track.name;
								tick().then(() => {
									nameInput?.focus();
									nameInput?.select();
								});
							}
						}}
						title="Double-click to rename track"
					>
						{track.name}
					</span>
				{/if}
			{:else}
				{track.name}
			{/if}
		</span>
	</div>
	<div class="row-clips" style="width: {beatToPixel(totalLength, pixelsPerBeat)}px;">
		<!-- Grid lines -->
		{#each gridLines as line}
			<div 
				class="grid-line {line.isBar ? 'bar-line' : 'beat-line'}"
				style="left: {line.x}px;"
			></div>
		{/each}
		
		{#if track.type === 'pattern'}
			<!-- Pattern clips -->
			{#key pixelsPerBeat}
				{#each visibleClips as clip (clip.id)}
					{@const clipPattern = findPatternById(clip.patternId)}
					{#if clipPattern}
						<TimelineClipComponent
							{clip}
							pattern={clipPattern}
							trackVolume={track.volume ?? 1.0}
							trackId={track.id}
							{pixelsPerBeat}
							isDragging={isDraggingClip?.id === clip.id && isDraggingClip?.type === 'clip'}
							{isGreyedOut}
							onMouseDown={(e) => onClipMouseDown(e, clip, 'clip')}
							onTouchStart={onClipTouchStart ? (e) => onClipTouchStart(e, clip, 'clip') : undefined}
							onTouchMove={onClipTouchMove}
							onTouchEnd={onClipTouchEnd}
							onClick={(e) => {
								if (!isResizing && !isDraggingClip) {
									e.stopPropagation();
								}
							}}
							onContextMenu={(e) => {
								e.preventDefault();
								onDeleteClip(clip.id, 'clip');
							}}
							onDelete={() => onDeleteClip(clip.id, 'clip')}
						/>
					{/if}
				{/each}
			{/key}
		{:else if track.type === 'effect'}
			<!-- Effect clips -->
			{#key pixelsPerBeat}
				{#each visibleEffects as timelineEffect (timelineEffect.id)}
					{@const effect = effects.find((e) => e.id === timelineEffect.effectId)}
					{#if effect}
						{@const automationCurves = getAutomationCurvesForEffect(effect.id, timelineEffect.id)}
						<TimelineEffectClip
							timelineEffect={timelineEffect}
							{effect}
							{pixelsPerBeat}
							isSelected={selectedEffectId === timelineEffect.id}
							isDragging={isDraggingClip?.id === timelineEffect.id && isDraggingClip?.type === 'effect'}
							{automationCurves}
							onMouseDown={(e) => onClipMouseDown(e, timelineEffect, 'effect')}
							onTouchStart={onClipTouchStart ? (e) => onClipTouchStart(e, timelineEffect, 'effect') : undefined}
							onClick={() => {
								if (!isResizing && !isDraggingClip) {
									onClipClick(timelineEffect.id, 'effect');
								}
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									onClipKeyDown(timelineEffect.id, 'effect');
								}
							}}
							onContextMenu={(e) => {
								e.preventDefault();
								onDeleteClip(timelineEffect.id, 'effect');
							}}
							onDelete={() => onDeleteClip(timelineEffect.id, 'effect')}
						/>
					{/if}
				{/each}
			{/key}
		{:else if track.type === 'envelope'}
			<!-- Envelope clips -->
			{#key pixelsPerBeat}
				{#each visibleEnvelopes as timelineEnvelope (timelineEnvelope.id)}
					{@const envelope = envelopes.find((e) => e.id === timelineEnvelope.envelopeId)}
					{#if envelope}
						<TimelineEnvelopeClip
							timelineEnvelope={timelineEnvelope}
							{envelope}
							{pixelsPerBeat}
							isSelected={selectedEnvelopeId === timelineEnvelope.id}
							isDragging={isDraggingClip?.id === timelineEnvelope.id && isDraggingClip?.type === 'envelope'}
							onMouseDown={(e) => onClipMouseDown(e, timelineEnvelope, 'envelope')}
							onTouchStart={onClipTouchStart ? (e) => onClipTouchStart(e, timelineEnvelope, 'envelope') : undefined}
							onClick={() => {
								if (!isResizing && !isDraggingClip) {
									onClipClick(timelineEnvelope.id, 'envelope');
								}
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									onClipKeyDown(timelineEnvelope.id, 'envelope');
								}
							}}
							onContextMenu={(e) => {
								e.preventDefault();
								onDeleteClip(timelineEnvelope.id, 'envelope');
							}}
							onDelete={() => onDeleteClip(timelineEnvelope.id, 'envelope')}
						/>
					{/if}
				{/each}
			{/key}
		{/if}
	</div>
	
	{#if contextMenuOpen}
		<div 
			class="track-context-menu" 
			style="left: {contextMenuX}px; top: {contextMenuY}px;"
			on:click|stopPropagation
			on:contextmenu|stopPropagation|preventDefault
		>
			<button class="menu-item" on:click={handleDelete}>
				Delete Track
			</button>
			<div class="menu-item color-picker-section">
				<label>Change Color:</label>
				<div class="color-swatches">
					{#each colorSwatches as swatchColor}
						<button
							class="color-swatch {trackColor === swatchColor ? 'active' : ''}"
							style="background: {swatchColor};"
							on:click={() => handleColorChange(swatchColor)}
							title="Set color to {swatchColor}"
							aria-label="Set color to {swatchColor}"
						></button>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<svelte:window 
	on:click={(e) => {
		if (contextMenuOpen) {
			closeContextMenu();
		}
	}} 
	on:contextmenu={(e) => {
		if (contextMenuOpen) {
			closeContextMenu();
		}
	}} 
/>

