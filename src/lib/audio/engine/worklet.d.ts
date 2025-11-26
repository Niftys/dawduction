/**
 * Type definitions for AudioWorklet globals
 */
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
	process(
		inputs: Float32Array[][],
		outputs: Float32Array[][],
		parameters: Record<string, Float32Array>
	): boolean;
}

declare const sampleRate: number;

declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;

