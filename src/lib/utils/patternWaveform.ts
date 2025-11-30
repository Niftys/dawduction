/**
 * Generate waveform visualization data from a pattern
 * This creates a waveform representation based on the pattern's events
 * with actual instrument parameters applied (ADSR, filters, oscillator types, etc.)
 */

import type { Pattern } from '$lib/types/pattern';
import { flattenTree } from '$lib/audio/utils/eventFlatten';

// Use a lower sample rate for visualization - we don't need full audio quality
// This significantly improves performance while maintaining good visual quality
const VISUALIZATION_SAMPLE_RATE = 2205; // 1/20th of 44.1kHz - still plenty for visualization
const SAMPLE_RATE = 44100; // Keep for reference calculations

/**
 * Generate a simple waveform visualization from pattern events
 * @param pattern - The pattern to visualize
 * @param duration - Duration in beats
 * @param bpm - BPM for time calculation
 * @param width - Width of the visualization in pixels
 * @returns Array of amplitude values (0-1) for each pixel
 */
export function generatePatternWaveform(
	pattern: Pattern,
	duration: number,
	bpm: number = 120,
	width: number = 200,
	trackVolume: number = 1.0
): number[] {
	// Safety checks for edge cases (extreme zoom levels)
	if (!pattern || duration <= 0 || width <= 0 || bpm <= 0) {
		return [];
	}
	
	// Clamp width to reasonable bounds to prevent performance issues
	const clampedWidth = Math.max(1, Math.min(width, 10000));
	
	// Get all instruments in the pattern
	let patternInstruments: any[] = [];
	
	if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
		// New format: use instruments array
		// Validate and clean up each instrument
		patternInstruments = pattern.instruments
			.filter((inst: any) => {
				// Filter out invalid instruments
				if (!inst || typeof inst !== 'object') return false;
				if (!inst.instrumentType || typeof inst.instrumentType !== 'string') return false;
				if (!inst.patternTree || typeof inst.patternTree !== 'object') return false;
				// Ensure each instrument has a unique ID
				if (!inst.id || typeof inst.id !== 'string') {
					// Generate a unique ID if missing
					inst.id = crypto.randomUUID();
				}
				return true;
			})
			.map((inst: any) => {
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
			});
	} else if (pattern.instrumentType && pattern.patternTree) {
		// Legacy format: single instrument pattern
		// Generate a unique ID for legacy patterns to avoid conflicts
		const legacyId = pattern.id || crypto.randomUUID();
		patternInstruments = [{
			id: legacyId,
			instrumentType: pattern.instrumentType,
			patternTree: pattern.patternTree,
			settings: pattern.settings || {},
			instrumentSettings: pattern.instrumentSettings || {},
			color: pattern.color || '#7ab8ff',
			volume: pattern.volume ?? 1.0,
			pan: pattern.pan ?? 0.0,
			mute: pattern.mute ?? false,
			solo: pattern.solo ?? false
		}];
	}
	
	// Early return if no instruments
	if (patternInstruments.length === 0) {
		return new Array(clampedWidth).fill(0);
	}
	
	// Get base meter from pattern (defaults to 4)
	const baseMeter = pattern.baseMeter || 4;
	const patternLength = baseMeter; // Pattern length in beats
	
		// Pre-calculate pattern length in samples using exact floating point math
		// This is critical for preventing drift when looping - NEVER round this value!
		const patternLengthSeconds = (patternLength * 60) / bpm;
		const patternLengthSamplesExact = patternLengthSeconds * VISUALIZATION_SAMPLE_RATE;
		
		// Calculate how many complete pattern loops fit in the clip duration
		const numCompleteLoops = Math.floor(duration / patternLength);
		const remainderBeats = duration % patternLength;
		
		// Calculate total samples from exact pattern loops to prevent drift
		// Use exact floating point math throughout, only floor at the very end
		const remainderSeconds = (remainderBeats * 60) / bpm;
		const remainderSamplesExact = remainderSeconds * VISUALIZATION_SAMPLE_RATE;
		const totalSamplesExact = (numCompleteLoops * patternLengthSamplesExact) + remainderSamplesExact;
		const totalSamples = Math.ceil(totalSamplesExact); // Use ceil to ensure we have enough samples
	
	// Safety check for extremely long durations
	if (totalSamples > VISUALIZATION_SAMPLE_RATE * 60 * 10) { // Max 10 minutes
		return new Array(clampedWidth).fill(0);
	}
	
	// Create an amplitude array for the entire duration
	// Use signed values to properly mix instruments (not just max)
	// Initialize to all zeros to ensure no random values
	const amplitude = new Float32Array(totalSamples);
	// Explicitly zero out the array (though Float32Array should already be zero)
	for (let i = 0; i < totalSamples; i++) {
		amplitude[i] = 0;
	}
	
	// Check for solo state - if any instrument is soloed, only soloed instruments play
	const hasSoloedInstrument = patternInstruments.some((inst: any) => inst.solo === true);
	
	// Process each instrument and mix them together
	for (const instrument of patternInstruments) {
		// Validate instrument has required fields
		if (!instrument || typeof instrument !== 'object') {
			console.warn('[Waveform] Skipping invalid instrument:', instrument);
			continue;
		}
		
		if (!instrument.patternTree || typeof instrument.patternTree !== 'object') {
			console.warn('[Waveform] Skipping instrument without valid patternTree:', instrument.id);
			continue;
		}
		
		if (!instrument.instrumentType || typeof instrument.instrumentType !== 'string') {
			console.warn('[Waveform] Skipping instrument without valid instrumentType:', instrument.id);
			continue;
		}
		
		// Handle mute/solo logic (matches audio engine behavior)
		// If pattern is muted, skip all instruments
		if (pattern.mute) continue;
		
		// If instrument is muted, skip it
		if (instrument.mute) continue;
		
		// Solo logic: if any instrument is soloed, only play soloed instruments
		if (hasSoloedInstrument && !instrument.solo) continue;
		
		// Get instrument settings - check instrumentSettings first, then settings
		// Create a defensive copy to avoid mutation issues when multiple instruments share settings
		const instrumentType = instrument.instrumentType || 'kick';
		
		// Safely retrieve settings with fallback chain
		let rawSettings: Record<string, any> = {};
		if (instrument.instrumentSettings && typeof instrument.instrumentSettings === 'object' && !Array.isArray(instrument.instrumentSettings)) {
			const typeSettings = instrument.instrumentSettings[instrumentType];
			if (typeSettings && typeof typeSettings === 'object' && !Array.isArray(typeSettings)) {
				rawSettings = typeSettings;
			}
		}
		
		// Fallback to instrument.settings if instrumentSettings didn't have the type
		if (Object.keys(rawSettings).length === 0 && instrument.settings && typeof instrument.settings === 'object' && !Array.isArray(instrument.settings)) {
			rawSettings = instrument.settings;
		}
		
		// Deep copy settings to prevent mutation issues with multiple instruments
		// This is critical for copied patterns where settings might be shared references
		// Use JSON parse/stringify for deep copy to handle nested objects and arrays
		let settings: Record<string, any> = {};
		try {
			settings = JSON.parse(JSON.stringify(rawSettings));
		} catch (e) {
			// If deep copy fails, fall back to shallow copy
			console.warn(`[Waveform] Failed to deep copy settings for instrument ${instrument.id}, using shallow copy:`, e);
			settings = { ...rawSettings };
		}
		
		// STEP 1: Generate audio for ONE pattern cycle for this instrument
		// This is the key change - generate audio once, then place it at correct times
		
		// Flatten the pattern tree to get events for one pattern cycle
		const baseEvents = flattenTree(instrument.patternTree, baseMeter, 0, instrument.id);
		
		// Sort events by time to match audio engine behavior
		baseEvents.sort((a, b) => a.time - b.time);
		
		// Filter out invalid events
		const validEvents = baseEvents.filter(e => {
			const time = e.time;
			return time >= 0 && 
				time < patternLength && // Events at patternLength belong to next cycle
				isFinite(time) && 
				isFinite(e.velocity ?? 1.0) && 
				isFinite(e.pitch ?? 60);
		});
		
		// If no valid events, skip this instrument entirely
		if (validEvents.length === 0) {
			continue;
		}
		
		// Generate audio buffer for one pattern cycle
		// Use exact pattern length in samples (floored to match audio engine)
		// This ensures we only generate audio for the exact pattern length, nothing beyond
		const patternCycleSamples = Math.floor(patternLengthSamplesExact);
		
		// Skip if pattern has no samples (shouldn't happen, but safety check)
		if (patternCycleSamples <= 0) {
			continue;
		}
		
		const instrumentBuffer = new Float32Array(patternCycleSamples);
		
		// Track active notes to handle note-off events (velocity 0)
		// Map: sample position -> Set of note IDs that should be cut off at this sample
		const noteOffEvents = new Map<number, Set<string>>();
		
		// Track active notes: noteId -> { startSample, endSample, pitch, velocity, filterState, cutOffAt, instrumentId }
		const activeNotes = new Map<string, {
			startSample: number;
			endSample: number;
			pitch: number;
			velocity: number;
			filterState: { y1: number; y2: number; x1: number; x2: number };
			cutOffAt?: number; // Sample where note was cut off (if any)
			instrumentId: string; // Instrument ID to prevent cross-instrument note-offs
		}>();
		
		// First pass: identify note-off events (velocity 0) and schedule them
		// Also identify regular notes and their expected end times
		// We need to process events in time order to properly handle note-offs
		const sortedEvents = [...validEvents].sort((a, b) => a.time - b.time);
		
		for (const baseEvent of sortedEvents) {
			const eventTimeSeconds = (baseEvent.time * 60) / bpm;
			const eventTimeSamplesExact = eventTimeSeconds * VISUALIZATION_SAMPLE_RATE;
			const startSample = Math.floor(eventTimeSamplesExact);
			
			if (startSample < 0 || startSample >= patternCycleSamples) continue;
			
			const velocity = baseEvent.velocity ?? 0.8;
			const pitch = baseEvent.pitch ?? 60;
			const eventInstrumentId = baseEvent.instrumentId || instrument.id; // Use event's instrumentId or fallback to instrument.id
			const noteId = `${eventInstrumentId}_${pitch}_${startSample}`; // Unique ID includes instrument ID
			
			// Check if this is a note-off event (velocity 0 or very close to 0)
			if (velocity <= 0.001) {
				// This is a note-off event - mark all active notes at this pitch for THIS INSTRUMENT to be cut off
				// CRITICAL: Only cut off notes from the same instrument to prevent cross-instrument interference
				for (const [activeNoteId, activeNote] of activeNotes.entries()) {
					if (activeNote.pitch === pitch && 
						activeNote.instrumentId === eventInstrumentId && // Match instrument ID!
						startSample >= activeNote.startSample && 
						startSample < activeNote.endSample) {
						// Cut off this note at the note-off time
						if (!noteOffEvents.has(startSample)) {
							noteOffEvents.set(startSample, new Set());
						}
						noteOffEvents.get(startSample)!.add(activeNoteId);
						// Update the end sample to allow release phase after cut-off
						// Add release time after the cut-off point
						const release = (settings.release || 0.3) * VISUALIZATION_SAMPLE_RATE;
						const fadeOutSamples = Math.max(0.1 * VISUALIZATION_SAMPLE_RATE, release * 0.5);
						activeNote.endSample = Math.min(startSample + Math.ceil(release + fadeOutSamples), patternCycleSamples);
						activeNote.cutOffAt = startSample; // Mark where it was cut off
					}
				}
				// Don't generate audio for note-off events themselves
				continue;
			}
			
			// Calculate note duration based on ADSR envelope
			const attack = (settings.attack || 0.1) * VISUALIZATION_SAMPLE_RATE;
			const decay = (settings.decay || 0.2) * VISUALIZATION_SAMPLE_RATE;
			const sustain = settings.sustain ?? 0.7;
			const release = (settings.release || 0.3) * VISUALIZATION_SAMPLE_RATE;
			const totalDuration = attack + decay + release;
			const fadeOutSamples = Math.max(0.1 * VISUALIZATION_SAMPLE_RATE, release * 0.5);
			const noteDurationSamples = Math.ceil(totalDuration + fadeOutSamples);
			
			// CRITICAL: Clamp endSample to patternCycleSamples to prevent audio beyond pattern boundary
			const endSample = Math.min(startSample + noteDurationSamples, patternCycleSamples);
			
			if (endSample <= startSample) continue;
			
			// Register this note as active
			activeNotes.set(noteId, {
				startSample,
				endSample,
				pitch,
				velocity,
				filterState: { y1: 0, y2: 0, x1: 0, x2: 0 },
				cutOffAt: undefined,
				instrumentId: eventInstrumentId // Store instrument ID to prevent cross-instrument note-offs
			});
		}
		
		// Second pass: generate audio for all active notes, respecting note-off events
		for (const [noteId, note] of activeNotes.entries()) {
			const { startSample, endSample, pitch, velocity, filterState } = note;
			
			// Apply instrument volume, event velocity, and track volume
			const baseVolume = (instrument.volume ?? 1.0) * velocity * trackVolume;
			
			// Calculate ADSR envelope parameters
			const attack = (settings.attack || 0.1) * VISUALIZATION_SAMPLE_RATE;
			const decay = (settings.decay || 0.2) * VISUALIZATION_SAMPLE_RATE;
			const sustain = settings.sustain ?? 0.7;
			const release = (settings.release || 0.3) * VISUALIZATION_SAMPLE_RATE;
			const totalDuration = attack + decay + release;
			const fadeOutSamples = Math.max(0.1 * VISUALIZATION_SAMPLE_RATE, release * 0.5);
			
			// Check if this note was cut off
			const cutOffAt = note.cutOffAt;
			
			// Generate audio samples for this note
			for (let sample = startSample; sample < endSample && sample < patternCycleSamples; sample++) {
				const sampleOffset = sample - startSample;
				
				// Calculate ADSR envelope
				// If note was cut off, transition to release phase from the cut-off point
				let envelope = 0;
				if (cutOffAt !== undefined && sample >= cutOffAt) {
					// Note was cut off - calculate release phase from cut-off point
					const cutOffOffset = cutOffAt - startSample;
					const releaseOffset = sampleOffset - cutOffOffset; // Time since cut-off
					
					// Get the envelope value at the cut-off point
					let cutOffEnvelope = sustain;
					if (cutOffOffset < attack) {
						cutOffEnvelope = 0.5 * (1 - Math.cos(Math.PI * cutOffOffset / attack));
					} else if (cutOffOffset < attack + decay) {
						const decayPhase = (cutOffOffset - attack) / decay;
						cutOffEnvelope = 1 - decayPhase * (1 - sustain);
					} else {
						// Already in sustain
						cutOffEnvelope = sustain;
					}
					
					// Apply release envelope from cut-off point
					if (release > 0) {
						const releasePhase = releaseOffset / release;
						envelope = cutOffEnvelope * Math.exp(-releasePhase * 6);
					} else {
						envelope = cutOffEnvelope * Math.exp(-releaseOffset * 10);
					}
				} else if (sampleOffset < attack) {
					envelope = 0.5 * (1 - Math.cos(Math.PI * sampleOffset / attack));
				} else if (sampleOffset < attack + decay) {
					const decayPhase = (sampleOffset - attack) / decay;
					envelope = 1 - decayPhase * (1 - sustain);
				} else if (sampleOffset < attack + decay + release) {
					const releasePhase = (sampleOffset - attack - decay) / release;
					envelope = sustain * Math.exp(-releasePhase * 6);
				} else if (sampleOffset < totalDuration + fadeOutSamples) {
					const fadePhase = (sampleOffset - (attack + decay + release)) / fadeOutSamples;
					const fadeStartValue = sustain * Math.exp(-6);
					envelope = fadeStartValue * Math.exp(-fadePhase * 10);
				}
				
				envelope = Math.max(0, Math.min(1, envelope));
				
				// Skip if envelope is effectively zero (prevents generating audio during silence)
				if (envelope < 0.0001) {
					continue;
				}
				
				// Generate oscillator waveform
				const frequency = 440 * Math.pow(2, (pitch - 69) / 12);
				const phase = sampleOffset * 2 * Math.PI * frequency / VISUALIZATION_SAMPLE_RATE;
				
				let oscillatorValue = generateOscillator(phase, instrumentType, settings);
				
				// Apply low-pass filter if filter settings exist
				if (settings.filterCutoff) {
					oscillatorValue = applyLowpassFilter(oscillatorValue, frequency, settings.filterCutoff, settings.filterResonance || 0.5, filterState);
				}
				
				const sampleValue = oscillatorValue * envelope * baseVolume * 0.3;
				
				// Add to instrument buffer (mix events for this instrument)
				// Only add if value is finite and non-zero
				if (isFinite(sampleValue) && Math.abs(sampleValue) > 0.0001) {
					instrumentBuffer[sample] += sampleValue;
				}
			}
		}
		
		// STEP 2: Place the generated audio buffer at the correct times in the final amplitude array
		// This prevents drift because we're copying the same audio, not recalculating it
		
		// Process complete loops
		for (let loopIndex = 0; loopIndex < numCompleteLoops; loopIndex++) {
			// Calculate exact loop start position using floating point, then floor
			const loopStartSamplesExact = loopIndex * patternLengthSamplesExact;
			const loopStartSample = Math.floor(loopStartSamplesExact);
			
			// Copy instrument buffer to the correct position
			// CRITICAL: Only copy exactly patternCycleSamples samples (the exact pattern length)
			// This ensures we don't copy any audio beyond the pattern boundary
			const samplesToCopy = Math.min(patternCycleSamples, totalSamples - loopStartSample);
			
			for (let i = 0; i < samplesToCopy && i < patternCycleSamples; i++) {
				const targetSample = loopStartSample + i;
				if (targetSample >= 0 && targetSample < totalSamples) {
					// Only add if the source buffer has actual audio (not just silence)
					// This prevents adding zero values that might cause issues
					const bufferValue = instrumentBuffer[i];
					if (isFinite(bufferValue) && bufferValue !== 0) {
						amplitude[targetSample] += bufferValue;
					}
				}
			}
		}
		
		// Process remainder (partial loop at the end)
		if (remainderBeats > 0) {
			const loopStartSamplesExact = numCompleteLoops * patternLengthSamplesExact;
			const loopStartSample = Math.floor(loopStartSamplesExact);
			
			// Calculate how many samples we need for the remainder
			const remainderSamples = Math.floor(remainderSamplesExact);
			// CRITICAL: Only copy up to the remainder length, and never beyond patternCycleSamples
			const samplesToCopy = Math.min(remainderSamples, patternCycleSamples, totalSamples - loopStartSample);
			
			for (let i = 0; i < samplesToCopy; i++) {
				const targetSample = loopStartSample + i;
				if (targetSample >= 0 && targetSample < totalSamples) {
					// Only add if the source buffer has actual audio (not just silence)
					const bufferValue = instrumentBuffer[i];
					if (isFinite(bufferValue) && bufferValue !== 0) {
						amplitude[targetSample] += bufferValue;
					}
				}
			}
		}
	}
	
	// Find the peak amplitude across all samples for normalization
	let peakAmplitude = 0;
	let rmsAmplitude = 0; // Root mean square for better normalization
	for (let i = 0; i < totalSamples; i++) {
		const absValue = Math.abs(amplitude[i]);
		if (absValue > peakAmplitude) {
			peakAmplitude = absValue;
		}
		rmsAmplitude += absValue * absValue;
	}
	rmsAmplitude = Math.sqrt(rmsAmplitude / totalSamples);
	
	// Normalize factor to prevent clipping
	// Use peak-based normalization but with a minimum threshold to prevent silent waveforms
	// If peak is very small, use RMS-based normalization instead
	const minPeakThreshold = 0.001; // Minimum peak to consider valid
	let normalizeFactor = 1.0;
	
	if (peakAmplitude > minPeakThreshold) {
		// Normal peak-based normalization
		normalizeFactor = 1.0 / peakAmplitude;
	} else if (rmsAmplitude > minPeakThreshold) {
		// Fallback to RMS-based normalization if peak is too small
		normalizeFactor = 1.0 / (rmsAmplitude * 3); // RMS * 3 approximates peak
	} else {
		// No audio detected - return silent waveform
		return new Array(clampedWidth).fill(0);
	}
	
	// Add some headroom (0.9) to prevent clipping and ensure visibility
	normalizeFactor *= 0.9;
	
	// Downsample to clamped width pixels
	const result: number[] = [];
	const samplesPerPixel = Math.max(1, Math.floor(totalSamples / clampedWidth));
	
	for (let i = 0; i < clampedWidth; i++) {
		const start = i * samplesPerPixel;
		const end = Math.min(start + samplesPerPixel, totalSamples);
		
		// Find max absolute amplitude in this pixel's range (after normalization)
		let max = 0;
		for (let j = start; j < end; j++) {
			const normalizedValue = Math.abs(amplitude[j] * normalizeFactor);
			if (normalizedValue > max) max = normalizedValue;
		}
		
		// Clamp to 0-1 range
		result.push(Math.min(1.0, max));
	}
	
	// If width was clamped, we need to scale the result back
	// For very small widths, just return a simplified version
	if (width < clampedWidth) {
		// Downsample further if needed
		const scale = width / clampedWidth;
		const scaledResult: number[] = [];
		for (let i = 0; i < width; i++) {
			const sourceIndex = Math.floor(i / scale);
			scaledResult.push(result[sourceIndex] || 0);
		}
		return scaledResult;
	}
	
	return result;
}

