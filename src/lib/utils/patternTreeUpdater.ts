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
		console.warn('[PatternTreeUpdater] No engine available');
		return false;
	}

	// Get the latest project from the store
	let currentProject: any = null;
	projectStore.subscribe((p) => (currentProject = p))();
	
	if (!currentProject) {
		console.warn('[PatternTreeUpdater] No project available');
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

	console.warn('[PatternTreeUpdater] No patternId or trackId provided', context);
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
		console.warn('[PatternTreeUpdater] Pattern not found', {
			patternId,
			availablePatterns: project.patterns?.map((p: Pattern) => p.id)
		});
		return false;
	}

	const patternInstruments = projectStore.getPatternInstruments(pattern);
	
	if (patternInstruments.length === 0) {
		console.warn('[PatternTreeUpdater] Pattern has no instruments', { patternId });
		return false;
	}

	// Find the instrument to update
	const instrument = instrumentId
		? patternInstruments.find((inst: Instrument) => inst.id === instrumentId)
		: patternInstruments[0];

	if (!instrument) {
		console.warn('[PatternTreeUpdater] Instrument not found', {
			patternId,
			instrumentId,
			availableInstruments: patternInstruments.map((inst: Instrument) => inst.id)
		});
		return false;
	}

	if (!instrument.patternTree) {
		console.warn('[PatternTreeUpdater] Instrument has no pattern tree', {
			patternId,
			instrumentId: instrument.id
		});
		return false;
	}

	// Create the pattern instrument track ID (format: __pattern_{patternId}_{instrumentId})
	const patternTrackId = `__pattern_${patternId}_${instrument.id}`;

	engine.updatePatternTree(patternTrackId, instrument.patternTree);
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
		console.warn('[PatternTreeUpdater] Standalone instrument not found', {
			instrumentId,
			availableInstruments: project.standaloneInstruments?.map((i: StandaloneInstrument) => i.id)
		});
		return false;
	}

	if (!instrument.patternTree) {
		console.warn('[PatternTreeUpdater] Standalone instrument has no pattern tree', { instrumentId });
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

