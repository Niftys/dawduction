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
	const melodicInstruments = ['bass', 'subtractive', 'fm', 'wavetable', 'supersaw', 'pluck', 'pad', 'organ'];
	// Drum instruments that also support pitch editing
	const drumInstruments = ['kick', 'snare', 'hihat', 'clap', 'tom', 'cymbal', 'shaker', 'rimshot'];
	// Sample instruments that support pitch editing (via playback rate)
	const sampleInstruments = ['sample'];
	// All instruments that support pitch editing (melodic + drums + samples)
	const pitchEditableInstruments = [...melodicInstruments, ...drumInstruments, ...sampleInstruments];
	
	// Editor mode: 'pitch' or 'velocity' - use shared store to sync with NoteControls
	$: editorMode = $editorModeStore;
	
	// Check if we should show the MIDI editor
	// Show when 2+ nodes are selected (multiselect) for instruments that support pitch editing
	// Use selectedNodes.length instead of duplicating the logic
	// Note: We check selectedNodes (all nodes) for showing the editor, but use selectedNodesForPitch in pitch mode
	$: shouldShow = selectedNodes.length >= 2;
	
	// Ensure editor mode is set to 'pitch' when editor should show
	// This needs to happen before showPitchEditor/showVelocityEditor are computed
	$: if (shouldShow && !previousShouldShow && selectedNodes.length > 0) {
		// Editor is opening - ensure it starts in pitch mode
		// Set mode synchronously to avoid race conditions
		// Only set to pitch mode if there are non-muted nodes to show
		if (selectedNodesForPitch.length > 0) {
			editorModeStore.setMode('pitch');
		} else {
			// If all nodes are muted, default to velocity mode
			editorModeStore.setMode('velocity');
		}
		previousShouldShow = true;
	}
	
	// Show pitch editor when mode is 'pitch' and there are non-muted nodes
	$: showPitchEditor = shouldShow && editorMode === 'pitch' && selectedNodesForPitch.length > 0;
	
	// Show velocity editor when mode is 'velocity'
	$: showVelocityEditor = shouldShow && editorMode === 'velocity';
	
	// Auto-scroll for velocity mode
	// If velocities are high (>= 95%), ensure 100% is visible at the top
	$: if (showVelocityEditor && !previousShouldShow && selectedNodes.length > 0) {
		setTimeout(() => {
			if (gridContainer && pianoKeysContainer && selectedNodes.length > 0) {
				const velocities = selectedNodes.map(({ node }) => node.velocity ?? 1.0);
				const maxVelocity = Math.max(...velocities);
				const centerVelocity = (Math.min(...velocities) + maxVelocity) / 2;
				const centerRow = Math.round(centerVelocity * VELOCITY_STEPS);
				
				let targetScroll: number;
				// If max velocity is >= 95%, scroll to show 100% at the top
				if (maxVelocity >= 0.95) {
					// Scroll to top (0) to show 100% at the very top
					targetScroll = 0;
				} else {
					// Otherwise, center on selected velocities
					targetScroll = Math.max(0, ((VELOCITY_STEPS - centerRow) * KEY_HEIGHT) - (gridContainer.clientHeight / 2));
				}
				
				pianoKeysContainer.scrollTop = targetScroll;
				gridContainer.scrollTop = targetScroll;
			}
		}, 150);
	}
	
	// Get selected nodes for the current instrument (standalone or pattern)
	// Compute this independently of shouldShow to avoid circular dependency
	$: selectedNodes = (() => {
		if (!project || !selection) return [];
		
		// Need at least 2 nodes selected for multiselect editor
		if (selection.selectedNodes.size < 2) {
			return [];
		}
		
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
		
		// Check if this instrument type supports pitch editing
		if (!pitchEditableInstruments.includes(track.instrumentType)) {
			return [];
		}
		
		const nodes: Array<{ node: PatternNode; nodeId: string; index: number }> = [];
		let index = 0;
		
		// Helper to find leaf nodes (childmost nodes) in tree
		// Only include nodes that are selected AND have no children (leaf nodes)
		const findNodes = (node: PatternNode): void => {
			// Only add if selected AND is a leaf node (no children)
			if (selection.selectedNodes.has(node.id) && (!node.children || node.children.length === 0)) {
				nodes.push({ node, nodeId: node.id, index: index++ });
			}
			// Continue traversing children
			for (const child of node.children) {
				findNodes(child);
			}
		};
		
		findNodes(track.patternTree);
		return nodes;
	})();
	
	// Filtered nodes for pitch editor: exclude nodes with velocity === 0 (muted)
	$: selectedNodesForPitch = selectedNodes.filter(({ node }) => {
		const velocity = node.velocity ?? 1.0;
		return velocity > 0;
	});
	
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
	
	// Auto-scroll to center on selected notes ONLY when editor first opens (pitch mode)
	$: if (showPitchEditor && previousShouldShow && !hasAutoScrolled && selectedNodesForPitch.length > 0) {
		// Editor just opened in pitch mode - scroll to notes
		hasAutoScrolled = false;
		
		// Wait for DOM to be ready, then scroll
		setTimeout(() => {
			if (gridContainer && pianoKeysContainer && selectedNodesForPitch.length > 0) {
				const pitches = selectedNodesForPitch.map(({ node }) => node.pitch ?? 60);
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
		if (columnIndex >= selectedNodesForPitch.length) return;
		
		const { nodeId } = selectedNodesForPitch[columnIndex];
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
	// Use appropriate node list based on editor mode
	$: nodesForColumnWidth = showPitchEditor ? selectedNodesForPitch : selectedNodes;
	function updateColumnWidth() {
		if (gridArea && nodesForColumnWidth.length > 0) {
			columnWidth = Math.max(40, gridArea.clientWidth / nodesForColumnWidth.length);
		} else {
			columnWidth = 60;
		}
	}
	
	$: if (gridArea && nodesForColumnWidth.length > 0) {
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
							{#each selectedNodesForPitch as { node, nodeId }, columnIndex (nodeId)}
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
