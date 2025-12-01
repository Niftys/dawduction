<script lang="ts">
	import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
import { projectStore } from '$lib/stores/projectStore';
import { engineStore } from '$lib/stores/engineStore';
import { editorModeStore } from '$lib/stores/editorModeStore';
import { midiToNoteName, noteNameToMidi } from '$lib/audio/utils/midiUtils';
import { getInputValue } from './sidebarUtils';
import { updateEnginePatternTree, createUpdateContext } from '$lib/utils/patternTreeUpdater';
import NumericInput from './NumericInput.svelte';
	
	let engine: any = null;
	engineStore.subscribe((e) => (engine = e));

	const {
		selectedTrack = undefined,
		selectedPattern = undefined,
		selectedNodes,
		isMelodicInstrument = false,
		isMultiSelect,
		getCommonValue,
		hasMixedValues,
		activeItem = undefined
	}: {
		selectedTrack?: StandaloneInstrument | undefined;
		selectedPattern?: Pattern | undefined;
		selectedNodes: Array<{ node: any; pattern?: Pattern; track?: StandaloneInstrument; instrument?: any; instrumentId?: string | null }>;
		isMelodicInstrument?: boolean;
		isMultiSelect: boolean;
		getCommonValue: <T>(getter: (node: any) => T | undefined, defaultValue: T) => T;
		hasMixedValues: (getter: (node: any) => any, defaultValue: any) => boolean;
		activeItem?: any;
	} = $props();

	let pitchNoteInput: HTMLInputElement = $state(null as any);
	let isTypingNote = $state(false);
	
	// Editor mode: 'pitch' or 'velocity' (for instruments with multi-select)
	// Use shared store to sync with MidiEditor
	const editorMode = $derived($editorModeStore);

	// Determine default pitch based on instrument type
	const defaultPitch = $derived((() => {
		if (!activeItem) return 60;
		// Tom defaults to 50, all others default to 60
		return activeItem.instrumentType === 'tom' ? 50 : 60;
	})());

	const currentPitch = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.pitch, defaultPitch) : defaultPitch);
	const currentVelocity = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.velocity, 1.0) : 1.0);
	const currentDivision = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.division, 1) : 1);
	
	// Get default ADSR values from instrument settings
	const defaultADSR = $derived(() => {
		if (!activeItem) return { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 };
		const settings = activeItem.settings || {};
		return {
			attack: settings.attack ?? 0.01,
			decay: settings.decay ?? 0.3,
			sustain: settings.sustain ?? 0,
			release: settings.release ?? 0.1
		};
	});
	
	const currentAttack = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.attack, defaultADSR().attack) : defaultADSR().attack);
	const currentDecay = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.decay, defaultADSR().decay) : defaultADSR().decay);
	const currentSustain = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.sustain, defaultADSR().sustain) : defaultADSR().sustain);
	const currentRelease = $derived(selectedNodes.length > 0 ? getCommonValue((n) => n.release, defaultADSR().release) : defaultADSR().release);

	// Update note input when pitch changes (if not currently typing)
	$effect(() => {
		if (pitchNoteInput && !isTypingNote && selectedNodes.length > 0) {
			pitchNoteInput.value = midiToNoteName(currentPitch);
		}
	});

	function updateEnginePatternTreeFromSelection() {
		for (const { pattern, track, instrumentId } of selectedNodes) {
			updateEnginePatternTree(engine, createUpdateContext({
				patternId: pattern?.id ?? null,
				trackId: track?.id ?? null,
				instrumentId: instrumentId ?? null
			}));
		}
	}

	function updateNodePitch(value: number) {
		if (selectedNodes.length === 0) return;
		if (isNaN(value)) return;
		const clampedValue = Math.max(0, Math.min(127, value));
		
		for (const { node, pattern, track, instrumentId } of selectedNodes) {
			if (pattern) {
				projectStore.updatePatternNodePitch(pattern.id, node.id, clampedValue, instrumentId);
			} else if (track) {
				projectStore.updateNodePitch(track.id, node.id, clampedValue);
			}
		}
		if (pitchNoteInput && !isTypingNote) {
			pitchNoteInput.value = midiToNoteName(clampedValue);
		}
		// Update pattern tree in engine for real-time audio updates
		updateEnginePatternTreeFromSelection();
	}

	function transposeSelectedNodes(semitones: number) {
		if (selectedNodes.length === 0) return;
		
		for (const { node, pattern, track, instrumentId } of selectedNodes) {
			const currentPitch = node.pitch ?? defaultPitch;
			const newPitch = Math.max(0, Math.min(127, currentPitch + semitones));
			if (pattern) {
				projectStore.updatePatternNodePitch(pattern.id, node.id, newPitch, instrumentId);
			} else if (track) {
				projectStore.updateNodePitch(track.id, node.id, newPitch);
			}
		}
		updateEnginePatternTreeFromSelection();
	}

	function updateNodeVelocity(value: number) {
		if (selectedNodes.length === 0) return;
		if (isNaN(value)) return;
		const clampedValue = Math.max(0, Math.min(1, value));
		
		for (const { node, pattern, track, instrumentId } of selectedNodes) {
			if (pattern) {
				projectStore.updatePatternNodeVelocity(pattern.id, node.id, clampedValue, instrumentId);
			} else if (track) {
				projectStore.updateNodeVelocity(track.id, node.id, clampedValue);
			}
		}
		updateEnginePatternTreeFromSelection();
	}

	function updateNodeDivision(value: number) {
		if (selectedNodes.length === 0) return;
		// Note: NoteControls is only shown when !isRootNode in Sidebar, so root nodes can't be edited here
		
		for (const { node, pattern, track, instrumentId } of selectedNodes) {
			if (pattern) {
				projectStore.updatePatternNodeDivision(pattern.id, node.id, value, instrumentId);
			} else if (track) {
				projectStore.updateNodeDivision(track.id, node.id, value);
			}
		}
		// Small delay to ensure store update completes, then update engine for live audio updates
		setTimeout(() => {
			updateEnginePatternTreeFromSelection();
		}, 0);
	}
	
	function updateNodeADSR(adsr: { attack?: number; decay?: number; sustain?: number; release?: number }) {
		if (selectedNodes.length === 0) return;
		
		// Clamp values to valid ranges
		const clampedADSR: { attack?: number; decay?: number; sustain?: number; release?: number } = {};
		if (adsr.attack !== undefined) {
			clampedADSR.attack = Math.max(0, Math.min(10, adsr.attack));
		}
		if (adsr.decay !== undefined) {
			clampedADSR.decay = Math.max(0, Math.min(10, adsr.decay));
		}
		if (adsr.sustain !== undefined) {
			clampedADSR.sustain = Math.max(0, Math.min(1, adsr.sustain));
		}
		if (adsr.release !== undefined) {
			clampedADSR.release = Math.max(0, Math.min(10, adsr.release));
		}
		
		for (const { node, pattern, track, instrumentId } of selectedNodes) {
			if (pattern) {
				projectStore.updatePatternNodeADSR(pattern.id, node.id, clampedADSR, instrumentId);
			} else if (track) {
				projectStore.updateNodeADSR(track.id, node.id, clampedADSR);
			}
		}
		updateEnginePatternTreeFromSelection();
	}

