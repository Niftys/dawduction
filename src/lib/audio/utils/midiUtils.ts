/**
 * MIDI note number to note name conversion utilities
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI note number (0-127) to note name (e.g., "C4", "D#5")
 */
export function midiToNoteName(midi: number): string {
	if (midi < 0 || midi > 127) return '---';
	
	const octave = Math.floor(midi / 12) - 1;
	const noteIndex = midi % 12;
	const noteName = NOTE_NAMES[noteIndex];
	
	return `${noteName}${octave}`;
}

/**
 * Convert note name (e.g., "C4", "D#5") to MIDI note number
 * Supports formats: "C4", "C#4", "Db4", "D#4", etc.
 */
export function noteNameToMidi(noteName: string): number | null {
	// Remove whitespace
	const cleaned = noteName.trim();
	
	// Match note name and octave (supports both # and b for accidentals)
	const match = cleaned.match(/^([A-Ga-g])([#b]?)(\d+)$/);
	if (!match) return null;
	
	const [, note, accidental, octaveStr] = match;
	const noteUpper = note.toUpperCase();
	const octave = parseInt(octaveStr, 10);
	
	// Find base note index
	const baseNoteIndex = NOTE_NAMES.findIndex(n => n.startsWith(noteUpper));
	if (baseNoteIndex === -1) return null;
	
	// Handle accidentals
	let noteIndex = baseNoteIndex;
	if (accidental === '#') {
		noteIndex = (noteIndex + 1) % 12;
	} else if (accidental === 'b' || accidental === 'B') {
		// Handle 'b' as flat (Db, Eb, etc.)
		noteIndex = (noteIndex - 1 + 12) % 12;
	}
	
	// Convert to MIDI: MIDI note = (octave + 1) * 12 + noteIndex
	const midi = (octave + 1) * 12 + noteIndex;
	
	if (midi < 0 || midi > 127) return null;
	return midi;
}

/**
 * Get all valid note names for a given octave range
 */
export function getNoteNamesForRange(minOctave: number = 0, maxOctave: number = 10): string[] {
	const notes: string[] = [];
	for (let octave = minOctave; octave <= maxOctave; octave++) {
		for (const noteName of NOTE_NAMES) {
			notes.push(`${noteName}${octave}`);
		}
	}
	return notes;
}

