/**
 * Base class for audio effects
 * Provides common functionality like state management and denormal flushing
 */
class BaseEffect {
	constructor(processor) {
		this.processor = processor;
		this.sampleRate = (processor && processor.sampleRate) ? processor.sampleRate : 44100;
	}

	_flushDenormals(x) {
		return (x > -1e-20 && x < 1e-20) ? 0 : x;
	}

	getSampleRate() {
		return (this.processor && this.processor.sampleRate) ? this.processor.sampleRate : 44100;
	}

	/**
	 * Process a single sample through the effect
	 * Must be implemented by subclasses
	 */
	process(sample, settings, effect) {
		return sample;
	}
}

