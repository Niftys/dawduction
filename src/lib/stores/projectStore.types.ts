import type { StandaloneInstrument, Pattern } from '$lib/types/pattern';
import type { Effect, Envelope } from '$lib/types/effects';

/**
 * TRACK - A timeline track in arrangement view
 * 
 * This is the actual "Track" - where patterns, effects, and envelopes are manipulated
 * to create songs. Tracks exist ONLY in the arrangement view timeline editor.
 * 
 * Tracks can be of three types:
 * - 'pattern': Displays and plays patterns (which contain instruments)
 * - 'effect': Displays and applies effects
 * - 'envelope': Displays and applies envelopes
 */
export interface TimelineTrack {
	id: string;
	type: 'pattern' | 'effect' | 'envelope';
	name: string;
	patternId?: string; // For pattern tracks, which pattern this track displays/plays
	order: number; // Display order
	volume?: number; // Track volume (0.0 to 2.0, default 1.0)
	createdAt: number;
}

/**
 * TimelineClip - A clip placed on a timeline track
 * Represents when and how long a pattern plays on a track
 */
export interface TimelineClip {
	id: string;
	patternId: string; // Which pattern (container of instruments) to play
	trackId: string; // Which timeline track this clip belongs to
	startBeat: number; // When to start playing (in beats from timeline start)
	duration: number; // How long to play (in beats) - can be extended/contracted
	offsetBeats?: number; // Offset into the pattern (start playing from a specific beat)
}

/**
 * Timeline - The arrangement view timeline
 * Contains tracks where patterns, effects, and envelopes are arranged to create songs
 */
export interface Timeline {
	tracks: TimelineTrack[]; // Timeline tracks (pattern, effect, envelope tracks) - these are the actual "Tracks"
	clips: TimelineClip[]; // Clips of patterns placed on tracks
	effects: import('$lib/types/effects').TimelineEffect[]; // Effects placed on timeline
	envelopes: import('$lib/types/effects').TimelineEnvelope[]; // Envelopes placed on timeline
	totalLength: number; // Total timeline length in beats
}

/**
 * Project - The main project structure
 */
export interface Project {
	id: string;
	title: string;
	bpm: number;
	standaloneInstruments: StandaloneInstrument[]; // Standalone instruments for arrangement editing (NOT tracks - tracks are TimelineTrack)
	patterns: Pattern[]; // Instruments stored as patterns (can be loaded into timeline tracks)
	effects: Effect[]; // Stored effects that can be used in timeline
	envelopes: Envelope[]; // Stored envelopes that can be used in timeline
	baseMeterTrackId?: string; // Instrument ID whose root division determines the pattern loop length
	timeline?: Timeline; // Optional timeline for arrangement view (contains actual Tracks)
	automation?: import('$lib/types/effects').ProjectAutomation; // Parameter automation curves
}

