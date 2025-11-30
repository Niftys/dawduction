<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { TimelineClip, TimelineTrack } from '$lib/stores/projectStore';
	import type { Pattern } from '$lib/types/pattern';
	import { TIMELINE_CONSTANTS } from '$lib/utils/timelineUtils';
	import { beatToPixel } from '$lib/utils/timelineUtils';
	import { projectStore } from '$lib/stores/projectStore';
	import { generatePatternWaveform, drawPatternWaveform } from '$lib/utils/patternWaveform';

	const {
		clip,
		pattern,
		trackVolume = 1.0,
		trackId,
		pixelsPerBeat,
		isDragging,
		isGreyedOut,
		onMouseDown,
		onTouchStart = undefined,
		onTouchMove = undefined,
		onTouchEnd = undefined,
		onClick,
		onContextMenu,
		onDelete = undefined
	}: {
		clip: TimelineClip;
		pattern: Pattern | null;
		trackVolume?: number;
		trackId?: string;
		pixelsPerBeat: number;
		isDragging: boolean;
		isGreyedOut: boolean;
		onMouseDown: (e: MouseEvent) => void;
		onTouchStart?: ((e: TouchEvent) => void) | undefined;
		onTouchMove?: ((e: TouchEvent) => void) | undefined;
		onTouchEnd?: (() => void) | undefined;
		onClick: (e: MouseEvent) => void;
		onContextMenu: (e: MouseEvent) => void;
		onDelete?: (() => void) | undefined;
	} = $props();

	const clipLeft = $derived(beatToPixel(clip.startBeat, pixelsPerBeat));
	const clipWidth = $derived(Math.max(20, Math.min(beatToPixel(clip.duration, pixelsPerBeat), 10000))); // Clamp to prevent extreme values at extreme zoom levels
	
	// Waveform canvas
	let waveformCanvas: HTMLCanvasElement;
	let waveformCtx: CanvasRenderingContext2D | null = null;
	
	// Get project BPM
	let project: any = $state(null);
	projectStore.subscribe((p) => (project = p));
	const bpm = $derived(project?.bpm || 120);
	
	// Clip container reference for height calculation
	let clipContainer: HTMLDivElement;
	
	// Debouncing for zoom changes
	let waveformGenerationTimeout: ReturnType<typeof setTimeout> | null = null;
	let isGeneratingWaveform = false;
	let pendingGeneration = false;
	let lastPixelsPerBeat = pixelsPerBeat;
	let lastWidth = 0;
	
	// Clean up any pending waveform generation on destroy
	onDestroy(() => {
		if (waveformGenerationTimeout) {
			clearTimeout(waveformGenerationTimeout);
			waveformGenerationTimeout = null;
		}
	});
	
	// Generate and draw waveform
	function drawWaveform() {
		if (!waveformCanvas || !pattern || !waveformCtx || !clipContainer) return;
		
		const width = Math.floor(clipWidth);
		// Get the clip's actual height from the container
		const height = clipContainer.clientHeight;
		
		// Safety checks for edge cases
		if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) return;
		
		// Clamp width to prevent performance issues at extreme zoom levels
		const clampedWidth = Math.max(1, Math.min(width, 10000));
		
		// Set canvas size (use device pixel ratio for crisp rendering)
		const dpr = window.devicePixelRatio || 1;
		waveformCanvas.width = clampedWidth * dpr;
		waveformCanvas.height = height * dpr;
		waveformCanvas.style.width = `${clampedWidth}px`;
		waveformCanvas.style.height = `${height}px`;
		
		// Reset transform and scale for high DPI displays
		waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		
		// Generate waveform data (this will loop the pattern if needed)
		// Apply track volume to the waveform
		const waveform = generatePatternWaveform(pattern, clip.duration, bpm, clampedWidth, trackVolume);
		
		// Clear canvas
		waveformCtx.clearRect(0, 0, clampedWidth, height);
		
		// Draw waveform with pattern color
		const waveformColor = isGreyedOut ? '#88888880' : '#ffffff80';
		drawPatternWaveform(waveformCtx, waveform, clampedWidth, height, waveformColor);
	}
	
	// Redraw when pattern, clip duration, clip width, BPM, track volume, pixelsPerBeat (zoom), or greyed-out state changes
	$effect(() => {
		// Access reactive values to ensure effect tracks them
		// This ensures the waveform updates when clip.duration changes (e.g., when extended)
		// or when zoom changes (pixelsPerBeat)
		const duration = clip.duration;
		const width = clipWidth;
		const currentBpm = bpm;
		const currentTrackVolume = trackVolume;
		const currentPixelsPerBeat = pixelsPerBeat; // Track zoom changes
		const greyedOut = isGreyedOut;
		
		if (waveformCanvas && pattern && clipContainer) {
			waveformCtx = waveformCanvas.getContext('2d');
			
			// Skip if width hasn't changed significantly (less than 1 pixel difference)
			// This prevents unnecessary regeneration during minor zoom adjustments
			const widthDiff = Math.abs(width - lastWidth);
			if (widthDiff < 1 && lastWidth > 0) {
				return; // Skip regeneration for tiny changes
			}
			lastWidth = width;
			
			// Clear any pending timeout
			if (waveformGenerationTimeout) {
				clearTimeout(waveformGenerationTimeout);
				waveformGenerationTimeout = null;
			}
			
			// If we're already generating, mark that we need to regenerate
			if (isGeneratingWaveform) {
				pendingGeneration = true;
				return;
			}
			
			// Debounce waveform generation during zoom to prevent freezing
			// Use a longer delay for zoom changes (pixelsPerBeat) vs other changes
			const isZoomChange = currentPixelsPerBeat !== lastPixelsPerBeat;
			lastPixelsPerBeat = currentPixelsPerBeat;
			const delay = isZoomChange ? 200 : 50; // Longer delay for zoom (200ms gives time for zoom to settle)
			
			waveformGenerationTimeout = setTimeout(() => {
				waveformGenerationTimeout = null;
				
				// Use requestIdleCallback if available (runs when browser is idle)
				// Falls back to requestAnimationFrame for compatibility
				const scheduleGeneration = (callback: () => void) => {
					if ('requestIdleCallback' in window) {
						requestIdleCallback(callback, { timeout: 100 });
					} else {
						requestAnimationFrame(callback);
					}
				};
				
				scheduleGeneration(() => {
					// Double-check that values haven't changed during the delay
					if (waveformCanvas && pattern && clipContainer) {
						isGeneratingWaveform = true;
						
						// Use a small chunk of work to prevent blocking
						// Generate waveform in a way that yields to the browser
						try {
							drawWaveform();
						} finally {
							isGeneratingWaveform = false;
							
							// If there's a pending generation, trigger it
							if (pendingGeneration) {
								pendingGeneration = false;
								// Schedule another generation
								requestAnimationFrame(() => {
									if (waveformCanvas && pattern && clipContainer) {
										drawWaveform();
									}
								});
							}
						}
					}
				});
			}, delay);
		}
	});
</script>

{#if pattern}
	<div
		bind:this={clipContainer}
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
		on:touchstart={onTouchStart}
		on:touchmove={onTouchMove}
		on:touchend={onTouchEnd}
		on:touchcancel={onTouchEnd}
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
		<div class="clip-content">
			<span class="clip-label">{pattern.name}</span>
		</div>
		<canvas bind:this={waveformCanvas} class="clip-waveform"></canvas>
		<div class="clip-resize-handle-right" title="Drag to resize right edge"></div>
	</div>
{/if}

