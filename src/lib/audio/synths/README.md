# Synth Modules

This directory contains all synthesizer implementations, organized by category.

## Structure

```
synths/
├── drums/              # Percussion synthesizers
│   ├── KickSynth.js
│   ├── SnareSynth.js
│   ├── HiHatSynth.js
│   ├── ClapSynth.js
│   ├── TomSynth.js
│   ├── CymbalSynth.js
│   └── ShakerSynth.js
├── melodic/            # Melodic synthesizers
│   ├── SubtractiveSynth.js
│   ├── FMSynth.js
│   ├── WavetableSynth.js
│   └── SupersawSynth.js
└── shared/             # Shared utilities
    ├── envelope.js     # ADSR envelope calculations
    ├── filter.js       # Filter implementations
    └── oscillator.js   # Waveform generation
```

## Building

The synths are bundled into the AudioWorklet processor using the build script:

```bash
npm run build:worklet
```

This concatenates all synth files with the processor core to create `static/EngineWorkletProcessor.js`.

The build script runs automatically before `npm run dev` and `npm run build`.

## Adding a New Synth

1. Create a new synth class file in the appropriate directory (`drums/` or `melodic/`)
2. Implement the required methods:
   - `constructor(settings, sampleRate)`
   - `updateSettings(settings)`
   - `trigger(velocity, pitch)`
   - `process()` - returns a sample value
3. Add the synth to `scripts/build-worklet.js` in the `synthFiles` array
4. Add the case in `EngineWorkletProcessor.core.js` `createSynth()` method
5. Run `npm run build:worklet` to rebuild

## Synth Interface

All synths must implement:

```javascript
class MySynth {
  constructor(settings, sampleRate) {
    this.sampleRate = sampleRate;
    this.settings = settings || {};
    // Initialize state
  }

  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  trigger(velocity, pitch) {
    // Reset state and start note
    this.isActive = true;
    this.velocity = velocity;
    this.pitch = pitch;
  }

  process() {
    if (!this.isActive) return 0;
    // Generate and return one sample
    // Return 0 when note is finished and set this.isActive = false
  }
}
```

## Best Practices

- Use smooth envelope fade-outs to prevent clicks
- Normalize oscillator outputs to prevent clipping
- Use exponential decay for natural-sounding releases
- Document any special parameters or behaviors
- Keep each synth focused on its core sound character