/**
 * Generate oscillator waveform based on instrument type and settings
 */
function generateOscillator(phase: number, instrumentType: string, settings: Record<string, any>): number {
	const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
	
	switch (instrumentType) {
		case 'kick':
		case 'snare':
		case 'hihat':
		case 'clap':
		case 'tom':
		case 'cymbal':
		case 'shaker':
		case 'rimshot':
			// Drums: use sine wave for simplicity (actual drums are more complex)
			return Math.sin(phase);
		
		case 'subtractive':
		case 'bass':
			// Use osc1Type from settings, default to saw
			const osc1Type = settings.osc1Type || 'saw';
			return generateOscillatorWaveform(phase, osc1Type);
		
		case 'supersaw':
		case 'pad':
			// Multiple detuned sawtooth oscillators
			const numOscillators = settings.numOscillators || 7;
			const detune = settings.detune || 0.1;
			const spread = settings.spread || 0.5;
			let sample = 0;
			const centerIndex = Math.floor(numOscillators / 2);
			
			for (let i = 0; i < numOscillators; i++) {
				const offset = (i - centerIndex) * detune * spread;
				const oscFreq = 1.0 * Math.pow(2, offset / 12);
				const oscPhase = phase * oscFreq;
				const saw = generateOscillatorWaveform(oscPhase, 'saw');
				const distanceFromCenter = Math.abs(i - centerIndex);
				const gain = 1.0 - (distanceFromCenter * 0.1);
				sample += saw * gain;
			}
			return sample / numOscillators;
		
		case 'fm':
			// FM synthesis - simplified version
			return Math.sin(phase + Math.sin(phase * (settings.operators?.[0]?.frequency || 1)) * 0.5);
		
		case 'pluck':
			// Pluck: use sawtooth with damping
			const damping = settings.damping || 0.96;
			const age = normalizedPhase;
			return generateOscillatorWaveform(phase, 'saw') * Math.pow(damping, age * 100);
		
		case 'organ':
			// Organ: multiple harmonics (drawbars)
			// Ensure drawbars is a valid array with proper defaults
			// Use a constant default to avoid creating new arrays on each call
			const defaultDrawbars = [0.8, 0.0, 1.0, 0.0, 0.6, 0.0, 0.4, 0.0, 0.2];
			// Deep copy drawbars to prevent mutation issues with copied patterns
			const rawDrawbars = settings.drawbars ? (Array.isArray(settings.drawbars) ? [...settings.drawbars] : settings.drawbars) : undefined;
			
			// Validate and sanitize drawbars with thorough checks
			let drawbars: number[];
			
			// Check if drawbars exists and is a valid array
			if (!rawDrawbars) {
				// No drawbars provided - use defaults
				drawbars = [...defaultDrawbars]; // Create a copy to avoid mutation
			} else if (!Array.isArray(rawDrawbars)) {
				// Drawbars is not an array - use defaults
				drawbars = [...defaultDrawbars];
			} else if (rawDrawbars.length !== 9) {
				// Wrong length - pad or truncate to 9 elements, then use defaults if still invalid
				if (rawDrawbars.length === 0) {
					drawbars = [...defaultDrawbars];
				} else {
					// Try to create valid array from what we have
					const padded = [...rawDrawbars];
					while (padded.length < 9) {
						padded.push(0);
					}
					drawbars = padded.slice(0, 9).map((val: any) => {
						const num = typeof val === 'number' && isFinite(val) ? val : 0;
						return Math.max(0, Math.min(1, num));
					});
				}
			} else {
				// Valid array length - sanitize all values
				// Create a fresh copy to avoid any mutation issues
				drawbars = rawDrawbars.map((val: any) => {
					// Convert to number if possible, otherwise use 0
					let num = 0;
					if (typeof val === 'number') {
						num = isFinite(val) ? val : 0;
					} else if (typeof val === 'string') {
						const parsed = parseFloat(val);
						num = isFinite(parsed) ? parsed : 0;
					}
					// Clamp to 0-1 range
					return Math.max(0, Math.min(1, num));
				});
			}
			
			// Generate organ sample from harmonics
			let organSample = 0;
			const numDrawbars = drawbars.length; // Cache length for performance
			for (let i = 0; i < numDrawbars; i++) {
				const harmonic = i + 1; // 1st, 2nd, 3rd harmonic, etc.
				const level = drawbars[i];
				// Only add if level is significant (avoid unnecessary computation)
				if (level > 0.0001) {
					organSample += Math.sin(phase * harmonic) * level;
				}
			}
			
			// Normalize by number of drawbars to maintain consistent volume scaling
			// This matches the original behavior and prevents clipping when many drawbars are active
			// Use cached length for consistency
			return organSample / numDrawbars;
		
		case 'wavetable':
			// Wavetable: use sawtooth as approximation
			return generateOscillatorWaveform(phase, 'saw');
		
		default:
			// Default: sine wave
			return Math.sin(phase);
	}
}

