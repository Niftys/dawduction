<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { fade } from 'svelte/transition';
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
	import EffectPluginWindow from '$lib/components/EffectPluginWindow.svelte';
	import { effectPluginStore } from '$lib/stores/effectPluginStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { generateEnvelopeCurvePath } from '$lib/utils/envelopeCurve';
	import { generateAutomationCurvePath } from '$lib/utils/automationCurve';
	import { TIMELINE_CONSTANTS, beatToPixel, pixelToBeat, snapToBeat, formatZoomDisplay, clampZoomLevel } from '$lib/utils/timelineUtils';
	import { generateRulerMarks, generateGridLines } from '$lib/utils/timelineRuler';
	import PatternSidebar from '$lib/components/timeline/PatternSidebar.svelte';
	import TimelineRuler from '$lib/components/timeline/TimelineRuler.svelte';
	import TimelineTrackRow from '$lib/components/timeline/TimelineTrackRow.svelte';
	import ProjectSkeleton from '$lib/components/skeletons/ProjectSkeleton.svelte';
	import WelcomeModal from '$lib/components/WelcomeModal.svelte';
	import '$lib/styles/components/ProjectView.css';
	import '$lib/styles/components/ArrangementView.css';

	let project: any;
	let playbackState: any;
	let isLoading = true;
	let timelineAreaElement: HTMLDivElement | null = null;
	let showWelcomeModal = false;
	let showDeletePatternConfirm = false;
	let patternToDelete: Pattern | null = null;
	
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
	let viewMode: 'arrangement' | 'pattern' = 'arrangement';
	$: viewMode = $viewStore || 'arrangement';
	
	// Sidebar width
	const sidebarWidth = 240;
	
	// Selected pattern for pattern view
	let selectedPatternId: string | null = null;
	
	// Rename state
	let editingPatternId: string | null = null;
	let editingEffectId: string | null = null;
	let editingEnvelopeId: string | null = null;
	
	// Update CSS variable for sidebar width - ensure it's set immediately
	if (typeof document !== 'undefined') {
		document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
	}
	$: if (typeof document !== 'undefined') {
		document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
	}

	// Function to check and show welcome modal
	function checkAndShowWelcomeModal() {
		if (typeof window === 'undefined') return;
		
		const projectId = $page.params.id;
		if (!projectId) return;
		
		// Check if modal has been shown for this project in this session
		const welcomeKey = `welcome_shown_${projectId}`;
		const hasShownWelcome = sessionStorage.getItem(welcomeKey);
		
		// Show modal if it hasn't been shown yet
		if (!hasShownWelcome) {
			// Mark as shown immediately to prevent multiple modals
			sessionStorage.setItem(welcomeKey, 'true');
			// Show modal after a short delay to ensure project is loaded
			setTimeout(() => {
				showWelcomeModal = true;
			}, 100);
		}
	}

	onMount(async () => {
		// Check if this is a sandbox project (starts with 'sandbox-')
		const isSandbox = $page.params.id?.startsWith('sandbox-');
		
		// Check authentication first (only in browser) - skip for sandbox
		if (typeof window !== 'undefined' && !isSandbox) {
			const user = await getCurrentUser();
			if (!user) {
				// Redirect to home if not authenticated (unless sandbox)
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
			// Check if welcome modal should be shown
			checkAndShowWelcomeModal();
			return;
		}
		
		// Skip database loading for sandbox projects
		if (isSandbox) {
			// Try to load from localStorage first
			if (typeof window !== 'undefined') {
				const saved = localStorage.getItem(`project_${$page.params.id}`);
				if (saved) {
					try {
						const loadedProject = JSON.parse(saved);
						projectStore.set(loadedProject);
						isLoading = false;
						// Check if welcome modal should be shown
						checkAndShowWelcomeModal();
						return;
					} catch (e) {
						console.error('Failed to load sandbox project from localStorage:', e);
					}
				}
			}
			
			// Sandbox project should already be in store from home page, or initialize if not
			if (!project || project.id !== $page.params.id) {
				// Initialize sandbox project if not already set
				projectStore.set({
					id: $page.params.id,
					title: 'Sandbox Project',
					bpm: 120,
					tracks: [],
					patterns: [],
					effects: [],
					envelopes: [],
					timeline: {
						tracks: [],
						clips: [],
						effects: [],
						envelopes: [],
						totalLength: 64
					}
				});
			}
			isLoading = false;
			// Check if welcome modal should be shown
			checkAndShowWelcomeModal();
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
						totalLength: 64 // 16 measures at 4/4 time (16 * 4 = 64 beats)
					}
				});
			}
			isLoading = false;
			// Check if welcome modal should be shown
			checkAndShowWelcomeModal();
		} else if (loadedProject) {
			// Check if we've already reloaded for this project to avoid infinite loop
			// Only reload on initial load, not on manual page reloads
			const reloadKey = `reloaded_${$page.params.id}`;
			const hasReloaded = typeof window !== 'undefined' ? sessionStorage.getItem(reloadKey) : null;
			
			if (!hasReloaded && typeof window !== 'undefined') {
				// Mark that we're about to reload BEFORE setting the project
				sessionStorage.setItem(reloadKey, 'true');
				// Set the project first
				projectStore.set(loadedProject);
				isLoading = false;
				// Small delay to ensure project is set in store before reload
				setTimeout(() => {
					window.location.reload();
				}, 100);
				return; // Exit early to prevent further execution
			}
			
			// If we've already reloaded, just set the project normally
			projectStore.set(loadedProject);
			isLoading = false;
			// Check if welcome modal should be shown
			checkAndShowWelcomeModal();
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
						totalLength: 64 // 16 measures at 4/4 time (16 * 4 = 64 beats)
					}
				});
			}
			isLoading = false;
			// Check if welcome modal should be shown
			checkAndShowWelcomeModal();
		}
		
		// Set CSS variable for sidebar width
		if (typeof document !== 'undefined') {
			document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
		}
	});
	
	// Set up localStorage auto-save for sandbox projects
	let unsubscribeAutoSave: (() => void) | null = null;
	let saveToLocalStorage: (() => void) | null = null;
	
	// Set up localStorage saving for sandbox projects
	$: if ($page.params.id && typeof window !== 'undefined') {
		const isSandbox = $page.params.id.startsWith('sandbox-');
		
		if (isSandbox && !unsubscribeAutoSave) {
			// Function to save project to localStorage
			saveToLocalStorage = () => {
				const currentProject = $projectStore;
				if (currentProject && $page.params.id) {
					try {
						localStorage.setItem(`project_${$page.params.id}`, JSON.stringify(currentProject));
					} catch (e) {
						console.error('[Project Page] Failed to save to localStorage:', e);
					}
				}
			};
			
			// Auto-save subscription - save whenever project changes
			unsubscribeAutoSave = projectStore.subscribe((p) => {
				if (p && $page.params.id && p.id.startsWith('sandbox-')) {
					// Debounce saves to avoid too many localStorage writes
					setTimeout(() => {
						if (saveToLocalStorage) {
							saveToLocalStorage();
						}
					}, 100);
				}
			});
			
			// Save on page unload
			window.addEventListener('beforeunload', saveToLocalStorage);
		}
	}
	
	// Force layout recalculation when arrangement view is first rendered
	$: if (project && !isLoading && viewMode === 'arrangement' && typeof window !== 'undefined') {
		// Use requestAnimationFrame to ensure DOM is ready
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const mainContent = document.querySelector('.main-content.has-sidebar');
				if (mainContent) {
					// Force a reflow to ensure the margin-left is applied
					(mainContent as HTMLElement).offsetHeight;
				}
			});
		});
	}

	onDestroy(() => {
		// Clean up click outside listener
		if (typeof window !== 'undefined') {
			if (clickOutsideListenerAttached) {
				window.removeEventListener('click', handleClickOutside);
				clickOutsideListenerAttached = false;
			}
			
			// Clean up localStorage auto-save
			if (saveToLocalStorage) {
				window.removeEventListener('beforeunload', saveToLocalStorage);
			}
			if (unsubscribeAutoSave) {
				unsubscribeAutoSave();
			}
		}
	});
	

	$: patterns = project?.patterns || [];
	$: effects = project?.effects || [];
	$: envelopes = project?.envelopes || [];
	$: timeline = project?.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
	
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

	function handleTimelineClick(e: MouseEvent) {
		// Don't handle clicks if we're interacting with clips
		if (isResizing || isDraggingClip) return;
		
		const target = e.target as HTMLElement;
		
		// CRITICAL: Check for dropdown menu elements FIRST before doing anything else
		if (target.closest('.add-track-menu') ||
		    target.closest('.add-track-dropdown-ruler') ||
		    target.closest('.add-track-trigger') ||
		    (target.tagName === 'BUTTON' && target.closest('.add-track-menu'))) {
			console.log('[handleTimelineClick] Ignoring click on dropdown menu');
			return;
		}
		
		// Don't handle clicks on interactive elements or the properties sidebar
		if (target.closest('.timeline-clip') || 
		    target.closest('.row-label') || 
		    target.closest('button') ||
		    target.closest('.timeline-ruler-container') ||
		    target.closest('.effect-envelope-properties')) {
			return;
		}
		
		// Deselect effect/envelope when clicking on empty timeline area
		selectedEffectId = null;
		selectedEnvelopeId = null;
	}

	async function handleRulerClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		
		// CRITICAL: Check for dropdown menu elements FIRST
		if (target.closest('.add-track-menu') ||
		    target.closest('.add-track-dropdown-ruler') ||
		    target.closest('.add-track-trigger') ||
		    (target.tagName === 'BUTTON' && target.closest('.add-track-menu'))) {
			console.log('[handleRulerClick] Ignoring click on dropdown menu');
			return;
		}
		
		// Don't handle clicks on the spacer or interactive elements
		if (target.closest('.ruler-label-spacer') || 
		    target.closest('button')) {
			return;
		}
		
		// Calculate the beat position from the click
		// The playhead is positioned at: ROW_LABEL_WIDTH + beatToPixel(beat)
		// So we need to calculate the click position relative to timeline-area
		if (!timelineAreaElement) return;
		
		const timelineRect = timelineAreaElement.getBoundingClientRect();
		const clickX = e.clientX - timelineRect.left;
		
		// Account for scroll position
		const scrollLeft = timelineAreaElement.scrollLeft;
		const absoluteX = clickX + scrollLeft;
		
		// Subtract the row label width to get position within the ruler content area
		// (same calculation as playhead positioning: ROW_LABEL_WIDTH + beatToPixel(beat))
		const adjustedX = absoluteX - ROW_LABEL_WIDTH;
		
		// Convert pixel position to beat
		const targetBeat = Math.max(0, snapToBeat(pixelToBeatLocal(adjustedX)));
		
		// Clamp to timeline length
		const clampedBeat = Math.min(targetBeat, timeline.totalLength || 0);
		
		// Get engine instance
		const engine = $engineStore;
		if (!engine) return;
		
		// Check if playback is currently active
		// Use multiple checks to be more reliable:
		// 1. Check if there are playing nodes (most reliable during active playback)
		// 2. Check if currentTime is advancing (indicates playback)
		// We'll preserve playback state if any of these indicate it's playing
		const hasPlayingNodes = playbackState?.playingNodes?.size > 0;
		const wasPlaying = hasPlayingNodes || (playbackState?.currentTime !== undefined && playbackState.currentTime > 0);
		
		// Seek to the clicked position
		if (wasPlaying) {
			// If playback is active, reload the project to reschedule events from the new position
			// This ensures all clips/events play correctly from the seek position
			const currentBpm = project?.bpm ?? 120;
			const currentViewMode = $viewStore;
			
			if (currentViewMode === 'arrangement' && project?.timeline && project.timeline.clips && project.timeline.clips.length > 0) {
				// Reload timeline in arrangement view
				await engine.loadProject(
					project.standaloneInstruments || [],
					currentBpm,
					project.baseMeterTrackId,
					project.timeline,
					project.patterns,
					project.effects,
					project.envelopes,
					project.automation
				);
			} else {
				// Pattern view - reload standalone instruments
				await engine.loadProject(
					project?.standaloneInstruments || [],
					currentBpm,
					project?.baseMeterTrackId,
					undefined,
					project?.patterns,
					project?.effects,
					project?.envelopes
				);
			}
			
			// Small delay to ensure loadProject completes before setting transport
			await new Promise(resolve => setTimeout(resolve, 10));
			
			// Seek to new position while keeping playback active
			// IMPORTANT: Must call setTransport AFTER loadProject to ensure playback continues
			engine.setTransport('play', clampedBeat);
			
			// Clear playedNodes so events can replay from the new position
			playbackStore.update((state) => ({
				...state,
				currentTime: clampedBeat,
				playedNodes: new Set(), // Clear so events can replay
				isLoopStart: false
				// Keep playingNodes as-is (they'll be updated by the engine)
			}));
			
			// Dispatch event immediately to notify Toolbar that playback is still active after seek
			// This ensures the play/pause button state stays correct
			window.dispatchEvent(new CustomEvent('playbackSeeked', { 
				detail: { position: clampedBeat, isPlaying: true } 
			}));
			
			// Also dispatch again after a short delay to ensure it's received
			// (in case the first one was missed due to timing)
			setTimeout(() => {
				window.dispatchEvent(new CustomEvent('playbackSeeked', { 
					detail: { position: clampedBeat, isPlaying: true } 
				}));
			}, 100);
		} else {
			// Playback is stopped, just move the playhead
			engine.setTransport('stop', clampedBeat);
			
			// Update playback store to reflect the new playhead position
			playbackStore.update((state) => ({
				...state,
				currentTime: clampedBeat
			}));
		}
		
		// Deselect effect/envelope when clicking on ruler
		selectedEffectId = null;
		selectedEnvelopeId = null;
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

	function copyPattern(patternId: string) {
		if (!project) {
			console.error('Cannot copy pattern: no project exists');
			return;
		}
		try {
			const duplicatedPattern = projectStore.duplicatePattern(patternId);
			if (duplicatedPattern) {
				// Optionally navigate to the new pattern
				// goto(`/project/${projectId}/pattern/${duplicatedPattern.id}`);
			}
		} catch (error) {
			console.error('Error copying pattern:', error);
		}
	}

	function deletePattern(patternId: string) {
		const pattern = project?.patterns?.find((p: Pattern) => p.id === patternId);
		if (pattern) {
			patternToDelete = pattern;
			showDeletePatternConfirm = true;
		}
	}
	
	function handleDeletePatternConfirm() {
		if (!patternToDelete) return;
		projectStore.deletePattern(patternToDelete.id);
		showDeletePatternConfirm = false;
		patternToDelete = null;
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
		// Reload project if in arrangement view to update engine
		// The reload handler will preserve playback if it was playing
		if (viewMode === 'arrangement') {
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
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
	let isResizing: { type: 'clip' | 'effect' | 'envelope', id: string, side: 'left' | 'right', startBeat: number, startDuration: number, startX: number, startScrollLeft: number } | null = null;
	let isDraggingClip: { type: 'clip' | 'effect' | 'envelope', id: string, startBeat: number, startX: number, startScrollLeft: number } | null = null;
	
	// Auto-scroll state
	let autoScrollInterval: ReturnType<typeof setInterval> | null = null;
	let autoScrollDirection: 'left' | 'right' | null = null;
	let lastMouseX: number | null = null;
	let currentMouseX: number | null = null;

	function handleDragStart(e: DragEvent, patternId: string) {
		if (viewMode !== 'arrangement') return;
		draggedPatternId = patternId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copy';
			e.dataTransfer.setData('text/plain', patternId);
			e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pattern', id: patternId }));
		}
	}
	
	// Touch drag start for mobile (sets drag state without DragEvent)
	function handleTouchDragStart(patternId: string) {
		if (viewMode !== 'arrangement') return;
		draggedPatternId = patternId;
	}
	
	function handleEffectEnvelopeTouchDragStart(data: { type: 'effect' | 'envelope', id: string }) {
		if (viewMode !== 'arrangement') return;
		if (data.type === 'effect') {
			draggedEffectId = data.id;
		} else {
			draggedEnvelopeId = data.id;
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

	function handleDragOver(e: DragEvent, patternId?: string, rowType?: 'pattern' | 'effect' | 'envelope') {
		if (viewMode !== 'arrangement') return;
		
		// Check what's being dragged
		let dragType: 'effect' | 'envelope' | 'pattern' | null = null;
		
		// First, try to get drag type from JSON data
		try {
			const dragData = e.dataTransfer?.getData('application/json');
			if (dragData) {
				const data = JSON.parse(dragData);
				if (data.type === 'effect' || data.type === 'envelope' || data.type === 'pattern') {
					dragType = data.type;
				}
			}
		} catch (err) {
			// Not JSON data, continue
		}
		
		// If no drag type from JSON, check state variables (for touch drags)
		if (!dragType) {
			if (draggedEffectId) {
				dragType = 'effect';
			} else if (draggedEnvelopeId) {
				dragType = 'envelope';
			} else if (draggedPatternId) {
				dragType = 'pattern';
			}
		}
		
		// If we know what's being dragged, check if types match
		if (dragType && rowType) {
			if (dragType === 'effect' && rowType !== 'effect') {
				// Dragging effect but not over effect track - reject
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'none';
				}
				return;
			}
			if (dragType === 'envelope' && rowType !== 'envelope') {
				// Dragging envelope but not over envelope track - reject
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'none';
				}
				return;
			}
			if (dragType === 'pattern' && rowType !== 'pattern') {
				// Dragging pattern but not over pattern track - reject
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'none';
				}
				return;
			}
			// Types match - allow drag over
		}
		// If we don't know what's being dragged or rowType, allow it (might be track reordering or other drag)
		
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = dragType ? 'copy' : 'move';
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
				// If dropped on a pattern row, attach to that row's timeline track (per-track insert)
				const targetTimelineTrackId = isPatternRow && patternId ? patternId : undefined;
				
				if (data.type === 'effect' && data.id && rowType === 'effect') {
					// trackId will be determined in addEffectToTimeline if not provided
					addEffectToTimeline(data.id, beat, 4, targetTimelineTrackId);
					draggedEffectId = null;
					return;
				} else if (data.type === 'envelope' && data.id && rowType === 'envelope') {
					// trackId will be determined in addEnvelopeToTimeline if not provided
					addEnvelopeToTimeline(data.id, beat, 4, targetTimelineTrackId);
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
			const startScrollLeft = timelineAreaElement?.scrollLeft || 0;
			isResizing = {
				type,
				id: clip.id,
				side,
				startBeat: clip.startBeat,
				startDuration: clip.duration,
				startX,
				startScrollLeft
			};
		} else {
			// Start dragging the clip - begin batching for undo/redo
			projectStore.startBatch();
			const clipContainer = e.currentTarget as HTMLElement;
			if (!clipContainer) return;
			const rect = clipContainer.closest('.timeline-area')?.getBoundingClientRect();
			if (!rect) return;
			
			const startX = e.clientX - rect.left - ROW_LABEL_WIDTH;
			const startScrollLeft = timelineAreaElement?.scrollLeft || 0;
			isDraggingClip = {
				type,
				id: clip.id,
				startBeat: clip.startBeat,
				startX,
				startScrollLeft
			};
		}
	}

	// Touch drag delay state for timeline clips (prevents accidental drags)
	let clipDragDelayTimeout: ReturnType<typeof setTimeout> | null = null;
	let pendingClipDrag: { clip: TimelineClip | TimelineEffect | TimelineEnvelope; type: 'clip' | 'effect' | 'envelope'; startX: number; touch: Touch } | null = null;

	// Touch equivalent of handleClipMouseDown for mobile drag/resize in arrangement view
	function handleClipTouchStart(e: TouchEvent, clip: TimelineClip | TimelineEffect | TimelineEnvelope, type: 'clip' | 'effect' | 'envelope' = 'clip') {
		if (!timelineAreaElement) return;
		if (!e.touches || e.touches.length === 0) return;
		e.stopPropagation();

		const touch = e.touches[0];
		const target = e.target as HTMLElement;

		// Check if touching a resize handle - no delay for resize
		const resizeHandle = target.closest('.clip-resize-handle-left, .clip-resize-handle-right') as HTMLElement;
		if (resizeHandle) {
			// Clear any pending drag
			if (clipDragDelayTimeout) {
				clearTimeout(clipDragDelayTimeout);
				clipDragDelayTimeout = null;
			}
			pendingClipDrag = null;
			
			projectStore.startBatch();
			const side = resizeHandle.classList.contains('clip-resize-handle-left') ? 'left' : 'right';
			const clipContainer = e.currentTarget as HTMLElement;
			if (!clipContainer) return;
			const rect = clipContainer.closest('.timeline-area')?.getBoundingClientRect();
			if (!rect) return;

			const startX = touch.clientX - rect.left - ROW_LABEL_WIDTH;
			isResizing = {
				type,
				id: clip.id,
				side,
				startBeat: clip.startBeat,
				startDuration: clip.duration,
				startX
			};
		} else {
			// For dragging, require 100ms pause before starting
			// Clear any existing pending drag
			if (clipDragDelayTimeout) {
				clearTimeout(clipDragDelayTimeout);
				clipDragDelayTimeout = null;
			}
			
			const clipContainer = e.currentTarget as HTMLElement;
			if (!clipContainer) return;
			const rect = clipContainer.closest('.timeline-area')?.getBoundingClientRect();
			if (!rect) return;

			const startX = touch.clientX - rect.left - ROW_LABEL_WIDTH;
			
			// Store pending drag info
			pendingClipDrag = {
				clip,
				type,
				startX,
				touch
			};
			
			// Start drag after 100ms delay
			clipDragDelayTimeout = setTimeout(() => {
				if (pendingClipDrag) {
					projectStore.startBatch();
					isDraggingClip = {
						type: pendingClipDrag.type,
						id: pendingClipDrag.clip.id,
						startBeat: pendingClipDrag.clip.startBeat,
						startX: pendingClipDrag.startX,
						startScrollLeft: timelineAreaElement?.scrollLeft || 0
					};
					pendingClipDrag = null;
					clipDragDelayTimeout = null;
				}
			}, 100);
		}
	}
	
	// Cancel pending drag if touch moves or ends before delay completes
	function handleClipTouchMove(e: TouchEvent) {
		if (pendingClipDrag && e.touches.length > 0) {
			const touch = e.touches[0];
			const moveX = touch.clientX - pendingClipDrag.touch.clientX;
			const moveY = touch.clientY - pendingClipDrag.touch.clientY;
			const distanceSq = moveX * moveX + moveY * moveY;
			
			// If moved more than 5px, cancel pending drag (user is scrolling/panning)
			if (distanceSq > 25) {
				if (clipDragDelayTimeout) {
					clearTimeout(clipDragDelayTimeout);
					clipDragDelayTimeout = null;
				}
				pendingClipDrag = null;
			}
		}
	}
	
	function handleClipTouchEnd() {
		if (clipDragDelayTimeout) {
			clearTimeout(clipDragDelayTimeout);
			clipDragDelayTimeout = null;
		}
		pendingClipDrag = null;
	}
	
	function handleTimelineMouseMove(e: MouseEvent) {
		// Only process if we're actually resizing or dragging
		if (!isResizing && !isDraggingClip) return;
		if (!e || !e.currentTarget) return;
		
		const target = e.currentTarget;
		if (!target) return;
		
		const rect = target.getBoundingClientRect();
		if (!rect) return;
		
		// Auto-scroll when mouse is near viewport edges
		// Speed matches cursor movement to keep cursor on drag handle
		if (timelineAreaElement) {
			const mouseX = e.clientX;
			currentMouseX = mouseX; // Update tracked mouse position
			const viewportRect = timelineAreaElement.getBoundingClientRect();
			const edgeThreshold = 100; // pixels from edge to trigger scroll
			
			// Track mouse movement to match scroll speed
			const mouseDeltaX = lastMouseX !== null ? mouseX - lastMouseX : 0;
			lastMouseX = mouseX;
			
			// Clear existing auto-scroll if mouse moved away from edge
			const isNearRightEdge = mouseX > viewportRect.right - edgeThreshold;
			const isNearLeftEdge = mouseX < viewportRect.left + edgeThreshold;
			
			if (!isNearRightEdge && !isNearLeftEdge) {
				if (autoScrollInterval) {
					clearInterval(autoScrollInterval);
					autoScrollInterval = null;
					autoScrollDirection = null;
				}
			}
			
			// Check if mouse is near right edge
			if (isNearRightEdge) {
				const maxScroll = timelineAreaElement.scrollWidth - timelineAreaElement.clientWidth;
				if (timelineAreaElement.scrollLeft < maxScroll) {
					// Clear existing interval if direction changed
					if (autoScrollDirection !== 'right' && autoScrollInterval) {
						clearInterval(autoScrollInterval);
						autoScrollInterval = null;
					}
					
					if (!autoScrollInterval) {
						autoScrollDirection = 'right';
						autoScrollInterval = setInterval(() => {
							if (!timelineAreaElement || currentMouseX === null) {
								if (autoScrollInterval) clearInterval(autoScrollInterval);
								autoScrollInterval = null;
								return;
							}
							
							const viewportRect = timelineAreaElement.getBoundingClientRect();
							const distanceFromEdge = viewportRect.right - currentMouseX;
							
							// Only scroll if still near edge
							if (currentMouseX > viewportRect.right - edgeThreshold) {
								const normalizedDistance = Math.max(0, Math.min(1, distanceFromEdge / edgeThreshold));
								// Use a smooth curve for better feel
								const speedMultiplier = 1 - (normalizedDistance * normalizedDistance);
								// Base speed from cursor movement, with smooth acceleration
								const baseSpeed = Math.abs(mouseDeltaX) || 2; // Minimum 2px/frame
								const scrollSpeed = Math.min(12, baseSpeed * (1 + speedMultiplier * 1.5)); // Cap at 12px/frame
								
								const maxScroll = timelineAreaElement.scrollWidth - timelineAreaElement.clientWidth;
								if (timelineAreaElement.scrollLeft < maxScroll) {
									timelineAreaElement.scrollLeft = Math.min(
										maxScroll,
										timelineAreaElement.scrollLeft + scrollSpeed
									);
								} else {
									if (autoScrollInterval) clearInterval(autoScrollInterval);
									autoScrollInterval = null;
									autoScrollDirection = null;
								}
							} else {
								if (autoScrollInterval) clearInterval(autoScrollInterval);
								autoScrollInterval = null;
								autoScrollDirection = null;
							}
						}, 16); // ~60fps
					}
				}
			}
			// Check if mouse is near left edge
			else if (isNearLeftEdge) {
				if (timelineAreaElement.scrollLeft > 0) {
					if (autoScrollDirection !== 'left' && autoScrollInterval) {
						clearInterval(autoScrollInterval);
						autoScrollInterval = null;
					}
					
					if (!autoScrollInterval) {
						autoScrollDirection = 'left';
						autoScrollInterval = setInterval(() => {
							if (!timelineAreaElement || currentMouseX === null) {
								if (autoScrollInterval) clearInterval(autoScrollInterval);
								autoScrollInterval = null;
								return;
							}
							
							const viewportRect = timelineAreaElement.getBoundingClientRect();
							const distanceFromEdge = currentMouseX - viewportRect.left;
							
							// Only scroll if still near edge
							if (currentMouseX < viewportRect.left + edgeThreshold) {
								const normalizedDistance = Math.max(0, Math.min(1, distanceFromEdge / edgeThreshold));
								const speedMultiplier = 1 - (normalizedDistance * normalizedDistance);
								const baseSpeed = Math.abs(mouseDeltaX) || 2;
								const scrollSpeed = Math.min(12, baseSpeed * (1 + speedMultiplier * 1.5));
								
								if (timelineAreaElement.scrollLeft > 0) {
									timelineAreaElement.scrollLeft = Math.max(
										0,
										timelineAreaElement.scrollLeft - scrollSpeed
									);
								} else {
									if (autoScrollInterval) clearInterval(autoScrollInterval);
									autoScrollInterval = null;
									autoScrollDirection = null;
								}
							} else {
								if (autoScrollInterval) clearInterval(autoScrollInterval);
								autoScrollInterval = null;
								autoScrollDirection = null;
							}
						}, 16); // ~60fps
					}
				}
			}
		}
		
		if (isResizing) {
			const resize = isResizing; // Capture for type narrowing
			const currentX = e.clientX - rect.left - ROW_LABEL_WIDTH;
			// Account for scroll offset change during drag
			const scrollDelta = (timelineAreaElement?.scrollLeft || 0) - resize.startScrollLeft;
			const deltaX = currentX - resize.startX + scrollDelta;
			const deltaBeat = pixelToBeatLocal(deltaX);
			
			if (resize.type === 'clip') {
				const clip = timeline.clips?.find((c: TimelineClip) => c.id === resize.id);
				if (clip) {
					let newStart = clip.startBeat;
					let newDuration = clip.duration;
					
					if (resize.side === 'right') {
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineClip(resize.id, { duration: newDuration });
					} else {
						newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineClip(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
					
					// Auto-expand timeline if clip extends past current end
					const clipEnd = newStart + newDuration;
					if (clipEnd > timeline.totalLength && timelineAreaElement) {
						// Expand timeline to accommodate the clip (with some padding)
						const expandedLength = Math.ceil(clipEnd / 4) * 4; // Round up to next measure
						projectStore.updateTimelineLength(expandedLength);
						
						// Auto-scroll to keep the clip visible
						const clipEndPixel = beatToPixelLocal(clipEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (clipEndPixel > visibleEnd - 50) { // 50px padding
							timelineAreaElement.scrollLeft = clipEndPixel - timelineAreaElement.clientWidth + 100; // Extra padding
						}
					}
				}
			} else if (resize.type === 'effect') {
				const effect = timeline.effects?.find((e) => e.id === resize.id);
				if (effect) {
					let newStart = effect.startBeat;
					let newDuration = effect.duration;
					
					if (resize.side === 'right') {
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineEffect(resize.id, { duration: newDuration });
					} else {
						newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineEffect(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
					
					// Auto-expand timeline if effect extends past current end
					const effectEnd = newStart + newDuration;
					if (effectEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(effectEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const effectEndPixel = beatToPixelLocal(effectEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (effectEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = effectEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			} else if (resize.type === 'envelope') {
				const envelope = timeline.envelopes?.find((e) => e.id === resize.id);
				if (envelope) {
					let newStart = envelope.startBeat;
					let newDuration = envelope.duration;
					
					if (resize.side === 'right') {
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineEnvelope(resize.id, { duration: newDuration });
					} else {
						newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineEnvelope(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
					
					// Auto-expand timeline if envelope extends past current end
					const envelopeEnd = newStart + newDuration;
					if (envelopeEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(envelopeEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const envelopeEndPixel = beatToPixelLocal(envelopeEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (envelopeEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = envelopeEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			}
		} else if (isDraggingClip) {
			const drag = isDraggingClip; // Capture for type narrowing
			const currentX = e.clientX - rect.left - ROW_LABEL_WIDTH;
			// Account for scroll offset change during drag
			const scrollDelta = (timelineAreaElement?.scrollLeft || 0) - drag.startScrollLeft;
			const deltaX = currentX - drag.startX + scrollDelta;
			const deltaBeat = pixelToBeatLocal(deltaX);
			const newStart = Math.max(0, snapToBeat(drag.startBeat + deltaBeat));
			
			if (drag.type === 'clip') {
				const clip = timeline.clips?.find((c: TimelineClip) => c.id === drag.id);
				if (clip) {
					projectStore.updateTimelineClip(drag.id, { startBeat: newStart });
					
					// Auto-expand timeline if clip is dragged past current end
					const clipEnd = newStart + clip.duration;
					if (clipEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(clipEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						// Auto-scroll to keep the clip visible
						const clipEndPixel = beatToPixelLocal(clipEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (clipEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = clipEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			} else if (drag.type === 'effect') {
				const effect = timeline.effects?.find((e) => e.id === drag.id);
				if (effect) {
					projectStore.updateTimelineEffect(drag.id, { startBeat: newStart });
					
					const effectEnd = newStart + effect.duration;
					if (effectEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(effectEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const effectEndPixel = beatToPixelLocal(effectEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (effectEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = effectEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			} else if (drag.type === 'envelope') {
				const envelope = timeline.envelopes?.find((e) => e.id === drag.id);
				if (envelope) {
					projectStore.updateTimelineEnvelope(drag.id, { startBeat: newStart });
					
					const envelopeEnd = newStart + envelope.duration;
					if (envelopeEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(envelopeEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const envelopeEndPixel = beatToPixelLocal(envelopeEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (envelopeEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = envelopeEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			}
		}
	}

	// Touch move equivalent for clip drag/resize
	function handleTimelineTouchMove(e: TouchEvent) {
		// Only process if we're actually resizing or dragging
		if (!isResizing && !isDraggingClip) return;
		if (!e || !e.currentTarget) return;

		const target = e.currentTarget as HTMLElement;
		if (!target) return;

		const rect = target.getBoundingClientRect();
		if (!rect) return;
		
		const touch = e.touches[0];
		if (!touch) return;

		const clientX = touch.clientX;
		
		// Auto-scroll when touch is near viewport edges
		if (timelineAreaElement) {
			const touchX = touch.clientX;
			const viewportRect = timelineAreaElement.getBoundingClientRect();
			const edgeThreshold = 80; // pixels from edge to trigger scroll
			const scrollSpeed = 15; // pixels to scroll per interval
			
			// Clear existing auto-scroll
			if (autoScrollInterval) {
				clearInterval(autoScrollInterval);
				autoScrollInterval = null;
				autoScrollDirection = null;
			}
			
			// Check if touch is near right edge
			if (touchX > viewportRect.right - edgeThreshold) {
				const maxScroll = timelineAreaElement.scrollWidth - timelineAreaElement.clientWidth;
				if (timelineAreaElement.scrollLeft < maxScroll) {
					autoScrollDirection = 'right';
					autoScrollInterval = setInterval(() => {
						if (!timelineAreaElement) {
							if (autoScrollInterval) clearInterval(autoScrollInterval);
							autoScrollInterval = null;
							return;
						}
						const maxScroll = timelineAreaElement.scrollWidth - timelineAreaElement.clientWidth;
						if (timelineAreaElement.scrollLeft < maxScroll) {
							timelineAreaElement.scrollLeft = Math.min(
								maxScroll,
								timelineAreaElement.scrollLeft + scrollSpeed
							);
						} else {
							if (autoScrollInterval) clearInterval(autoScrollInterval);
							autoScrollInterval = null;
							autoScrollDirection = null;
						}
					}, 16); // ~60fps
				}
			}
			// Check if touch is near left edge
			else if (touchX < viewportRect.left + edgeThreshold) {
				if (timelineAreaElement.scrollLeft > 0) {
					autoScrollDirection = 'left';
					autoScrollInterval = setInterval(() => {
						if (!timelineAreaElement) {
							if (autoScrollInterval) clearInterval(autoScrollInterval);
							autoScrollInterval = null;
							return;
						}
						if (timelineAreaElement.scrollLeft > 0) {
							timelineAreaElement.scrollLeft = Math.max(
								0,
								timelineAreaElement.scrollLeft - scrollSpeed
							);
						} else {
							if (autoScrollInterval) clearInterval(autoScrollInterval);
							autoScrollInterval = null;
							autoScrollDirection = null;
						}
					}, 16); // ~60fps
				}
			}
		}

		if (isResizing) {
			const resize = isResizing;
			const currentX = clientX - rect.left - ROW_LABEL_WIDTH;
			// Account for scroll offset change during drag
			const scrollDelta = (timelineAreaElement?.scrollLeft || 0) - resize.startScrollLeft;
			const deltaX = currentX - resize.startX + scrollDelta;
			const deltaBeat = pixelToBeatLocal(deltaX);

			if (resize.type === 'clip') {
				const clip = timeline.clips?.find((c: TimelineClip) => c.id === resize.id);
				if (clip) {
					let newStart = clip.startBeat;
					let newDuration = clip.duration;
					
					if (resize.side === 'right') {
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineClip(resize.id, { duration: newDuration });
					} else {
						newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineClip(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
					
					// Auto-expand timeline if clip extends past current end
					const clipEnd = newStart + newDuration;
					if (clipEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(clipEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const clipEndPixel = beatToPixelLocal(clipEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (clipEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = clipEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			} else if (resize.type === 'effect') {
				const effect = timeline.effects?.find((e) => e.id === resize.id);
				if (effect) {
					let newStart = effect.startBeat;
					let newDuration = effect.duration;
					
					if (resize.side === 'right') {
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineEffect(resize.id, { duration: newDuration });
					} else {
						newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineEffect(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
					
					const effectEnd = newStart + newDuration;
					if (effectEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(effectEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const effectEndPixel = beatToPixelLocal(effectEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (effectEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = effectEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			} else if (resize.type === 'envelope') {
				const envelope = timeline.envelopes?.find((e) => e.id === resize.id);
				if (envelope) {
					let newStart = envelope.startBeat;
					let newDuration = envelope.duration;
					
					if (resize.side === 'right') {
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration + deltaBeat));
						projectStore.updateTimelineEnvelope(resize.id, { duration: newDuration });
					} else {
						newStart = Math.max(0, snapToBeat(resize.startBeat + deltaBeat));
						newDuration = Math.max(0.25, snapToBeat(resize.startDuration - deltaBeat));
						if (newDuration > 0) {
							projectStore.updateTimelineEnvelope(resize.id, { startBeat: newStart, duration: newDuration });
						}
					}
					
					const envelopeEnd = newStart + newDuration;
					if (envelopeEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(envelopeEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const envelopeEndPixel = beatToPixelLocal(envelopeEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (envelopeEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = envelopeEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			}
		} else if (isDraggingClip) {
			const drag = isDraggingClip;
			const currentX = clientX - rect.left - ROW_LABEL_WIDTH;
			// Account for scroll offset change during drag
			const scrollDelta = (timelineAreaElement?.scrollLeft || 0) - drag.startScrollLeft;
			const deltaX = currentX - drag.startX + scrollDelta;
			const deltaBeat = pixelToBeatLocal(deltaX);
			const newStart = Math.max(0, snapToBeat(drag.startBeat + deltaBeat));

			if (drag.type === 'clip') {
				const clip = timeline.clips?.find((c: TimelineClip) => c.id === drag.id);
				if (clip) {
					projectStore.updateTimelineClip(drag.id, { startBeat: newStart });
					
					const clipEnd = newStart + clip.duration;
					if (clipEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(clipEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const clipEndPixel = beatToPixelLocal(clipEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (clipEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = clipEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			} else if (drag.type === 'effect') {
				const effect = timeline.effects?.find((e) => e.id === drag.id);
				if (effect) {
					projectStore.updateTimelineEffect(drag.id, { startBeat: newStart });
					
					const effectEnd = newStart + effect.duration;
					if (effectEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(effectEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const effectEndPixel = beatToPixelLocal(effectEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (effectEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = effectEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			} else if (drag.type === 'envelope') {
				const envelope = timeline.envelopes?.find((e) => e.id === drag.id);
				if (envelope) {
					projectStore.updateTimelineEnvelope(drag.id, { startBeat: newStart });
					
					const envelopeEnd = newStart + envelope.duration;
					if (envelopeEnd > timeline.totalLength && timelineAreaElement) {
						const expandedLength = Math.ceil(envelopeEnd / 4) * 4;
						projectStore.updateTimelineLength(expandedLength);
						
						const envelopeEndPixel = beatToPixelLocal(envelopeEnd) + ROW_LABEL_WIDTH;
						const visibleEnd = timelineAreaElement.scrollLeft + timelineAreaElement.clientWidth;
						if (envelopeEndPixel > visibleEnd - 50) {
							timelineAreaElement.scrollLeft = envelopeEndPixel - timelineAreaElement.clientWidth + 100;
						}
					}
				}
			}
		}

		e.preventDefault();
	}
	
	function handleTimelineMouseUp() {
		// Stop auto-scroll
		if (autoScrollInterval) {
			clearInterval(autoScrollInterval);
			autoScrollInterval = null;
			autoScrollDirection = null;
		}
		lastMouseX = null;
		currentMouseX = null;
		
		// End batching if we were dragging or resizing
		if (isResizing || isDraggingClip) {
			projectStore.endBatch();
			// Reload project if in arrangement view to update engine with clip changes
			// The reload handler will preserve playback if it was playing
			if (viewMode === 'arrangement') {
				window.dispatchEvent(new CustomEvent('reloadProject'));
			}
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
		} else {
			// Clicked on empty area of non-pattern track - deselect effect/envelope
			selectedEffectId = null;
			selectedEnvelopeId = null;
		}
	}
	
	// Touch drop handler for mobile - handles dropping patterns/effects/envelopes from sidebar
	function handleRowTouchEnd(e: TouchEvent, track: TimelineTrack) {
		if (viewMode !== 'arrangement' || !e.changedTouches || e.changedTouches.length === 0) return;
		
		const touch = e.changedTouches[0];
		const target = e.target as HTMLElement;
		
		// Don't drop if touching a clip or controls
		if (target && (
			target.closest('.timeline-clip') || 
			target.closest('.clip-controls') || 
			target.closest('.clip-resize-handle-left') ||
			target.closest('.clip-resize-handle-right') ||
			target.closest('button')
		)) return;
		
		const rowTarget = e.currentTarget as HTMLElement;
		if (!rowTarget) return;
		const rect = rowTarget.getBoundingClientRect();
		const x = touch.clientX - rect.left - ROW_LABEL_WIDTH;
		const beat = Math.max(0, snapToBeat(pixelToBeatLocal(x)));
		
		// Check for dragged pattern
		if (draggedPatternId && track.type === 'pattern') {
			if (track.patternId === draggedPatternId) {
				addClipToTimeline(draggedPatternId, beat, track.id);
				draggedPatternId = null;
			}
		}
		
		// Check for dragged effect
		if (draggedEffectId && track.type === 'effect') {
			addEffectToTimeline(draggedEffectId, beat, 4, undefined, track.id);
			draggedEffectId = null;
		}
		
		// Check for dragged envelope
		if (draggedEnvelopeId && track.type === 'envelope') {
			addEnvelopeToTimeline(draggedEnvelopeId, beat, 4, undefined, track.id);
			draggedEnvelopeId = null;
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

	function addEffectToTimeline(effectId: string, startBeat: number, duration: number, targetTimelineTrackId?: string, effectTrackRowId?: string) {
		if (!project) return;
		
		// If no trackId provided, find or create an effect track
		let effectRowId = effectTrackRowId;
		if (!effectRowId) {
			const existingTrack = timeline.tracks?.find((t) => t.type === 'effect');
			if (existingTrack) {
				effectRowId = existingTrack.id;
			} else {
				// Create a new effect track
				const newTrack = projectStore.createTimelineTrack('effect');
				projectStore.addTimelineTrack(newTrack);
				effectRowId = newTrack.id;
			}
		}
		
		const newEffect: TimelineEffect = {
			id: crypto.randomUUID(),
			effectId,
			trackId: effectRowId,
			startBeat: snapToBeat(startBeat),
			duration,
			// Per-track insert if provided
			targetTrackId: targetTimelineTrackId || undefined
		};
		projectStore.addTimelineEffect(newEffect);
		
		// Reload project if playing in arrangement view
		if (viewMode === 'arrangement') {
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
	}

	function addEnvelopeToTimeline(envelopeId: string, startBeat: number, duration: number, targetTimelineTrackId?: string, envelopeTrackRowId?: string) {
		if (!project) return;
		
		// If no trackId provided, find or create an envelope track
		let envelopeRowId = envelopeTrackRowId;
		if (!envelopeRowId) {
			const existingTrack = timeline.tracks?.find((t) => t.type === 'envelope');
			if (existingTrack) {
				envelopeRowId = existingTrack.id;
			} else {
				// Create a new envelope track
				const newTrack = projectStore.createTimelineTrack('envelope');
				projectStore.addTimelineTrack(newTrack);
				envelopeRowId = newTrack.id;
			}
		}
		
		const newEnvelope: TimelineEnvelope = {
			id: crypto.randomUUID(),
			envelopeId,
			trackId: envelopeRowId,
			startBeat: snapToBeat(startBeat),
			duration,
			// Per-track insert if provided
			targetTrackId: targetTimelineTrackId || undefined
		};
		projectStore.addTimelineEnvelope(newEnvelope);
		
		// Reload project if playing in arrangement view
		if (viewMode === 'arrangement') {
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
	}

	function deleteTimelineEffect(effectId: string) {
		projectStore.deleteTimelineEffect(effectId);
		// Reload project if in arrangement view to update engine
		// The reload handler will preserve playback if it was playing
		if (viewMode === 'arrangement') {
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
	}

	function deleteTimelineEnvelope(envelopeId: string) {
		projectStore.deleteTimelineEnvelope(envelopeId);
		// Reload project if in arrangement view to update engine
		// The reload handler will preserve playback if it was playing
		if (viewMode === 'arrangement') {
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}
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
		console.log('[createTimelineTrack] Called with type:', type, 'project exists:', !!project);
		if (!project) {
			console.error('[createTimelineTrack] No project available');
			return;
		}
		
		try {
			const newTrack = projectStore.createTimelineTrack(type, patternId);
			console.log('[createTimelineTrack] Track created:', newTrack);
			projectStore.addTimelineTrack(newTrack);
			console.log('[createTimelineTrack] Track added to store');
			showAddTrackMenu = false;
			console.log('[createTimelineTrack] Menu closed');
		} catch (error) {
			console.error('[createTimelineTrack] Error creating track:', error);
		}
	}

	function updateTimelineTrackName(trackId: string, name: string) {
		projectStore.updateTimelineTrack(trackId, { name: name.trim() || 'Track' });
	}
	
	function toggleAddTrackMenu() {
		console.log('[toggleAddTrackMenu] Current state:', showAddTrackMenu);
		showAddTrackMenu = !showAddTrackMenu;
		console.log('[toggleAddTrackMenu] New state:', showAddTrackMenu);
	}
	
	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (!showAddTrackMenu) return;
		
		const target = event.target as HTMLElement;
		console.log('[handleClickOutside] Target:', target, 'closest menu:', target.closest('.add-track-menu'));
		
		// Don't close if clicking inside the dropdown trigger, menu, or any button within
		// Check multiple selectors to be thorough
		if (target.closest('.add-track-dropdown-ruler') || 
		    target.closest('.add-track-menu') ||
		    target.closest('.add-track-trigger') ||
		    (target.tagName === 'BUTTON' && target.closest('.add-track-menu'))) {
			console.log('[handleClickOutside] Click was inside menu, not closing');
			return;
		}
		
		console.log('[handleClickOutside] Click was outside, closing menu');
		showAddTrackMenu = false;
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
	// Use a ref to track if listener is attached to avoid duplicate listeners
	let clickOutsideListenerAttached = false;
	
	$: if (showAddTrackMenu && typeof window !== 'undefined' && !clickOutsideListenerAttached) {
		// Use nextTick to ensure listener is added after current event cycle
		// This allows the button click to fire first
		tick().then(() => {
			// Use capture phase false (bubble phase) so button clicks fire first
			window.addEventListener('click', handleClickOutside, false);
			clickOutsideListenerAttached = true;
		});
	} else if (!showAddTrackMenu && typeof window !== 'undefined' && clickOutsideListenerAttached) {
		window.removeEventListener('click', handleClickOutside, false);
		clickOutsideListenerAttached = false;
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

	function toggleTrackCollapse(trackId: string) {
		if (!project || !project.timeline) return;
		const track = project.timeline.tracks.find((t: TimelineTrack) => t.id === trackId);
		if (!track) return;
		
		const newCollapsed = !(track.collapsed ?? false);
		projectStore.updateTimelineTrack(trackId, { collapsed: newCollapsed });
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
		const unsubscribe = projectStore.subscribe((p) => {
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
		});
		
		return () => {
			unsubscribe();
		};
	});
</script>

<style>
	/* Delete Pattern Confirmation Dialog Styles */
	.delete-dialog-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		backdrop-filter: blur(4px);
	}

	.delete-dialog {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 12px;
		padding: 2rem;
		max-width: 400px;
		width: 90%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.delete-dialog h3 {
		margin: 0 0 1rem 0;
		color: #ffffff;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.delete-dialog p {
		margin: 0 0 1.5rem 0;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.5;
	}

	.dialog-buttons {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.cancel-button,
	.delete-button {
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.cancel-button {
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.cancel-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.delete-button {
		background: #ff4444;
		color: #ffffff;
	}

	.delete-button:hover {
		background: #ff3333;
	}

	/* Ensure margin is set immediately via CSS for arrangement view */
	/* Use :global() since this is a scoped style block */
	:global(.project-view .main-content.has-sidebar) {
		margin-left: 240px !important;
	}
	
	/* CRITICAL: When pattern-sidebar exists as a sibling, apply margin immediately */
	/* This works even before JavaScript runs */
	:global(.project-view .pattern-sidebar + .main-content) {
		margin-left: 240px !important;
	}
	
	/* Also ensure it's set when pattern-sidebar exists anywhere */
	:global(.project-view:has(.pattern-sidebar) .main-content) {
		margin-left: 240px !important;
	}
</style>

<Toolbar />

<WelcomeModal bind:isOpen={showWelcomeModal} />

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
			handlePatternDragStart={handleDragStart}
			onTouchDragStart={handleTouchDragStart}
			onEffectEnvelopeTouchDragStart={handleEffectEnvelopeTouchDragStart}
		/>
	{/if}

	<!-- Main Content Area -->
	<div 
		class="main-content" 
		class:has-sidebar={viewMode === 'arrangement'}
	>
		{#if viewMode === 'arrangement'}
			<!-- Arrangement View -->
			<div class="arrangement-view" class:automation-open={$automationStore.length > 0}>
				<div 
					class="timeline-area" 
					bind:this={timelineAreaElement}
					role="region"
					aria-label="Timeline area"
					on:wheel={(e) => handleTimelineWheel(e)}
					on:click={handleTimelineClick}
					on:mousemove={(e) => handleTimelineMouseMove(e)}
					on:mouseup={() => handleTimelineMouseUp()}
					on:mouseleave={() => handleTimelineMouseUp()}
					on:touchmove={(e) => handleTimelineTouchMove(e)}
					on:touchend={() => handleTimelineMouseUp()}
					on:touchcancel={() => handleTimelineMouseUp()}
				>
					<TimelineRuler
						totalLength={timeline.totalLength}
						pixelsPerBeat={PIXELS_PER_BEAT}
						{zoomLevel}
						viewportElement={timelineAreaElement}
						bind:showAddTrackMenu
						onZoomWheel={handleTimelineWheel}
						onCreateTrack={createTimelineTrack}
						onToggleAddTrackMenu={toggleAddTrackMenu}
						onRulerClick={handleRulerClick}
					/>

					<div class="playhead-container">
						<div 
							class="playhead" 
							style="left: {ROW_LABEL_WIDTH + beatToPixelLocal(currentBeat)}px;"
						>
							<!-- Playhead is now non-interactive, just visual indicator -->
						</div>
					</div>

					<div class="pattern-rows">
						<!-- Render timeline tracks sorted by order -->
						{#each timelineTracks.sort((a, b) => a.order - b.order) as track (track.id)}
							{@const trackClips = getClipsForTrack(track.id)}
							{@const trackEffects = getEffectsForTrack(track.id)}
							{@const trackEnvelopes = getEnvelopesForTrack(track.id)}
							{@const trackPattern = track.type === 'pattern' && track.patternId ? findPatternById(track.patternId) : null}
							
							<div transition:fade={{ duration: 200 }}>
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
								viewportElement={timelineAreaElement}
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
									// Check what's being dragged and only allow if types match
									let dragType: 'effect' | 'envelope' | 'pattern' | null = null;
									
									// First, try to get drag type from JSON data
									try {
										const dragData = e.dataTransfer?.getData('application/json');
										if (dragData) {
											const data = JSON.parse(dragData);
											if (data.type === 'effect' || data.type === 'envelope' || data.type === 'pattern') {
												dragType = data.type;
											}
										}
									} catch (err) {
										// Not JSON data, continue
									}
									
									// If no drag type from JSON, check state variables (for touch drags)
									if (!dragType) {
										if (draggedEffectId) {
											dragType = 'effect';
										} else if (draggedEnvelopeId) {
											dragType = 'envelope';
										} else if (draggedPatternId) {
											dragType = 'pattern';
										}
									}
									
									// If we know what's being dragged, check if types match
									if (dragType) {
										if (dragType === 'effect' && track.type !== 'effect') {
											// Dragging effect but not over effect track - reject
											if (e.dataTransfer) {
												e.dataTransfer.dropEffect = 'none';
											}
											return;
										}
										if (dragType === 'envelope' && track.type !== 'envelope') {
											// Dragging envelope but not over envelope track - reject
											if (e.dataTransfer) {
												e.dataTransfer.dropEffect = 'none';
											}
											return;
										}
										if (dragType === 'pattern' && track.type !== 'pattern') {
											// Dragging pattern but not over pattern track - reject
											if (e.dataTransfer) {
												e.dataTransfer.dropEffect = 'none';
											}
											return;
										}
										// Types match - allow drag over
									}
									// If we don't know what's being dragged, allow it (might be track reordering or other drag)
									
									e.preventDefault();
									if (e.dataTransfer) {
										e.dataTransfer.dropEffect = dragType ? 'copy' : 'move';
									}
									dragOverRow = track.id;
								}}
								onRowDragLeave={handleRowDragLeave}
								onRowDrop={(e) => handleRowDrop(e, track)}
								onRowClick={(e) => handleRowClick(e, track.id, track.patternId)}
								onRowTouchEnd={(e) => handleRowTouchEnd(e, track)}
								onTrackVolumeMouseDown={handleTrackVolumeMouseDown}
								onToggleTrackMute={toggleTrackMute}
								onToggleTrackSolo={toggleTrackSolo}
								onToggleTrackCollapse={toggleTrackCollapse}
								onDeleteTrack={deleteTimelineTrack}
								onChangeTrackColor={(trackId, color) => {
									projectStore.updateTimelineTrack(trackId, { color });
								}}
								onClipMouseDown={handleClipMouseDown}
								onClipTouchStart={handleClipTouchStart}
								onClipTouchMove={handleClipTouchMove}
								onClipTouchEnd={handleClipTouchEnd}
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
								onUpdateTrackName={updateTimelineTrackName}
							/>
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
							onCopy={copyPattern}
						/>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
{/if}

<!-- Effect Plugin Windows -->
{#if $effectPluginStore.length > 0}
	{#each $effectPluginStore as window}
		<EffectPluginWindow {window} />
	{/each}
{/if}

<!-- Delete Pattern Confirmation Dialog -->
{#if showDeletePatternConfirm && patternToDelete}
	<div 
		class="delete-dialog-overlay" 
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-pattern-dialog-title"
		on:click={() => {
			showDeletePatternConfirm = false;
			patternToDelete = null;
		}}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				showDeletePatternConfirm = false;
				patternToDelete = null;
			}
		}}
		tabindex="-1"
	>
		<div 
			class="delete-dialog" 
			on:click|stopPropagation 
			role="document"
			on:keydown={(e) => e.stopPropagation()}
		>
			<h3 id="delete-pattern-dialog-title">Delete Pattern</h3>
			<p>Are you sure you want to delete "{patternToDelete.name || 'this pattern'}"? This action cannot be undone.</p>
			<div class="dialog-buttons">
				<button class="cancel-button" on:click={() => {
					showDeletePatternConfirm = false;
					patternToDelete = null;
				}}>
					Cancel
				</button>
				<button class="delete-button" on:click={handleDeletePatternConfirm}>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
