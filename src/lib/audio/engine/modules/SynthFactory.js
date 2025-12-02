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
		case 'tr808kick':
			return new TR808WavetableKickSynth(settings, this.sampleRate);
		case 'tr808snare':
			return new TR808WavetableSnareSynth(settings, this.sampleRate);
		case 'tr808hihat':
			return new TR808WavetableHiHatSynth(settings, this.sampleRate);
		case 'tr808openhihat':
			return new TR808WavetableOpenHiHatSynth(settings, this.sampleRate);
		case 'tr808closedhihat':
			return new TR808WavetableClosedHiHatSynth(settings, this.sampleRate);
		case 'tr808clap':
			return new TR808WavetableClapSynth(settings, this.sampleRate);
		case 'tr808tom':
			return new TR808WavetableLowTomSynth(settings, this.sampleRate);
		case 'tr808lowtom':
			return new TR808WavetableLowTomSynth(settings, this.sampleRate);
		case 'tr808midtom':
			return new TR808WavetableMidTomSynth(settings, this.sampleRate);
		case 'tr808hightom':
			return new TR808WavetableHighTomSynth(settings, this.sampleRate);
		case 'tr808cymbal':
			return new TR808WavetableCymbalSynth(settings, this.sampleRate);
		case 'tr808ride':
			return new TR808WavetableRideSynth(settings, this.sampleRate);
		case 'tr808shaker':
			return new TR808WavetableShakerSynth(settings, this.sampleRate);
		case 'tr808cowbell':
			return new TR808WavetableCowbellSynth(settings, this.sampleRate);
		case 'tr808clave':
			return new TR808WavetableClaveSynth(settings, this.sampleRate);
		case 'tr808rimshot':
			return new TR808WavetableRimshotSynth(settings, this.sampleRate);
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
		case 'pad':
			return new PadSynth(settings, this.sampleRate);
		case 'organ':
			return new OrganSynth(settings, this.sampleRate);
		case 'sample':
			return new SampleSynth(settings, this.sampleRate);
		default:
			return null;
	}
}
}

