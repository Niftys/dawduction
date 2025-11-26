/**
 * Factory for creating synth instances based on instrument type
 * Centralizes synth creation logic
 */

class SynthFactory {
	constructor(sampleRate) {
		this.sampleRate = sampleRate;
	}

	create(instrumentType, settings) {
		switch (instrumentType) {
			case 'kick':
				return new KickSynth(settings, this.sampleRate);
			case 'snare':
				return new SnareSynth(settings, this.sampleRate);
			case 'hihat':
				return new HiHatSynth(settings, this.sampleRate);
			case 'clap':
				return new ClapSynth(settings, this.sampleRate);
			case 'tom':
				return new TomSynth(settings, this.sampleRate);
			case 'cymbal':
				return new CymbalSynth(settings, this.sampleRate);
		case 'shaker':
			return new ShakerSynth(settings, this.sampleRate);
		case 'rimshot':
			return new RimshotSynth(settings, this.sampleRate);
		case 'subtractive':
			return new SubtractiveSynth(settings, this.sampleRate);
			case 'fm':
				return new FMSynth(settings, this.sampleRate);
			case 'wavetable':
				return new WavetableSynth(settings, this.sampleRate);
		case 'supersaw':
			return new SupersawSynth(settings, this.sampleRate);
		case 'pluck':
			return new PluckSynth(settings, this.sampleRate);
		case 'bass':
			return new BassSynth(settings, this.sampleRate);
		default:
			return null;
		}
	}
}

