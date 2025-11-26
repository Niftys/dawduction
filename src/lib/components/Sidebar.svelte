<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import type { StandaloneInstrument, PatternNode } from '$lib/types/pattern';
	import { midiToNoteName, noteNameToMidi } from '$lib/audio/utils/midiUtils';
	import InstrumentSelector from './sidebar/InstrumentSelector.svelte';
	import MixerControls from './sidebar/MixerControls.svelte';
	import SynthParameters from './sidebar/SynthParameters.svelte';
	import NoteControls from './sidebar/NoteControls.svelte';
	import { findNodeInTree, getInputValue, getSelectValue } from './sidebar/sidebarUtils';
	import '$lib/styles/components/Sidebar.css';

	let project: any;
	let selection: any;
	let engine: EngineWorklet | null = null;
	
	projectStore.subscribe((p) => (project = p));
	selectionStore.subscribe((s) => (selection = s));
	engineStore.subscribe((e) => (engine = e));

	// Find the selected standalone instrument or pattern
	$: selectedTrack = selection.selectedTrackId && project?.standaloneInstruments
		.find((i: StandaloneInstrument) => i.id === selection.selectedTrackId);
	$: selectedPattern = selection.selectedPatternId && project?.patterns
		.find((p) => p.id === selection.selectedPatternId);
	
	// Get the selected instrument from pattern (if in pattern edit mode)
	$: selectedInstrument = (() => {
		if (!selectedPattern || !selection.selectedInstrumentId) return null;
		const instruments = selectedPattern.instruments && Array.isArray(selectedPattern.instruments) && selectedPattern.instruments.length > 0
			? selectedPattern.instruments
			: (selectedPattern.instrumentType && selectedPattern.patternTree ? [{
				id: selectedPattern.id,
				instrumentType: selectedPattern.instrumentType,
				patternTree: selectedPattern.patternTree,
				settings: selectedPattern.settings || {},
				instrumentSettings: selectedPattern.instrumentSettings,
				color: selectedPattern.color || '#7ab8ff',
				volume: selectedPattern.volume ?? 1.0,
				pan: selectedPattern.pan ?? 0.0,
				mute: selectedPattern.mute,
				solo: selectedPattern.solo
			}] : []);
		return instruments.find(inst => inst.id === selection.selectedInstrumentId) || instruments[0] || null;
	})();
	
	// Get the pattern tree from selected instrument (if pattern), or track
	$: patternTree = selectedInstrument?.patternTree || selectedTrack?.patternTree;
	$: selectedNode = patternTree && selection.selectedNodeId 
		? findNodeInTree(patternTree, selection.selectedNodeId) 
		: null;
	$: isRootNode = selection.isRoot || false;
	
	// Get the active item (selected instrument from pattern, or standalone instrument) for settings/instrument type
	$: activeItem = selectedInstrument || selectedTrack;
	
	// Check if the selected standalone instrument/instrument is a melodic instrument
	const melodicInstruments = ['bass', 'subtractive', 'fm', 'wavetable', 'supersaw', 'pluck'];
	$: isMelodicInstrument = activeItem ? melodicInstruments.includes(activeItem.instrumentType) : false;
	
	// Force reactivity for standalone instrument values to ensure sliders update when number inputs change
	$: trackVolume = selectedTrack?.volume ?? selectedInstrument?.volume ?? 1.0;
	$: trackPan = selectedTrack?.pan ?? selectedInstrument?.pan ?? 0.0;
	$: trackSettings = activeItem?.settings ?? {};
	
	// Get all selected nodes (for multi-select)
	// Force reactivity by depending on both selectedNodes Set and selectedNodeId
	$: selectedNodes = (() => {
		if (!project || (!selection.selectedTrackId && !selection.selectedPatternId)) return [];
		
		// Get the pattern tree from selected instrument (if pattern), or standalone instrument
		const tree = patternTree;
		if (!tree) return [];
		
		// Use selectedNodes Set if it has items, otherwise fall back to selectedNodeId
		const nodeIds = selection.selectedNodes.size > 0 
			? Array.from(selection.selectedNodes)
			: (selection.selectedNodeId ? [selection.selectedNodeId] : []);
		
		if (nodeIds.length === 0) return [];
		
			// Map node IDs to actual node objects with their pattern/standaloneInstrument/instrument info
		return nodeIds.map((nodeId) => {
			const node = findNodeInTree(tree, nodeId);
			return node ? { 
				node, 
				pattern: selectedPattern, 
				track: selectedTrack,
				instrument: selectedInstrument,
				instrumentId: selection.selectedInstrumentId
			} : null;
		}).filter((item): item is { node: PatternNode; pattern?: any; track?: StandaloneInstrument; instrument?: any; instrumentId?: string | null } => item !== null);
	})();
	
	$: isMultiSelect = selectedNodes.length > 1;
	
	// Reactive values that update when selected nodes change
	$: currentPitch = selectedNodes.length > 0 ? getCommonValue((n) => n.pitch, 60) : 60;
	$: currentVelocity = selectedNodes.length > 0 ? getCommonValue((n) => n.velocity, 1.0) : 1.0;
	$: currentDivision = selectedNodes.length > 0 ? getCommonValue((n) => n.division, 1) : 1;
	
	// Get a value that's common across all selected nodes, or return the first one
	function getCommonValue<T>(getter: (node: any) => T | undefined, defaultValue: T): T {
		if (selectedNodes.length === 0) return defaultValue;
		if (selectedNodes.length === 1) {
			const value = getter(selectedNodes[0].node);
			return value !== undefined ? value : defaultValue;
		}
		
		// Check if all nodes have the same value
		const firstValue = getter(selectedNodes[0].node);
		const first = firstValue !== undefined ? firstValue : defaultValue;
		
		const allSame = selectedNodes.every(({ node }) => {
			const value = getter(node);
			const nodeValue = value !== undefined ? value : defaultValue;
			return nodeValue === first;
		});
		
		return allSame ? first : defaultValue;
	}
	
	// Check if all selected nodes have the same value for a property
	function hasMixedValues(getter: (node: any) => any, defaultValue: any): boolean {
		if (selectedNodes.length <= 1) return false;
		
		const firstValue = getter(selectedNodes[0].node);
		const first = firstValue !== undefined ? firstValue : defaultValue;
		
		return !selectedNodes.every(({ node }) => {
			const value = getter(node);
			const nodeValue = value !== undefined ? value : defaultValue;
			return nodeValue === first;
		});
	}
