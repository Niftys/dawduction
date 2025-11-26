<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { playbackStore } from '$lib/stores/playbackStore';
	import type { TimelineClip } from '$lib/stores/projectStore';
	import type { StandaloneInstrument } from '$lib/types/pattern';
	import '$lib/styles/components/Timeline.css';

	let project: any;
	let playbackState: any;
	
	projectStore.subscribe((p) => (project = p));
	playbackStore.subscribe((s) => (playbackState = s));

	// Timeline settings
	const BEATS_PER_PIXEL = 0.5; // How many beats per pixel (zoom level)
	const RULER_HEIGHT = 30;
	const TRACK_HEIGHT = 60;
	const CLIP_MIN_WIDTH = 20;

	$: timeline = project?.timeline || { clips: [], totalLength: 16 };
	$: tracks = project?.standaloneInstruments || [];
	$: currentBeat = playbackState?.currentBeat || 0;
	$: bpm = project?.bpm || 120;

	// Calculate pixel positions
	function beatToPixel(beat: number): number {
		return beat / BEATS_PER_PIXEL;
	}

	function pixelToBeat(pixel: number): number {
		return pixel * BEATS_PER_PIXEL;
	}

	// Get track color for a clip
	function getTrackColor(trackId: string): string {
		const track = tracks.find((t: StandaloneInstrument) => t.id === trackId);
		return track?.color || '#666666';
	}

	// Get track name for a clip
	function getTrackName(trackId: string): string {
		const track = tracks.find((t: StandaloneInstrument) => t.id === trackId);
		return track?.instrumentType || 'Unknown';
	}

	// Snap to grid
	function snapToBeat(beat: number): number {
		return Math.round(beat * 4) / 4; // Snap to quarter beats
	}

	// Generate ruler marks
	$: rulerMarks = (() => {
		const marks = [];
		const totalPixels = beatToPixel(timeline.totalLength);
		const beatInterval = 1; // Show marks every beat
		for (let beat = 0; beat <= timeline.totalLength; beat += beatInterval) {
			marks.push({
				beat,
				x: beatToPixel(beat),
				isMajor: beat % 4 === 0 // Major mark every 4 beats
			});
		}
		return marks;
	})();

	// Get clips for each track (legacy - this component is deprecated in favor of arrangement view)
	$: clipsByTrack = (() => {
		const map = new Map<string, TimelineClip[]>();
		for (const track of tracks) {
			// Note: TimelineClip now uses patternId, not trackId
			// This is a legacy component - use arrangement view instead
			map.set(track.id, []);
		}
		return map;
	})();

	let isDraggingPlayhead = false;
	let isDraggingClip: { clipId: string; startOffset: number } | null = null;
	let isResizingClip: { clipId: string; side: 'left' | 'right'; startBeat: number; startDuration: number } | null = null;

	function handlePlayheadMouseDown(e: MouseEvent) {
		if (e.button !== 0) return;
		isDraggingPlayhead = true;
		updatePlayheadPosition(e);
		e.preventDefault();
	}

	function updatePlayheadPosition(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		const beat = Math.max(0, snapToBeat(pixelToBeat(x)));
		// TODO: Update playback position
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDraggingPlayhead) {
			updatePlayheadPosition(e);
		}
	}

	function handleMouseUp() {
		isDraggingPlayhead = false;
		isDraggingClip = null;
		isResizingClip = null;
	}

	// Get pattern length from track's root division
	function getPatternLength(trackId: string): number {
		const track = tracks.find((t: StandaloneInstrument) => t.id === trackId);
		return track?.patternTree?.division || 4;
	}

	// Add clip to timeline
	function addClipToTimeline(trackId: string, startBeat: number) {
		if (!project) return;
		
		const snappedStart = snapToBeat(startBeat);
		const patternLength = getPatternLength(trackId);
		
		// Legacy - this component is deprecated, use arrangement view instead
		// Creating a stub clip that won't break but won't work either
		const newClip: TimelineClip = {
			id: crypto.randomUUID(),
			patternId: '', // Empty - this component is deprecated
			startBeat: snappedStart,
			duration: patternLength
		};

		projectStore.addTimelineClip(newClip);
	}

	// Handle clicking on empty track area to add clip
	function handleTrackClick(e: MouseEvent, trackId: string) {
		if (e.target !== e.currentTarget) return; // Only if clicking the track itself, not a clip
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX - rect.left - 120; // Account for track label width
		const beat = Math.max(0, snapToBeat(pixelToBeat(x)));
		addClipToTimeline(trackId, beat);
	}

	// Delete clip
	function deleteClip(clipId: string) {
		projectStore.deleteTimelineClip(clipId);
	}
</script>

<div class="timeline-container">
	<div class="timeline-header">
		<h3>Timeline</h3>
		<button 
			class="add-clip-btn" 
			on:click={() => {
				if (tracks.length > 0) {
					addClipToTimeline(tracks[0].id, timeline.totalLength);
				}
			}}
			disabled={tracks.length === 0}
		>
			+ Add Clip
		</button>
	</div>

	<div 
		class="timeline-viewport"
		on:mousemove={handleMouseMove}
		on:mouseup={handleMouseUp}
		on:mouseleave={handleMouseUp}
	>
		<!-- Ruler -->
		<div class="timeline-ruler" style="height: {RULER_HEIGHT}px;">
			{#each rulerMarks as mark}
				<div 
					class="ruler-mark {mark.isMajor ? 'major' : ''}"
					style="left: {mark.x}px;"
				>
					{#if mark.isMajor}
						<span class="ruler-label">{mark.beat}</span>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Playhead -->
		<div 
			class="playhead"
			style="left: {beatToPixel(currentBeat)}px;"
			on:mousedown={handlePlayheadMouseDown}
		/>

		<!-- Tracks -->
		<div class="timeline-tracks">
			{#each tracks as track}
				{@const trackClips = clipsByTrack.get(track.id) || []}
				<div 
					class="timeline-track" 
					style="height: {TRACK_HEIGHT}px;"
					on:click={(e) => handleTrackClick(e, track.id)}
				>
					<div class="track-label" style="background: {track.color}20;">
						<span>{track.instrumentType}</span>
					</div>
					<div class="track-clips">
						{#each trackClips as clip}
							<div
								class="timeline-clip"
								style="
									left: {beatToPixel(clip.startBeat)}px;
									width: {Math.max(CLIP_MIN_WIDTH, beatToPixel(clip.duration))}px;
									background: {track.color}80;
									border-color: {track.color};
								"
								title="Clip - {clip.startBeat.toFixed(2)} to {(clip.startBeat + clip.duration).toFixed(2)} beats"
							>
								<span class="clip-label">Clip</span>
								<button 
									class="clip-delete"
									on:click|stopPropagation={() => deleteClip(clip.id)}
									title="Delete clip"
								>
									×
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

