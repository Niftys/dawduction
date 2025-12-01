<script lang="ts">
	/**
	 * InstrumentSelector Component
	 * 
	 * TERMINOLOGY:
	 * - selectedTrack: A STANDALONE INSTRUMENT (legacy variable name, actually a StandaloneInstrument)
	 * - selectedPattern: A PATTERN (container for instruments)
	 * 
	 * This component allows selecting/changing the instrument type (synth type).
	 * 
	 * When a pattern is selected and user clicks an instrument type:
	 * - Creates a NEW instrument with that type and adds it to the pattern
	 * - Does NOT replace existing instruments in the pattern
	 * 
	 * When a standalone instrument is selected and user clicks an instrument type:
	 * - Updates that instrument's type (replaces it)
	 */
	import type { StandaloneInstrument, Pattern, Instrument } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';

	const {
		selectedTrack = undefined,
		selectedPattern = undefined,
		isRootNode = false,
		selectedInstrumentId = null,
		selectedInstrument = undefined
	}: {
		selectedTrack?: StandaloneInstrument | undefined;
		selectedPattern?: Pattern | undefined;
		isRootNode?: boolean;
		selectedInstrumentId?: string | null;
		selectedInstrument?: Instrument | undefined;
	} = $props();
	
	let engine: EngineWorklet | null = null;
	let project: any = $state(null);
	let selection: any = $state(null);
	
	$effect(() => {
		const unsubscribeEngine = engineStore.subscribe((e) => (engine = e));
		const unsubscribeProject = projectStore.subscribe((p) => (project = p));
		const unsubscribeSelection = selectionStore.subscribe((s) => (selection = s));
		
		return () => {
			unsubscribeEngine();
			unsubscribeProject();
			unsubscribeSelection();
		};
	});

	const nonMelodicInstruments = [
		{ value: 'kick', label: 'Kick', color: '#00ffff' },
		{ value: 'snare', label: 'Snare', color: '#ff00ff' },
		{ value: 'hihat', label: 'Hi-Hat', color: '#ffff00' },
		{ value: 'clap', label: 'Clap', color: '#ff6600' },
		{ value: 'tom', label: 'Tom', color: '#00ff00' },
		{ value: 'cymbal', label: 'Cymbal', color: '#ff0066' },
		{ value: 'shaker', label: 'Shaker', color: '#6600ff' },
		{ value: 'rimshot', label: 'Rimshot', color: '#ff9900' }
	];
	
	const melodicInstrumentsList = [
		{ value: 'bass', label: 'Bass', color: '#0066ff' },
		{ value: 'subtractive', label: 'Subtractive', color: '#00ffcc' },
		{ value: 'fm', label: 'FM', color: '#cc00ff' },
		{ value: 'wavetable', label: 'Wavetable', color: '#ffcc00' },
		{ value: 'supersaw', label: 'Supersaw', color: '#ff3366' },
		{ value: 'pluck', label: 'Pluck', color: '#66ff99' },
		{ value: 'pad', label: 'Pad', color: '#9966ff' },
		{ value: 'organ', label: 'Organ', color: '#ff9966' }
	];

	const instrumentDefaults = {
		kick: { color: '#00ffff', settings: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 0.15 } },
		snare: { color: '#ff00ff', settings: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.1 } },
		hihat: { color: '#ffff00', settings: { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.01 } },
		clap: { color: '#ff6600', settings: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.05 } },
		tom: { color: '#00ff00', settings: { attack: 0.01, decay: 0.4, sustain: 0.0, release: 0.1 } },
		cymbal: { color: '#ff0066', settings: { attack: 0.01, decay: 0.5, sustain: 0.0, release: 0.2 } },
		shaker: { color: '#6600ff', settings: { attack: 0.01, decay: 0.3, sustain: 0.0, release: 0.1 } },
		rimshot: { color: '#ff9900', settings: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.05 } },
		subtractive: { color: '#00ffcc', settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, osc1Type: 'saw', osc2Type: 'saw', osc2Detune: 0, filterCutoff: 5000, filterResonance: 0.5 } },
		fm: { color: '#cc00ff', settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, operators: [{ frequency: 1, amplitude: 1, waveform: 'sine' }] } },
		wavetable: { color: '#ffcc00', settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3 } },
		supersaw: { color: '#ff3366', settings: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, numOscillators: 7, detune: 0.1, spread: 0.5, filterCutoff: 8000, filterResonance: 0.5, lfoRate: 0, lfoAmount: 0 } },
		pluck: { color: '#66ff99', settings: { attack: 0.01, decay: 0.3, sustain: 0.0, release: 0.4, damping: 0.96 } },
		bass: { color: '#0066ff', settings: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3, osc1Type: 'saw', subLevel: 0.6, saturation: 0.3, filterCutoff: 2000, filterResonance: 0.3 } },
		pad: { color: '#9966ff', settings: { attack: 0.5, decay: 0.3, sustain: 0.9, release: 1.5, numOscillators: 8, detune: 0.15, spread: 0.7, oscType: 'saw', filterCutoff: 4000, filterResonance: 0.3, pitchLfoRate: 0.5, pitchLfoAmount: 0.02, filterLfoRate: 0.3, filterLfoAmount: 1000 } },
		organ: { color: '#ff9966', settings: { attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.2, drawbars: [0.8, 0.0, 1.0, 0.0, 0.6, 0.0, 0.4, 0.0, 0.2], rotarySpeed: 4.0, rotaryDepth: 0.3, filterCutoff: 8000, filterResonance: 0.2 } }
	};

	// Get the active item (selected instrument from pattern, or standalone instrument)
	// Use $state with $effect to ensure proper reactivity when store updates
	let activeItem: any = $state(selectedInstrument || selectedTrack);
	
	$effect(() => {
		// Force reactivity by accessing project and selection
		if (!project || !selection) {
			const fallback = selectedInstrument || selectedTrack;
			if (activeItem?.id !== fallback?.id || activeItem?.instrumentType !== fallback?.instrumentType) {
				activeItem = fallback;
			}
			return;
		}
		
		// If we have a selected instrument in a pattern, get it from the project
		if (selectedPattern && selection.selectedInstrumentId) {
			const patterns = project.patterns;
			if (patterns) {
				const pattern = patterns.find((p: any) => p.id === selectedPattern.id);
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
					const instrument = instruments.find((inst: any) => inst.id === selection.selectedInstrumentId) || instruments[0];
					if (instrument) {
						// Only update if the instrument type or ID actually changed
						if (activeItem?.id !== instrument.id || activeItem?.instrumentType !== instrument.instrumentType) {
							activeItem = instrument; // Use the instrument directly, not a copy
						}
						return;
					}
				}
			}
		}
		
		// If we have a selected track, get it from the project
		if (selectedTrack && selection.selectedTrackId) {
			const standaloneInstruments = project.standaloneInstruments;
			if (standaloneInstruments) {
				const track = standaloneInstruments.find((t: any) => t.id === selection.selectedTrackId);
				if (track) {
					// Only update if the track type or ID actually changed
					if (activeItem?.id !== track.id || activeItem?.instrumentType !== track.instrumentType) {
						activeItem = track; // Use the track directly, not a copy
					}
					return;
				}
			}
		}
		
		// Fallback to props
		const fallback = selectedInstrument || selectedTrack;
		if (activeItem?.id !== fallback?.id || activeItem?.instrumentType !== fallback?.instrumentType) {
			activeItem = fallback;
		}
	});
	
	async function updateInstrumentType(type: string) {
		const defaults = instrumentDefaults[type as keyof typeof instrumentDefaults];
		if (!defaults) return;
		
		// If a root node is selected, switch the instrument type (preserving settings)
		if (isRootNode) {
			// If a pattern instrument is selected, switch that instrument's type
			if (selectedPattern && selectedInstrumentId && project) {
				// Get the latest pattern from the project store to ensure we have the most up-to-date data
				const latestPattern = project.patterns?.find((p: any) => p.id === selectedPattern.id);
				if (!latestPattern) return;
				
				// Get all instruments from pattern
				const patternInstruments = latestPattern.instruments && Array.isArray(latestPattern.instruments) && latestPattern.instruments.length > 0
					? latestPattern.instruments
					: (latestPattern.instrumentType && latestPattern.patternTree ? [{
						id: latestPattern.id,
						instrumentType: latestPattern.instrumentType,
						patternTree: latestPattern.patternTree,
						settings: latestPattern.settings || {},
						instrumentSettings: latestPattern.instrumentSettings,
						color: latestPattern.color || '#7ab8ff',
						volume: latestPattern.volume ?? 1.0,
						pan: latestPattern.pan ?? 0.0,
						mute: latestPattern.mute,
						solo: latestPattern.solo
					}] : []);
				
				// Find the selected instrument
				const instrument = patternInstruments.find((inst: any) => inst.id === selectedInstrumentId);
				if (instrument) {
					// Initialize instrumentSettings if it doesn't exist
					const instrumentSettings = instrument.instrumentSettings || {};
					
					// Save current settings for the current instrument type before switching
					if (instrument.instrumentType && instrument.settings) {
						instrumentSettings[instrument.instrumentType] = { ...instrument.settings };
					}
					
					// Restore previously saved settings for the new instrument type, or use defaults
					const newSettings = instrumentSettings[type] 
						? { ...instrumentSettings[type] }
						: { ...defaults.settings };
					
					// Update the instrument in the pattern
					projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrumentId, {
						instrumentType: type,
						color: defaults.color,
						settings: newSettings,
						instrumentSettings: instrumentSettings
					});
					
					// Update the engine immediately - call engine directly for instant update
					if (!engine) {
						console.error('❌ Engine is null, cannot update');
						return;
					}
					
					const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrumentId}`;
					
					// Get updated instrument from store (store update is synchronous, so this should have the new data)
					let currentProject: any = null;
					projectStore.subscribe((p: any) => (currentProject = p))();
					
					if (!currentProject) return;
					
					const updatedPattern = currentProject.patterns?.find((p: any) => p.id === selectedPattern.id);
					if (!updatedPattern) return;
					
					const instruments = updatedPattern.instruments && Array.isArray(updatedPattern.instruments) && updatedPattern.instruments.length > 0
						? updatedPattern.instruments
						: [];
					const updatedInstrument = instruments.find((inst: any) => inst.id === selectedInstrumentId);
					
					if (!updatedInstrument) return;
					
					const trackForEngine = {
						id: patternTrackId,
						projectId: selectedPattern.projectId,
						instrumentType: type,
						patternTree: updatedInstrument.patternTree,
						settings: newSettings,
						instrumentSettings: instrumentSettings,
						volume: updatedInstrument.volume ?? 1.0,
						pan: updatedInstrument.pan ?? 0.0,
						color: defaults.color,
						mute: updatedInstrument.mute ?? false,
						solo: updatedInstrument.solo ?? false
					};
					
					// Call engine.updateTrack directly for immediate synchronous update
					if (engine) {
						engine.updateTrack(patternTrackId, trackForEngine);
					}
					return;
				}
			}
			
			// If a track is selected, update that track's instrument type
			if (selectedTrack && project) {
				// Get the latest track from the project store to ensure we have the most up-to-date data
				const latestTrack = project.standaloneInstruments?.find((t: any) => t.id === selectedTrack.id);
				if (!latestTrack) return;
				
				// Initialize instrumentSettings if it doesn't exist
				const instrumentSettings = latestTrack.instrumentSettings || {};
				
				// Save current settings for the current instrument type before switching
				if (latestTrack.instrumentType && latestTrack.settings) {
					instrumentSettings[latestTrack.instrumentType] = { ...latestTrack.settings };
				}
				
				// Restore previously saved settings for the new instrument type, or use defaults
				const newSettings = instrumentSettings[type] 
					? { ...instrumentSettings[type] }
					: { ...defaults.settings };
				
				// Update track
				projectStore.updateStandaloneInstrument(selectedTrack.id, {
					instrumentType: type,
					color: defaults.color,
					settings: newSettings,
					instrumentSettings: instrumentSettings
				});
				
				// Update the engine immediately - call engine directly for instant update
				if (!engine) return;
				
				// Get updated track from store (store update is synchronous, so this should have the new data)
				let currentProject: any = null;
				projectStore.subscribe((p: any) => (currentProject = p))();
				
				if (!currentProject) return;
				
				const updatedTrack = currentProject.standaloneInstruments?.find((t: any) => t.id === selectedTrack.id);
				
				if (!updatedTrack) return;
				
				const trackForEngine = {
					id: selectedTrack.id,
					projectId: updatedTrack.projectId,
					instrumentType: type,
					patternTree: updatedTrack.patternTree,
					settings: newSettings,
					instrumentSettings: instrumentSettings,
					volume: updatedTrack.volume ?? 1.0,
					pan: updatedTrack.pan ?? 0.0,
					color: defaults.color,
					mute: updatedTrack.mute ?? false,
					solo: updatedTrack.solo ?? false
				};
				
				// Call engine.updateTrack directly for immediate synchronous update
				if (engine) {
					engine.updateTrack(selectedTrack.id, trackForEngine);
				}
				return;
			}
		}
		
		// If NOT a root node (or no root node selected), add a new instrument to the pattern
		if (selectedPattern && !isRootNode) {
			// Create a new instrument with the selected instrument type
			const newInstrument: Instrument = {
				id: crypto.randomUUID(),
				instrumentType: type,
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
			projectStore.addPatternInstrument(selectedPattern.id, newInstrument);
			
			// Select the new instrument so the user can see it
			import('$lib/stores/selectionStore').then(({ selectionStore }) => {
				selectionStore.selectNode(newInstrument.patternTree.id, null, true, false, selectedPattern.id, newInstrument.id);
			});
			
			// Update engine in real-time without stopping playback
			// Use a small delay to ensure store update completes
			setTimeout(() => {
				if (engine) {
					// Get the updated instrument from the store to ensure we have the latest data
					let currentProject: any = null;
					projectStore.subscribe((p: any) => (currentProject = p))();
					if (!currentProject) return;
					
					const updatedPattern = currentProject.patterns?.find((p: any) => p.id === selectedPattern.id);
					if (!updatedPattern) return;
					
					const updatedInstruments = updatedPattern.instruments && Array.isArray(updatedPattern.instruments) && updatedPattern.instruments.length > 0
						? updatedPattern.instruments
						: [];
					
					const updatedInstrument = updatedInstruments.find((inst: any) => inst.id === newInstrument.id);
					if (!updatedInstrument) return;
					
					const patternTrackId = `__pattern_${selectedPattern.id}_${newInstrument.id}`;
					const trackForEngine = {
						id: patternTrackId,
						projectId: selectedPattern.projectId,
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
			return;
		}
	}
</script>

<div class="section">
	<h3 class="section-title">Instrument Type</h3>
	
	<div class="instrument-group">
		<h4 class="instrument-group-title">Drums</h4>
		<div class="instrument-grid">
			{#each nonMelodicInstruments as inst}
				{@const isActive = activeItem?.instrumentType === inst.value}
				<button
					class="instrument-btn"
					class:active={isActive}
					style="border-color: {inst.color};"
					onclick={() => updateInstrumentType(inst.value)}
				>
					{inst.label}
				</button>
			{/each}
		</div>
	</div>
	
	<div class="instrument-group">
		<h4 class="instrument-group-title">Melodic</h4>
		<div class="instrument-grid">
			{#each melodicInstrumentsList as inst}
				{@const isActive = activeItem?.instrumentType === inst.value}
				<button
					class="instrument-btn"
					class:active={isActive}
					style="border-color: {inst.color};"
					onclick={() => updateInstrumentType(inst.value)}
				>
					{inst.label}
				</button>
			{/each}
		</div>
	</div>
</div>

