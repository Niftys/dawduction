/**
 * Pattern Utilities
 * Shared utilities for working with patterns and their instruments
 * Handles both new format (instruments array) and legacy format (single instrument)
 */

import type { Pattern, Instrument } from '$lib/types/pattern';

/**
 * Get all instruments from a pattern (handles both new and legacy formats)
 * This is the canonical way to extract instruments from a pattern
 */
export function getPatternInstruments(pattern: Pattern): Instrument[] {
	if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
		return pattern.instruments;
	}
	
	// Legacy format: convert single instrument
	if (pattern.instrumentType && pattern.patternTree) {
		return [{
			id: pattern.id || crypto.randomUUID(),
			instrumentType: pattern.instrumentType,
			patternTree: pattern.patternTree,
			settings: pattern.settings || {},
			instrumentSettings: pattern.instrumentSettings,
			color: pattern.color || '#7ab8ff',
			volume: pattern.volume ?? 1.0,
			pan: pattern.pan ?? 0.0,
			mute: pattern.mute,
			solo: pattern.solo
		}];
	}
	
	return [];
}

/**
 * Normalize a pattern to ensure it has an instruments array
 * Converts legacy format (single instrument) to new format (instruments array)
 * while preserving backward compatibility
 */
export function normalizePattern(pattern: Pattern): Pattern {
	// If already has instruments array, return as-is
	if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
		return pattern;
	}
	
	// Convert legacy format to new format
	if (pattern.instrumentType && pattern.patternTree) {
		const instrument: Instrument = {
			id: crypto.randomUUID(),
			instrumentType: pattern.instrumentType,
			patternTree: pattern.patternTree,
			settings: pattern.settings || {},
			instrumentSettings: pattern.instrumentSettings,
			color: pattern.color || '#7ab8ff',
			volume: pattern.volume ?? 1.0,
			pan: pattern.pan ?? 0.0,
			mute: pattern.mute,
			solo: pattern.solo
		};
		
		return {
			...pattern,
			instruments: [instrument],
			// Keep legacy fields for backward compatibility during transition
			instrumentType: pattern.instrumentType,
			patternTree: pattern.patternTree,
			settings: pattern.settings,
			instrumentSettings: pattern.instrumentSettings,
			color: pattern.color,
			volume: pattern.volume,
			pan: pattern.pan
		};
	}
	
	// No instruments, create empty array
	return {
		...pattern,
		instruments: []
	};
}

/**
 * Validate and normalize an instrument, ensuring all required fields are present
 */
export function normalizeInstrument(inst: Partial<Instrument>): Instrument | null {
	// Filter out invalid instruments
	if (!inst || typeof inst !== 'object') return null;
	if (!inst.instrumentType || typeof inst.instrumentType !== 'string') return null;
	if (!inst.patternTree || typeof inst.patternTree !== 'object') return null;
	
	// Ensure all required fields are present with defaults
	return {
		id: inst.id || crypto.randomUUID(),
		instrumentType: inst.instrumentType || 'kick',
		patternTree: inst.patternTree,
		settings: inst.settings || {},
		instrumentSettings: inst.instrumentSettings || {},
		color: inst.color || '#7ab8ff',
		volume: inst.volume ?? 1.0,
		pan: inst.pan ?? 0.0,
		mute: inst.mute ?? false,
		solo: inst.solo ?? false
	};
}

