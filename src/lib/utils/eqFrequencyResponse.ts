/**
 * Calculate frequency response for EQ bands
 * Returns gain in dB for a given frequency
 */

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'bell' | 'lowshelf' | 'highshelf';

export interface EQBand {
	id: number;
	type: FilterType;
	frequency: number; // Hz
	gain: number; // dB
	q: number;
	enabled: boolean;
}

/**
 * Calculate the frequency response of a single filter at a given frequency
 */
function calculateFilterResponse(
	frequency: number,
	centerFreq: number,
	q: number,
	gain: number,
	type: FilterType,
	sampleRate: number = 44100
): number {
	if (!gain || Math.abs(gain) < 0.01) return 0;
	
	const w = 2 * Math.PI * frequency / sampleRate;
	const w0 = 2 * Math.PI * centerFreq / sampleRate;
	const A = Math.pow(10, gain / 40); // Convert dB to amplitude
	const S = 1;
	const alpha = Math.sin(w0) / (2 * q);
	const cosw0 = Math.cos(w0);
	const sinw0 = Math.sin(w0);
	
	let b0, b1, b2, a0, a1, a2;
	
	switch (type) {
		case 'lowpass':
			b0 = (1 - Math.cos(w0)) / 2;
			b1 = 1 - Math.cos(w0);
			b2 = (1 - Math.cos(w0)) / 2;
			a0 = 1 + alpha;
			a1 = -2 * Math.cos(w0);
			a2 = 1 - alpha;
			break;
			
		case 'highpass':
			b0 = (1 + Math.cos(w0)) / 2;
			b1 = -(1 + Math.cos(w0));
			b2 = (1 + Math.cos(w0)) / 2;
			a0 = 1 + alpha;
			a1 = -2 * Math.cos(w0);
			a2 = 1 - alpha;
			break;
			
		case 'bandpass':
			b0 = alpha;
			b1 = 0;
			b2 = -alpha;
			a0 = 1 + alpha;
			a1 = -2 * Math.cos(w0);
			a2 = 1 - alpha;
			break;
			
		case 'notch':
			b0 = 1;
			b1 = -2 * Math.cos(w0);
			b2 = 1;
			a0 = 1 + alpha;
			a1 = -2 * Math.cos(w0);
			a2 = 1 - alpha;
			break;
			
		case 'bell':
			// Parametric EQ bell curve
			const beta = Math.sin(w0) * Math.sqrt(A) / q;
			b0 = 1 + alpha * A;
			b1 = -2 * Math.cos(w0);
			b2 = 1 - alpha * A;
			a0 = 1 + alpha / A;
			a1 = -2 * Math.cos(w0);
			a2 = 1 - alpha / A;
			break;
			
		case 'lowshelf':
			const sqrtA = Math.sqrt(A);
			b0 = A * ((A + 1) - (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * alpha);
			b1 = 2 * A * ((A - 1) - (A + 1) * Math.cos(w0));
			b2 = A * ((A + 1) - (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * alpha);
			a0 = (A + 1) + (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * alpha;
			a1 = -2 * ((A - 1) + (A + 1) * Math.cos(w0));
			a2 = (A + 1) + (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * alpha;
			break;
			
		case 'highshelf':
			const sqrtA2 = Math.sqrt(A);
			b0 = A * ((A + 1) + (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * alpha);
			b1 = -2 * A * ((A - 1) + (A + 1) * Math.cos(w0));
			b2 = A * ((A + 1) + (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * alpha);
			a0 = (A + 1) - (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * alpha;
			a1 = 2 * ((A - 1) - (A + 1) * Math.cos(w0));
			a2 = (A + 1) - (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * alpha;
			break;
			
		default:
			return 0;
	}
	
	// Calculate frequency response using the transfer function
	// H(z) evaluated at z = e^(jw)
	const numReal = b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w);
	const numImag = b1 * Math.sin(w) + b2 * Math.sin(2 * w);
	const denReal = a0 + a1 * Math.cos(w) + a2 * Math.cos(2 * w);
	const denImag = a1 * Math.sin(w) + a2 * Math.sin(2 * w);
	
	// Magnitude = |H(e^(jw))| = sqrt((numReal^2 + numImag^2) / (denReal^2 + denImag^2))
	const numMag = Math.sqrt(numReal * numReal + numImag * numImag);
	const denMag = Math.sqrt(denReal * denReal + denImag * denImag);
	
	if (denMag === 0) return 0;
	
	const magnitude = numMag / denMag;
	
	return 20 * Math.log10(magnitude);
}

/**
 * Calculate combined frequency response for all EQ bands
 */
export function calculateFrequencyResponse(
	frequency: number,
	bands: EQBand[],
	sampleRate: number = 44100
): number {
	let totalGain = 0;
	
	for (const band of bands) {
		if (!band.enabled) continue;
		totalGain += calculateFilterResponse(
			frequency,
			band.frequency,
			band.q,
			band.gain,
			band.type,
			sampleRate
		);
	}
	
	return totalGain;
}

/**
 * Generate frequency response curve data points
 */
export function generateFrequencyResponseCurve(
	bands: EQBand[],
	width: number,
	minFreq: number = 20,
	maxFreq: number = 20000,
	sampleRate: number = 44100
): Array<{ x: number; y: number; freq: number }> {
	const points: Array<{ x: number; y: number; freq: number }> = [];
	
	for (let i = 0; i < width; i++) {
		const x = i / width;
		// Logarithmic frequency scale
		const freq = minFreq * Math.pow(maxFreq / minFreq, x);
		const gain = calculateFrequencyResponse(freq, bands, sampleRate);
		
		points.push({ x, y: gain, freq });
	}
	
	return points;
}

/**
 * Convert frequency to x position (logarithmic scale)
 */
export function frequencyToX(freq: number, width: number, minFreq: number = 20, maxFreq: number = 20000): number {
	const normalized = Math.log(freq / minFreq) / Math.log(maxFreq / minFreq);
	return normalized * width;
}

/**
 * Convert x position to frequency (logarithmic scale)
 */
export function xToFrequency(x: number, width: number, minFreq: number = 20, maxFreq: number = 20000): number {
	const normalized = x / width;
	return minFreq * Math.pow(maxFreq / minFreq, normalized);
}

/**
 * Convert gain (dB) to y position
 */
export function gainToY(gain: number, height: number, minGain: number = -12, maxGain: number = 12): number {
	const normalized = (gain - minGain) / (maxGain - minGain);
	return height - (normalized * height);
}

/**
 * Convert y position to gain (dB)
 */
export function yToGain(y: number, height: number, minGain: number = -12, maxGain: number = 12): number {
	const normalized = (height - y) / height;
	return minGain + normalized * (maxGain - minGain);
}

