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

	// Use $state with $effect for proper reactivity
	let project: any = $state(null);
	let selection: any = $state({ selectedNodes: new Set(), selectedTrackId: null, selectedPatternId: null, selectedInstrumentId: null, selectedNodeId: null, isRoot: false });
	let engine: EngineWorklet | null = null;
	
	$effect(() => {
		const unsubscribeProject = projectStore.subscribe((p) => {
			project = p;
		});
		const unsubscribeSelection = selectionStore.subscribe((s) => {
			selection = s;
		});
		const unsubscribeEngine = engineStore.subscribe((e) => {
			engine = e;
		});
		
		return () => {
			unsubscribeProject();
			unsubscribeSelection();
			unsubscribeEngine();
		};
	});

	// Find the selected standalone instrument or pattern
	const selectedTrack = $derived(selection.selectedTrackId && project?.standaloneInstruments
		? project.standaloneInstruments.find((i: StandaloneInstrument) => i.id === selection.selectedTrackId)
		: undefined);
	const selectedPattern = $derived(selection.selectedPatternId && project?.patterns
		? project.patterns.find((p: any) => p.id === selection.selectedPatternId)
		: undefined);
	
	// Get the selected instrument from pattern (if in pattern edit mode)
	const selectedInstrument = $derived((() => {
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
	})());
	
	// Get the pattern tree from selected instrument (if pattern), or track
	const patternTree = $derived(selectedInstrument?.patternTree || selectedTrack?.patternTree);
	const selectedNode = $derived(patternTree && selection.selectedNodeId 
		? findNodeInTree(patternTree, selection.selectedNodeId) 
		: null);
	const isRootNode = $derived(selection.isRoot || false);
	
	// Get the active item (selected instrument from pattern, or standalone instrument) for settings/instrument type
	const activeItem = $derived(selectedInstrument || selectedTrack);
	
	// Check if the selected standalone instrument/instrument is a melodic instrument
	const melodicInstruments = ['bass', 'subtractive', 'fm', 'wavetable', 'supersaw', 'pluck', 'pad', 'organ'];
	const isMelodicInstrument = $derived(activeItem ? melodicInstruments.includes(activeItem.instrumentType) : false);
	
	// Force reactivity for standalone instrument values to ensure sliders update when number inputs change
	const trackVolume = $derived(selectedTrack?.volume ?? selectedInstrument?.volume ?? 1.0);
	const trackPan = $derived(selectedTrack?.pan ?? selectedInstrument?.pan ?? 0.0);
	
	// Make trackSettings reactive to project changes by using $state and $effect
	// This ensures it updates immediately when settings are changed via updateSetting functions
	let trackSettings: Record<string, any> = $state({});
	
	$effect(() => {
		// Access project and selection to track changes
		if (!project) {
			trackSettings = {};
			return;
		}
		
		// Use selection IDs directly to ensure we're always getting fresh data
		const patternId = selection.selectedPatternId;
		const instrumentId = selection.selectedInstrumentId;
		const trackId = selection.selectedTrackId;
		
		// If we have a selected instrument in a pattern, get its settings from the project
		if (patternId && instrumentId) {
			const pattern = project.patterns?.find((p: any) => p.id === patternId);
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
				const instrument = instruments.find((inst: any) => inst.id === instrumentId) || instruments[0];
				// Create a new object reference to ensure Svelte detects the change
				trackSettings = instrument?.settings ? { ...instrument.settings } : {};
				return;
			}
		}
		
		// If we have a selected track, get its settings from the project
		if (trackId) {
			const track = project.standaloneInstruments?.find((t: any) => t.id === trackId);
			// Create a new object reference to ensure Svelte detects the change
			trackSettings = track?.settings ? { ...track.settings } : {};
			return;
		}
		
		trackSettings = {};
	});
	
	// Get all selected nodes (for multi-select)
	// Force reactivity by depending on both selectedNodes Set and selectedNodeId
	const selectedNodes = $derived((() => {
		if (!project || (!selection.selectedTrackId && !selection.selectedPatternId)) return [];
		
		// Use selectedNodes Set if it has items, otherwise fall back to selectedNodeId
		const nodeIds = selection.selectedNodes.size > 0 
			? Array.from(selection.selectedNodes)
			: (selection.selectedNodeId ? [selection.selectedNodeId] : []);
		
		if (nodeIds.length === 0) return [];
		
		// If we're in pattern editor mode, search across all instruments in the pattern
		// This allows multiselect to work across multiple instruments
		if (selection.selectedPatternId && selectedPattern) {
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
			
			// Search across all instruments to find nodes
			const foundNodes: Array<{ node: PatternNode; pattern?: any; track?: StandaloneInstrument; instrument?: any; instrumentId?: string | null }> = [];
			
			for (const instrument of instruments) {
				for (const nodeId of nodeIds) {
					// Skip if we already found this node
					if (foundNodes.some(n => n.node.id === nodeId)) continue;
					
					const node = findNodeInTree(instrument.patternTree, nodeId);
					if (node) {
						foundNodes.push({
							node,
							pattern: selectedPattern,
							track: null,
							instrument: instrument,
							instrumentId: instrument.id
						});
					}
				}
			}
			
			return foundNodes;
		}
		
		// For standalone instruments, search in the selected track's tree
		const tree = patternTree;
		if (!tree) return [];
		
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
	})());
	
	const isMultiSelect = $derived(selectedNodes.length > 1);
	
	// Reactive values that update when selected nodes change
	const currentPitch = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.pitch, 60) : 60);
	const currentVelocity = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.velocity, 1.0) : 1.0);
	const currentDivision = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.division, 1) : 1);
	
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
			<button class="close-btn" onclick={() => selectionStore.clearSelection()}>Close</button>
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
			<button class="close-btn" onclick={() => selectionStore.clearSelection()}>Close</button>
		</div>

		<div class="sidebar-content">
			<NoteControls
				{selectedTrack}
				selectedPattern={selectedPattern}
				{selectedNodes}
				{isMelodicInstrument}
				{isMultiSelect}
				{getCommonValue}
				{hasMixedValues}
				activeItem={activeItem}
			/>
		</div>
	</div>
{/if}
