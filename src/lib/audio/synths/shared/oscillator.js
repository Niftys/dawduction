/**
 * Shared oscillator utilities
 * Provides common waveform generation functions
 */

/**
 * Generate oscillator waveform
 * @param {number} phase - Current phase in radians
 * @param {string} type - Waveform type: 'sine', 'saw', 'square', 'triangle'
 * @returns {number} Sample value (-1 to 1)
 */
export function oscillator(phase, type) {
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