/**
 * Generate oscillator waveform by type
 */
function generateOscillatorWaveform(phase: number, type: string): number {
	const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);
	
	switch (type) {
		case 'sine':
			return Math.sin(phase);
		case 'saw':
			return 2 * normalizedPhase - 1;
		case 'square':
			return normalizedPhase < 0.5 ? 1 : -1;
		case 'triangle':
			return normalizedPhase < 0.5 ? 4 * normalizedPhase - 1 : 3 - 4 * normalizedPhase;
		default:
			return Math.sin(phase);
	}
}

/**
 * Simple low-pass filter approximation
 * This is a simplified version for visualization purposes
 */
function applyLowpassFilter(
	input: number,
	frequency: number,
	cutoff: number,
	resonance: number,
	filterState: { y1: number; y2: number; x1: number; x2: number }
): number {
	// Simple IIR low-pass filter approximation
	// Use visualization sample rate for filter calculations
	const c = 1.0 / Math.tan(Math.PI * Math.min(cutoff, VISUALIZATION_SAMPLE_RATE / 2 - 1) / VISUALIZATION_SAMPLE_RATE);
	const a1 = 1.0 / (1.0 + resonance * c + c * c);
	const a2 = 2 * a1;
	const a3 = a1;
	const b1 = 2.0 * (1.0 - c * c) * a1;
	const b2 = (1.0 - resonance * c + c * c) * a1;
	
	const output = a1 * input + a2 * filterState.x1 + a3 * filterState.x2
		- b1 * filterState.y1 - b2 * filterState.y2;
	
	filterState.x2 = filterState.x1;
	filterState.x1 = input;
	filterState.y2 = filterState.y1;
	filterState.y1 = output;
	
	return output;
}

