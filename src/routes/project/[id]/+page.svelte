<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/projectStore';
	import { playbackStore } from '$lib/stores/playbackStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { viewStore } from '$lib/stores/viewStore';
	import { loadingStore } from '$lib/stores/loadingStore';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getCurrentUser } from '$lib/utils/supabase';
	import type { Pattern, PatternNode } from '$lib/types/pattern';
	import type { TimelineClip, TimelineTrack } from '$lib/stores/projectStore';
	import type { Effect, Envelope, TimelineEffect, TimelineEnvelope } from '$lib/types/effects';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import MidiEditor from '$lib/components/MidiEditor.svelte';
	import VelocityEditor from '$lib/components/VelocityEditor.svelte';
	import EffectsEnvelopesPanel from '$lib/components/EffectsEnvelopesPanel.svelte';
	import EffectEnvelopeProperties from '$lib/components/EffectEnvelopeProperties.svelte';
	import PatternCard from '$lib/components/PatternCard.svelte';
	import AutomationCurveEditor from '$lib/components/AutomationCurveEditor.svelte';
	import { automationStore } from '$lib/stores/automationStore';
	import SynthPluginWindow from '$lib/components/SynthPluginWindow.svelte';
	import { synthPluginStore } from '$lib/stores/synthPluginStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { generateEnvelopeCurvePath } from '$lib/utils/envelopeCurve';
	import { generateAutomationCurvePath } from '$lib/utils/automationCurve';
	import { TIMELINE_CONSTANTS, beatToPixel, pixelToBeat, snapToBeat, formatZoomDisplay, clampZoomLevel } from '$lib/utils/timelineUtils';
	import { generateRulerMarks, generateGridLines } from '$lib/utils/timelineRuler';
	import PatternSidebar from '$lib/components/timeline/PatternSidebar.svelte';
	import TimelineRuler from '$lib/components/timeline/TimelineRuler.svelte';
	import TimelineTrackRow from '$lib/components/timeline/TimelineTrackRow.svelte';
	import ProjectSkeleton from '$lib/components/skeletons/ProjectSkeleton.svelte';
	import '$lib/styles/components/ProjectView.css';
	import '$lib/styles/components/ArrangementView.css';

	let project: any;
	let playbackState: any;
	let isLoading = true;
	
	projectStore.subscribe((p) => {
		project = p;
		// Stop loading once project is loaded (using local state, not loadingStore)
		if (project && isLoading) {
			setTimeout(() => {
				isLoading = false;
			}, 100);
		}
	});
	playbackStore.subscribe((s) => (playbackState = s));
	
	// Pages with skeletons use local loading state only
	// Don't subscribe to loadingStore - that's for overlay operations only

	// View mode from store
	$: viewMode = $viewStore;
	
	// Sidebar state - reduced width to make arrangement editor wider
	const sidebarWidth = 240;
	
	// Selected pattern for pattern view
	let selectedPatternId: string | null = null;
	
	// Rename state
	let editingPatternId: string | null = null;
	let editingEffectId: string | null = null;
	let editingEnvelopeId: string | null = null;
	
	// Update CSS variable for sidebar width
	$: if (typeof document !== 'undefined') {
		document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
	}

	onMount(async () => {
		// Check authentication first (only in browser)
		if (typeof window !== 'undefined') {
			const user = await getCurrentUser();
			if (!user) {
				// Redirect to home if not authenticated
				await goto('/');
				return;
			}
		}

		// Reset loading state to ensure fresh start on each mount
		isLoading = true;
		
		// Use local loading state for skeleton, not loadingStore (which shows overlay)
		// loadingStore is only for operations like view transitions
		// Clear any existing loading state
		loadingStore.stopLoading();
		
		// Check if project is already loaded (from previous navigation)
		if (project && project.id === $page.params.id) {
			// Project already loaded, skip loading state
			isLoading = false;
			return;
		}
		
		// Load project from Supabase
		const { loadProject } = await import('$lib/utils/projectSaveLoad');
		const { project: loadedProject, error } = await loadProject($page.params.id);
		
		if (error) {
			console.error('Failed to load project from Supabase:', error);
			// If project doesn't exist in Supabase, initialize a new one
			if ($page.params.id) {
				projectStore.set({
					id: $page.params.id,
					title: 'New Project',
					bpm: 120,
					tracks: [],
					patterns: [],
					effects: [],
					envelopes: [],
					timeline: {
						tracks: [], // TimelineTracks (not standalone instruments)
						clips: [],
						effects: [],
						envelopes: [],
						totalLength: 16
					}
				});
			}
			isLoading = false;
		} else if (loadedProject) {
			projectStore.set(loadedProject);
			isLoading = false;
		} else {
			// Initialize project if needed
			if (!project && $page.params.id) {
				projectStore.set({
					id: $page.params.id,
					title: 'New Project',
					bpm: 120,
					tracks: [],
					patterns: [],
					effects: [],
					envelopes: [],
					timeline: {
						tracks: [], // TimelineTracks (not standalone instruments)
						clips: [],
						effects: [],
						envelopes: [],
						totalLength: 16
					}
				});
			}
			isLoading = false;
		}
		
		// Set initial CSS variable
		if (typeof document !== 'undefined') {
			document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
		}

		// Note: Auto-save is handled by the Save button in Toolbar
		// No need for localStorage auto-save subscription anymore
	});

	$: patterns = project?.patterns || [];
	$: effects = project?.effects || [];
	$: envelopes = project?.envelopes || [];
	$: timeline = project?.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 16 };
	
	// Ensure tracks array exists (backward compatibility)
	$: if (timeline && !timeline.tracks) {
		timeline.tracks = [];
	}
	
	$: timelineTracks = timeline.tracks || [];
	$: currentBeat = playbackState?.currentTime || 0;
	$: bpm = project?.bpm || 120;
	
	// Ensure default tracks exist (for backward compatibility)
	$: if (project && timeline && (!timeline.tracks || timeline.tracks.length === 0)) {
		const firstPattern = patterns.find((p) => p.name === 'Pattern 1') || patterns[0];
		if (firstPattern) {
			const patternTrack = projectStore.createTimelineTrack('pattern', firstPattern.id, 'Pattern 1');
			const effectTrack = projectStore.createTimelineTrack('effect', undefined, 'Effects');
			const envelopeTrack = projectStore.createTimelineTrack('envelope', undefined, 'Envelopes');
			
			projectStore.addTimelineTrack(patternTrack);
			projectStore.addTimelineTrack(effectTrack);
			projectStore.addTimelineTrack(envelopeTrack);
		}
	}

		// No need to select pattern - pattern list view just displays all patterns

	// Timeline settings
	const ROW_LABEL_WIDTH = TIMELINE_CONSTANTS.ROW_LABEL_WIDTH;
	const BASE_ZOOM = TIMELINE_CONSTANTS.BASE_ZOOM;
	let zoomLevel = BASE_ZOOM; // Zoom multiplier (8 = 100% display, matching user's comfortable zoom level)
	const BASE_PIXELS_PER_BEAT = TIMELINE_CONSTANTS.BASE_PIXELS_PER_BEAT;
	const RULER_HEIGHT = TIMELINE_CONSTANTS.RULER_HEIGHT;
	const PATTERN_ROW_HEIGHT = TIMELINE_CONSTANTS.PATTERN_ROW_HEIGHT;
	const BEATS_PER_BAR = TIMELINE_CONSTANTS.BEATS_PER_BAR;

	$: PIXELS_PER_BEAT = BASE_PIXELS_PER_BEAT * zoomLevel;
	
	// Declare reactive variables for ruler marks and grid lines
	$: rulerMarks = generateRulerMarks(timeline?.totalLength || 0, PIXELS_PER_BEAT);
	$: gridLines = generateGridLines(timeline?.totalLength || 0, PIXELS_PER_BEAT);

	function handleTimelineWheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return; // Only zoom with Ctrl/Cmd
		e.preventDefault();
		e.stopPropagation();
		
		// Use larger delta for more noticeable zoom changes
		const delta = e.deltaY > 0 ? -0.5 : 0.5;
		zoomLevel = clampZoomLevel(zoomLevel, delta);
	}
	
	// Format zoom level for display - normalize so BASE_ZOOM (8x) shows as 100%
	$: zoomDisplay = formatZoomDisplay(zoomLevel, BASE_ZOOM);

	// Local wrapper functions that use reactive PIXELS_PER_BEAT
	function beatToPixelLocal(beat: number): number {
		return beatToPixel(beat, PIXELS_PER_BEAT);
	}

	function pixelToBeatLocal(pixel: number): number {
		return pixelToBeat(pixel, PIXELS_PER_BEAT);
	}

	function findPatternById(patternId: string | undefined): Pattern | null {
		if (!patternId) return null;
		return patterns.find((p) => p.id === patternId) || null;
	}



	function createPattern() {
		if (!project) {
			console.error('Cannot create pattern: no project exists');
			return;
		}
		try {
			const projectId = $page.params.id;
			if (!projectId) {
				console.error('Cannot create pattern: project ID is missing');
				return;
			}
			const newPattern = projectStore.createPattern(
				projectId,
				`Pattern ${patterns.length + 1}`
			);
			projectStore.addPattern(newPattern);
			// Navigate to the new pattern's dedicated page
			goto(`/project/${projectId}/pattern/${newPattern.id}`);
		} catch (error) {
			console.error('Error creating pattern:', error);
		}
	}

	function deletePattern(patternId: string) {
		projectStore.deletePattern(patternId);
	}

	async function selectPattern(patternId: string) {
		// Show loading state while navigating
		const { loadingStore } = await import('$lib/stores/loadingStore');
		loadingStore.startLoading('Loading pattern editor...');
		
		// Navigate to the dedicated pattern page
		const projectId = $page.params.id;
		if (projectId) {
			await goto(`/project/${projectId}/pattern/${patternId}`);
			// Loading will be stopped by the pattern editor page when it finishes loading
		}
	}

	function addClipToTimeline(patternId: string, startBeat: number, trackId?: string) {
		if (!project) return;
		const pattern = patterns.find((p) => p.id === patternId);
		if (!pattern) return;

		const snappedStart = snapToBeat(startBeat);
		const duration = pattern.baseMeter;

		// If no trackId provided, find or create a pattern track for this pattern
		let targetTrackId = trackId;
		if (!targetTrackId) {
			// Find any pattern track (not necessarily for this specific pattern)
			const existingTrack = timeline.tracks?.find((t) => t.type === 'pattern');
			if (existingTrack) {
				targetTrackId = existingTrack.id;
			} else {
				// Create a new pattern track
				const newTrack = projectStore.createTimelineTrack('pattern', patternId, pattern.name);
				projectStore.addTimelineTrack(newTrack);
				targetTrackId = newTrack.id;
			}
		}

		const newClip: TimelineClip = {
			id: crypto.randomUUID(),
			patternId,
			trackId: targetTrackId,
			startBeat: snappedStart,
			duration
		};

		projectStore.addTimelineClip(newClip);
		
		// Reload project if playing in arrangement view
		if (viewMode === 'arrangement') {
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
	}

	function deleteClip(clipId: string) {
		projectStore.deleteTimelineClip(clipId);
	}

	function extendClip(clipId: string, by: number) {
		const clip = timeline.clips.find((c: TimelineClip) => c.id === clipId);
		if (clip) {
			projectStore.updateTimelineClip(clipId, { duration: Math.max(1, clip.duration + by) });
		}
	}

	// Drag and drop state
	let draggedPatternId: string | null = null;
	let draggedEffectId: string | null = null;
	let draggedEnvelopeId: string | null = null;
	let dragOverRow: string | null = null;
	let selectedEffectId: string | null = null;
	let selectedEnvelopeId: string | null = null;
	
	// Resize state
	let isResizing: { type: 'clip' | 'effect' | 'envelope', id: string, side: 'left' | 'right', startBeat: number, startDuration: number, startX: number } | null = null;
	let isDraggingClip: { type: 'clip' | 'effect' | 'envelope', id: string, startBeat: number, startX: number } | null = null;

	function handleDragStart(e: DragEvent, patternId: string) {
		if (viewMode !== 'arrangement') return;
		draggedPatternId = patternId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copy';
			e.dataTransfer.setData('text/plain', patternId);
			e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pattern', id: patternId }));
		}
	}

	function handleEffectEnvelopeDragStart(e: DragEvent, data: { type: 'effect' | 'envelope', id: string }) {
		if (viewMode !== 'arrangement') return;
		if (data.type === 'effect') {
			draggedEffectId = data.id;
		} else {
			draggedEnvelopeId = data.id;
		}
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copy';
			e.dataTransfer.setData('application/json', JSON.stringify(data));
		}
	}

	function handleDragOver(e: DragEvent, patternId?: string) {
		if (viewMode !== 'arrangement') return;
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
		if (patternId) {
			dragOverRow = patternId;
		}
	}

	function handleDragLeave() {
		dragOverRow = null;
	}

	function handleDrop(e: DragEvent, patternId?: string, rowType?: 'pattern' | 'effect' | 'envelope') {
		if (viewMode !== 'arrangement') return;
		e.preventDefault();
		dragOverRow = null;
		
		const target = e.currentTarget;
		if (!target) return;
		const rect = target.getBoundingClientRect();
		const x = e.clientX - rect.left - ROW_LABEL_WIDTH;
		const beat = Math.max(0, snapToBeat(pixelToBeatLocal(x)));
		
		// Check if dragging effect or envelope
		try {
			const dragData = e.dataTransfer?.getData('application/json');
			if (dragData) {
				const data = JSON.parse(dragData);
				const isPatternRow = rowType === 'pattern';
				// If dropped on a pattern row, assign to that pattern
				const targetPatternId = isPatternRow && patternId ? patternId : undefined;
				
				if (data.type === 'effect' && data.id && rowType === 'effect') {
					// trackId will be determined in addEffectToTimeline if not provided
					addEffectToTimeline(data.id, beat, 4, targetPatternId);
					draggedEffectId = null;
					return;
				} else if (data.type === 'envelope' && data.id && rowType === 'envelope') {
					// trackId will be determined in addEnvelopeToTimeline if not provided
					addEnvelopeToTimeline(data.id, beat, 4, targetPatternId);
					draggedEnvelopeId = null;
					return;
				}
			}
		} catch (err) {
			// Not JSON data, continue with pattern logic
		}
		
		// Pattern drop - also check for pattern data
		try {
			const dragData = e.dataTransfer?.getData('application/json');
			if (dragData) {
				const data = JSON.parse(dragData);
				if (data.type === 'pattern' && data.id && patternId && data.id === patternId) {
					addClipToTimeline(data.id, beat);
					draggedPatternId = null;
					return;
				}
			}
		} catch (err) {
			// Not JSON data, continue with fallback
		}
		
		// Fallback pattern drop
		if (patternId && draggedPatternId === patternId) {
			addClipToTimeline(draggedPatternId, beat);
			draggedPatternId = null;
		}
	}
	
	function handleClipMouseDown(e: MouseEvent, clip: TimelineClip | TimelineEffect | TimelineEnvelope, type: 'clip' | 'effect' | 'envelope' = 'clip') {
		if (e.button !== 0) return; // Only left mouse button
		e.stopPropagation();
		
		const target = e.target as HTMLElement;
		// Check if clicking on a resize handle (could be the handle itself or a child)
		const resizeHandle = target.closest('.clip-resize-handle-left, .clip-resize-handle-right') as HTMLElement;
		if (resizeHandle) {
			// Start resizing - begin batching for undo/redo
			projectStore.startBatch();
			const side = resizeHandle.classList.contains('clip-resize-handle-left') ? 'left' : 'right';
			const clipContainer = e.currentTarget as HTMLElement;
			if (!clipContainer) return;
			const rect = clipContainer.closest('.timeline-area')?.getBoundingClientRect();
			if (!rect) return;
			
			const startX = e.clientX - rect.left - ROW_LABEL_WIDTH;
			isResizing = {
				type,
				id: clip.id,
				side,
				startBeat: clip.startBeat,
				startDuration: clip.duration,
				startX
			};
		} else {
			// Start dragging the clip - begin batching for undo/redo
			projectStore.startBatch();
			const clipContainer = e.currentTarget as HTMLElement;
			if (!clipContainer) return;
			const rect = clipContainer.closest('.timeline-area')?.getBoundingClientRect();
			if (!rect) return;
			
			const startX = e.clientX - rect.left - ROW_LABEL_WIDTH;
			isDraggingClip = {
				type,
				id: clip.id,
				startBeat: clip.startBeat,
				startX
			};
		}
	}
	
	function handleTimelineMouseMove(e: MouseEvent) {
		// Only process if we're actually resizing or dragging
		if (!isResizing && !isDraggingClip) return;
		if (!e || !e.currentTarget) return;
		
		const target = e.currentTarget;
		if (!target) return;
		
		const rect = target.getBoundingClientRect();
		if (!rect) return;
		
		if (isResizing) {
			const resize = isResizing; // Capture for type narrowing
			const currentX = e.clientX - rect.left - ROW_LABEL_WIDTH;
			const deltaX = currentX - resize.startX;
			const deltaBeat = pixelToBeatLocal(deltaX);
			
			if (resize.type === 'clip') {
				const clip = timeline.clips?.find((c: TimelineClip) => c.id === resize.id);
				if (clip) {
					if (resize.side === 'right') {
						const newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineClip(resize.id, { duration: newDuration });
					} else {
						const newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						const newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineClip(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
				}
			} else if (resize.type === 'effect') {
				const effect = timeline.effects?.find((e) => e.id === resize.id);
				if (effect) {
					if (resize.side === 'right') {
						const newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineEffect(resize.id, { duration: newDuration });
					} else {
						const newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						const newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineEffect(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
				}
			} else if (resize.type === 'envelope') {
				const envelope = timeline.envelopes?.find((e) => e.id === resize.id);
				if (envelope) {
					if (resize.side === 'right') {
						const newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineEnvelope(resize.id, { duration: newDuration });
					} else {
						const newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						const newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineEnvelope(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
				}
			}
		} else if (isDraggingClip) {
			const drag = isDraggingClip; // Capture for type narrowing
			const currentX = e.clientX - rect.left - ROW_LABEL_WIDTH;
			const deltaX = currentX - drag.startX;
			const deltaBeat = pixelToBeatLocal(deltaX);
			const newStart = Math.max(0, snapToBeat(drag.startBeat + deltaBeat));
			
			if (drag.type === 'clip') {
				const clip = timeline.clips?.find((c: TimelineClip) => c.id === drag.id);
				if (clip) {
					projectStore.updateTimelineClip(drag.id, { startBeat: newStart });
				}
			} else if (drag.type === 'effect') {
				const effect = timeline.effects?.find((e) => e.id === drag.id);
				if (effect) {
					projectStore.updateTimelineEffect(drag.id, { startBeat: newStart });
				}
			} else if (drag.type === 'envelope') {
				const envelope = timeline.envelopes?.find((e) => e.id === drag.id);
				if (envelope) {
					projectStore.updateTimelineEnvelope(drag.id, { startBeat: newStart });
				}
			}
		}
	}
	
	function handleTimelineMouseUp() {
		// End batching if we were dragging or resizing
		if (isResizing || isDraggingClip) {
			projectStore.endBatch();
		}
		isResizing = null;
		isDraggingClip = null;
	}

	function handleRowClick(e: MouseEvent, trackId: string, patternId?: string) {
		if (viewMode !== 'arrangement') return;
		// Don't create a clip if clicking on an existing clip, its controls, resize handles, or buttons
		const target = e.target as HTMLElement;
		if (target && (
			target.closest('.timeline-clip') || 
			target.closest('.clip-controls') || 
			target.closest('.clip-resize-handle-left') ||
			target.closest('.clip-resize-handle-right') ||
			target.closest('button')
		)) return;
		
		// Only create clips for pattern tracks
		if (patternId) {
			const rowTarget = e.currentTarget as HTMLElement;
			if (!rowTarget) return;
			const rect = rowTarget.getBoundingClientRect();
			const x = e.clientX - rect.left - ROW_LABEL_WIDTH;
			const beat = Math.max(0, snapToBeat(pixelToBeatLocal(x)));
			
			addClipToTimeline(patternId, beat, trackId);
		}
	}

	function handleRowDragLeave(e: DragEvent) {
		const target = e.relatedTarget;
		const currentTarget = e.currentTarget as HTMLElement;
		if (!target || !currentTarget.contains(target as Node)) {
			dragOverRow = null;
			dragOverTrackId = null;
		}
	}

	function handleRowDrop(e: DragEvent, track: TimelineTrack) {
		e.preventDefault();
		dragOverRow = null;
		const target = e.currentTarget as HTMLElement;
		if (!target) return;
		const rect = target.getBoundingClientRect();
		const x = e.clientX - rect.left - ROW_LABEL_WIDTH;
		const beat = Math.max(0, snapToBeat(pixelToBeatLocal(x)));
		
		try {
			const dragData = e.dataTransfer?.getData('application/json');
			if (dragData) {
				const data = JSON.parse(dragData);
				if (data.type === 'pattern' && track.type === 'pattern') {
					addClipToTimeline(data.id, beat, track.id);
					draggedPatternId = null;
				} else if (data.type === 'effect' && track.type === 'effect') {
					addEffectToTimeline(data.id, beat, 4, undefined, track.id);
					draggedEffectId = null;
				} else if (data.type === 'envelope' && track.type === 'envelope') {
					addEnvelopeToTimeline(data.id, beat, 4, undefined, track.id);
					draggedEnvelopeId = null;
				}
			} else {
				// Fallback: try text data as pattern ID (but not if it's a track ID)
				const textData = e.dataTransfer?.getData('text/plain');
				if (textData && !timeline.tracks?.find((t: any) => t.id === textData)) {
					const patternIdText = textData;
					if (patternIdText && track.type === 'pattern' && patterns.find((p) => p.id === patternIdText)) {
						addClipToTimeline(patternIdText, beat, track.id);
						draggedPatternId = null;
					}
				}
			}
		} catch (error) {
			console.error('Error handling drop:', error);
		}
	}

	function addEffectToTimeline(effectId: string, startBeat: number, duration: number, patternId?: string, trackId?: string) {
		if (!project) return;
		
		// If no trackId provided, find or create an effect track
		let targetTrackId = trackId;
		if (!targetTrackId) {
			const existingTrack = timeline.tracks?.find((t) => t.type === 'effect');
			if (existingTrack) {
				targetTrackId = existingTrack.id;
			} else {
				// Create a new effect track
				const newTrack = projectStore.createTimelineTrack('effect');
				projectStore.addTimelineTrack(newTrack);
				targetTrackId = newTrack.id;
			}
		}
		
		const newEffect: TimelineEffect = {
			id: crypto.randomUUID(),
			effectId,
			trackId: targetTrackId,
			startBeat: snapToBeat(startBeat),
			duration,
			patternId: patternId || undefined // Assign to specific pattern if provided
		};
		projectStore.addTimelineEffect(newEffect);
		
		// Reload project if playing in arrangement view
		if (viewMode === 'arrangement') {
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
	}

	function addEnvelopeToTimeline(envelopeId: string, startBeat: number, duration: number, patternId?: string, trackId?: string) {
		if (!project) return;
		
		// If no trackId provided, find or create an envelope track
		let targetTrackId = trackId;
		if (!targetTrackId) {
			const existingTrack = timeline.tracks?.find((t) => t.type === 'envelope');
			if (existingTrack) {
				targetTrackId = existingTrack.id;
			} else {
				// Create a new envelope track
				const newTrack = projectStore.createTimelineTrack('envelope');
				projectStore.addTimelineTrack(newTrack);
				targetTrackId = newTrack.id;
			}
		}
		
		const newEnvelope: TimelineEnvelope = {
			id: crypto.randomUUID(),
			envelopeId,
			trackId: targetTrackId,
			startBeat: snapToBeat(startBeat),
			duration,
			patternId: patternId || undefined // Assign to specific pattern if provided
		};
		projectStore.addTimelineEnvelope(newEnvelope);
		
		// Reload project if playing in arrangement view
		if (viewMode === 'arrangement') {
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
	}

	function deleteTimelineEffect(effectId: string) {
		projectStore.deleteTimelineEffect(effectId);
	}

	function deleteTimelineEnvelope(envelopeId: string) {
		projectStore.deleteTimelineEnvelope(envelopeId);
	}

	function extendTimelineEffect(effectId: string, by: number) {
		const effect = timeline.effects?.find((e) => e.id === effectId);
		if (effect) {
			projectStore.updateTimelineEffect(effectId, { duration: Math.max(1, effect.duration + by) });
		}
	}

	function extendTimelineEnvelope(envelopeId: string, by: number) {
		const envelope = timeline.envelopes?.find((e) => e.id === envelopeId);
		if (envelope) {
			projectStore.updateTimelineEnvelope(envelopeId, { duration: Math.max(1, envelope.duration + by) });
		}
	}

	// Timeline track management
	let showAddTrackMenu = false;
	
	function createTimelineTrack(type: 'pattern' | 'effect' | 'envelope', patternId?: string) {
		if (!project) return;
		const newTrack = projectStore.createTimelineTrack(type, patternId);
		projectStore.addTimelineTrack(newTrack);
		showAddTrackMenu = false;
	}
	
	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target;
		if (!target.closest('.add-track-dropdown-ruler')) {
			showAddTrackMenu = false;
		}
	}
	
	// Track reordering
	let draggedTrackId: string | null = null;
	let dragOverTrackId: string | null = null;
	
	function handleTrackDragStart(e: DragEvent, trackId: string) {
		e.stopPropagation();
		draggedTrackId = trackId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('application/json', JSON.stringify({ type: 'track-reorder', trackId }));
			e.dataTransfer.setData('text/plain', trackId);
		}
	}
	
	function handleTrackDragOver(e: DragEvent, trackId: string) {
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		if (draggedTrackId && draggedTrackId !== trackId) {
			dragOverTrackId = trackId;
		}
	}
	
	function handleTrackDragLeave(e: DragEvent) {
		e.stopPropagation();
		dragOverTrackId = null;
	}
	
	function handleTrackDrop(e: DragEvent, targetTrackId: string) {
		e.preventDefault();
		e.stopPropagation();
		
		// Use the stored draggedTrackId from dragstart
		if (!draggedTrackId || !project || draggedTrackId === targetTrackId) {
			draggedTrackId = null;
			dragOverTrackId = null;
			return;
		}
		
		const allTracks = [...(timeline.tracks || [])].sort((a, b) => a.order - b.order);
		const draggedTrack = allTracks.find((t) => t.id === draggedTrackId);
		const targetTrack = allTracks.find((t) => t.id === targetTrackId);
		
		if (!draggedTrack || !targetTrack) {
			draggedTrackId = null;
			dragOverTrackId = null;
			return;
		}
		
		const draggedIndex = allTracks.indexOf(draggedTrack);
		const targetIndex = allTracks.indexOf(targetTrack);
		
		// If already in the same position, do nothing
		if (draggedIndex === targetIndex) {
			draggedTrackId = null;
			dragOverTrackId = null;
			return;
		}
		
		// Remove dragged track from its position
		allTracks.splice(draggedIndex, 1);
		// Insert at target position
		allTracks.splice(targetIndex, 0, draggedTrack);
		
		// Update all order values sequentially
		allTracks.forEach((track, index) => {
			if (track.order !== index) {
				projectStore.updateTimelineTrack(track.id, { order: index });
			}
		});
		
		draggedTrackId = null;
		dragOverTrackId = null;
	}
	
	// Handle click outside for dropdown
	$: if (showAddTrackMenu && typeof window !== 'undefined') {
		window.addEventListener('click', handleClickOutside);
	} else if (typeof window !== 'undefined') {
		window.removeEventListener('click', handleClickOutside);
	}

	function deleteTimelineTrack(trackId: string) {
		projectStore.deleteTimelineTrack(trackId);
	}
	
	function handleTrackVolumeMouseDown(e: MouseEvent, trackId: string) {
		e.stopPropagation();
		e.preventDefault(); // Prevent text selection
		const volumeBar = (e.currentTarget as HTMLElement).querySelector('.track-volume-bar') as HTMLElement;
		if (!volumeBar) return;
		
		const rect = volumeBar.getBoundingClientRect();
		// Calculate volume from click position (0.0 to 2.0, where 1.0 is center)
		// Click at top = 2.0, click at bottom = 0.0
		const clickY = e.clientY - rect.top;
		const height = rect.height;
		const volume = Math.max(0, Math.min(2.0, 2.0 * (1.0 - (clickY / height))));
		
		updateTrackVolume(trackId, volume);
		
		// Set up drag handlers for real-time adjustment
		const handleMouseMove = (moveEvent: MouseEvent) => {
			const newRect = volumeBar.getBoundingClientRect();
			const newClickY = moveEvent.clientY - newRect.top;
			const newVolume = Math.max(0, Math.min(2.0, 2.0 * (1.0 - (newClickY / newRect.height))));
			updateTrackVolume(trackId, newVolume);
		};
		
		const handleMouseUp = () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
		
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}
	
	function updateTrackVolume(trackId: string, volume: number) {
		// Update track volume
		projectStore.updateTimelineTrack(trackId, { volume });
		
		// Update audio engine in real-time
		const engine = $engineStore;
		if (engine) {
			engine.updateTimelineTrackVolume(trackId, volume);
		}
	}

	function toggleTrackMute(trackId: string) {
		if (!project || !project.timeline) return;
		const track = project.timeline.tracks.find((t: TimelineTrack) => t.id === trackId);
		if (!track) return;
		
		const newMute = !(track.mute ?? false);
		projectStore.updateTimelineTrack(trackId, { mute: newMute });
		
		// Update audio engine in real-time
		const engine = $engineStore;
		if (engine) {
			engine.updateTimelineTrackMute(trackId, newMute);
		}
	}

	function toggleTrackSolo(trackId: string) {
		if (!project || !project.timeline) return;
		const track = project.timeline.tracks.find((t: TimelineTrack) => t.id === trackId);
		if (!track) return;
		
		const newSolo = !(track.solo ?? false);
		
		// If soloing this track, unsolo all other tracks
		if (newSolo) {
			project.timeline.tracks.forEach((t: TimelineTrack) => {
				if (t.id !== trackId && t.type === 'pattern') {
					projectStore.updateTimelineTrack(t.id, { solo: false });
					const engine = $engineStore;
					if (engine) {
						engine.updateTimelineTrackSolo(t.id, false);
					}
				}
			});
		}
		
		projectStore.updateTimelineTrack(trackId, { solo: newSolo });
		
		// Update audio engine in real-time
		const engine = $engineStore;
		if (engine) {
			engine.updateTimelineTrackSolo(trackId, newSolo);
		}
	}

	// Get clips/effects/envelopes for a specific track
	function getClipsForTrack(trackId: string): TimelineClip[] {
		return (timeline.clips || []).filter((c: TimelineClip) => c.trackId === trackId);
	}

	function getEffectsForTrack(trackId: string): TimelineEffect[] {
		return (timeline.effects || []).filter((e) => e.trackId === trackId);
	}

	function getEnvelopesForTrack(trackId: string): TimelineEnvelope[] {
		return (timeline.envelopes || []).filter((e) => e.trackId === trackId);
	}

	function getAutomationCurvesForEffect(effectId: string, timelineEffectId: string) {
		if (!project || !project.automation) return [];
		const curves: any[] = [];
		const automationData: any = project.automation;
		
		// Check if there's an open automation window for this effect instance
		const openAutomationWindow = $automationStore.find(
			(w) => w.targetType === 'effect' && 
			       w.targetId === effectId && 
			       w.timelineInstanceId === timelineEffectId
		);
		
		// Check for automation with this timeline instance ID
		for (const [key, value] of Object.entries(automationData)) {
			if (value && typeof value === 'object' && 'targetType' in value && 'targetId' in value) {
				const auto: any = value;
				if (auto.targetType === 'effect' && auto.targetId === effectId && auto.timelineInstanceId === timelineEffectId) {
					// Only include this curve if:
					// 1. There's no open automation window (show all), OR
					// 2. This is the parameter currently open in the automation editor
					if (!openAutomationWindow || auto.parameterKey === openAutomationWindow.parameterKey) {
						if (auto.points && auto.points.length > 0) {
							curves.push({ automation: auto, parameterKey: auto.parameterKey });
						}
					}
				}
			}
		}
		return curves;
	}



	// Get clips for each pattern
	$: clipsByPattern = (() => {
		const map = new Map<string, TimelineClip[]>();
		for (const pattern of patterns) {
			map.set(pattern.id, (timeline.clips || []).filter((c: TimelineClip) => c.patternId === pattern.id));
		}
		return map;
	})();

	// Get timeline effects and envelopes
	$: timelineEffects = (() => {
		return (timeline.effects || []).map((e) => {
			const effect = effects.find((eff) => eff.id === e.effectId);
			return { ...e, effect };
		}).filter((e) => e.effect);
	})();

	$: timelineEnvelopes = (() => {
		return (timeline.envelopes || []).map((e) => {
			const envelope = envelopes.find((env) => env.id === e.envelopeId);
			return { ...e, envelope };
		}).filter((e) => e.envelope);
	})();
	
	// Map timeline effect/envelope IDs to base effect/envelope IDs for settings panel
	$: selectedBaseEffectId = selectedEffectId 
		? timelineEffects.find((te) => te.id === selectedEffectId)?.effectId || null
		: null;
	$: selectedBaseEnvelopeId = selectedEnvelopeId 
		? timelineEnvelopes.find((te) => te.id === selectedEnvelopeId)?.envelopeId || null
		: null;

	// Close automation windows when selection changes or sidebar closes
	$: {
		const openWindows = $automationStore;
		if (openWindows.length > 0) {
			// Close all automation windows if:
			// 1. No effect or envelope is selected (sidebar closed)
			// 2. View mode is not arrangement
			if (!selectedEffectId && !selectedEnvelopeId) {
				automationStore.closeAll();
			} else if (viewMode !== 'arrangement') {
				automationStore.closeAll();
			} else {
				// Close windows that don't match the current selection
				for (const window of openWindows) {
					let shouldClose = false;
					
					if (window.targetType === 'effect') {
						// Close if no effect is selected or window doesn't match selected effect
						if (!selectedEffectId || window.timelineInstanceId !== selectedEffectId) {
							shouldClose = true;
						}
					} else if (window.targetType === 'envelope') {
						// Close if no envelope is selected or window doesn't match selected envelope
						if (!selectedEnvelopeId || window.timelineInstanceId !== selectedEnvelopeId) {
							shouldClose = true;
						}
					}
					
					if (shouldClose) {
						automationStore.closeWindow(window.id);
					}
				}
			}
		}
	}

	// Sync pattern to temporary track for canvas compatibility
	// Use a more controlled approach to avoid reactive loops
	// No sync logic needed - pattern editing happens in dedicated pattern editor page
	// Pattern list view just displays patterns, no editing here
	
	// Clean up any leftover temporary standalone instruments on mount (cleanup from old code)
	onMount(() => {
		// Clean up any temporary pattern instruments that might be lingering
		projectStore.subscribe((p) => {
			if (p && p.standaloneInstruments) {
				const tempInstruments = p.standaloneInstruments.filter((i) => i.id.startsWith('__pattern_'));
				if (tempInstruments.length > 0) {
					// Clean up after a short delay to avoid interfering with navigation
					setTimeout(() => {
						for (const instrument of tempInstruments) {
							projectStore.removeStandaloneInstrument(instrument.id);
						}
					}, 100);
				}
			}
		})();
	});
</script>

<Toolbar />

{#if isLoading}
	<ProjectSkeleton viewMode={viewMode} />
{:else}
<div class="project-view" style="--sidebar-width: {sidebarWidth}px;">
	<!-- Pattern Sidebar (only show in arrangement view) -->
	{#if viewMode === 'arrangement'}
		<PatternSidebar
			{patterns}
			{sidebarWidth}
			bind:editingPatternId
			{viewMode}
			{createPattern}
			{deletePattern}
			{selectPattern}
			{handleEffectEnvelopeDragStart}
		/>
	{/if}

	<!-- Main Content Area -->
	<div class="main-content" style="margin-left: {viewMode === 'arrangement' ? sidebarWidth : 0}px;">
		{#if viewMode === 'arrangement'}
			<!-- Arrangement View -->
			<div class="arrangement-view" class:automation-open={$automationStore.length > 0}>
				<div 
					class="timeline-area" 
					role="region"
					aria-label="Timeline area"
					on:wheel={(e) => handleTimelineWheel(e)}
					on:mousemove={(e) => handleTimelineMouseMove(e)}
					on:mouseup={() => handleTimelineMouseUp()}
					on:mouseleave={() => handleTimelineMouseUp()}
				>
					<TimelineRuler
						totalLength={timeline.totalLength}
						pixelsPerBeat={PIXELS_PER_BEAT}
						{zoomLevel}
						bind:showAddTrackMenu
						onZoomWheel={handleTimelineWheel}
						onCreateTrack={createTimelineTrack}
						onToggleAddTrackMenu={() => showAddTrackMenu = !showAddTrackMenu}
					/>

					<div class="playhead-container">
						<div class="playhead" style="left: {ROW_LABEL_WIDTH + beatToPixelLocal(currentBeat)}px;"></div>
					</div>

					<div class="pattern-rows">
						<!-- Render timeline tracks sorted by order -->
						{#each timelineTracks.sort((a, b) => a.order - b.order) as track}
							{@const trackClips = getClipsForTrack(track.id)}
							{@const trackEffects = getEffectsForTrack(track.id)}
							{@const trackEnvelopes = getEnvelopesForTrack(track.id)}
							{@const trackPattern = track.type === 'pattern' && track.patternId ? findPatternById(track.patternId) : null}
							
							<TimelineTrackRow
								{track}
								{trackClips}
								{trackEffects}
								{trackEnvelopes}
								{trackPattern}
								{patterns}
								{effects}
								{envelopes}
								{timeline}
								pixelsPerBeat={PIXELS_PER_BEAT}
								totalLength={timeline.totalLength}
								{dragOverRow}
								{dragOverTrackId}
								{draggedTrackId}
								{isResizing}
								{isDraggingClip}
								{selectedEffectId}
								{selectedEnvelopeId}
								{getAutomationCurvesForEffect}
								onTrackDragStart={handleTrackDragStart}
								onTrackDragOver={handleTrackDragOver}
								onTrackDragLeave={handleTrackDragLeave}
								onTrackDrop={handleTrackDrop}
								onRowDragOver={(e) => {
									e.preventDefault();
									if (e.dataTransfer) {
										e.dataTransfer.dropEffect = 'copy';
									}
									dragOverRow = track.id;
								}}
								onRowDragLeave={handleRowDragLeave}
								onRowDrop={(e) => handleRowDrop(e, track)}
								onRowClick={(e) => handleRowClick(e, track.id, track.patternId)}
								onTrackVolumeMouseDown={handleTrackVolumeMouseDown}
								onToggleTrackMute={toggleTrackMute}
								onToggleTrackSolo={toggleTrackSolo}
								onDeleteTrack={deleteTimelineTrack}
								onChangeTrackColor={(trackId, color) => {
									projectStore.updateTimelineTrack(trackId, { color });
								}}
								onClipMouseDown={handleClipMouseDown}
								onClipClick={(clipId, type) => {
									if (type === 'effect') {
										selectedEffectId = clipId;
										selectedEnvelopeId = null;
									} else if (type === 'envelope') {
										selectedEnvelopeId = clipId;
										selectedEffectId = null;
									}
								}}
								onClipKeyDown={(clipId, type) => {
									if (type === 'effect') {
										selectedEffectId = clipId;
										selectedEnvelopeId = null;
									} else if (type === 'envelope') {
										selectedEnvelopeId = clipId;
										selectedEffectId = null;
									}
								}}
								onDeleteClip={(clipId, type) => {
									if (type === 'clip') {
										deleteClip(clipId);
									} else if (type === 'effect') {
										deleteTimelineEffect(clipId);
									} else if (type === 'envelope') {
										deleteTimelineEnvelope(clipId);
									}
								}}
								onAddClipToTimeline={addClipToTimeline}
								onAddEffectToTimeline={(effectId, beat, trackId) => addEffectToTimeline(effectId, beat, 4, undefined, trackId)}
								onAddEnvelopeToTimeline={(envelopeId, beat, trackId) => addEnvelopeToTimeline(envelopeId, beat, 4, undefined, trackId)}
								{findPatternById}
							/>
						{/each}
					</div>
				</div>
			</div>
			<EffectEnvelopeProperties 
				selectedEffectId={selectedBaseEffectId} 
				selectedEnvelopeId={selectedBaseEnvelopeId}
				selectedTimelineEffectId={selectedEffectId}
				selectedTimelineEnvelopeId={selectedEnvelopeId}
			/>
			
			<!-- Automation Editor Panel (bottom, between sidebars) -->
			{#if $automationStore.length > 0}
				<div class="automation-panel-container">
					<div class="automation-windows-container">
						{#if $automationStore[0]}
							<AutomationCurveEditor automationWindow={$automationStore[0]} />
						{/if}
					</div>
				</div>
			{/if}
			
		{:else if viewMode === 'pattern'}
			<!-- Pattern List View -->
			<div class="pattern-list-view">
				<div class="pattern-list-header">
					<h2>Patterns</h2>
					<button class="create-pattern-btn-large" on:click={createPattern} title="Create new pattern">
						+ New Pattern
					</button>
				</div>
				<div class="pattern-grid">
					{#each patterns as pattern}
						<PatternCard 
							pattern={pattern} 
							onClick={() => selectPattern(pattern.id)}
							onDelete={deletePattern}
						/>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
{/if}
