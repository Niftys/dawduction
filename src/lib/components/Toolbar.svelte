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
	import { updateProjectTitle } from '$lib/utils/projectSaveLoad';
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
	
	// Reactive project for base meter selection
	$: project = $projectStore;
	$: selection = $selectionStore;
	$: viewMode = $viewStore;
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
					// Update local state to match
					if (wasPlaying) {
						transportState = 'play';
						isPlaying = true;
					}
					if (currentViewMode === 'arrangement' && project.timeline && project.timeline.clips && project.timeline.clips.length > 0) {
						await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, project.timeline, project.patterns, project.effects, project.envelopes, project.automation);
						if (wasPlaying) {
							transportState = 'stop';
							isPlaying = false;
							engine.setTransport('stop', 0);
							transportState = 'play';
							isPlaying = true;
							engine.setTransport('play', 0);
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
									transportState = 'play';
									isPlaying = true;
									engine.setTransport('play');
								}
							} else {
								// Pattern not found, fall back to standalone instruments
								await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
								if (wasPlaying) {
									transportState = 'play';
									isPlaying = true;
									engine.setTransport('play');
								}
							}
						} else {
							// Regular pattern view - use standalone instruments
						await engine.loadProject(project.standaloneInstruments || [], bpm, project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
							if (wasPlaying) {
								transportState = 'play';
								isPlaying = true;
								engine.setTransport('play');
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
		};
	});

	onDestroy(() => {
		engine?.destroy();
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
				console.log('Created new standalone instrument:', newInstrument.id);
				projectStore.addStandaloneInstrument(newInstrument);
				console.log('Standalone instrument added, project should now have', (project.standaloneInstruments?.length || 0) + 1, 'instruments');
			} catch (error) {
				console.error('Error creating standalone instrument:', error);
			}
		} else {
			// In arrangement view - add a new standalone instrument
			try {
				const newInstrument = projectStore.createNewStandaloneInstrument(project.id, 'kick');
				console.log('Created new standalone instrument:', newInstrument.id);
				projectStore.addStandaloneInstrument(newInstrument);
				console.log('Standalone instrument added, project should now have', (project.standaloneInstruments?.length || 0) + 1, 'instruments');
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

	async function handleLogout() {
		loadingStore.startLoading('Signing out...');
		try {
			await supabase.auth.signOut();
			await goto('/');
		} catch (err) {
			console.error('Error signing out:', err);
			loadingStore.stopLoading();
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
					<button
						class="project-title-button"
						on:click={() => {
							editingTitle = project.title || 'Untitled';
							isEditingTitle = true;
							// Focus input after it's rendered
							setTimeout(() => {
								titleInputRef?.focus();
								titleInputRef?.select();
							}, 0);
						}}
						title="Click to edit project name"
					>
						{project.title || 'Untitled'}
					</button>
				{/if}
			</div>
			
			<!-- Logout Button -->
			<button
				class="logout-button"
				on:click={handleLogout}
				title="Sign out"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M10 11L14 8L10 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M14 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
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

<style>
	@import '$lib/styles/components/Toolbar.css';
</style>

