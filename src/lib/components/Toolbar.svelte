<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { playbackStore } from '$lib/stores/playbackStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { viewStore } from '$lib/stores/viewStore';
	import { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import { updateEnginePatternTree, createUpdateContext } from '$lib/utils/patternTreeUpdater';
	import type { Pattern } from '$lib/types/pattern';
	import ExportDialog from '$lib/components/ExportDialog.svelte';
	import { updateProjectTitle, saveProject } from '$lib/utils/projectSaveLoad';
	import { supabase } from '$lib/utils/supabase';
	import { loadingStore } from '$lib/stores/loadingStore';

	let engine: EngineWorklet | null = null;
	let isPlaying = false;
	let transportState: 'play' | 'stop' | 'pause' = 'stop'; // Track actual transport state
	let canUndo = false;
	let canRedo = false;
	let isMuted = false;
	let isSoloed = false;
	let isEditingTitle = false;
	let editingTitle = '';
	let titleInputRef: HTMLInputElement | null = null;
	let showLeaveConfirm = false;
	let lastSavedTime: number | null = null;
	let autoSaveInterval: ReturnType<typeof setInterval> | null = null;
	
	// Reactive project for base meter selection
	$: project = $projectStore;
	$: selection = $selectionStore;
	$: viewMode = $viewStore;
	// Check if this is a sandbox project
	$: isSandbox = project?.id?.startsWith('sandbox-') || false;
	// Initialize BPM from project store, default to 120 if not set
	$: bpm = project?.bpm ?? 120;
	$: selectedTrack = project?.standaloneInstruments?.find((i) => i.id === selection.selectedTrackId);
	$: selectedPattern = selection.selectedPatternId ? project?.patterns?.find((p) => p.id === selection.selectedPatternId) : null;
	// For pattern view, get the selected instrument if one is selected
	// Explicitly depend on project and selectedPattern to ensure it updates when instruments change
	// Force reactivity by explicitly accessing pattern.updatedAt and pattern.instruments
	$: selectedInstrument = (() => {
		if (!project || !selectedPattern || !selection.selectedInstrumentId) return null;
		// Force reactivity by accessing pattern properties
		const _updatedAt = selectedPattern.updatedAt;
		const _instruments = selectedPattern.instruments;
		return projectStore.getPatternInstruments(selectedPattern).find((inst: any) => inst.id === selection.selectedInstrumentId);
	})();
	
	// Reactive statements for mute/solo state
	// Explicitly depend on project, selectedPattern, and selectedInstrument to ensure updates
	// Force reactivity by explicitly accessing the mute/solo properties
	$: {
		// Force reactivity by accessing project
		const _project = project;
		const _selectedPattern = selectedPattern;
		const _selectedInstrument = selectedInstrument;
		const _selectedTrack = selectedTrack;
		
		if (_selectedTrack) {
			isMuted = _selectedTrack.mute ?? false;
			isSoloed = _selectedTrack.solo ?? false;
		} else if (_selectedPattern && _selectedInstrument) {
			// Explicitly access the properties to ensure reactivity
			isMuted = _selectedInstrument.mute ?? false;
			isSoloed = _selectedInstrument.solo ?? false;
		} else if (_selectedPattern) {
			isMuted = _selectedPattern.mute ?? false;
			isSoloed = _selectedPattern.solo ?? false;
		} else {
			isMuted = false;
			isSoloed = false;
		}
	}
	
	// Subscribe to history state changes for undo/redo button states
	projectStore.subscribeHistory((state) => {
		canUndo = state.canUndo;
		canRedo = state.canRedo;
	});

	onMount(() => {
		(async () => {
		engine = new EngineWorklet();
		await engine.initialize();
		await engine.resume();
		
		// Share engine instance via store
		engineStore.set(engine);
		
		// Set up playback position tracking
		engine.onPlaybackUpdate((time: number, eventIds: string[]) => {
			playbackStore.updatePlayback(time, eventIds);
		});
		})();
		
		// Set up auto-save every 5 minutes (skip for sandbox)
		if (typeof window !== 'undefined' && window.location.pathname.match(/\/project\/([^/]+)/) && !isSandbox) {
			// Initial save timestamp
			lastSavedTime = Date.now();
			
			autoSaveInterval = setInterval(async () => {
				const currentProject = $projectStore;
				if (currentProject && currentProject.id && !currentProject.id.startsWith('sandbox-')) {
					await performSave(currentProject, false); // Silent save
				}
			}, 5 * 60 * 1000); // 5 minutes
		}
		
		// Listen for project reload requests (e.g., when instrument changes)
		const handleReload = async () => {
			if (engine) {
				// Use a small delay to ensure any pending store updates have completed
				await new Promise(resolve => setTimeout(resolve, 10));
				
				let project: any;
				projectStore.subscribe((p) => (project = p))();
				if (project) {
					const currentViewMode = $viewStore;
					// Use local transport state (engine.getTransportState doesn't exist)
					const wasPlaying = transportState === 'play' && isPlaying;
					// Get current playback position to preserve it
					let currentPosition = 0;
					playbackStore.subscribe((state) => {
						currentPosition = state.currentTime || 0;
					})();
					
					// Update local state to match
					if (wasPlaying) {
						transportState = 'play';
						isPlaying = true;
					}
					if (currentViewMode === 'arrangement' && project.timeline && project.timeline.clips && project.timeline.clips.length > 0) {
						await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, project.timeline, project.patterns, project.effects, project.envelopes, project.automation);
						if (wasPlaying) {
							// Resume playback at the same position without stopping
							engine.setTransport('play', currentPosition);
						}
					} else {
						// Pattern view - check if we're in a pattern editor page
						const currentPath = window.location.pathname;
						const patternMatch = currentPath.match(/\/project\/[^/]+\/pattern\/([^/]+)/);
						
						if (patternMatch && project.patterns) {
							// We're in pattern editor - load the specific pattern
							const patternId = patternMatch[1];
							const pattern = project.patterns.find((p: any) => p.id === patternId);
							
							if (pattern) {
								// Get all instruments from pattern (handling both new and legacy formats)
								const { projectStore } = await import('$lib/stores/projectStore');
								const patternInstruments = projectStore.getPatternInstruments(pattern);
								
								// Convert all instruments to standalone instrument format for engine
								const tracksForEngine: any[] = patternInstruments.map(inst => ({
									id: `__pattern_${pattern.id}_${inst.id}`, // Unique ID for each instrument
									projectId: pattern.projectId,
									instrumentType: inst.instrumentType || 'kick',
									patternTree: inst.patternTree,
									settings: inst.settings || {},
									instrumentSettings: inst.instrumentSettings || {},
									volume: inst.volume ?? 1.0,
									pan: inst.pan ?? 0.0,
									color: inst.color,
									mute: inst.mute ?? false,
									solo: inst.solo ?? false
								}));
								
								await engine.loadProject(tracksForEngine, bpm, tracksForEngine[0]?.id, undefined, project.patterns, project.effects, project.envelopes, project.automation);
								if (wasPlaying) {
									// Resume playback at the same position
									engine.setTransport('play', currentPosition);
								}
							} else {
								// Pattern not found, fall back to standalone instruments
								await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
								if (wasPlaying) {
									// Resume playback at the same position
									engine.setTransport('play', currentPosition);
								}
							}
						} else {
							// Regular pattern view - use standalone instruments
						await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
							if (wasPlaying) {
								// Resume playback at the same position
								engine.setTransport('play', currentPosition);
							}
						}
					}
				}
			}
		};
		window.addEventListener('reloadProject', handleReload);
		
		// Keyboard shortcuts for undo/redo and play/pause
		const handleKeyDown = (e: KeyboardEvent) => {
			// Spacebar for play/pause (only if not typing in an input)
			if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
				e.preventDefault();
				togglePlayback();
				return;
			}
			
			// Ctrl-Z or Cmd-Z for undo
			if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
				e.preventDefault();
				handleUndo();
			}
			// Ctrl-Shift-Z or Ctrl-Y or Cmd-Shift-Z for redo
			if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
				e.preventDefault();
				handleRedo();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		
		return () => {
			window.removeEventListener('reloadProject', handleReload);
			window.removeEventListener('keydown', handleKeyDown);
			// Clear auto-save interval on unmount
			if (autoSaveInterval) {
				clearInterval(autoSaveInterval);
			}
		};
	});

	onDestroy(() => {
		engine?.destroy();
		// Clear auto-save interval
		if (autoSaveInterval) {
			clearInterval(autoSaveInterval);
		}
	});

	// Track last BPM to avoid infinite loops
	let lastBpmUpdate = 0;
	
	// Reactive statement to sync BPM from project store to engine
	// This ensures the engine always uses the project's BPM
	$: if (engine && project?.bpm && project.bpm !== lastBpmUpdate) {
		lastBpmUpdate = project.bpm;
		engine.setTempo(project.bpm);
	}

	// Reload project when view mode changes (always, not just when playing)
	let lastViewMode: 'arrangement' | 'pattern' | null = null;
	$: if (engine && $viewStore && lastViewMode !== $viewStore) {
		(async () => {
			lastViewMode = $viewStore;
			// Small delay to ensure any pending pattern syncs complete
			await new Promise(resolve => setTimeout(resolve, 100));
			
			let project: any;
			projectStore.subscribe((p) => (project = p))();
			if (project) {
				const currentViewMode = $viewStore;
				if (currentViewMode === 'arrangement' && project.timeline && project.timeline.clips && project.timeline.clips.length > 0) {
					// Before loading, ensure all patterns used in timeline have their temporary tracks created
					// This ensures the engine can access the latest instrumentType
					const patternIds = new Set(project.timeline.clips.map((c: any) => c.patternId));
					for (const patternId of patternIds) {
						const pattern = project.patterns?.find((p: any) => p.id === patternId);
						if (pattern) {
							const tempTrackId = `__pattern_${patternId}`;
							const tempInstrument = project.standaloneInstruments?.find((i: any) => i.id === tempTrackId);
							if (!tempInstrument) {
								// Create temporary standalone instrument if it doesn't exist
								const { projectStore } = await import('$lib/stores/projectStore');
								const newTempInstrument = {
									id: tempTrackId,
									projectId: pattern.projectId,
									instrumentType: pattern.instrumentType || 'kick',
									patternTree: pattern.patternTree,
									settings: pattern.settings || {},
									instrumentSettings: pattern.instrumentSettings || {},
									volume: pattern.volume ?? 1.0,
									pan: pattern.pan ?? 0.0,
									color: pattern.color || '#00ffff',
									mute: pattern.mute ?? false,
									solo: pattern.solo ?? false
								};
								projectStore.addStandaloneInstrument(newTempInstrument);
								// Get fresh project data
								projectStore.subscribe((p) => (project = p))();
							}
						}
					}
					
					// Get fresh project data after ensuring standalone instruments exist
					projectStore.subscribe((p) => (project = p))();
					
					// Load timeline in arrangement view
					await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, project.timeline, project.patterns, project.effects, project.envelopes, project.automation);
					// Reset transport position when switching to arrangement view (if playing)
					if (isPlaying) {
						transportState = 'stop';
					engine.setTransport('stop', 0);
						transportState = 'play';
					engine.setTransport('play', 0);
					}
				} else {
					// Load pattern mode (use standalone instruments or patterns)
					await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
					// Resume playback if it was playing
					if (isPlaying) {
						transportState = 'play';
					engine.setTransport('play');
					}
				}
			}
		})();
	}

	async function togglePlayback() {
		if (!engine) return;

		// Ensure AudioContext is resumed (required for audio playback after page load)
		await engine.resume();

		isPlaying = !isPlaying;
		transportState = isPlaying ? 'play' : 'stop';
		engine.setTransport(transportState);

		// Clear playback state when stopping
		if (!isPlaying) {
			playbackStore.clear();
		}

		// Load project if playing
		if (isPlaying) {
			let project: any;
			projectStore.subscribe((p) => (project = p))();
			if (project) {
				// Determine what to load based on view mode
				const currentViewMode = $viewStore;
				if (currentViewMode === 'arrangement' && project.timeline && project.timeline.clips && project.timeline.clips.length > 0) {
					// Load timeline in arrangement view
					await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, project.timeline, project.patterns, project.effects, project.envelopes, project.automation);
					// Reset transport position when starting in arrangement view
					transportState = 'stop';
					isPlaying = false;
					engine.setTransport('stop', 0);
					transportState = 'play';
					isPlaying = true;
					engine.setTransport('play', 0);
				} else {
					// Pattern view - check if we're in a pattern editor page
					const currentPath = window.location.pathname;
					const patternMatch = currentPath.match(/\/project\/[^/]+\/pattern\/([^/]+)/);
					
					if (patternMatch && project.patterns) {
						// We're in pattern editor - load all instruments from the specific pattern
						const patternId = patternMatch[1];
						const pattern = project.patterns.find((p: any) => p.id === patternId);
						
						if (pattern) {
							// Get all instruments from pattern (handles both new and legacy formats)
							let patternInstruments: any[] = [];
							if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
								// New format: use instruments array
								patternInstruments = pattern.instruments;
							} else if (pattern.instrumentType && pattern.patternTree) {
								// Legacy format: convert single instrument
								patternInstruments = [{
									id: pattern.id,
									instrumentType: pattern.instrumentType,
									patternTree: pattern.patternTree,
									settings: pattern.settings || {},
									instrumentSettings: pattern.instrumentSettings,
									color: pattern.color || '#7ab8ff',
									volume: pattern.volume ?? 1.0,
									pan: pattern.pan ?? 0.0,
									mute: pattern.mute,
									solo: pattern.solo
								}];
							}
							
							// Convert all instruments to track format for engine
							const patternTracks = patternInstruments.map((instrument, index) => ({
								id: `__pattern_${pattern.id}_${instrument.id}`,
								projectId: pattern.projectId,
								instrumentType: instrument.instrumentType || 'kick',
								patternTree: instrument.patternTree,
								settings: instrument.settings || {},
								instrumentSettings: instrument.instrumentSettings || {},
								volume: instrument.volume ?? 1.0,
								pan: instrument.pan ?? 0.0,
								color: instrument.color || '#7ab8ff',
								mute: (pattern.mute ?? false) || (instrument.mute ?? false),
								solo: instrument.solo ?? false
							}));
							
							// Also include standalone instruments so they're visible on canvas
							const allTracks = [...(project.standaloneInstruments || []), ...patternTracks];
							
							await engine.loadProject(allTracks, bpm, patternTracks[0]?.id || project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
							transportState = 'play';
							isPlaying = true;
							engine.setTransport('play');
						} else {
							// Pattern not found, fall back to standalone instruments
							await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
							transportState = 'play';
							isPlaying = true;
							engine.setTransport('play');
						}
					} else {
						// Regular pattern view - use standalone instruments
					await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes);
					engine.setTransport('play');
					}
				}
			}
		}
	}

	function addNewTrack() {
		// Use the reactive project variable
		if (!project) {
			console.error('Cannot add standalone instrument: No project exists', project);
			return;
		}
		
		const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
		const patternMatch = currentPath.match(/\/project\/[^/]+\/pattern\/([^/]+)/);
		
		if (patternMatch) {
			// In pattern editor mode - add a new standalone instrument to the arrangement
			// This allows users to add instruments while editing a pattern
			try {
				const newInstrument = projectStore.createNewStandaloneInstrument(project.id, 'kick');
				projectStore.addStandaloneInstrument(newInstrument);
			} catch (error) {
				console.error('Error creating standalone instrument:', error);
			}
		} else {
			// In arrangement view - add a new standalone instrument
			try {
				const newInstrument = projectStore.createNewStandaloneInstrument(project.id, 'kick');
				projectStore.addStandaloneInstrument(newInstrument);
			} catch (error) {
				console.error('Error creating standalone instrument:', error);
			}
		}
	}
	
	async function handleUndo() {
		if (!canUndo) return;
		const undone = projectStore.undo();
		if (undone && engine && isPlaying) {
			// Reload project if playing
			let project: any;
			projectStore.subscribe((p) => (project = p))();
			if (project) {
				await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, project.timeline, project.patterns, project.effects, project.envelopes);
			}
		}
		window.dispatchEvent(new CustomEvent('reloadProject'));
	}
	
	async function handleRedo() {
		if (!canRedo) return;
		const redone = projectStore.redo();
		if (redone && engine && isPlaying) {
			// Reload project if playing
			let project: any;
			projectStore.subscribe((p) => (project = p))();
			if (project) {
				await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, project.timeline, project.patterns, project.effects, project.envelopes);
			}
		}
		window.dispatchEvent(new CustomEvent('reloadProject'));
	}

	async function handleSaveTitle() {
		if (!project || !editingTitle.trim()) {
			isEditingTitle = false;
			editingTitle = '';
			return;
		}

		const newTitle = editingTitle.trim();
		if (newTitle === project.title) {
			isEditingTitle = false;
			editingTitle = '';
			return;
		}

		loadingStore.startLoading('Updating project name...');
		
		try {
			// Update in store
			projectStore.update((p) => {
				if (!p) return p;
				return { ...p, title: newTitle };
			});

			// Update in Supabase
			const { success, error } = await updateProjectTitle(project.id, newTitle);
			
			if (!success) {
				console.error('Failed to update project title:', error);
				// Revert in store
				projectStore.update((p) => {
					if (!p) return p;
					return { ...p, title: project.title };
				});
				alert('Failed to update project name: ' + (error || 'Unknown error'));
			}
		} catch (err: any) {
			console.error('Error updating project title:', err);
			alert('Failed to update project name');
		} finally {
			isEditingTitle = false;
			editingTitle = '';
			loadingStore.stopLoading();
		}
	}

	async function performSave(projectToSave: any, showLoading = true): Promise<boolean> {
		// Don't save sandbox projects
		if (projectToSave?.id?.startsWith('sandbox-')) {
			if (showLoading) {
				loadingStore.stopLoading();
			}
			alert('Sandbox projects cannot be saved. Please create an account to save your work.');
			return false;
		}
		
		if (showLoading) {
			loadingStore.startLoading('Saving project...');
		}
		
		try {
			const { success, error } = await saveProject(projectToSave);
			
			if (!success) {
				console.error('Failed to save project:', error);
				if (showLoading) {
					loadingStore.stopLoading();
					alert('Failed to save project: ' + (error || 'Unknown error'));
				}
				return false;
			}
			
			lastSavedTime = Date.now();
			return true;
		} catch (err: any) {
			console.error('Error saving project:', err);
			if (showLoading) {
				loadingStore.stopLoading();
				alert('Failed to save project');
			}
			return false;
		} finally {
			if (showLoading) {
				loadingStore.stopLoading();
			}
		}
	}

	function handleHomeClick() {
		// Check if we need to save before leaving
		if (project && project.id) {
			showLeaveConfirm = true;
		} else {
			// No project, just go home
			goto('/');
		}
	}

	async function handleLeaveWithoutSaving() {
		showLeaveConfirm = false;
		await goto('/');
	}

	async function handleSaveAndLeave() {
		showLeaveConfirm = false;
		if (project && project.id) {
			const saved = await performSave(project, true);
			if (saved) {
				await goto('/');
			}
			// If save failed, don't leave - let user try again
		} else {
			await goto('/');
		}
	}

	function toggleMute() {
		if (selectedPattern && selection.selectedInstrumentId) {
			// Pattern view: update the specific instrument
			const currentMuteState = selectedInstrument?.mute ?? false;
			const newMuteState = !currentMuteState;
			projectStore.updatePatternInstrument(selectedPattern.id, selection.selectedInstrumentId, { mute: newMuteState });
			
			// Update engine in real-time
			if (engine) {
				const patternTrackId = `__pattern_${selectedPattern.id}_${selection.selectedInstrumentId}`;
				engine.updateTrackMute(patternTrackId, newMuteState);
			}
		} else if (selectedTrack) {
			// Arrangement view: update the standalone instrument
			const currentMuteState = selectedTrack.mute ?? false;
			const newMuteState = !currentMuteState;
			projectStore.updateStandaloneInstrument(selectedTrack.id, { mute: newMuteState });
			
			// Update engine in real-time
			if (engine) {
				engine.updateTrackMute(selectedTrack.id, newMuteState);
			}
		}
	}

	function toggleSolo() {
		if (selectedPattern && selection.selectedInstrumentId) {
			// Pattern view: update the specific instrument
			const currentSoloState = selectedInstrument?.solo ?? false;
			const newSoloState = !currentSoloState;
			
			// If soloing, unsolo all other instruments in this pattern first
			if (newSoloState && engine) {
				const patternInstruments = projectStore.getPatternInstruments(selectedPattern);
				for (const instrument of patternInstruments) {
					if (instrument.id !== selection.selectedInstrumentId && instrument.solo) {
						// Unsolo this instrument
						projectStore.updatePatternInstrument(selectedPattern.id, instrument.id, { solo: false });
						const patternTrackId = `__pattern_${selectedPattern.id}_${instrument.id}`;
						engine.updateTrackSolo(patternTrackId, false);
					}
				}
			}
			
			// Update the selected instrument (this handles both soloing and un-soloing)
			projectStore.updatePatternInstrument(selectedPattern.id, selection.selectedInstrumentId, { solo: newSoloState });
			
			// Update engine in real-time
			if (engine) {
				const patternTrackId = `__pattern_${selectedPattern.id}_${selection.selectedInstrumentId}`;
				engine.updateTrackSolo(patternTrackId, newSoloState);
			}
		} else if (selectedTrack) {
			// Arrangement view: update the standalone instrument
			const currentSoloState = selectedTrack.solo ?? false;
			const newSoloState = !currentSoloState;
			
			// If soloing, unsolo all other standalone instruments first
			if (newSoloState && project && engine) {
				for (const instrument of project.standaloneInstruments || []) {
					if (instrument.id !== selectedTrack.id && instrument.solo) {
						// Unsolo this instrument
						projectStore.updateStandaloneInstrument(instrument.id, { solo: false });
						engine.updateTrackSolo(instrument.id, false);
					}
				}
			}
			
			// Update the selected standalone instrument (this handles both soloing and un-soloing)
			projectStore.updateStandaloneInstrument(selectedTrack.id, { solo: newSoloState });
			
			// Update engine in real-time
			if (engine) {
				engine.updateTrackSolo(selectedTrack.id, newSoloState);
			}
		}
	}

	let showExportDialog = false;
	
	function handleExport() {
		showExportDialog = true;
	}
	
	function closeExportDialog() {
		showExportDialog = false;
	}
