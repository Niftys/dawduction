<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { projectStore } from '$lib/stores/projectStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { loadingStore } from '$lib/stores/loadingStore';
	import Canvas from '$lib/components/Canvas.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import MidiEditor from '$lib/components/MidiEditor.svelte';
	import VelocityEditor from '$lib/components/VelocityEditor.svelte';
	import SynthPluginWindow from '$lib/components/SynthPluginWindow.svelte';
	import { synthPluginStore } from '$lib/stores/synthPluginStore';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getCurrentUser } from '$lib/utils/supabase';
	import type { Pattern } from '$lib/types/pattern';
	import { viewStore } from '$lib/stores/viewStore';
	import { engineStore } from '$lib/stores/engineStore';
	import ProjectSkeleton from '$lib/components/skeletons/ProjectSkeleton.svelte';

	let project: any;
	let pattern: Pattern | null = null;
	let unsubscribeAutoSave: (() => void) | null = null;
	let engine: any = null;
	let isLoading = true;
	
	engineStore.subscribe((e) => (engine = e));

	projectStore.subscribe((p) => {
		project = p;
		if (project && $page.params.patternId) {
			pattern = project.patterns?.find((pat: Pattern) => pat.id === $page.params.patternId) || null;
			// Stop loading once pattern is found (both local state and loadingStore)
			if (pattern && isLoading) {
				setTimeout(() => {
					isLoading = false;
					loadingStore.stopLoading(); // Stop the loading overlay
				}, 100);
			}
		}
	});
	
	// Pages with skeletons use local loading state only
	// Don't subscribe to loadingStore - that's for overlay operations only

	// Function to save project to localStorage (sandbox projects can use this)
	function saveProject() {
		if (project && $page.params.id) {
			try {
				// Save to localStorage for both regular and sandbox projects
				// This allows sandbox users to have temporary persistence during their session
				localStorage.setItem(`project_${$page.params.id}`, JSON.stringify(project));
			} catch (e) {
				console.error('[Pattern Editor] Failed to save project:', e);
			}
		}
	}

	// Trigger reload when pattern changes so engine picks it up
	// The Toolbar's handleReload will detect we're in pattern editor and load the pattern
	let lastPatternSnapshot = '';
	let isInitialLoad = true;
	let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
	
	$: if (pattern && project) {
		const snapshot = JSON.stringify({
			id: pattern.id,
			patternTree: pattern.patternTree,
			instrumentType: pattern.instrumentType,
			settings: pattern.settings
		});
		
		if (snapshot !== lastPatternSnapshot) {
			lastPatternSnapshot = snapshot;
			// Only trigger reload if not initial load (to avoid double loading)
			if (!isInitialLoad) {
				// Clear any pending reload
				if (reloadTimeout) clearTimeout(reloadTimeout);
				// Debounce to avoid too many reloads
				reloadTimeout = setTimeout(() => {
					window.dispatchEvent(new CustomEvent('reloadProject'));
					reloadTimeout = null;
				}, 150);
			} else {
				isInitialLoad = false;
			}
		}
	}

	onMount(async () => {
		// Check if this is a sandbox project (starts with 'sandbox-')
		const isSandbox = $page.params.id?.startsWith('sandbox-') || false;
		
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
		
		// Check if pattern is already loaded (from previous navigation)
		if (project && $page.params.patternId) {
			const existingPattern = project.patterns?.find((pat: Pattern) => pat.id === $page.params.patternId);
			if (existingPattern) {
				// Pattern already loaded, skip loading state
				pattern = existingPattern;
				isLoading = false;
				loadingStore.stopLoading(); // Stop the loading overlay
			}
		}
		
		// Set view mode to pattern
		viewStore.setPattern();
		// Store the current pattern ID for navigation
		viewStore.setCurrentPatternId($page.params.patternId);
		// Select the pattern so sidebar shows parameters
		selectionStore.selectNode('root', null, true, false, $page.params.patternId);
		
		// If already have pattern, skip loading
		if (pattern) {
			return;
		}
		
		// Load project from localStorage
		const saved = localStorage.getItem(`project_${$page.params.id}`);
		if (saved) {
			try {
				const loadedProject = JSON.parse(saved);
				projectStore.set(loadedProject);
			} catch (e) {
				console.error('Failed to load project:', e);
				isLoading = false;
			}
		} else {
			// If no saved project, stop loading immediately
			isLoading = false;
		}

		// Auto-save subscription - save whenever project changes (works for sandbox too)
		unsubscribeAutoSave = projectStore.subscribe((p) => {
			if (p && $page.params.id) {
				// Debounce saves to avoid too many localStorage writes
				// This works for both regular and sandbox projects (localStorage only)
				setTimeout(() => {
					saveProject();
				}, 100);
			}
		});

		// If pattern doesn't exist, create it
		if (project && $page.params.patternId) {
			const existingPattern = project.patterns?.find((pat: Pattern) => pat.id === $page.params.patternId);
			if (!existingPattern) {
				// Create new pattern (empty, no default instruments)
				const newPattern = projectStore.createPattern(
					$page.params.id,
					`Pattern ${(project.patterns?.length || 0) + 1}`
				);
				projectStore.addPattern(newPattern);
				// Pattern will be loaded via reactivity
			}
		}
		
		// Initial load - trigger reload after a short delay to ensure engine is ready
		setTimeout(() => {
			isInitialLoad = false;
			window.dispatchEvent(new CustomEvent('reloadProject'));
		}, 300);
	});

	// Save before navigating away
	beforeNavigate(({ to, cancel }) => {
		// Save project before navigation
		saveProject();
	});

	// Save on component destruction
	onDestroy(() => {
		// Final save before component is destroyed
		saveProject();
		// Unsubscribe from auto-save
		if (unsubscribeAutoSave) {
			unsubscribeAutoSave();
		}
	});

	// No sync logic needed! Canvas now works directly with patterns via patternId prop.
	// Patterns are automatically saved when updated through projectStore.updatePattern()
