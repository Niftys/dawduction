<script lang="ts">
	import type { TimelineTrack, TimelineClip } from '$lib/stores/projectStore';
	import type { TimelineEffect, TimelineEnvelope } from '$lib/types/effects';
	import type { Pattern, Effect, Envelope } from '$lib/types/effects';
	import { TIMELINE_CONSTANTS, beatToPixel, pixelToBeat, snapToBeat } from '$lib/utils/timelineUtils';
	import { generateGridLines, type GridLine } from '$lib/utils/timelineRuler';
	import TimelineClip from './TimelineClip.svelte';
	import TimelineEffectClip from './TimelineEffectClip.svelte';
	import TimelineEnvelopeClip from './TimelineEnvelopeClip.svelte';

	export let track: TimelineTrack;
	export let trackClips: TimelineClip[];
	export let trackEffects: TimelineEffect[];
	export let trackEnvelopes: TimelineEnvelope[];
	export let trackPattern: Pattern | null;
	export const patterns: Pattern[] = [];
	export let effects: Effect[];
	export let envelopes: Envelope[];
	export let timeline: any;
	export let pixelsPerBeat: number;
	export let totalLength: number;
	export let dragOverRow: string | null;
	export let dragOverTrackId: string | null;
	export let draggedTrackId: string | null;
	export let isResizing: any;
	export let isDraggingClip: any;
	export let selectedEffectId: string | null;
	export let selectedEnvelopeId: string | null;
	export let getAutomationCurvesForEffect: (effectId: string, timelineEffectId: string) => Array<{ automation: any; parameterKey: string }>;
	
	// Event handlers
	export let onTrackDragStart: (e: DragEvent, trackId: string) => void;
	export let onTrackDragOver: (e: DragEvent, trackId: string) => void;
	export let onTrackDragLeave: (e: DragEvent) => void;
	export let onTrackDrop: (e: DragEvent, trackId: string) => void;
	export let onRowDragOver: (e: DragEvent) => void;
	export let onRowDragLeave: (e: DragEvent) => void;
	export let onRowDrop: (e: DragEvent) => void;
	export let onRowClick: (e: MouseEvent) => void;
	export let onTrackVolumeMouseDown: (e: MouseEvent, trackId: string) => void;
	export let onToggleTrackMute: (trackId: string) => void;
	export let onToggleTrackSolo: (trackId: string) => void;
	export let onDeleteTrack: (trackId: string) => void;
	export let onChangeTrackColor: (trackId: string, color: string) => void = () => {};
	export let onClipMouseDown: (e: MouseEvent, clip: TimelineClip | TimelineEffect | TimelineEnvelope, type: 'clip' | 'effect' | 'envelope') => void;
	export let onClipClick: (clipId: string, type: 'effect' | 'envelope') => void;
	export let onClipKeyDown: (clipId: string, type: 'effect' | 'envelope') => void;
	export let onDeleteClip: (clipId: string, type: 'clip' | 'effect' | 'envelope') => void;
	export const onAddClipToTimeline: (patternId: string, beat: number, trackId?: string) => void = () => {};
	export const onAddEffectToTimeline: (effectId: string, beat: number, trackId?: string) => void = () => {};
	export const onAddEnvelopeToTimeline: (envelopeId: string, beat: number, trackId?: string) => void = () => {};
	export let findPatternById: (patternId: string | undefined) => Pattern | null;

	$: gridLines = generateGridLines(totalLength, pixelsPerBeat);
	$: defaultColors = {
		pattern: '#7ab8ff',
		effect: '#9b59b6',
		envelope: '#2ecc71'
	};
	$: trackColor = track.color || defaultColors[track.type];
	$: rowLabelBackground = trackColor + '20';
	$: hasSoloedTrack = timeline.tracks?.some((t: any) => t.type === 'pattern' && t.solo === true) || false;
	$: isGreyedOut = track.mute || (hasSoloedTrack && !track.solo);
	
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
	let contextMenuOpen = false;
	let contextMenuX = 0;
	let contextMenuY = 0;
	let contextMenuElement: HTMLElement | null = null;
	
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
	class="pattern-row {track.type}-row {dragOverRow === track.id ? 'drag-over' : ''} {dragOverTrackId === track.id ? 'drag-over-track' : ''}" 
	style="height: {TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT}px;"
	role="region"
	aria-label="{track.type} timeline track"
	on:dragover={handleRowDragOver}
	on:dragleave={onRowDragLeave}
	on:drop={handleRowDrop}
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
		<span class="track-name">{track.name}</span>
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
				{#each trackClips as clip}
					{@const clipPattern = findPatternById(clip.patternId)}
					{#if clipPattern}
						<TimelineClip
							{clip}
							pattern={clipPattern}
							{pixelsPerBeat}
							isDragging={isDraggingClip?.id === clip.id && isDraggingClip?.type === 'clip'}
							{isGreyedOut}
							onMouseDown={(e) => onClipMouseDown(e, clip, 'clip')}
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
				{#each trackEffects as timelineEffect}
					{@const effect = effects.find((e) => e.id === timelineEffect.effectId)}
					{@const assignedPattern = findPatternById(timelineEffect.patternId)}
					{#if effect}
						{@const automationCurves = getAutomationCurvesForEffect(effect.id, timelineEffect.id)}
						<TimelineEffectClip
							timelineEffect={timelineEffect}
							{effect}
							assignedPattern={assignedPattern}
							{pixelsPerBeat}
							isSelected={selectedEffectId === timelineEffect.id}
							isDragging={isDraggingClip?.id === timelineEffect.id && isDraggingClip?.type === 'effect'}
							{automationCurves}
							onMouseDown={(e) => onClipMouseDown(e, timelineEffect, 'effect')}
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
				{#each trackEnvelopes as timelineEnvelope}
					{@const envelope = envelopes.find((e) => e.id === timelineEnvelope.envelopeId)}
					{@const assignedPattern = findPatternById(timelineEnvelope.patternId)}
					{#if envelope}
						<TimelineEnvelopeClip
							timelineEnvelope={timelineEnvelope}
							{envelope}
							assignedPattern={assignedPattern}
							{pixelsPerBeat}
							isSelected={selectedEnvelopeId === timelineEnvelope.id}
							isDragging={isDraggingClip?.id === timelineEnvelope.id && isDraggingClip?.type === 'envelope'}
							onMouseDown={(e) => onClipMouseDown(e, timelineEnvelope, 'envelope')}
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