</script>

<div class="toolbar">
	<div class="toolbar-left">
		<!-- Home Button (always on the left) -->
		{#if typeof window !== 'undefined' && window.location.pathname.match(/\/project\/([^/]+)/)}
			<button
				class="home-button"
				on:click={handleHomeClick}
				title="Go to home"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M2 8L8 2L14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M4 8V13C4 13.5523 4.44772 14 5 14H11C11.5523 14 12 13.5523 12 13V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M6 14V10C6 9.44772 6.44772 9 7 9H9C9.55228 9 10 9.44772 10 10V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		{/if}
		
		{#if viewMode === 'arrangement' || (typeof window !== 'undefined' && window.location.pathname.match(/\/project\/[^/]+\/pattern\/([^/]+)/))}
			<div class="bpm-control">
				<label for="bpm-input">BPM</label>
				<div class="number-input-wrapper">
					<input
						id="bpm-input"
						type="number"
						bind:value={bpm}
						min="20"
						max="500"
						on:input={() => {
							// Update project store immediately when BPM changes
							projectStore.update((p) => {
								if (p) {
									p.bpm = bpm;
								}
								return p;
							});
							// Update engine tempo immediately
							if (engine) {
								engine.setTempo(bpm);
							}
						}}
					/>
					<div class="number-input-arrows">
						<button
							type="button"
							class="arrow-button arrow-up"
							on:click={() => {
								const newBpm = Math.min(500, bpm + 1);
								bpm = newBpm;
								projectStore.update((p) => {
									if (p) {
										p.bpm = newBpm;
									}
									return p;
								});
								if (engine) {
									engine.setTempo(newBpm);
								}
							}}
							title="Increase BPM"
						>
							<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M5 2L8 6H2L5 2Z" fill="currentColor"/>
							</svg>
						</button>
						<button
							type="button"
							class="arrow-button arrow-down"
							on:click={() => {
								const newBpm = Math.max(20, bpm - 1);
								bpm = newBpm;
								projectStore.update((p) => {
									if (p) {
										p.bpm = newBpm;
									}
									return p;
								});
								if (engine) {
									engine.setTempo(newBpm);
								}
							}}
							title="Decrease BPM"
						>
							<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M5 8L2 4H8L5 8Z" fill="currentColor"/>
							</svg>
						</button>
					</div>
				</div>
			</div>
		{/if}
		{#if typeof window !== 'undefined' && window.location.pathname.match(/\/project\/[^/]+\/pattern\/([^/]+)/)}
			{@const patternMatch = window.location.pathname.match(/\/project\/[^/]+\/pattern\/([^/]+)/)}
			{@const currentPattern = patternMatch ? project?.patterns?.find((p) => p.id === patternMatch[1]) : null}
			{#if currentPattern}
				<div class="base-meter-control">
					<label for="base-meter-input">Base Meter</label>
					<div class="number-input-wrapper">
						<input
							id="base-meter-input"
							type="number"
							value={currentPattern.baseMeter || 4}
							min="1"
							max="32"
							on:change={(e) => {
								const baseMeter = parseInt(e.currentTarget.value) || 4;
								if (currentPattern) {
									// Update only the baseMeter property - root node divisions remain independent
									// Base meter (X) and root division (Y) are separate: meter = Y/X
									projectStore.updatePattern(currentPattern.id, { 
										baseMeter
									});
									// Small delay to ensure store update completes, then reload project
									setTimeout(() => {
										window.dispatchEvent(new CustomEvent('reloadProject'));
									}, 50);
								}
							}}
							title="Base meter (denominator X in Y/X time signature). Root node division (Y) is independent."
						/>
						<div class="number-input-arrows">
							<button
								type="button"
								class="arrow-button arrow-up"
								on:click={() => {
									const currentBaseMeter = currentPattern.baseMeter || 4;
									const newBaseMeter = Math.min(32, currentBaseMeter + 1);
									if (currentPattern) {
										// Update only the baseMeter property - root node divisions remain independent
										projectStore.updatePattern(currentPattern.id, { 
											baseMeter: newBaseMeter
										});
										// Small delay to ensure store update completes, then reload project
										setTimeout(() => {
											window.dispatchEvent(new CustomEvent('reloadProject'));
										}, 50);
									}
								}}
								title="Increase Base Meter"
							>
								<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M5 2L8 6H2L5 2Z" fill="currentColor"/>
								</svg>
							</button>
							<button
								type="button"
								class="arrow-button arrow-down"
								on:click={() => {
									const currentBaseMeter = currentPattern.baseMeter || 4;
									const newBaseMeter = Math.max(1, currentBaseMeter - 1);
									if (currentPattern) {
										// Update only the baseMeter property - root node divisions remain independent
										projectStore.updatePattern(currentPattern.id, { 
											baseMeter: newBaseMeter
										});
										// Small delay to ensure store update completes, then reload project
										setTimeout(() => {
											window.dispatchEvent(new CustomEvent('reloadProject'));
										}, 50);
									}
								}}
								title="Decrease Base Meter"
							>
								<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M5 8L2 4H8L5 8Z" fill="currentColor"/>
								</svg>
							</button>
						</div>
					</div>
				</div>
			{/if}
		{/if}
		{#if (typeof window !== 'undefined' && window.location.pathname.match(/\/project\/[^/]+\/pattern\/([^/]+)/)) && selection.isRoot && selectedPattern && selection.selectedInstrumentId}
			<div class="mute-solo-controls">
				<button
					class="track-mute {isMuted ? 'active' : ''}"
					on:click={toggleMute}
					title={isMuted ? 'Unmute track' : 'Mute track'}
				>
					M
				</button>
				<button
					class="track-solo {isSoloed ? 'active' : ''}"
					on:click={toggleSolo}
					title={isSoloed ? 'Unsolo track' : 'Solo track'}
				>
					S
				</button>
			</div>
		{/if}
	</div>

	<div class="toolbar-center">
		<button 
			class="view-toggle {viewMode === 'arrangement' ? 'active' : ''}"
			on:click={async () => {
				const { loadingStore } = await import('$lib/stores/loadingStore');
				loadingStore.startLoading('Switching to arrangement view...');
				
				// If we're in pattern editor, navigate to arrangement view
				const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
				const patternMatch = currentPath.match(/\/project\/([^/]+)\/pattern\/([^/]+)/);
				if (patternMatch) {
					const projectId = patternMatch[1];
					const patternId = patternMatch[2];
					// Store pattern ID for later return
					viewStore.setCurrentPatternId(patternId);
					// Navigate to arrangement view
					await goto(`/project/${projectId}`);
					viewStore.setArrangement();
				} else {
					viewStore.setArrangement();
				}
				
				// Stop loading after a short delay to allow page to render
				setTimeout(() => {
					loadingStore.stopLoading();
				}, 200);
			}}
			title="Arrangement View"
		>
			Arrangement
		</button>
		<button class="play-button" on:click={togglePlayback} title={isPlaying ? 'Pause' : 'Play'}>
			{#if isPlaying}
				<!-- Pause icon -->
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<rect x="5" y="3" width="2" height="10" fill="currentColor"/>
					<rect x="9" y="3" width="2" height="10" fill="currentColor"/>
				</svg>
			{:else}
				<!-- Play icon -->
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M5 3L13 8L5 13V3Z" fill="currentColor"/>
				</svg>
			{/if}
		</button>
		<button 
			class="view-toggle {viewMode === 'pattern' ? 'active' : ''}"
			on:click={async () => {
				const { loadingStore } = await import('$lib/stores/loadingStore');
				loadingStore.startLoading('Switching to pattern view...');
				
				const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
				const projectMatch = currentPath.match(/\/project\/([^/]+)/);
				if (projectMatch) {
					const projectId = projectMatch[1];
					// Always navigate to pattern list view (not pattern editor)
					// If we're in pattern editor, navigate back to project page
					const patternMatch = currentPath.match(/\/project\/([^/]+)\/pattern\/([^/]+)/);
					if (patternMatch) {
						// We're in pattern editor, navigate to project page
						await goto(`/project/${projectId}`);
					}
					// Set view mode to pattern (shows pattern list)
					viewStore.setPattern();
				} else {
					viewStore.setPattern();
					window.dispatchEvent(new CustomEvent('switchToPatternView'));
				}
				
				// Stop loading after a short delay to allow page to render
				setTimeout(() => {
					loadingStore.stopLoading();
				}, 200);
			}}
			title="Pattern View"
		>
			Patterns
		</button>
	</div>

	<div class="toolbar-right">
		<!-- Project Title Editor -->
		{#if project && typeof window !== 'undefined' && window.location.pathname.match(/\/project\/([^/]+)/)}
			<div class="project-title-editor">
				{#if isEditingTitle}
					<input
						type="text"
						class="title-input"
						bind:value={editingTitle}
						on:keydown={(e) => {
							if (e.key === 'Enter') {
								handleSaveTitle();
							} else if (e.key === 'Escape') {
								isEditingTitle = false;
								editingTitle = '';
							}
						}}
						on:blur={handleSaveTitle}
						bind:this={titleInputRef}
					/>
				{:else}
					<div class="title-container">
						<button
							class="project-title-button"
							on:click={() => {
								if (!isSandbox) {
									editingTitle = project.title || 'Untitled';
									isEditingTitle = true;
									// Focus input after it's rendered
									setTimeout(() => {
										titleInputRef?.focus();
										titleInputRef?.select();
									}, 0);
								}
							}}
							title={isSandbox ? 'Sandbox Mode - Cannot edit title' : 'Click to edit project name'}
							class:disabled={isSandbox}
						>
							{project.title || 'Untitled'}
						</button>
						{#if isSandbox}
							<span class="sandbox-badge" title="Sandbox Mode - Your work will not be saved">
								SANDBOX
							</span>
						{/if}
					</div>
				{/if}
			</div>
			
		{/if}
		
		{#if viewMode === 'arrangement' || (typeof window !== 'undefined' && window.location.pathname.match(/\/project\/[^/]+\/pattern\/([^/]+)/))}
			<div class="undo-redo-controls">
				<button 
					class="undo-button" 
					on:click={handleUndo}
					disabled={!canUndo}
					title="Undo (Ctrl+Z)"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M2 8C2 10.2091 3.79086 12 6 12H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						<path d="M5 5L2 8L5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
				<button 
					class="redo-button" 
					on:click={handleRedo}
					disabled={!canRedo}
					title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M14 8C14 5.79086 12.2091 4 10 4H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						<path d="M11 11L14 8L11 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</div>
		{/if}
		{#if viewMode === 'arrangement'}
			<button class="export-button" on:click={handleExport} title="Export to WAV">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M2 12V13C2 14.1046 2.89543 15 4 15H12C13.1046 15 14 14.1046 14 13V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				Export
			</button>
		{/if}
	</div>
</div>

<ExportDialog isOpen={showExportDialog} onClose={closeExportDialog} />

<!-- Leave Confirmation Dialog -->
{#if showLeaveConfirm}
	<div 
		class="leave-dialog-overlay" 
		role="dialog"
		aria-modal="true"
		aria-labelledby="leave-dialog-title"
		on:click={() => showLeaveConfirm = false}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				showLeaveConfirm = false;
			}
		}}
		tabindex="-1"
	>
		<div 
			class="leave-dialog" 
			on:click|stopPropagation 
			role="document"
			on:keydown={(e) => e.stopPropagation()}
		>
			<h3 id="leave-dialog-title">Save Before Leaving?</h3>
			<p>Your project has unsaved changes. Would you like to save before going to the home page?</p>
			<div class="dialog-actions">
				<div class="dialog-main-actions">
					<button class="save-and-leave-button" on:click={handleSaveAndLeave}>
						Save & Leave
					</button>
					<button class="leave-without-saving-text" on:click={handleLeaveWithoutSaving}>
						Leave Without Saving
					</button>
				</div>
				<button class="cancel-text" on:click={() => showLeaveConfirm = false}>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	@import '$lib/styles/components/Toolbar.css';
	
	.home-button {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		padding: 0.5rem;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.home-button:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: #ffffff;
	}

	.leave-dialog-overlay {
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

	.leave-dialog {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 12px;
		padding: 2rem;
		max-width: 450px;
		width: 90%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.leave-dialog h3 {
		margin: 0 0 1rem 0;
		color: #ffffff;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.leave-dialog p {
		margin: 0 0 1.5rem 0;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.5;
	}

	.dialog-actions {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding-bottom: 1.5rem;
		min-height: 120px;
	}

	.dialog-main-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	.save-and-leave-button {
		padding: 0.75rem 2rem;
		background: #00ffff;
		color: #0f0f0f;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s;
		font-size: 0.9rem;
		font-weight: 600;
		width: auto;
		min-width: 150px;
	}

	.save-and-leave-button:hover {
		background: #00e6e6;
	}

	.leave-without-saving-text {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: color 0.2s;
		font-size: 0.85rem;
		font-weight: 400;
		padding: 0.25rem 0.5rem;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.leave-without-saving-text:hover {
		color: rgba(255, 255, 255, 0.9);
	}

	.cancel-text {
		position: absolute;
		bottom: 0;
		right: 0;
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: color 0.2s;
		font-size: 0.85rem;
		font-weight: 400;
		padding: 0.25rem 0.5rem;
		text-decoration: underline;
		text-underline-offset: 3px;
		margin: 0;
	}

	.cancel-text:hover {
		color: rgba(255, 255, 255, 0.8);
	}

	.save-and-leave-button:hover {
		background: #00cccc;
	}

	.title-container {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.sandbox-badge {
		background: #ffc107;
		color: #0f0f0f;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.project-title-button.disabled {
		cursor: default;
		opacity: 0.8;
	}

	.project-title-button.disabled:hover {
		text-decoration: none;
	}
</style>

