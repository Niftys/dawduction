import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';

/**
 * Load a sample audio buffer to the AudioWorklet engine
 * @param engine - The EngineWorklet instance
 * @param trackId - The track/instrument ID
 * @param audioBuffer - The mono Float32Array audio buffer
 * @param originalSampleRate - The original sample rate of the audio
 */
export async function loadSampleToEngine(
	engine: EngineWorklet,
	trackId: string,
	audioBuffer: Float32Array,
	originalSampleRate: number
): Promise<void> {
	// Resample if needed (AudioWorklet typically runs at 44100Hz)
	const targetSampleRate = 44100;
	let resampledBuffer = audioBuffer;
	
	if (originalSampleRate !== targetSampleRate) {
		resampledBuffer = resampleAudio(audioBuffer, originalSampleRate, targetSampleRate);
	}
	
	// Send sample data to the worklet
	// We need to transfer the ArrayBuffer directly (can't use JSON serialization)
	// Access the worklet node's port directly
	const workletNode = (engine as any).workletNode;
	if (workletNode?.port) {
		// Transfer the ArrayBuffer (moves ownership, doesn't copy)
		// Note: After transfer, resampledBuffer will be detached
		workletNode.port.postMessage({
			type: 'loadSample',
			trackId,
			sampleData: resampledBuffer.buffer, // ArrayBuffer to transfer
			sampleRate: targetSampleRate
		}, [resampledBuffer.buffer]); // Transfer list - moves buffer to worklet thread
	} else {
		console.error('Cannot load sample: worklet node not available');
	}
}

/**
 * Simple linear resampling
 * For production, you'd want a better resampling algorithm (e.g., using a library)
 */
function resampleAudio(
	inputBuffer: Float32Array,
	inputSampleRate: number,
	outputSampleRate: number
): Float32Array {
	if (inputSampleRate === outputSampleRate) {
		return inputBuffer;
	}
	
	const ratio = inputSampleRate / outputSampleRate;
	const outputLength = Math.round(inputBuffer.length / ratio);
	const output = new Float32Array(outputLength);
	
	for (let i = 0; i < outputLength; i++) {
		const inputIndex = i * ratio;
		const index = Math.floor(inputIndex);
		const fraction = inputIndex - index;
		
		// Linear interpolation
		if (index + 1 < inputBuffer.length) {
			output[i] = inputBuffer[index] * (1 - fraction) + inputBuffer[index + 1] * fraction;
		} else {
			output[i] = inputBuffer[index] || 0;
		}
	}
	
	return output;
}

