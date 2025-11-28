import type { StandaloneInstrument } from '$lib/types/pattern';
import { EngineWorklet } from '$lib/audio/engine/EngineWorklet';

const SAMPLE_RATE = 44100;

/**
 * Record audio from the engine for a specified duration
 * This uses the real-time engine but records its output
 */
export async function recordProject(
	standaloneInstruments: StandaloneInstrument[],
	bpm: number,
	baseMeterTrackId: string | undefined,
	durationInBeats: number,
	onProgress?: (progress: number) => void,
	timeline?: any,
	patterns?: any[],
	effects?: any[],
	envelopes?: any[],
	automation?: any
): Promise<AudioBuffer> {
	// Create engine instance
	const engine = new EngineWorklet();
	await engine.initialize();
	await engine.resume();
	
	// Get the engine's AudioContext (must use same context for connections)
	const audioContext = engine.getAudioContext();
	
	// Load project (use timeline if available, otherwise pattern loop)
	// Pass effects, envelopes, and automation so they're applied during export
	await engine.loadProject(standaloneInstruments, bpm, baseMeterTrackId, timeline, patterns, effects, envelopes, automation);
	
	// Calculate duration
	const durationInSeconds = (durationInBeats * 60) / bpm;
	const totalSamples = Math.ceil(durationInSeconds * SAMPLE_RATE);
	
	// Create script processor node to capture audio (must use engine's context)
	const bufferSize = 4096;
	const processor = audioContext.createScriptProcessor(bufferSize, 2, 2);
	
	// Create recording buffers
	const leftChannel: Float32Array[] = [];
	const rightChannel: Float32Array[] = [];
	let recordedSamples = 0;
	let isRecording = true;
	
	processor.onaudioprocess = (e) => {
		if (!isRecording || recordedSamples >= totalSamples) {
			return;
		}
		
		const inputData = e.inputBuffer;
		const left = inputData.getChannelData(0);
		const right = inputData.getChannelData(1);
		
		// Copy data
		const samplesToRecord = Math.min(bufferSize, totalSamples - recordedSamples);
		leftChannel.push(new Float32Array(left.subarray(0, samplesToRecord)));
		rightChannel.push(new Float32Array(right.subarray(0, samplesToRecord)));
		
		recordedSamples += samplesToRecord;
		
		if (onProgress) {
			onProgress(Math.min(1, recordedSamples / totalSamples));
		}
		
		if (recordedSamples >= totalSamples) {
			isRecording = false;
		}
	};
	
	// Connect engine to processor instead of output
	engine.connectToDestination(processor);
	// Note: processor doesn't need to connect to destination for recording
	// The processor will receive audio from the engine worklet
	
	// Start playback
	engine.setTransport('play');
	
	// Wait for recording to complete
	// Primary mechanism: timeout based on calculated duration
	// Secondary: periodic check for early completion
	await new Promise<void>(resolve => {
		let resolved = false;
		
		const cleanup = () => {
			if (resolved) return;
			resolved = true;
			engine.setTransport('stop');
			processor.disconnect();
			engine.reconnectToOutput();
			resolve();
		};
		
		// Primary: timeout based on actual duration (with buffer for processing)
		const timeoutMs = Math.ceil(durationInSeconds * 1000) + 1000; // Add 1s buffer for safety
		const timeoutId = setTimeout(() => {
			if (!resolved) {
				cleanup();
			}
		}, timeoutMs);
		
		// Secondary: check for early completion (useful if processing finishes early)
		const checkComplete = () => {
			if (resolved) return;
			if (recordedSamples >= totalSamples) {
				clearTimeout(timeoutId);
				cleanup();
			} else {
				setTimeout(checkComplete, 100); // Check every 100ms
			}
		};
		
		// Start checking for early completion
		checkComplete();
	});
	
	// Combine buffers
	const leftBuffer = new Float32Array(totalSamples);
	const rightBuffer = new Float32Array(totalSamples);
	
	let offset = 0;
	for (let i = 0; i < leftChannel.length && offset < totalSamples; i++) {
		const chunk = leftChannel[i];
		const copyLength = Math.min(chunk.length, totalSamples - offset);
		leftBuffer.set(chunk.subarray(0, copyLength), offset);
		rightBuffer.set(rightChannel[i].subarray(0, copyLength), offset);
		offset += copyLength;
	}
	
	// Create audio buffer
	const audioBuffer = audioContext.createBuffer(2, totalSamples, SAMPLE_RATE);
	audioBuffer.getChannelData(0).set(leftBuffer);
	audioBuffer.getChannelData(1).set(rightBuffer);
	
	// Cleanup
	processor.disconnect();
	engine.destroy();
	
	return audioBuffer;
}