/**
 * Draw waveform on canvas
 * @param ctx - Canvas 2D context
 * @param waveform - Waveform data from generatePatternWaveform
 * @param width - Width of canvas
 * @param height - Height of canvas
 * @param color - Stroke color
 */
export function drawPatternWaveform(
	ctx: CanvasRenderingContext2D,
	waveform: number[],
	width: number,
	height: number,
	color: string = '#ffffff'
): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.beginPath();
	
	const centerY = height / 2;
	const pixelWidth = width / waveform.length;
	// Use almost the full height (leave small margin at top/bottom for visibility)
	const maxAmplitude = height * 0.48;
	
	for (let i = 0; i < waveform.length; i++) {
		const amplitude = waveform[i];
		const x = i * pixelWidth;
		// Scale amplitude to use full height
		const barHeight = amplitude * maxAmplitude;
		
		ctx.moveTo(x, centerY - barHeight);
		ctx.lineTo(x, centerY + barHeight);
	}
	
	ctx.stroke();
	
	// Also draw a filled version for better visibility
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.3;
	ctx.beginPath();
	ctx.moveTo(0, centerY);
	
	for (let i = 0; i < waveform.length; i++) {
		const amplitude = waveform[i];
		const x = i * pixelWidth;
		const barHeight = amplitude * maxAmplitude;
		ctx.lineTo(x, centerY - barHeight);
	}
	
	for (let i = waveform.length - 1; i >= 0; i--) {
		const amplitude = waveform[i];
		const x = i * pixelWidth;
		const barHeight = amplitude * maxAmplitude;
		ctx.lineTo(x, centerY + barHeight);
	}
	
	ctx.closePath();
	ctx.fill();
	ctx.globalAlpha = 1.0;
}

