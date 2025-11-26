<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/projectStore';
	import { playbackStore } from '$lib/stores/playbackStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { viewStore } from '$lib/stores/viewStore';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
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
	import { engineStore } from '$lib/stores/engineStore';
	import '$lib/styles/components/ProjectView.css';
	import '$lib/styles/components/ArrangementView.css';

	let project: any;
	let playbackState: any;
	
	projectStore.subscribe((p) => (project = p));
	playbackStore.subscribe((s) => (playbackState = s));

	// View mode from store
	$: viewMode = $viewStore;
	
	// Sidebar state
	const sidebarWidth = 280;
	
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

	onMount(() => {
		// Load project from localStorage
		const saved = localStorage.getItem(`project_${$page.params.id}`);
		if (saved) {
			try {
				const loadedProject = JSON.parse(saved);
				projectStore.set(loadedProject);
			} catch (e) {
				console.error('Failed to load project:', e);
			}
		}

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
		
		// Set initial CSS variable
		if (typeof document !== 'undefined') {
			document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
		}

		// Auto-save subscription
		const unsubscribe = projectStore.subscribe((p) => {
			if (p && $page.params.id) {
				localStorage.setItem(`project_${$page.params.id}`, JSON.stringify(p));
			}
		});
		
		// No trackUpdated listener needed - pattern editing happens in dedicated page
		
		return () => {
			unsubscribe();
		};
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
	const ROW_LABEL_WIDTH = 200; // Width of the row label column
	const BASE_ZOOM = 8; // Base zoom level (8x = what we want to show as 100%)
	let zoomLevel = BASE_ZOOM; // Zoom multiplier (8 = 100% display, matching user's comfortable zoom level)
	const BASE_PIXELS_PER_BEAT = 4; // Base pixels per beat at zoom level 1
	const RULER_HEIGHT = 50;
	const PATTERN_ROW_HEIGHT = 80;
	const BEATS_PER_BAR = 4; // Standard 4/4 time

	$: PIXELS_PER_BEAT = BASE_PIXELS_PER_BEAT * zoomLevel;
	
	// Declare reactive variables for ruler marks and grid lines
	let rulerMarks: any[] = [];
	let gridLines: any[] = [];

	function beatToPixel(beat: number): number {
		return beat * PIXELS_PER_BEAT;
	}

	function pixelToBeat(pixel: number): number {
		return pixel / PIXELS_PER_BEAT;
	}

	function handleTimelineWheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return; // Only zoom with Ctrl/Cmd
		e.preventDefault();
		e.stopPropagation();
		
		// Use larger delta for more noticeable zoom changes
		const delta = e.deltaY > 0 ? -0.5 : 0.5;
		zoomLevel = Math.max(0.25, Math.min(64, zoomLevel + delta)); // Zoom between 0.25x (25%) and 64x (6400%)
	}
	
	// Format zoom level for display - normalize so BASE_ZOOM (8x) shows as 100%
	$: zoomDisplay = `${Math.round((zoomLevel / BASE_ZOOM) * 100)}%`;

	function snapToBeat(beat: number): number {
		return Math.round(beat * 4) / 4;
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

	function selectPattern(patternId: string) {
		// Navigate to the dedicated pattern page
		const projectId = $page.params.id;
		if (projectId) {
			goto(`/project/${projectId}/pattern/${patternId}`);
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
		const beat = Math.max(0, snapToBeat(pixelToBeat(x)));
		
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
	
	function handleClipMouseDown(e: MouseEvent, clip: TimelineClip, type: 'clip' | 'effect' | 'envelope' = 'clip') {
		if (e.button !== 0) return; // Only left mouse button
		e.stopPropagation();
		
		const target = e.target as HTMLElement;
		// Check if clicking on a resize handle (could be the handle itself or a child)
		const resizeHandle = target.closest('.clip-resize-handle-left, .clip-resize-handle-right') as HTMLElement;
		if (resizeHandle) {
			// Start resizing
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
			// Start dragging the clip
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
			const deltaBeat = pixelToBeat(deltaX);
			
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
			const deltaBeat = pixelToBeat(deltaX);
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
			const beat = Math.max(0, snapToBeat(pixelToBeat(x)));
			
			addClipToTimeline(patternId, beat, trackId);
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
	
	function handleTrackVolumeClick(e: MouseEvent, trackId: string) {
		e.stopPropagation();
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

	// Generate ruler marks with beats and bars (reactive to zoom)
	// Explicitly reference PIXELS_PER_BEAT to ensure reactivity
	$: {
		if (!timeline || !timeline.totalLength) {
			rulerMarks = [];
		} else {
			const marks = [];
			const pixelsPerBeat = PIXELS_PER_BEAT; // Explicitly reference reactive variable
			// Only show bars and beats, not sub-beats
			for (let beat = 0; beat <= timeline.totalLength; beat += 1) {
				const isBar = beat % BEATS_PER_BAR === 0;
				const barNumber = Math.floor(beat / BEATS_PER_BAR);
				const beatInBar = Math.floor(beat % BEATS_PER_BAR);
				
				marks.push({
					beat,
					x: beat * pixelsPerBeat,
					isBar,
					isBeat: true,
					barNumber,
					beatInBar
				});
			}
			rulerMarks = marks;
		}
	}
	
	// Generate grid lines for timeline rows - only bars and beats (reactive to zoom)
	// Explicitly reference PIXELS_PER_BEAT to ensure reactivity
	$: {
		if (!timeline || !timeline.totalLength) {
			gridLines = [];
		} else {
			const lines = [];
			const pixelsPerBeat = PIXELS_PER_BEAT; // Explicitly reference reactive variable
			for (let beat = 0; beat <= timeline.totalLength; beat += 1) {
				const isBar = beat % BEATS_PER_BAR === 0;
				lines.push({
					beat,
					x: beat * pixelsPerBeat,
					isBar,
					isBeat: true
				});
			}
			gridLines = lines;
		}
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

<div class="project-view" style="--sidebar-width: {sidebarWidth}px;">
	<!-- Pattern Sidebar (only show in arrangement view) -->
	{#if viewMode === 'arrangement'}
	<div class="pattern-sidebar" style="width: {sidebarWidth}px;">
		<div class="sidebar-header">
			<h3>Patterns</h3>
			<button class="create-pattern-btn" on:click={createPattern} title="Create new pattern">
				+
			</button>
		</div>
		<div class="patterns-list">
			{#each patterns as pattern}
				<button
					class="pattern-item {$page.url.pathname.includes(`/pattern/${pattern.id}`) ? 'active' : ''}"
					on:click={() => {
						if (editingPatternId !== pattern.id) {
							selectPattern(pattern.id);
						}
					}}
					on:dragstart={(e) => {
						if (editingPatternId !== pattern.id) {
							handleDragStart(e, pattern.id);
						}
					}}
					draggable={viewMode === 'arrangement' && editingPatternId !== pattern.id}
					tabindex="0"
				>
					<div class="pattern-color" style="background: {pattern.color};"></div>
					{#if editingPatternId === pattern.id}
						<input
							type="text"
							class="pattern-name-input-inline"
							value={pattern.name}
							on:blur={(e) => {
								const newName = e.currentTarget.value.trim() || pattern.name;
								projectStore.updatePattern(pattern.id, { name: newName });
								editingPatternId = null;
							}}
							on:keydown={(e) => {
								if (e.key === 'Enter') {
									e.currentTarget.blur();
								} else if (e.key === 'Escape') {
									editingPatternId = null;
								}
							}}
							on:click|stopPropagation
							autofocus
						/>
					{:else}
						<span 
							class="pattern-name"
							on:dblclick|stopPropagation={() => editingPatternId = pattern.id}
							title="Double-click to rename"
						>
							{pattern.name}
						</span>
					{/if}
					<span class="pattern-instrument">{pattern.instrumentType}</span>
					<button 
						class="pattern-delete" 
						on:click|stopPropagation={() => deletePattern(pattern.id)} 
						title="Delete pattern"
					>
						×
					</button>
				</button>
			{/each}
			{#if patterns.length === 0}
				<div class="empty-state">No patterns yet. Create one to get started!</div>
			{/if}
		</div>
		<EffectsEnvelopesPanel onDragStart={handleEffectEnvelopeDragStart} />
	</div>
	{/if}

	<!-- Main Content Area -->
	<div class="main-content" style="margin-left: {viewMode === 'arrangement' ? sidebarWidth : 0}px;">
		{#if viewMode === 'arrangement'}
			<!-- Arrangement View -->
			<div class="arrangement-view">
				<div 
					class="timeline-area" 
					role="region"
					aria-label="Timeline area"
					on:wheel={(e) => handleTimelineWheel(e)}
					on:mousemove={(e) => handleTimelineMouseMove(e)}
					on:mouseup={() => handleTimelineMouseUp()}
					on:mouseleave={() => handleTimelineMouseUp()}
				>
					<div class="timeline-ruler-container">
						<div class="ruler-label-spacer" style="width: {ROW_LABEL_WIDTH}px;">
							{#if Math.round((zoomLevel / BASE_ZOOM) * 100) !== 100}
								<div class="zoom-indicator" title="Zoom: {zoomDisplay} (Ctrl+Wheel to zoom)">
									{zoomDisplay}
								</div>
							{/if}
							<div class="add-track-dropdown-ruler">
								<span 
									class="add-track-trigger"
									on:click={() => showAddTrackMenu = !showAddTrackMenu}
									role="button"
									tabindex="0"
									on:keydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											showAddTrackMenu = !showAddTrackMenu;
										}
									}}
								>
									+ Add Track
								</span>
								{#if showAddTrackMenu}
									<div class="add-track-menu">
										<button on:click={() => createTimelineTrack('pattern')}>
											Pattern Track
										</button>
										<button on:click={() => createTimelineTrack('effect')}>
											Effect Track
										</button>
										<button on:click={() => createTimelineTrack('envelope')}>
											Envelope Track
										</button>
									</div>
								{/if}
							</div>
						</div>
						<div class="timeline-ruler" style="height: {RULER_HEIGHT}px; width: {beatToPixel(timeline.totalLength)}px;">
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

					<div class="playhead-container">
						<div class="playhead" style="left: {ROW_LABEL_WIDTH + beatToPixel(currentBeat)}px;"></div>
					</div>

					<div class="pattern-rows">
						<!-- Render timeline tracks sorted by order -->
						{#each timelineTracks.sort((a, b) => a.order - b.order) as track}
							{@const trackClips = getClipsForTrack(track.id)}
							{@const trackEffects = getEffectsForTrack(track.id)}
							{@const trackEnvelopes = getEnvelopesForTrack(track.id)}
							{@const trackPattern = track.type === 'pattern' && track.patternId ? findPatternById(track.patternId) : null}
							
							<div 
								class="pattern-row {track.type}-row {dragOverRow === track.id ? 'drag-over' : ''} {dragOverTrackId === track.id ? 'drag-over-track' : ''}" 
								style="height: {PATTERN_ROW_HEIGHT}px;"
								role="region"
								aria-label="{track.type} timeline track"
								on:dragover={(e) => {
									// Check if this is a track reorder first (using stored draggedTrackId)
									if (draggedTrackId && draggedTrackId !== track.id) {
										e.preventDefault();
										if (e.dataTransfer) {
											e.dataTransfer.dropEffect = 'move';
										}
										dragOverTrackId = track.id;
										return;
									}
									
									e.preventDefault();
									if (e.dataTransfer) {
										e.dataTransfer.dropEffect = 'copy';
									}
									dragOverRow = track.id;
								}}
								on:dragleave={(e) => {
									// Only clear dragOverRow if we're leaving the row entirely
									const target = e.relatedTarget;
									if (!target || !e.currentTarget.contains(target)) {
										dragOverRow = null;
										dragOverTrackId = null;
									}
								}}
								on:drop={(e) => {
									// Check if this is a track reorder operation first (using stored draggedTrackId)
									if (draggedTrackId && draggedTrackId !== track.id) {
										// This is a track reorder
										handleTrackDrop(e, track.id);
										return;
									}
									
									e.preventDefault();
									dragOverRow = null;
									const target = e.currentTarget;
									if (!target) return;
									const rect = target.getBoundingClientRect();
									const x = e.clientX - rect.left - ROW_LABEL_WIDTH;
									const beat = Math.max(0, snapToBeat(pixelToBeat(x)));
									
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
											if (textData && !timeline.tracks?.find((t) => t.id === textData)) {
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
								}}
							>
								<div 
									class="row-label" 
									style="background: {
										track.type === 'pattern' && trackPattern ? trackPattern.color + '20' :
										track.type === 'effect' ? 'rgba(155, 89, 182, 0.2)' :
										'rgba(46, 204, 113, 0.2)'
									};"
									draggable="true"
									role="button"
									tabindex="0"
									on:dragstart={(e) => handleTrackDragStart(e, track.id)}
									on:dragover={(e) => handleTrackDragOver(e, track.id)}
									on:dragleave={(e) => handleTrackDragLeave(e)}
									on:drop={(e) => handleTrackDrop(e, track.id)}
								>
									<div 
										class="track-volume-control"
										on:click={(e) => handleTrackVolumeClick(e, track.id)}
										on:mousedown|stopPropagation
										title="Click to set volume: {Math.round((track.volume ?? 1.0) * 100)}%"
									>
										<div class="track-volume-bar">
											<div 
												class="track-volume-fill"
												style="height: {((track.volume ?? 1.0) / 2.0) * 100}%"
											></div>
										</div>
									</div>
									<span class="track-name">{track.name}</span>
									<button 
										class="track-delete" 
										on:click|stopPropagation={() => deleteTimelineTrack(track.id)}
										on:dragstart|stopPropagation
										title="Delete track"
									>
										×
									</button>
								</div>
								<div class="row-clips" style="width: {beatToPixel(timeline.totalLength)}px;">
									<!-- Grid lines -->
									{#each gridLines as line}
										<div 
											class="grid-line {line.isBar ? 'bar-line' : 'beat-line'}"
											style="left: {line.x}px;"
										></div>
									{/each}
									
									{#if track.type === 'pattern'}
										<!-- Pattern clips -->
										{#key PIXELS_PER_BEAT}
											{#each trackClips as clip}
												{@const clipPattern = findPatternById(clip.patternId)}
												{@const clipLeft = beatToPixel(clip.startBeat)}
												{@const clipWidth = Math.max(20, beatToPixel(clip.duration))}
											{#if clipPattern}
												<div
													class="timeline-clip {isDraggingClip?.id === clip.id && isDraggingClip?.type === 'clip' ? 'dragging' : ''}"
													style="
														left: {clipLeft}px;
														width: {clipWidth}px;
														background: {clipPattern.color}CC;
														border-color: {clipPattern.color};
													"
													on:mousedown={(e) => handleClipMouseDown(e, clip, 'clip')}
													on:click|stopPropagation={(e) => {
														// Only stop propagation if we're not resizing or dragging
														// This allows clicks to pass through when interacting with resize handles
														if (!isResizing && !isDraggingClip) {
															e.stopPropagation();
														}
													}}
												>
													<div class="clip-resize-handle-left" title="Drag to resize left edge"></div>
													<span class="clip-label">{clipPattern.name}</span>
													<div class="clip-controls">
														<button class="clip-delete" on:click|stopPropagation={() => deleteClip(clip.id)} title="Delete">×</button>
													</div>
													<div class="clip-resize-handle-right" title="Drag to resize right edge"></div>
												</div>
											{/if}
										{/each}
										{/key}
									{:else if track.type === 'effect'}
										<!-- Effect clips -->
										{#key PIXELS_PER_BEAT}
											{#each trackEffects as timelineEffect}
												{@const effect = effects.find((e) => e.id === timelineEffect.effectId)}
												{@const assignedPattern = findPatternById(timelineEffect.patternId)}
												{@const effectLeft = beatToPixel(timelineEffect.startBeat)}
												{@const effectWidth = Math.max(20, beatToPixel(timelineEffect.duration))}
											{#if effect}
												<div
													class="timeline-clip timeline-effect {selectedEffectId === timelineEffect.id ? 'selected' : ''} {isDraggingClip?.id === timelineEffect.id && isDraggingClip?.type === 'effect' ? 'dragging' : ''}"
													style="
														left: {effectLeft}px;
														width: {effectWidth}px;
														background: {effect.color}80;
														border-color: {effect.color};
													"
													role="button"
													tabindex="0"
													on:mousedown={(e) => handleClipMouseDown(e, timelineEffect, 'effect')}
													on:click={() => {
														if (!isResizing && !isDraggingClip) {
															selectedEffectId = timelineEffect.id;
															selectedEnvelopeId = null; // Clear envelope selection
														}
													}}
													on:keydown={(e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															e.preventDefault();
															selectedEffectId = timelineEffect.id;
															selectedEnvelopeId = null; // Clear envelope selection
														}
													}}
												>
													<div class="clip-resize-handle-left" title="Drag to resize left edge"></div>
													<span class="clip-label">
														{effect.name}
														{#if assignedPattern}
															<span class="pattern-badge">→ {assignedPattern.name}</span>
														{:else}
															<span class="pattern-badge global">Global</span>
														{/if}
													</span>
													<div class="clip-controls">
														<button class="clip-delete" on:click|stopPropagation={() => deleteTimelineEffect(timelineEffect.id)} title="Delete">×</button>
													</div>
													<div class="clip-resize-handle-right" title="Drag to resize right edge"></div>
												</div>
											{/if}
											{/each}
										{/key}
									{:else if track.type === 'envelope'}
										<!-- Envelope clips -->
										{#key PIXELS_PER_BEAT}
											{#each trackEnvelopes as timelineEnvelope}
												{@const envelope = envelopes.find((e) => e.id === timelineEnvelope.envelopeId)}
												{@const isSelected = selectedEnvelopeId === timelineEnvelope.id}
												{@const assignedPattern = findPatternById(timelineEnvelope.patternId)}
												{@const envelopeLeft = beatToPixel(timelineEnvelope.startBeat)}
												{@const envelopeWidth = Math.max(20, beatToPixel(timelineEnvelope.duration))}
											{#if envelope}
												<div
													class="timeline-clip timeline-envelope {isSelected ? 'selected' : ''} {isDraggingClip?.id === timelineEnvelope.id && isDraggingClip?.type === 'envelope' ? 'dragging' : ''}"
													style="
														left: {envelopeLeft}px;
														width: {envelopeWidth}px;
														background: {envelope.color}80;
														border-color: {envelope.color};
													"
													role="button"
													tabindex="0"
													on:mousedown={(e) => handleClipMouseDown(e, timelineEnvelope, 'envelope')}
													on:click={() => {
														if (!isResizing && !isDraggingClip) {
															selectedEnvelopeId = timelineEnvelope.id;
															selectedEffectId = null; // Clear effect selection
														}
													}}
													on:keydown={(e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															e.preventDefault();
															selectedEnvelopeId = timelineEnvelope.id;
															selectedEffectId = null; // Clear effect selection
														}
													}}
												>
													<div class="clip-resize-handle-left" title="Drag to resize left edge"></div>
													<span class="clip-label">
														{envelope.name}
														{#if assignedPattern}
															<span class="pattern-badge">→ {assignedPattern.name}</span>
														{:else}
															<span class="pattern-badge global">Global</span>
														{/if}
													</span>
													<div class="clip-controls">
														<button class="clip-delete" on:click|stopPropagation={() => deleteTimelineEnvelope(timelineEnvelope.id)} title="Delete">×</button>
													</div>
													<div class="clip-resize-handle-right" title="Drag to resize right edge"></div>
												</div>
											{/if}
											{/each}
										{/key}
									{/if}
								</div>
							</div>
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
							<AutomationCurveEditor window={$automationStore[0]} />
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
