/**
 * Waveform visualization utilities
 * Can be used for displaying audio waveforms in various parts of the application
 */

/**
 * Analyze audio buffer and extract waveform data
 * @param audioBuffer - AudioBuffer or Float32Array of audio samples
 * @param width - Width of the visualization in pixels
 * @param height - Height of the visualization in pixels
 * @returns Array of points for drawing the waveform
 */
export function extractWaveform(
	audioBuffer: AudioBuffer | Float32Array,
	width: number,
	height: number
): Array<{ x: number; y: number }> {
	let samples: Float32Array;
	
	if (audioBuffer instanceof AudioBuffer) {
		// Use first channel
		samples = audioBuffer.getChannelData(0);
	} else {
		samples = audioBuffer;
	}
	
	const points: Array<{ x: number; y: number }> = [];
	const samplesPerPixel = Math.max(1, Math.floor(samples.length / width));
	const centerY = height / 2;
	
	for (let i = 0; i < width; i++) {
		const start = i * samplesPerPixel;
		const end = Math.min(start + samplesPerPixel, samples.length);
		
		// Find min and max in this pixel's range
		let min = 0;
		let max = 0;
		
		for (let j = start; j < end; j++) {
			const sample = samples[j];
			if (sample < min) min = sample;
			if (sample > max) max = sample;
		}
		
		// Convert to pixel coordinates
		const x = i;
		const yMin = centerY - (min * centerY);
		const yMax = centerY - (max * centerY);
		
		points.push({ x, y: yMin });
		points.push({ x, y: yMax });
	}
	
	return points;
}

/**
 * Draw waveform on canvas
 * @param ctx - Canvas 2D context
 * @param waveform - Waveform points from extractWaveform
 * @param color - Stroke color (default: '#7ab8ff')
 * @param lineWidth - Line width (default: 1)
 */
export function drawWaveform(
	ctx: CanvasRenderingContext2D,
	waveform: Array<{ x: number; y: number }>,
	color: string = '#7ab8ff',
	lineWidth: number = 1
): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	ctx.beginPath();
	
	for (let i = 0; i < waveform.length; i += 2) {
		const point1 = waveform[i];
		const point2 = waveform[i + 1] || point1;
		
		if (i === 0) {
			ctx.moveTo(point1.x, point1.y);
		} else {
			ctx.lineTo(point1.x, point1.y);
		}
		
		if (point2 && point2.x === point1.x) {
			ctx.lineTo(point2.x, point2.y);
		}
	}
	
	ctx.stroke();
}

/**
 * Analyze frequency spectrum using FFT
 * Note: This requires Web Audio API AnalyserNode
 * @param analyserNode - AnalyserNode from Web Audio API
 * @param width - Width of the visualization
 * @returns Array of frequency magnitude values
 */
export function extractFrequencySpectrum(
	analyserNode: AnalyserNode,
	width: number
): Float32Array {
	const bufferLength = analyserNode.frequencyBinCount;
	const dataArray = new Float32Array(bufferLength);
	analyserNode.getFloatFrequencyData(dataArray);
	
	// Downsample to width
	const result = new Float32Array(width);
	const samplesPerBin = bufferLength / width;
	
	for (let i = 0; i < width; i++) {
		const start = Math.floor(i * samplesPerBin);
		const end = Math.floor((i + 1) * samplesPerBin);
		let sum = 0;
		
		for (let j = start; j < end && j < bufferLength; j++) {
			sum += dataArray[j];
		}
		
		result[i] = sum / (end - start);
	}
	
	return result;
}

/**
 * Draw frequency spectrum on canvas
 * @param ctx - Canvas 2D context
 * @param spectrum - Frequency spectrum data from extractFrequencySpectrum
 * @param height - Height of the canvas
 * @param minDb - Minimum dB value (default: -100)
 * @param maxDb - Maximum dB value (default: 0)
 * @param color - Fill color (default: '#7ab8ff')
 */
export function drawFrequencySpectrum(
	ctx: CanvasRenderingContext2D,
	spectrum: Float32Array,
	height: number,
	minDb: number = -100,
	maxDb: number = 0,
	color: string = '#7ab8ff'
): void {
	ctx.fillStyle = color;
	ctx.beginPath();
	
	const width = spectrum.length;
	const dbRange = maxDb - minDb;
	
	for (let i = 0; i < width; i++) {
		const db = spectrum[i];
		const normalized = (db - minDb) / dbRange;
		const barHeight = normalized * height;
		const x = (i / width) * ctx.canvas.width;
		
		if (i === 0) {
			ctx.moveTo(x, height);
		}
		
		ctx.lineTo(x, height - barHeight);
	}
	
	ctx.lineTo(ctx.canvas.width, height);
	ctx.closePath();
	ctx.fill();
}

