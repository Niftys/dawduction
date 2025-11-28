/**
 * Pattern Tree Updater
 * 
 * Centralized utility for updating pattern trees in the audio engine in real-time.
 * This module handles the flow from UI changes to engine updates, making it easier
 * to debug and maintain.
 */

import type { Pattern, StandaloneInstrument, Instrument } from '$lib/types/pattern';
import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
import { projectStore } from '$lib/stores/projectStore';
import { flattenTrackPattern } from '$lib/audio/utils/eventFlatten';

export interface UpdateContext {
	patternId?: string | null;
	trackId?: string | null;
	instrumentId?: string | null;
}

/**
 * Updates the pattern tree in the audio engine for real-time audio updates.
 * This function handles both pattern instruments and standalone instruments.
 * 
 * @param engine - The audio engine worklet instance
 * @param context - The update context (patternId, trackId, instrumentId)
 * @returns true if update was successful, false otherwise
 */
export function updateEnginePatternTree(
	engine: EngineWorklet | null,
	context: UpdateContext
): boolean {
	const { patternId, trackId, instrumentId } = context;

	if (!engine) {
		return false;
	}

	// Get the latest project from the store
	// Use get() method if available, otherwise subscribe to get current value
	let currentProject: any = null;
	const unsubscribe = projectStore.subscribe((p) => {
		currentProject = p;
	});
	unsubscribe(); // Unsubscribe immediately after getting the value
	
	if (!currentProject) {
		return false;
	}

	// Handle pattern instrument updates
	if (patternId) {
		return updatePatternInstrument(engine, currentProject, patternId, instrumentId);
	}
	
	// Handle standalone instrument updates
	if (trackId) {
		return updateStandaloneInstrument(engine, currentProject, trackId);
	}

	return false;
}

/**
 * Updates a pattern instrument's pattern tree in the engine
 */
function updatePatternInstrument(
	engine: EngineWorklet,
	project: any,
	patternId: string,
	instrumentId: string | null | undefined
): boolean {
	const pattern = project.patterns?.find((p: Pattern) => p.id === patternId);
	
	if (!pattern) {
		return false;
	}

	const patternInstruments = projectStore.getPatternInstruments(pattern);
	
	if (patternInstruments.length === 0) {
		return false;
	}

	// Find the instrument to update
	const instrument = instrumentId
		? patternInstruments.find((inst: Instrument) => inst.id === instrumentId)
		: patternInstruments[0];

	if (!instrument) {
		return false;
	}

	if (!instrument.patternTree) {
		return false;
	}

	// Create the pattern instrument track ID (format: __pattern_{patternId}_{instrumentId})
	const patternTrackId = `__pattern_${patternId}_${instrument.id}`;

	// Get baseMeter from pattern (defaults to 4)
	const baseMeter = pattern.baseMeter || 4;

	engine.updatePatternTree(patternTrackId, instrument.patternTree, baseMeter);
	return true;
}

/**
 * Updates a standalone instrument's pattern tree in the engine
 */
function updateStandaloneInstrument(
	engine: EngineWorklet,
	project: any,
	instrumentId: string
): boolean {
	const instrument = project.standaloneInstruments?.find((i: StandaloneInstrument) => i.id === instrumentId);
	
	if (!instrument) {
		return false;
	}

	if (!instrument.patternTree) {
		return false;
	}

	engine.updatePatternTree(instrumentId, instrument.patternTree);
	return true;
}

/**
 * Creates an update context from various sources (menu, selection, etc.)
 */
export function createUpdateContext(options: {
	menu?: { patternId?: string | null; trackId?: string | null; instrumentId?: string | null };
	selection?: { selectedPatternId?: string | null; selectedTrackId?: string | null; selectedInstrumentId?: string | null };
	editingNode?: { patternId?: string | null; trackId?: string | null; instrumentId?: string | null };
	patternId?: string | null;
	trackId?: string | null;
	instrumentId?: string | null;
}): UpdateContext {
	// Priority: explicit params > editingNode > menu > selection
	return {
		patternId: options.patternId ?? options.editingNode?.patternId ?? options.menu?.patternId ?? options.selection?.selectedPatternId ?? null,
		trackId: options.trackId ?? options.editingNode?.trackId ?? options.menu?.trackId ?? options.selection?.selectedTrackId ?? null,
		instrumentId: options.instrumentId ?? options.editingNode?.instrumentId ?? options.menu?.instrumentId ?? options.selection?.selectedInstrumentId ?? null
	};
}

