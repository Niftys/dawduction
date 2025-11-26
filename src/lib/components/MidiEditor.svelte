<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { editorModeStore } from '$lib/stores/editorModeStore';
	import { midiToNoteName } from '$lib/audio/utils/midiUtils';
	import type { PatternNode } from '$lib/types/pattern';
	import { updateEnginePatternTree, createUpdateContext } from '$lib/utils/patternTreeUpdater';
	import '$lib/styles/components/MidiEditor.css';

	let project: any;
	let selection: any;
	let engine: any = null;
	engineStore.subscribe((e) => (engine = e));
	let editorContainer: HTMLDivElement;
	let gridArea: HTMLDivElement;
	let pianoKeysContainer: HTMLDivElement;
	let gridContainer: HTMLDivElement;
	let columnWidth = 60;
	const KEY_HEIGHT = 20; // Height of each key in pixels
	let hasAutoScrolled = false; // Track if we've done initial auto-scroll
	let previousShouldShow = false; // Track when editor opens/closes
	
	projectStore.subscribe((p) => (project = p));
	selectionStore.subscribe((s) => (selection = s));
	
	// Melodic instruments that support pitch editing
	const melodicInstruments = ['bass', 'subtractive', 'fm', 'wavetable', 'supersaw', 'pluck'];
	
	// Editor mode: 'pitch' or 'velocity' - use shared store to sync with NoteControls
	$: editorMode = $editorModeStore;
	
	// Check if we should show the MIDI editor
	// Show when 2+ nodes are selected (multiselect) for melodic instruments
	$: shouldShow = (() => {
		if (!project) {
			return false;
		}
		
		// Need at least 2 nodes selected for multiselect editor
		if (selection.selectedNodes.size < 2) {
			return false;
		}
		
		// Check if we have a track (standalone instrument) or pattern instrument
		let track = null;
		if (selection.selectedTrackId) {
			track = project.standaloneInstruments?.find((i: any) => i.id === selection.selectedTrackId);
		}
		
		// If no standalone track, check if we have a pattern instrument
		if (!track && selection.selectedPatternId && selection.selectedInstrumentId) {
			const pattern = project.patterns?.find((p: any) => p.id === selection.selectedPatternId);
			if (pattern) {
				const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
					? pattern.instruments
					: (pattern.instrumentType && pattern.patternTree ? [{
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
					}] : []);
				track = instruments.find((inst: any) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
			}
		}
		
		if (!track) return false;
		
		// Only show for melodic instruments
		return melodicInstruments.includes(track.instrumentType);
	})();
	
	// Show pitch editor when mode is 'pitch'
	$: showPitchEditor = shouldShow && editorMode === 'pitch';
	
	// Show velocity editor when mode is 'velocity'
	$: showVelocityEditor = shouldShow && editorMode === 'velocity';
	
	// Update body class to adjust canvas position
	$: {
		if (typeof document !== 'undefined') {
			if (shouldShow) {
				document.body.classList.add('midi-editor-visible');
			} else {
				document.body.classList.remove('midi-editor-visible');
			}
		}
	}
	
	// Auto-scroll for velocity mode
	$: if (showVelocityEditor && !previousShouldShow && selectedNodes.length > 0) {
		setTimeout(() => {
			if (gridContainer && pianoKeysContainer && selectedNodes.length > 0) {
				const velocities = selectedNodes.map(({ node }) => node.velocity ?? 1.0);
				const centerVelocity = (Math.min(...velocities) + Math.max(...velocities)) / 2;
				const centerRow = Math.round(centerVelocity * VELOCITY_STEPS);
				const targetScroll = Math.max(0, ((VELOCITY_STEPS - centerRow) * KEY_HEIGHT) - (gridContainer.clientHeight / 2));
				
				pianoKeysContainer.scrollTop = targetScroll;
				gridContainer.scrollTop = targetScroll;
			}
		}, 150);
	}
	
	// Get selected nodes for the current instrument (standalone or pattern)
	$: selectedNodes = (() => {
		if (!shouldShow || !project) return [];
		
		// Get track (standalone instrument) or pattern instrument
		let track = null;
		if (selection.selectedTrackId) {
			track = project.standaloneInstruments?.find((i: any) => i.id === selection.selectedTrackId);
		}
		
		// If no standalone track, check if we have a pattern instrument
		if (!track && selection.selectedPatternId && selection.selectedInstrumentId) {
			const pattern = project.patterns?.find((p: any) => p.id === selection.selectedPatternId);
			if (pattern) {
				const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
					? pattern.instruments
					: (pattern.instrumentType && pattern.patternTree ? [{
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
					}] : []);
				track = instruments.find((inst: any) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
			}
		}
		
		if (!track || !track.patternTree) return [];
		
		const nodes: Array<{ node: PatternNode; nodeId: string; index: number }> = [];
		let index = 0;
		
		// Helper to find nodes in tree
		const findNodes = (node: PatternNode): void => {
			if (selection.selectedNodes.has(node.id)) {
				nodes.push({ node, nodeId: node.id, index: index++ });
			}
			for (const child of node.children) {
				findNodes(child);
			}
		};
		
		findNodes(track.patternTree);
		return nodes;
	})();
	
	// Full pitch range (C0 to C8 = MIDI 12 to 108)
	const FULL_PITCH_RANGE = { min: 12, max: 108 };
	
	// Generate all notes in full range for piano keys
	$: allPianoKeys = (() => {
		const keys = [];
		for (let pitch = FULL_PITCH_RANGE.max; pitch >= FULL_PITCH_RANGE.min; pitch--) {
			const noteName = midiToNoteName(pitch);
			const isBlack = noteName.includes('#');
			keys.push({ pitch, noteName, isBlack });
		}
		return keys;
	})();
	
	// Total height of all keys (for scrolling)
	$: totalKeysHeight = allPianoKeys.length * KEY_HEIGHT;
	
	// Auto-scroll to center on selected notes ONLY when editor first opens
	$: if (shouldShow && !previousShouldShow && selectedNodes.length > 0) {
		// Editor just opened - reset auto-scroll flag and scroll to notes
		hasAutoScrolled = false;
		previousShouldShow = true;
		
		// Wait for DOM to be ready, then scroll
		setTimeout(() => {
			if (gridContainer && pianoKeysContainer && selectedNodes.length > 0) {
				const pitches = selectedNodes.map(({ node }) => node.pitch ?? 60);
				const centerPitch = Math.round((Math.min(...pitches) + Math.max(...pitches)) / 2);
				const centerRow = FULL_PITCH_RANGE.max - centerPitch;
				const targetScroll = Math.max(0, (centerRow * KEY_HEIGHT) - (gridContainer.clientHeight / 2));
				
				pianoKeysContainer.scrollTop = targetScroll;
				gridContainer.scrollTop = targetScroll;
				hasAutoScrolled = true;
			}
		}, 150);
	} else if (!shouldShow && previousShouldShow) {
		// Editor just closed - reset flags
		previousShouldShow = false;
		hasAutoScrolled = false;
	} else if (shouldShow) {
		// Editor is open - keep tracking state
		previousShouldShow = true;
	}
	
	// Get note position for a given pitch (relative to full range)
	function getNoteRow(pitch: number): number {
		return FULL_PITCH_RANGE.max - pitch;
	}
	
	// Get pitch for a given row (relative to full range)
	function getPitchFromRow(row: number): number {
		return FULL_PITCH_RANGE.max - row;
	}
	
	
	// Handle scroll synchronization between piano keys and grid
	function handleScroll(event: Event) {
		const target = event.target as HTMLElement;
		if (target === pianoKeysContainer && gridContainer) {
			gridContainer.scrollTop = target.scrollTop;
		} else if (target === gridContainer && pianoKeysContainer) {
			pianoKeysContainer.scrollTop = target.scrollTop;
		}
	}
	
	// Handle click on grid cell (pitch mode)
	function handleGridClick(columnIndex: number, pitch: number, event: MouseEvent) {
		if (columnIndex >= selectedNodes.length) return;
		
		const { nodeId } = selectedNodes[columnIndex];
		updateNodePitch(nodeId, pitch);
	}
	
	// Handle click on grid cell (velocity mode)
	function handleVelocityGridClick(columnIndex: number, velocity: number, event: MouseEvent) {
		if (columnIndex >= selectedNodes.length) return;
		
		const { nodeId } = selectedNodes[columnIndex];
		updateNodeVelocity(nodeId, velocity);
	}
	
	function updateNodePitch(nodeId: string, newPitch: number) {
		if (!project) return;
		
		// Clamp pitch to valid MIDI range
		const clampedPitch = Math.max(0, Math.min(127, newPitch));
		
		// Update based on whether it's a standalone track or pattern instrument
		if (selection.selectedTrackId) {
			projectStore.updateNodePitch(selection.selectedTrackId, nodeId, clampedPitch);
			updateEnginePatternTree(engine, createUpdateContext({
				trackId: selection.selectedTrackId,
				selection
			}));
		} else if (selection.selectedPatternId && selection.selectedInstrumentId) {
			projectStore.updatePatternNodePitch(selection.selectedPatternId, nodeId, clampedPitch, selection.selectedInstrumentId);
			updateEnginePatternTree(engine, createUpdateContext({
				patternId: selection.selectedPatternId,
				instrumentId: selection.selectedInstrumentId,
				selection
			}));
		}
	}
	
	function updateNodeVelocity(nodeId: string, newVelocity: number) {
		if (!project) return;
		
		// Clamp velocity to valid range
		const clampedVelocity = Math.max(0, Math.min(1, newVelocity));
		
		// Update based on whether it's a standalone track or pattern instrument
		if (selection.selectedTrackId) {
			projectStore.updateNodeVelocity(selection.selectedTrackId, nodeId, clampedVelocity);
			updateEnginePatternTree(engine, createUpdateContext({
				trackId: selection.selectedTrackId,
				selection
			}));
		} else if (selection.selectedPatternId && selection.selectedInstrumentId) {
			projectStore.updatePatternNodeVelocity(selection.selectedPatternId, nodeId, clampedVelocity, selection.selectedInstrumentId);
			updateEnginePatternTree(engine, createUpdateContext({
				patternId: selection.selectedPatternId,
				instrumentId: selection.selectedInstrumentId,
				selection
			}));
		}
	}
	
	
	// Velocity range (0 to 1)
	const VELOCITY_STEPS = 50;
	$: velocityRows = (() => {
		const rows = [];
		for (let i = VELOCITY_STEPS; i >= 0; i--) {
			const velocity = i / VELOCITY_STEPS;
			rows.push({ velocity, value: Math.round(velocity * 100) });
		}
		return rows;
	})();
	$: totalVelocityRowsHeight = velocityRows.length * KEY_HEIGHT;
	
	// Calculate column width based on number of selected notes
	function updateColumnWidth() {
		if (gridArea && selectedNodes.length > 0) {
			columnWidth = Math.max(40, gridArea.clientWidth / selectedNodes.length);
		} else {
			columnWidth = 60;
		}
	}
	
	$: if (gridArea && selectedNodes.length > 0) {
		updateColumnWidth();
	}
	
	onMount(() => {
		const resizeObserver = new ResizeObserver(() => {
			updateColumnWidth();
		});
		
		// Watch for gridArea to be available
		const checkAndObserve = () => {
			if (gridArea) {
				resizeObserver.observe(gridArea);
			}
		};
		
		// Check immediately and after a short delay
		checkAndObserve();
		setTimeout(checkAndObserve, 100);
		
		window.addEventListener('resize', updateColumnWidth);
		
		return () => {
			resizeObserver.disconnect();
			window.removeEventListener('resize', updateColumnWidth);
		};
	});
	
	// Get selected track/instrument for color
	$: selectedTrack = (() => {
		if (!shouldShow || !project) return null;
		
		// Try standalone instrument first
		if (selection.selectedTrackId) {
			return project.standaloneInstruments?.find((i: any) => i.id === selection.selectedTrackId) || null;
		}
		
		// Try pattern instrument
		if (selection.selectedPatternId && selection.selectedInstrumentId) {
			const pattern = project.patterns?.find((p: any) => p.id === selection.selectedPatternId);
			if (pattern) {
				const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
					? pattern.instruments
					: (pattern.instrumentType && pattern.patternTree ? [{
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
					}] : []);
				return instruments.find((inst: any) => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
			}
		}
		
		return null;
	})();
</script>

{#if shouldShow && selectedNodes.length > 0}
	<div class="midi-editor" bind:this={editorContainer}>
		<!-- Mode Toggle -->
		<div class="editor-mode-toggle">
			<button
				class="mode-btn"
				class:active={editorMode === 'pitch'}
				on:click={() => editorModeStore.setMode('pitch')}
				title="Pitch Editor"
			>
				Pitch
			</button>
			<button
				class="mode-btn"
				class:active={editorMode === 'velocity'}
				on:click={() => editorModeStore.setMode('velocity')}
				title="Velocity Editor"
			>
				Velocity
			</button>
		</div>
		
		<div class="piano-roll-container">
			{#if showPitchEditor}
				<!-- Piano Keys (Left Side) -->
				<div class="piano-keys" bind:this={pianoKeysContainer} on:scroll={handleScroll}>
					<div class="piano-keys-content" style="height: {totalKeysHeight}px">
						{#each allPianoKeys as key (key.pitch)}
							<div 
								class="piano-key {key.isBlack ? 'black' : 'white'}"
								style="height: {KEY_HEIGHT}px"
							>
								<span class="key-label">{key.noteName}</span>
							</div>
						{/each}
					</div>
				</div>
				
				<!-- Grid Area (Right Side) - Pitch Mode -->
				<div class="grid-area" bind:this={gridArea}>
					<div class="grid-container" bind:this={gridContainer} on:scroll={handleScroll}>
						<div class="grid-content" style="height: {totalKeysHeight}px">
							{#each selectedNodes as { node, nodeId }, columnIndex (nodeId)}
								{@const currentPitch = node.pitch ?? 60}
								<div class="grid-column" style="width: {columnWidth}px">
									{#each allPianoKeys as key (key.pitch)}
										{@const isActive = key.pitch === currentPitch}
										<div
											class="grid-cell {key.isBlack ? 'black' : 'white'} {isActive ? 'active' : ''}"
											style="height: {KEY_HEIGHT}px"
											role="gridcell"
											tabindex="0"
											on:click={(e) => handleGridClick(columnIndex, key.pitch, e)}
											on:mousedown={(e) => e.preventDefault()}
											on:keydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													handleGridClick(columnIndex, key.pitch, e);
												}
											}}
										>
											{#if isActive}
												<div class="note-block" style="background-color: {selectedTrack?.color || '#7ab8ff'}">
													<span class="note-label">{key.noteName}</span>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else if showVelocityEditor}
				<!-- Velocity Scale (Left Side) -->
				<div class="piano-keys" bind:this={pianoKeysContainer} on:scroll={handleScroll}>
					<div class="piano-keys-content" style="height: {totalVelocityRowsHeight}px">
						{#each velocityRows as row (row.velocity)}
							<div 
								class="piano-key white"
								style="height: {KEY_HEIGHT}px"
							>
								<span class="key-label">{row.value}%</span>
							</div>
						{/each}
					</div>
				</div>
				
				<!-- Grid Area (Right Side) - Velocity Mode -->
				<div class="grid-area" bind:this={gridArea}>
					<div class="grid-container" bind:this={gridContainer} on:scroll={handleScroll}>
						<div class="grid-content" style="height: {totalVelocityRowsHeight}px">
							{#each selectedNodes as { node, nodeId }, columnIndex (nodeId)}
								{@const currentVelocity = node.velocity ?? 1.0}
								<div class="grid-column" style="width: {columnWidth}px">
									{#each velocityRows as row (row.velocity)}
										{@const isActive = Math.abs(row.velocity - currentVelocity) < (1 / VELOCITY_STEPS / 2)}
										<div
											class="grid-cell white {isActive ? 'active' : ''}"
											style="height: {KEY_HEIGHT}px"
											role="gridcell"
											tabindex="0"
											on:click={(e) => handleVelocityGridClick(columnIndex, row.velocity, e)}
											on:mousedown={(e) => e.preventDefault()}
											on:keydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													handleVelocityGridClick(columnIndex, row.velocity, e);
												}
											}}
										>
											{#if isActive}
												<div class="note-block" style="background-color: {selectedTrack?.color || '#7ab8ff'}">
													<span class="note-label">{Math.round(currentVelocity * 100)}%</span>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