</script>

{#if activeItem && isRootNode}
	<div class="sidebar">
		<div class="sidebar-header">
			<h2>{selectedPattern ? 'Pattern Settings' : 'Instrument Settings'}</h2>
			<button class="close-btn" on:click={() => selectionStore.clearSelection()}>Close</button>
		</div>

		<div class="sidebar-content">
			<InstrumentSelector 
				selectedTrack={selectedTrack} 
				selectedPattern={selectedPattern} 
				isRootNode={isRootNode}
				selectedInstrumentId={selection.selectedInstrumentId}
				selectedInstrument={selectedInstrument}
			/>
			<MixerControls {selectedTrack} selectedInstrument={selectedInstrument} />
			<SynthParameters selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} trackSettings={trackSettings} />
		</div>
	</div>
{:else if activeItem && selectedNodes.length > 0 && !isRootNode}
	<div class="sidebar">
		<div class="sidebar-header">
			<h2>Note Settings</h2>
			<button class="close-btn" on:click={() => selectionStore.clearSelection()}>Close</button>
		</div>

		<div class="sidebar-content">
			<NoteControls
				{selectedTrack}
				{selectedNodes}
				{isMelodicInstrument}
				{isMultiSelect}
				{getCommonValue}
				{hasMixedValues}
			/>
		</div>
	</div>
{/if}
