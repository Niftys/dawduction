<script lang="ts">
	import { onMount } from 'svelte';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { projectStore } from '$lib/stores/projectStore';
	import { editorModeStore } from '$lib/stores/editorModeStore';
	import type { PatternNode } from '$lib/types/pattern';
	import '$lib/styles/components/VelocityEditor.css';

	let project: any;
	let selection: any;
	let editorContainer: HTMLDivElement;
	let gridArea: HTMLDivElement;
	let scaleContainer: HTMLDivElement;
	let gridContainer: HTMLDivElement;
	let columnWidth = 60;
	const ROW_HEIGHT = 20; // Height of each velocity row in pixels
	let hasAutoScrolled = false;
	let previousShouldShow = false;
	
	projectStore.subscribe((p) => (project = p));
	selectionStore.subscribe((s) => (selection = s));
	
	// Instruments that support pitch editing via MidiEditor (melodic + drums + samples)
	// VelocityEditor should NOT show for these - MidiEditor handles both pitch and velocity modes
	const pitchEditableInstruments = ['bass', 'subtractive', 'fm', 'wavetable', 'supersaw', 'pluck', 'pad', 'organ', 'kick', 'snare', 'hihat', 'clap', 'tom', 'cymbal', 'shaker', 'rimshot', 'sample'];
	
	// Check if we should show the velocity editor
	// Only show for instruments that DON'T support pitch editing
	// (MidiEditor handles velocity mode for pitch-editable instruments)
	$: shouldShow = (() => {
		if (!project || selection.selectedNodes.size < 2) {
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
		
		// Don't show for instruments that support pitch editing
		// MidiEditor handles both pitch and velocity modes for these instruments
		// Include TR-808 instruments (all start with 'tr808')
		const supportsPitchEditing = pitchEditableInstruments.includes(track.instrumentType) || 
		                             track.instrumentType?.startsWith('tr808');
		return !supportsPitchEditing;
	})();
	
	
	// Get selected nodes for the current instrument (standalone or pattern)
	$: selectedNodes = (() => {
		if (!shouldShow || !project) return [];
		
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
		
		if (!track) return [];
		
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
	
	// Velocity range (0 to 1)
	const VELOCITY_RANGE = { min: 0, max: 1 };
	const VELOCITY_STEPS = 50; // Number of velocity steps to display
	
	// Generate velocity rows
	$: velocityRows = (() => {
		const rows = [];
		for (let i = VELOCITY_STEPS; i >= 0; i--) {
			const velocity = i / VELOCITY_STEPS;
			rows.push({ velocity, value: Math.round(velocity * 100) });
		}
		return rows;
	})();
	
	// Total height of all rows
	$: totalRowsHeight = velocityRows.length * ROW_HEIGHT;
	
	// Auto-scroll to center on selected velocities when editor first opens
	// If velocities are high (>= 95%), ensure 100% is visible at the top
	$: if (shouldShow && !previousShouldShow && selectedNodes.length > 0) {
		hasAutoScrolled = false;
		previousShouldShow = true;
		
		setTimeout(() => {
			if (gridContainer && scaleContainer && selectedNodes.length > 0) {
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
					targetScroll = Math.max(0, ((VELOCITY_STEPS - centerRow) * ROW_HEIGHT) - (gridContainer.clientHeight / 2));
				}
				
				scaleContainer.scrollTop = targetScroll;
				gridContainer.scrollTop = targetScroll;
				hasAutoScrolled = true;
			}
		}, 150);
	} else if (!shouldShow && previousShouldShow) {
		previousShouldShow = false;
		hasAutoScrolled = false;
	} else if (shouldShow) {
		previousShouldShow = true;
	}
	
	// Handle scroll synchronization
	function handleScroll(event: Event) {
		const target = event.target as HTMLElement;
		if (target === scaleContainer && gridContainer) {
			gridContainer.scrollTop = target.scrollTop;
		} else if (target === gridContainer && scaleContainer) {
			scaleContainer.scrollTop = target.scrollTop;
		}
	}
	
	// Handle click on grid cell
	function handleGridClick(columnIndex: number, velocity: number, event: MouseEvent) {
		if (columnIndex >= selectedNodes.length) return;
		
		const { nodeId } = selectedNodes[columnIndex];
		updateNodeVelocity(nodeId, velocity);
	}
	
	function updateNodeVelocity(nodeId: string, newVelocity: number) {
		if (!project) return;
		
		// Clamp velocity to valid range
		const clampedVelocity = Math.max(0, Math.min(1, newVelocity));
		
		// Update velocity for standalone instrument or pattern instrument
		if (selection.selectedTrackId) {
			projectStore.updateNodeVelocity(selection.selectedTrackId, nodeId, clampedVelocity);
		} else if (selection.selectedPatternId && selection.selectedInstrumentId) {
			projectStore.updatePatternNodeVelocity(selection.selectedPatternId, nodeId, clampedVelocity, selection.selectedInstrumentId);
		} else {
			return;
		}
		
		window.dispatchEvent(new CustomEvent('reloadProject'));
	}
	
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
		
		const checkAndObserve = () => {
			if (gridArea) {
				resizeObserver.observe(gridArea);
			}
		};
		
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
		
		// Check if we have a track (standalone instrument) or pattern instrument
		if (selection.selectedTrackId) {
			return project.standaloneInstruments?.find((i: any) => i.id === selection.selectedTrackId) || null;
		}
		
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
	<div class="velocity-editor" bind:this={editorContainer}>
		<div class="velocity-roll-container">
			<!-- Velocity Scale (Left Side) -->
			<div class="velocity-scale" bind:this={scaleContainer} on:scroll={handleScroll}>
				<div class="velocity-scale-content" style="height: {totalRowsHeight}px">
					{#each velocityRows as row (row.velocity)}
						<div 
							class="velocity-scale-row"
							style="height: {ROW_HEIGHT}px"
						>
							<span class="scale-label">{row.value}%</span>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Grid Area (Right Side) -->
			<div class="grid-area" bind:this={gridArea}>
				<div class="grid-container" bind:this={gridContainer} on:scroll={handleScroll}>
					<div class="grid-content" style="height: {totalRowsHeight}px">
						{#each selectedNodes as { node, nodeId }, columnIndex (nodeId)}
							{@const currentVelocity = node.velocity ?? 1.0}
							<div class="grid-column" style="width: {columnWidth}px">
								{#each velocityRows as row (row.velocity)}
									{@const isActive = Math.abs(row.velocity - currentVelocity) < (1 / VELOCITY_STEPS / 2)}
									<div
										class="grid-cell {isActive ? 'active' : ''}"
										style="height: {ROW_HEIGHT}px"
										role="gridcell"
										tabindex="0"
										on:click={(e) => handleGridClick(columnIndex, row.velocity, e)}
										on:mousedown={(e) => e.preventDefault()}
										on:keydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												handleGridClick(columnIndex, row.velocity, e);
											}
										}}
									>
										{#if isActive}
											<div class="velocity-block" style="background-color: {selectedTrack?.color || '#7ab8ff'}">
												<span class="velocity-label">{Math.round(currentVelocity * 100)}%</span>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