</script>

{#if isLoading}
	<ProjectSkeleton viewMode="pattern" isPatternEditor={true} />
{:else if pattern}
	<Toolbar />
	<div class="pattern-editor">
		<div class="pattern-header">
		<div class="pattern-header-left">
			<button class="back-btn" on:click={() => {
				// Save before navigating
				saveProject();
				// Navigate to pattern list (pattern view)
				viewStore.setPattern();
				goto(`/project/${$page.params.id}`);
			}}>
				← Back to Patterns
			</button>
			<h2>{pattern.name}</h2>
			<input 
				type="text" 
				value={pattern.name}
				on:input={(e) => {
					const newName = e.currentTarget.value;
					projectStore.updatePattern(pattern.id, { name: newName });
				}}
				class="pattern-name-input"
			/>
		</div>
		<button 
			class="add-instrument-btn" 
			on:click={() => {
				if (!project || !pattern) return;
				
				// Create a new instrument with default kick settings
				const instrumentDefaults = {
					kick: { color: '#00ffff', settings: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 0.15 } }
				};
				const defaults = instrumentDefaults.kick;
				
				const newInstrument = {
					id: crypto.randomUUID(),
					instrumentType: 'kick',
					patternTree: {
						id: crypto.randomUUID(),
						division: 4,
						x: 400 + Math.random() * 200,
						y: 200 + Math.random() * 100,
						children: []
					},
					settings: { ...defaults.settings },
					instrumentSettings: undefined,
					color: defaults.color,
					volume: 1.0,
					pan: 0.0,
					mute: false,
					solo: false
				};
				
				// Add the instrument to the pattern
				projectStore.addPatternInstrument(pattern.id, newInstrument);
				
				// Select the new instrument so the user can see it
				selectionStore.selectNode(newInstrument.patternTree.id, null, true, false, pattern.id, newInstrument.id);
				
				// Update engine in real-time without stopping playback
				// Use a small delay to ensure store update completes
				setTimeout(() => {
					if (engine) {
						// Get the updated instrument from the store to ensure we have the latest data
						let currentProject = null;
						projectStore.subscribe((p) => (currentProject = p))();
						if (!currentProject) return;
						
						const updatedPattern = currentProject.patterns?.find((p) => p.id === pattern.id);
						if (!updatedPattern) return;
						
						const updatedInstruments = updatedPattern.instruments && Array.isArray(updatedPattern.instruments) && updatedPattern.instruments.length > 0
							? updatedPattern.instruments
							: [];
						
						const updatedInstrument = updatedInstruments.find((inst) => inst.id === newInstrument.id);
						if (!updatedInstrument) return;
						
						const patternTrackId = `__pattern_${pattern.id}_${newInstrument.id}`;
						const trackForEngine = {
							id: patternTrackId,
							projectId: pattern.projectId,
							instrumentType: updatedInstrument.instrumentType,
							patternTree: updatedInstrument.patternTree,
							settings: updatedInstrument.settings || {},
							instrumentSettings: updatedInstrument.instrumentSettings,
							volume: updatedInstrument.volume ?? 1.0,
							pan: updatedInstrument.pan ?? 0.0,
							color: updatedInstrument.color,
							mute: updatedInstrument.mute ?? false,
							solo: updatedInstrument.solo ?? false
						};
						
						// Add the track to the engine - updateTrack will add it if it doesn't exist
						engine.updateTrack(patternTrackId, trackForEngine);
					}
				}, 0);
			}}
			title="Add new instrument to pattern"
		>
			+ Instrument
		</button>
	</div>
	<Canvas patternId={pattern.id} />
		<Sidebar />
		<MidiEditor />
		<VelocityEditor />
		
		<!-- Synth Plugin Windows (only in pattern editor) -->
		{#if $synthPluginStore.length > 0}
			{#each $synthPluginStore as window}
				<SynthPluginWindow {window} />
			{/each}
		{/if}
	</div>
{:else}
	<div class="loading">Loading pattern...</div>
{/if}

<style>
	.pattern-editor {
		width: 100%;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.pattern-header {
		position: fixed;
		top: 60px; /* Below toolbar */
		left: 0;
		right: 0;
		height: 50px;
		background: #252525;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 0 20px;
		z-index: 1001;
	}

	.pattern-header-left {
		display: flex;
		align-items: center;
		gap: 16px;
		flex: 1;
	}

	.back-btn {
		background: #2d2d2d;
		color: #e8e8e8;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 6px 12px;
		cursor: pointer;
		font-size: 13px;
		transition: all 0.2s ease;
	}

	.back-btn:hover {
		background: #333333;
		border-color: rgba(255, 255, 255, 0.2);
	}

	.pattern-header h2 {
		margin: 0;
		color: #e8e8e8;
		font-size: 16px;
		font-weight: 600;
	}

	.pattern-name-input {
		background: #1a1a1a;
		color: #e8e8e8;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 6px 12px;
		font-size: 14px;
		min-width: 200px;
	}

	.pattern-name-input:focus {
		outline: none;
		border-color: #7ab8ff;
	}

	.add-instrument-btn {
		background: #2d2d2d;
		color: #e8e8e8;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 6px 12px;
		cursor: pointer;
		font-size: 13px;
		transition: all 0.2s ease;
		margin-left: auto;
	}

	.add-instrument-btn:hover {
		background: #333333;
		border-color: rgba(255, 255, 255, 0.2);
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		color: #b8b8b8;
	}
</style>

