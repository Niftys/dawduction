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
	patterns?: any[]
): Promise<AudioBuffer> {
	// Create a temporary audio context for recording (must match engine sample rate)
	const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
	
	// Create engine instance
	const engine = new EngineWorklet();
	await engine.initialize();
	await engine.resume();
	
	// Load project (use timeline if available, otherwise pattern loop)
	await engine.loadProject(standaloneInstruments, bpm, baseMeterTrackId, timeline, patterns);
	
	// Calculate duration
	const durationInSeconds = (durationInBeats * 60) / bpm;
	const totalSamples = Math.ceil(durationInSeconds * SAMPLE_RATE);
	
	// Create script processor node to capture audio
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
	processor.connect(audioContext.destination); // Still output for monitoring
	
	// Start playback
	engine.setTransport('play');
	
	// Wait for recording to complete
	await new Promise<void>(resolve => {
		const checkComplete = () => {
			if (recordedSamples >= totalSamples) {
				engine.setTransport('stop');
				processor.disconnect();
				engine.reconnectToOutput();
				resolve();
			} else {
				setTimeout(checkComplete, 50);
			}
		};
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
	audioContext.close();
	
	return audioBuffer;
}

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

