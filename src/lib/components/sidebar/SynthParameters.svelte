<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { synthPluginStore } from '$lib/stores/synthPluginStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import DrumSynthParams from './synthParams/DrumSynthParams.svelte';
	import SubtractiveSynthParams from './synthParams/SubtractiveSynthParams.svelte';
	import FMSynthParams from './synthParams/FMSynthParams.svelte';
	import WavetableSynthParams from './synthParams/WavetableSynthParams.svelte';
	import SupersawSynthParams from './synthParams/SupersawSynthParams.svelte';
	import PluckSynthParams from './synthParams/PluckSynthParams.svelte';
	import BassSynthParams from './synthParams/BassSynthParams.svelte';
	import PadSynthParams from './synthParams/PadSynthParams.svelte';
	import OrganSynthParams from './synthParams/OrganSynthParams.svelte';
	import SampleParams from './synthParams/SampleParams.svelte';

	let selection: any;
	selectionStore.subscribe((s) => (selection = s));

	const {
		selectedTrack = undefined,
		selectedPattern = undefined,
		selectedInstrument = undefined,
		trackSettings
	}: {
		selectedTrack?: StandaloneInstrument | undefined;
		selectedPattern?: Pattern | undefined;
		selectedInstrument?: any;
		trackSettings: Record<string, any>;
	} = $props();
	
	// Get the active item (selected instrument from pattern, or standalone instrument)
	const activeItem = $derived(selectedInstrument || selectedTrack);
	
	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));

	const instrumentDefaults = {
		kick: { color: '#00ffff', settings: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 0.15 } },
		snare: { color: '#ff00ff', settings: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.1 } },
		hihat: { color: '#ffff00', settings: { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.01 } },
		clap: { color: '#ff6600', settings: { attack: 0.01, decay: 0.15, sustain: 0.0, release: 0.05 } },
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

	function resetSynthParameters() {
		if (!activeItem) return;
		const defaults = instrumentDefaults[activeItem.instrumentType as keyof typeof instrumentDefaults];
		if (defaults) {
			if (selectedPattern && selectedInstrument) {
				// Reset the selected instrument's settings
				projectStore.updatePatternInstrument(selectedPattern.id, selectedInstrument.id, { 
					settings: { ...defaults.settings } 
				});
				// Update engine directly for real-time parameter changes
				if (engine) {
					const patternTrackId = `__pattern_${selectedPattern.id}_${selectedInstrument.id}`;
					engine.updateTrackSettings(patternTrackId, defaults.settings);
				}
			} else if (selectedTrack) {
				projectStore.updateStandaloneInstrument(selectedTrack.id, { settings: { ...defaults.settings } });
				if (engine) {
					engine.updateTrackSettings(selectedTrack.id, defaults.settings);
				}
			}
		}
	}

	function openPluginWindow() {
		if (!activeItem) {
			return;
		}
		
		if (activeItem.instrumentType !== 'pad' && activeItem.instrumentType !== 'organ') {
			return;
		}
		
		const windowId = selectedPattern && selectedInstrument
			? `${selectedPattern.id}:${selectedInstrument.id}`
			: selectedTrack?.id || '';
		
		if (!windowId) {
			return;
		}
		
		const label = activeItem.instrumentType === 'pad' 
			? 'Pad Synth'
			: 'Organ Synth';
		
		
		synthPluginStore.openWindow({
			id: windowId,
			instrumentType: activeItem.instrumentType as 'pad' | 'organ',
			trackId: selectedTrack?.id,
			patternId: selectedPattern?.id,
			instrumentId: selectedInstrument?.id,
			label: label
		});
	}
</script>

<div class="section">
	<div class="param-header">
		<h3>Synth Parameters</h3>
		<div class="param-header-actions">
			{#if activeItem && (activeItem.instrumentType === 'pad' || activeItem.instrumentType === 'organ')}
				<button class="plugin-btn" onclick={openPluginWindow} title="Open Plugin Window">
					Plugin
				</button>
			{/if}
			<button class="reset-btn" onclick={resetSynthParameters}>Reset All</button>
		</div>
	</div>
	{#if activeItem && ['kick', 'snare', 'hihat', 'clap', 'tom', 'cymbal', 'shaker', 'rimshot'].includes(activeItem.instrumentType)}
		<DrumSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'subtractive'}
		<SubtractiveSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'fm'}
		<FMSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'wavetable'}
		<WavetableSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'supersaw'}
		<SupersawSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'pluck'}
		<PluckSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'bass'}
		<BassSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'pad'}
		<PadSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'organ'}
		<OrganSynthParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{:else if activeItem && activeItem.instrumentType === 'sample'}
		<SampleParams selectedTrack={selectedTrack} selectedPattern={selectedPattern} selectedInstrument={selectedInstrument} {trackSettings} />
	{/if}
</div>

