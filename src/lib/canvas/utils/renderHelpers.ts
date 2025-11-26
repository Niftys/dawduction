/**
 * Rendering Helper Functions
 * Utilities for determining selection, playback, and visual states
 */

import type { Pattern, StandaloneInstrument, Instrument } from '$lib/types/pattern';

export interface RenderContext {
	project: any;
	patternId: string | null;
	pattern: Pattern | null;
	selectionState: any;
	playingNodeIds: Set<string>;
}

/**
 * Creates a selection checker function for a standalone instrument
 */
export function createTrackSelectionChecker(
	instrument: StandaloneInstrument,
	context: RenderContext
): (nodeId: string) => boolean {
	const { selectionState } = context;
	return (nodeId: string) => {
		return selectionState.selectedTrackId === instrument.id && 
		       selectionState.selectedNodes.has(nodeId);
	};
}

/**
 * Creates a selection checker function for a pattern instrument
 */
export function createInstrumentSelectionChecker(
	instrument: Instrument,
	patternId: string,
	context: RenderContext
): (nodeId: string) => boolean {
	const { selectionState } = context;
	return (nodeId: string) => {
		// Check if this instrument's node is selected
		if (selectionState.selectedPatternId !== patternId) return false;
		// If instrumentId is set, must match; if not set, allow selection (backward compat)
		if (selectionState.selectedInstrumentId !== null && 
		    selectionState.selectedInstrumentId !== instrument.id) return false;
		return selectionState.selectedNodes.has(nodeId);
	};
}

/**
 * Creates a playback checker function for a standalone instrument
 */
export function createTrackPlaybackChecker(
	instrument: StandaloneInstrument,
	context: RenderContext
): (nodeId: string) => boolean {
	const { project, playingNodeIds } = context;
	
	// Check if any instrument is soloed
	const hasSoloedInstrument = project.standaloneInstruments?.some((i: StandaloneInstrument) => i.solo === true) || false;
	
	// Determine if nodes should be considered "playing" (for flashing)
	// Don't flash if instrument is muted, or if another instrument is soloed and this one isn't
	const shouldFlash = !instrument.mute && (!hasSoloedInstrument || instrument.solo);
	
	return (nodeId: string) => shouldFlash && playingNodeIds.has(nodeId);
}

/**
 * Creates a playback checker function for a pattern instrument
 */
export function createInstrumentPlaybackChecker(
	instrument: Instrument,
	pattern: Pattern,
	context: RenderContext
): (nodeId: string) => boolean {
	const { playingNodeIds } = context;
	
	// Check if any instrument in pattern is soloed
	const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
		? pattern.instruments
		: [];
	const hasSoloedInstrument = patternInstruments.some((inst: Instrument) => inst.solo === true);
	
	// Determine if nodes should be considered "playing" (for flashing)
	// Don't flash if pattern or instrument is muted, or if another instrument is soloed and this one isn't
	const shouldFlash = !pattern.mute && !instrument.mute && (!hasSoloedInstrument || instrument.solo);
	
	return (nodeId: string) => shouldFlash && playingNodeIds.has(nodeId);
}

/**
 * Checks if a standalone instrument should be greyed out
 */
export function isTrackGreyedOut(instrument: StandaloneInstrument, project: any): boolean {
	const hasSoloedInstrument = project.standaloneInstruments?.some((i: StandaloneInstrument) => i.solo === true) || false;
	return instrument.mute || (hasSoloedInstrument && !instrument.solo);
}

/**
 * Checks if a pattern instrument should be greyed out
 */
export function isInstrumentGreyedOut(
	instrument: Instrument,
	pattern: Pattern
): boolean {
	const patternInstruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
		? pattern.instruments
		: [];
	const hasSoloedInstrument = patternInstruments.some((inst: Instrument) => inst.solo === true);
	return pattern.mute || instrument.mute || (hasSoloedInstrument && !instrument.solo);
}