export type ExportFormat = 'wav' | 'ogg' | 'mp3';

/**
 * Export audio buffer to WAV file
 */
export function exportBufferToWAV(buffer: AudioBuffer, filename: string = 'export.wav'): void {
	const numChannels = buffer.numberOfChannels;
	const length = buffer.length;
	const sampleRate = buffer.sampleRate;
	
	// Create WAV file buffer
	const arrayBuffer = new ArrayBuffer(44 + length * numChannels * 2);
	const view = new DataView(arrayBuffer);
	
	// WAV header
	const writeString = (offset: number, string: string) => {
		for (let i = 0; i < string.length; i++) {
			view.setUint8(offset + i, string.charCodeAt(i));
		}
	};
	
	writeString(0, 'RIFF');
	view.setUint32(4, 36 + length * numChannels * 2, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // audio format (1 = PCM)
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
	view.setUint16(32, numChannels * 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	writeString(36, 'data');
	view.setUint32(40, length * numChannels * 2, true);
	
	// Write audio data
	let offset = 44;
	for (let i = 0; i < length; i++) {
		for (let channel = 0; channel < numChannels; channel++) {
			const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
			view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
			offset += 2;
		}
	}
	
	// Create blob and download
	const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Export audio buffer to OGG file using MediaRecorder API
 */
export async function exportBufferToOGG(buffer: AudioBuffer, filename: string = 'export.ogg'): Promise<void> {
	// Check if MediaRecorder supports OGG
	if (!MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')) {
		throw new Error('OGG format not supported in this browser. Please use WAV format instead.');
	}

	// Create a real-time audio context to use MediaRecorder
	const audioContext = new AudioContext({ sampleRate: buffer.sampleRate });
	
	// Create a buffer source
	const source = audioContext.createBufferSource();
	source.buffer = buffer;

	// Create a MediaStreamDestination to capture audio
	const destination = audioContext.createMediaStreamDestination();
	source.connect(destination);
	
	// Use MediaRecorder to encode as OGG
	const mediaRecorder = new MediaRecorder(destination.stream, {
		mimeType: 'audio/ogg; codecs=opus'
	});

	const chunks: Blob[] = [];
	mediaRecorder.ondataavailable = (e) => {
		if (e.data.size > 0) {
			chunks.push(e.data);
		}
	};

	return new Promise<void>((resolve, reject) => {
		mediaRecorder.onstop = () => {
			const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			audioContext.close();
			resolve();
		};

		mediaRecorder.onerror = () => {
			audioContext.close();
			reject(new Error('MediaRecorder error'));
		};

		// Start recording
		mediaRecorder.start();

		// Start playback
		source.start(0);

		// Calculate duration and stop after playback completes
		const duration = buffer.duration * 1000; // Convert to milliseconds
		setTimeout(() => {
			mediaRecorder.stop();
			source.stop();
		}, duration + 100); // Add small buffer
	});
}

/**
 * Export audio buffer to MP3 file using lamejs encoder
 */
export async function exportBufferToMP3(buffer: AudioBuffer, filename: string = 'export.mp3'): Promise<void> {
	// First, try MediaRecorder API (supported in Chrome/Edge for MP3)
	const mimeTypes = [
		'audio/mpeg',           // Standard MP3 MIME type
		'audio/mp3',            // Alternative
		'audio/mpeg3'           // Another variant
	];

	let supportedMimeType: string | null = null;
	for (const mimeType of mimeTypes) {
		if (MediaRecorder.isTypeSupported(mimeType)) {
			supportedMimeType = mimeType;
			break;
		}
	}

	if (supportedMimeType) {
		// Use MediaRecorder API (simpler and works in Chrome/Edge)
		const audioContext = new AudioContext({ sampleRate: buffer.sampleRate });
		const source = audioContext.createBufferSource();
		source.buffer = buffer;
		const destination = audioContext.createMediaStreamDestination();
		source.connect(destination);

		const mediaRecorder = new MediaRecorder(destination.stream, {
			mimeType: supportedMimeType,
			audioBitsPerSecond: 128000 // 128 kbps
		});

		const chunks: Blob[] = [];
		mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				chunks.push(e.data);
			}
		};

		return new Promise<void>((resolve, reject) => {
			mediaRecorder.onstop = () => {
				const blob = new Blob(chunks, { type: supportedMimeType });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				audioContext.close();
				resolve();
			};

			mediaRecorder.onerror = () => {
				audioContext.close();
				reject(new Error('MediaRecorder error during MP3 encoding'));
			};

			mediaRecorder.start();
			source.start(0);
			const duration = buffer.duration * 1000;
			setTimeout(() => {
				mediaRecorder.stop();
				source.stop();
			}, duration + 100);
		});
	}

	// Fallback: Try lamejs if MediaRecorder doesn't support MP3
	// Note: lamejs has compatibility issues with ES modules, so this may fail
	try {
		// Load lamejs - it needs to be loaded as a script to work properly
		let Mp3Encoder: any;
		
		// Try ES module import
		const lamejsModule = await import(/* @vite-ignore */ 'lamejs');
		Mp3Encoder = lamejsModule.Mp3Encoder || lamejsModule.default?.Mp3Encoder || lamejsModule.default;
		
		if (!Mp3Encoder || typeof Mp3Encoder !== 'function') {
			throw new Error('Mp3Encoder not found in lamejs module');
		}
		
		const sampleRate = buffer.sampleRate;
		const numChannels = buffer.numberOfChannels;
		
		// Create MP3 encoder
		// Parameters: channels, sampleRate, bitrate (kbps)
		const mp3Encoder = new Mp3Encoder(numChannels, sampleRate, 128); // 128 kbps
		
		// Convert AudioBuffer to interleaved PCM samples (Int16Array)
		// MP3 encoder expects interleaved samples: [L, R, L, R, ...] for stereo
		const length = buffer.length;
		const samples = new Int16Array(length * numChannels);
		
		for (let i = 0; i < length; i++) {
			for (let ch = 0; ch < numChannels; ch++) {
				const sample = buffer.getChannelData(ch)[i];
				// Convert float32 (-1 to 1) to int16 (-32768 to 32767)
				const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
				samples[i * numChannels + ch] = intSample;
			}
		}
		
		// Encode the samples in chunks
		const sampleBlockSize = 1152; // Standard MP3 frame size
		const mp3Data: Int8Array[] = [];
		
		for (let i = 0; i < samples.length; i += sampleBlockSize * numChannels) {
			const sampleChunk = samples.subarray(i, Math.min(i + sampleBlockSize * numChannels, samples.length));
			const mp3buf = mp3Encoder.encodeBuffer(sampleChunk);
			if (mp3buf.length > 0) {
				mp3Data.push(mp3buf);
			}
		}
		
		// Flush remaining data
		const mp3buf = mp3Encoder.flush();
		if (mp3buf.length > 0) {
			mp3Data.push(mp3buf);
		}
		
		// Combine all MP3 chunks
		const totalLength = mp3Data.reduce((sum, chunk) => sum + chunk.length, 0);
		const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
		
		// Create blob and download
		const url = URL.createObjectURL(mp3Blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	} catch (error) {
		if (error instanceof Error) {
			const errorMsg = error.message;
			// Check for specific lamejs errors
			if (errorMsg.includes('MPEGMode') || errorMsg.includes('is not defined')) {
				throw new Error('MP3 export is not available in this browser. The lamejs library has compatibility issues. Please use WAV or OGG format instead, or use Chrome/Edge which support MP3 via MediaRecorder.');
			}
			if (errorMsg.includes('Failed to resolve module') || errorMsg.includes('Cannot find module')) {
				throw new Error('MP3 export requires lamejs. Please install it: npm install lamejs');
			}
			throw error;
		}
		throw new Error('MP3 encoding failed: ' + String(error));
	}
}

/**
 * Export audio buffer based on format
 */
export async function exportBuffer(
	buffer: AudioBuffer,
	filename: string,
	format: ExportFormat = 'wav'
): Promise<void> {
	const baseFilename = filename.replace(/\.(wav|ogg|mp3)$/i, '');
	
	switch (format) {
		case 'wav':
			exportBufferToWAV(buffer, `${baseFilename}.wav`);
			break;
		case 'ogg':
			await exportBufferToOGG(buffer, `${baseFilename}.ogg`);
			break;
		case 'mp3':
			await exportBufferToMP3(buffer, `${baseFilename}.mp3`);
			break;
		default:
			exportBufferToWAV(buffer, `${baseFilename}.wav`);
	}
}

