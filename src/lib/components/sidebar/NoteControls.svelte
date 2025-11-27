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

	export let selectedTrack: StandaloneInstrument | undefined = undefined;
	export let selectedPattern: Pattern | undefined = undefined;
	export let selectedNodes: Array<{ node: any; pattern?: Pattern; track?: StandaloneInstrument; instrument?: any; instrumentId?: string | null }>;
	export let isMelodicInstrument: boolean;
	export let isMultiSelect: boolean;
	export let getCommonValue: <T>(getter: (node: any) => T | undefined, defaultValue: T) => T;
	export let hasMixedValues: (getter: (node: any) => any, defaultValue: any) => boolean;

	let pitchNoteInput: HTMLInputElement;
	let isTypingNote = false;
	
	// Editor mode: 'pitch' or 'velocity' (for melodic instruments with multi-select)
	// Use shared store to sync with MidiEditor
	$: editorMode = $editorModeStore;

	$: currentPitch = selectedNodes.length > 0 ? getCommonValue((n) => n.pitch, 60) : 60;
	$: currentVelocity = selectedNodes.length > 0 ? getCommonValue((n) => n.velocity, 1.0) : 1.0;
	$: currentDivision = selectedNodes.length > 0 ? getCommonValue((n) => n.division, 1) : 1;

	// Update note input when pitch changes (if not currently typing)
	$: if (pitchNoteInput && !isTypingNote && selectedNodes.length > 0) {
		pitchNoteInput.value = midiToNoteName(currentPitch);
	}

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
			const currentPitch = node.pitch ?? 60;
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
		
		for (const { node, pattern, track, instrumentId } of selectedNodes) {
			if (pattern) {
				projectStore.updatePatternNodeDivision(pattern.id, node.id, value, instrumentId);
			} else if (track) {
				projectStore.updateNodeDivision(track.id, node.id, value);
			}
		}
		updateEnginePatternTreeFromSelection();
	}
</script>

{#if isMelodicInstrument}
	{#if isMultiSelect}
		<div class="section">
			<p class="multi-select-info">Editing {selectedNodes.length} selected nodes</p>
			<div class="editor-mode-switch">
				<button 
					class="mode-btn" 
					class:active={editorMode === 'pitch'}
					on:click={() => editorModeStore.setMode('pitch')}
					title="Pitch Editor"
				>
					Pitch Editor
				</button>
				<button 
					class="mode-btn" 
					class:active={editorMode === 'velocity'}
					on:click={() => editorModeStore.setMode('velocity')}
					title="Velocity Editor"
				>
					Velocity Editor
				</button>
			</div>
			{#if editorMode === 'pitch'}
				<div class="transpose-controls">
					<span class="transpose-label">Transpose:</span>
					<div class="transpose-buttons" role="group" aria-label="Transpose selected notes">
						<button class="transpose-btn" on:click={() => transposeSelectedNodes(-12)} title="Transpose down 1 octave">-12</button>
						<button class="transpose-btn" on:click={() => transposeSelectedNodes(-1)} title="Transpose down 1 semitone">-1</button>
						<button class="transpose-btn" on:click={() => transposeSelectedNodes(1)} title="Transpose up 1 semitone">+1</button>
						<button class="transpose-btn" on:click={() => transposeSelectedNodes(12)} title="Transpose up 1 octave">+12</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
	
	{#if !isMultiSelect || editorMode === 'pitch'}
		<div class="section">
			<div class="param-header">
				<label for="pitch-range">Pitch {isMultiSelect ? `(all ${selectedNodes.length} nodes)` : ''}</label>
				<button class="reset-btn" on:click={() => updateNodePitch(60)}>Reset</button>
			</div>
		<div class="param-controls">
			<input
				id="pitch-range"
				type="range"
				min="0"
				max="127"
				step="1"
				value={currentPitch}
				on:input={(e) => updateNodePitch(Number(getInputValue(e)))}
			/>
			<div class="pitch-input-group">
				<input
					bind:this={pitchNoteInput}
					id="pitch-note"
					type="text"
					value={midiToNoteName(currentPitch)}
					on:focus={() => isTypingNote = true}
					on:blur={() => {
						isTypingNote = false;
						if (pitchNoteInput) {
							pitchNoteInput.value = midiToNoteName(currentPitch);
						}
					}}
					on:input={(e) => {
						const midi = noteNameToMidi(getInputValue(e));
						if (midi !== null) {
							updateNodePitch(midi);
						}
					}}
					class="note-input"
					placeholder={isMultiSelect && hasMixedValues((n) => n.pitch, 60) ? "Mixed" : "C4"}
					title="Enter note name (e.g., C4, D#5)"
				/>
				<NumericInput
					id="pitch-number"
					min={0}
					max={127}
					step={1}
					value={currentPitch}
					placeholder={isMultiSelect && hasMixedValues((n) => n.pitch, 60) ? 'Mixed' : ''}
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
				<button class="reset-btn" on:click={() => updateNodeVelocity(1.0)}>Reset</button>
			</div>
		<div class="param-controls">
			<input
				id="velocity-range"
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={currentVelocity}
				on:input={(e) => updateNodeVelocity(Number(getInputValue(e)))}
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
{:else}
	<!-- Non-melodic instruments: show velocity controls for single and multi-select -->
	<div class="section">
		<div class="param-header">
			<label for="velocity-range">Velocity {isMultiSelect ? `(all ${selectedNodes.length} nodes)` : ''}</label>
			<button class="reset-btn" on:click={() => updateNodeVelocity(1.0)}>Reset</button>
		</div>
		<div class="param-controls">
			<input
				id="velocity-range"
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={currentVelocity}
				on:input={(e) => updateNodeVelocity(Number(getInputValue(e)))}
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
	<label for="division-input">Division</label>
	<NumericInput
		id="division-input"
		min={1}
		value={currentDivision}
		placeholder={isMultiSelect && hasMixedValues((n) => n.division, 1) ? 'Mixed' : ''}
		onInput={(val) => {
			if (val > 0) {
				updateNodeDivision(val);
			}
		}}
	/>
</div>