</script>

{#if isMultiSelect}
	<div class="section">
		<p class="multi-select-info">Editing {selectedNodes.length} selected nodes</p>
		<div class="editor-mode-switch">
			<button 
				class="mode-btn" 
				class:active={editorMode === 'pitch'}
				onclick={() => editorModeStore.setMode('pitch')}
				title="Pitch Editor"
			>
				Pitch Editor
			</button>
			<button 
				class="mode-btn" 
				class:active={editorMode === 'velocity'}
				onclick={() => editorModeStore.setMode('velocity')}
				title="Velocity Editor"
			>
				Velocity Editor
			</button>
		</div>
		{#if editorMode === 'pitch'}
			<div class="transpose-controls">
				<span class="transpose-label">Transpose:</span>
				<div class="transpose-buttons" role="group" aria-label="Transpose selected notes">
					<button class="transpose-btn" onclick={() => transposeSelectedNodes(-12)} title="Transpose down 1 octave">-12</button>
					<button class="transpose-btn" onclick={() => transposeSelectedNodes(-1)} title="Transpose down 1 semitone">-1</button>
					<button class="transpose-btn" onclick={() => transposeSelectedNodes(1)} title="Transpose up 1 semitone">+1</button>
					<button class="transpose-btn" onclick={() => transposeSelectedNodes(12)} title="Transpose up 1 octave">+12</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

{#if !isMultiSelect || editorMode === 'pitch'}
	<div class="section">
		<div class="param-header">
			<label for="pitch-range">Pitch {isMultiSelect ? `(all ${selectedNodes.length} nodes)` : ''}</label>
			<button class="reset-btn" onclick={() => updateNodePitch(defaultPitch)}>Reset</button>
		</div>
		<div class="param-controls">
			<input
				id="pitch-range"
				type="range"
				min="0"
				max="127"
				step="1"
				value={currentPitch}
				oninput={(e) => updateNodePitch(Number(getInputValue(e)))}
			/>
			<div class="pitch-input-group">
				<input
					bind:this={pitchNoteInput}
					id="pitch-note"
					type="text"
					value={midiToNoteName(currentPitch)}
					onfocus={() => isTypingNote = true}
					onblur={() => {
						isTypingNote = false;
						if (pitchNoteInput) {
							pitchNoteInput.value = midiToNoteName(currentPitch);
						}
					}}
					oninput={(e) => {
						const midi = noteNameToMidi(getInputValue(e));
						if (midi !== null) {
							updateNodePitch(midi);
						}
					}}
					class="note-input"
					placeholder={isMultiSelect && hasMixedValues((n) => n.pitch, defaultPitch) ? "Mixed" : midiToNoteName(defaultPitch)}
					title="Enter note name (e.g., C4, D#5)"
				/>
				<NumericInput
					id="pitch-number"
					min={0}
					max={127}
					step={1}
					value={currentPitch}
					placeholder={isMultiSelect && hasMixedValues((n) => n.pitch, defaultPitch) ? 'Mixed' : ''}
					title="MIDI note number (0-127)"
					onInput={updateNodePitch}
				/>
			</div>
		</div>
	</div>
{/if}

{#if !isMultiSelect || editorMode === 'velocity'}
	<div class="section">
		<div class="param-header">
			<label for="velocity-range">Velocity {isMultiSelect ? `(all ${selectedNodes.length} nodes)` : ''}</label>
			<button class="reset-btn" onclick={() => updateNodeVelocity(1.0)}>Reset</button>
		</div>
		<div class="param-controls">
			<input
				id="velocity-range"
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={currentVelocity}
				oninput={(e) => updateNodeVelocity(Number(getInputValue(e)))}
			/>
			<NumericInput
				id="velocity-number"
				min={0}
				max={1}
				step={0.01}
				value={currentVelocity}
				placeholder={isMultiSelect && hasMixedValues((n) => n.velocity, 1.0) ? 'Mixed' : ''}
				onInput={updateNodeVelocity}
			/>
		</div>
	</div>
{/if}

<div class="section">
	<div class="division-row">
		<div class="division-description">
			<label for="division-input" title="Controls how much time this node takes relative to its siblings. Higher values = longer duration.">
				Division
			</label>
			<div class="help-text" title="Controls how much time this node takes relative to its siblings. Higher values = longer duration.">
				This value determines how many beats this node takes to play relative to its siblings
			</div>
		</div>
		<NumericInput
			id="division-input"
			min={1}
			value={currentDivision}
			placeholder={isMultiSelect && hasMixedValues((n) => n.division, 1) ? 'Mixed' : ''}
			title="Controls how much time this node takes relative to its siblings. Higher values = longer duration."
			onInput={(val) => {
				if (val > 0) {
					updateNodeDivision(val);
				}
			}}
		/>
	</div>
</div>

<div class="section">
	<div class="param-header">
		<label>Envelope (ADSR) {isMultiSelect ? `(all ${selectedNodes.length} nodes)` : ''}</label>
		<button class="reset-btn" onclick={() => updateNodeADSR(defaultADSR())}>Reset</button>
	</div>
	
	<div class="adsr-grid">
		<div class="adsr-param">
			<label for="attack-range">Attack</label>
			<div class="param-controls">
				<input
					id="attack-range"
					type="range"
					min="0"
					max="1"
					step="0.001"
					value={currentAttack}
					oninput={(e) => updateNodeADSR({ attack: Number(getInputValue(e)) })}
				/>
				<NumericInput
					id="attack-number"
					min={0}
					max={1}
					step={0.001}
					value={currentAttack}
					placeholder={isMultiSelect && hasMixedValues((n) => n.attack, defaultADSR().attack) ? 'Mixed' : ''}
					onInput={(val) => updateNodeADSR({ attack: val })}
				/>
			</div>
		</div>
		
		<div class="adsr-param">
			<label for="decay-range">Decay</label>
			<div class="param-controls">
				<input
					id="decay-range"
					type="range"
					min="0"
					max="1"
					step="0.001"
					value={currentDecay}
					oninput={(e) => updateNodeADSR({ decay: Number(getInputValue(e)) })}
				/>
				<NumericInput
					id="decay-number"
					min={0}
					max={1}
					step={0.001}
					value={currentDecay}
					placeholder={isMultiSelect && hasMixedValues((n) => n.decay, defaultADSR().decay) ? 'Mixed' : ''}
					onInput={(val) => updateNodeADSR({ decay: val })}
				/>
			</div>
		</div>
		
		<div class="adsr-param">
			<label for="sustain-range">Sustain</label>
			<div class="param-controls">
				<input
					id="sustain-range"
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={currentSustain}
					oninput={(e) => updateNodeADSR({ sustain: Number(getInputValue(e)) })}
				/>
				<NumericInput
					id="sustain-number"
					min={0}
					max={1}
					step={0.01}
					value={currentSustain}
					placeholder={isMultiSelect && hasMixedValues((n) => n.sustain, defaultADSR().sustain) ? 'Mixed' : ''}
					onInput={(val) => updateNodeADSR({ sustain: val })}
				/>
			</div>
		</div>
		
		<div class="adsr-param">
			<label for="release-range">Release</label>
			<div class="param-controls">
				<input
					id="release-range"
					type="range"
					min="0"
					max="1"
					step="0.001"
					value={currentRelease}
					oninput={(e) => updateNodeADSR({ release: Number(getInputValue(e)) })}
				/>
				<NumericInput
					id="release-number"
					min={0}
					max={1}
					step={0.001}
					value={currentRelease}
					placeholder={isMultiSelect && hasMixedValues((n) => n.release, defaultADSR().release) ? 'Mixed' : ''}
					onInput={(val) => updateNodeADSR({ release: val })}
				/>
			</div>
		</div>
	</div>
</div>

