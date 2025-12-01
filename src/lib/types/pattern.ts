/**
 * Pattern Tree Node Structure
 * Represents a single node in the recursive subdivision tree
 * The node structure determines rhythm, velocity, and notes for an instrument
 */
export interface PatternNode {
	id: string; // Unique ID (UUID)
	division: number; // Subdivision value
	x?: number; // Canvas X position (visual only)
	y?: number; // Canvas Y position (visual only)
	children: PatternNode[]; // Recursive children
	velocity?: number; // 0-1, leaf nodes only
	pitch?: number; // MIDI number (0-127), leaf nodes only
}

/**
 * Flattened event for audio scheduling
 */
export interface AudioEvent {
	time: number; // In beats (relative to BPM)
	velocity: number; // 0-1
	pitch: number; // MIDI number (0-127)
	instrumentId: string; // Instrument ID (the generated synth that plays this event)
	duration?: number; // Note duration in beats (time until next note starts, or pattern length if last note)
}

/**
 * INSTRUMENT - A generated synth with a pattern tree
 * 
 * An Instrument is what goes into a pattern's canvas. It consists of:
 * - instrumentType: The synth type (kick, snare, fm, etc.)
 * - patternTree: The node structure that determines rhythm, velocity, and notes
 * - settings: Synth parameters for this instrument
 */
export interface Instrument {
	id: string; // Unique ID for this instrument
	instrumentType: string; // 'kick', 'snare', 'fm', etc. - defines what synth this instrument uses
	patternTree: PatternNode; // The pattern structure/rhythm for this instrument (determines when/how it plays)
	settings: Record<string, any>; // Synth parameters (JSONB) - current instrument's settings
	instrumentSettings?: Record<string, Record<string, any>>; // Settings per instrument type: { 'supersaw': {...}, 'snare': {...} }
	color: string;
	volume: number;
	pan: number;
	mute?: boolean; // Instrument mute state
	solo?: boolean; // Instrument solo state
}

/**
 * PATTERN - A container that stores multiple instruments
 * 
 * Patterns are bins that store a bunch of instruments. All instruments in a pattern
 * play simultaneously. Patterns can be loaded into timeline tracks in arrangement view.
 * 
 * Backward compatibility: If `instruments` array is not present, treat the pattern
 * as having a single instrument using the legacy fields (instrumentType, patternTree, etc.)
 */
export interface Pattern {
	id: string;
	projectId: string;
	name: string; // User-friendly name
	baseMeter: number; // Base meter/division for this pattern (default loop length)
	mute?: boolean; // Pattern mute state
	solo?: boolean; // Pattern solo state
	createdAt: number; // Timestamp
	updatedAt: number; // Timestamp
	
	// NEW: Array of instruments (preferred)
	instruments?: Instrument[];
	
	// LEGACY: Single instrument fields (for backward compatibility)
	instrumentType?: string; // Legacy: single instrument type
	patternTree?: PatternNode; // Legacy: single instrument pattern tree
	settings?: Record<string, any>; // Legacy: single instrument settings
	instrumentSettings?: Record<string, Record<string, any>>; // Legacy: single instrument settings
	color?: string; // Legacy: single instrument color
	volume?: number; // Legacy: single instrument volume
	pan?: number; // Legacy: single instrument pan
}

/**
 * STANDALONE INSTRUMENT - A generated synth with a pattern tree in arrangement view
 * 
 * This represents an instrument that exists directly in the arrangement view,
 * as opposed to being stored in a Pattern container.
 * 
 * NOTE: This is NOT a Track. Tracks (TimelineTrack) are the timeline lanes that hold
 * patterns, effects, and envelopes. This is a standalone instrument that can be edited
 * directly in arrangement view.
 */
export interface StandaloneInstrument {
	id: string;
	projectId: string;
	instrumentType: string; // 'kick', 'snare', 'fm', etc. - defines what synth this instrument uses
	patternTree: PatternNode; // The pattern structure/rhythm for this instrument (determines when/how it plays)
	settings: Record<string, any>; // Synth parameters (JSONB) - current instrument's settings
	instrumentSettings?: Record<string, Record<string, any>>; // Settings per instrument type: { 'supersaw': {...}, 'snare': {...} }
	volume: number;
	pan: number;
	color: string;
	mute?: boolean; // Instrument mute state
	solo?: boolean; // Instrument solo state
}

