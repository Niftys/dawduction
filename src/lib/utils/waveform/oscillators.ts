/**
 * Oscillator Generation for Waveform Visualization
 * Generates oscillator waveforms based on instrument type and settings
 */

/**
 * Generate oscillator waveform by type
 */
export function generateOscillatorWaveform(phase: number, type: string): number {
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
 * Generate oscillator waveform based on instrument type and settings
 */
export function generateOscillator(
	phase: number,
	instrumentType: string,
	settings: Record<string, unknown>
): number {
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
			const osc1Type = (typeof settings.osc1Type === 'string' ? settings.osc1Type : 'saw') || 'saw';
			return generateOscillatorWaveform(phase, osc1Type);
		
		case 'supersaw':
		case 'pad':
			// Multiple detuned sawtooth oscillators
			const numOscillators = (typeof settings.numOscillators === 'number' ? settings.numOscillators : 7) || 7;
			const detune = (typeof settings.detune === 'number' ? settings.detune : 0.1) || 0.1;
			const spread = (typeof settings.spread === 'number' ? settings.spread : 0.5) || 0.5;
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
			const operators = Array.isArray(settings.operators) ? settings.operators : undefined;
			const operatorFreq = operators && operators[0] && typeof operators[0] === 'object' && 'frequency' in operators[0] && typeof operators[0].frequency === 'number' ? operators[0].frequency : 1;
			return Math.sin(phase + Math.sin(phase * operatorFreq) * 0.5);
		
		case 'pluck':
			// Pluck: use sawtooth with damping
			const damping = (typeof settings.damping === 'number' ? settings.damping : 0.96) || 0.96;
			const age = normalizedPhase;
			return generateOscillatorWaveform(phase, 'saw') * Math.pow(damping, age * 100);
		
		case 'organ':
			// Organ: multiple harmonics (drawbars)
			return generateOrganOscillator(phase, settings);
		
		case 'wavetable':
			// Wavetable: use sawtooth as approximation
			return generateOscillatorWaveform(phase, 'saw');
		
		default:
			// Default: sine wave
			return Math.sin(phase);
	}
}

/**
 * Generate organ oscillator with drawbars
 */
function generateOrganOscillator(phase: number, settings: Record<string, unknown>): number {
	// Ensure drawbars is a valid array with proper defaults
	const defaultDrawbars = [0.8, 0.0, 1.0, 0.0, 0.6, 0.0, 0.4, 0.0, 0.2];
	const rawDrawbars = Array.isArray(settings.drawbars) ? [...settings.drawbars] : undefined;
	
	// Validate and sanitize drawbars with thorough checks
	let drawbars: number[];
	
	// Check if drawbars exists and is a valid array
	if (!rawDrawbars) {
		// No drawbars provided - use defaults
		drawbars = [...defaultDrawbars];
	} else if (!Array.isArray(rawDrawbars)) {
		// Drawbars is not an array - use defaults
		drawbars = [...defaultDrawbars];
	} else if (rawDrawbars.length !== 9) {
		// Wrong length - pad or truncate to 9 elements
		if (rawDrawbars.length === 0) {
			drawbars = [...defaultDrawbars];
		} else {
			// Try to create valid array from what we have
			const padded = [...rawDrawbars];
			while (padded.length < 9) {
				padded.push(0);
			}
			drawbars = padded.slice(0, 9).map((val) => {
				const num = typeof val === 'number' && isFinite(val) ? val : 0;
				return Math.max(0, Math.min(1, num));
			});
		}
	} else {
		// Valid array length - sanitize all values
		drawbars = rawDrawbars.map((val) => {
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
	const numDrawbars = drawbars.length;
	for (let i = 0; i < numDrawbars; i++) {
		const harmonic = i + 1; // 1st, 2nd, 3rd harmonic, etc.
		const level = drawbars[i];
		// Only add if level is significant (avoid unnecessary computation)
		if (level > 0.0001) {
			organSample += Math.sin(phase * harmonic) * level;
		}
	}
	
	// Normalize by number of drawbars to maintain consistent volume scaling
	return organSample / numDrawbars;
}

