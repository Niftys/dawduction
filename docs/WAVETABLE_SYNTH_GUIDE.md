# Converting WAV Samples to JavaScript Synth Code

This guide explains how to convert pre-recorded WAV drum samples into JavaScript synth code using wavetable synthesis.

## Overview

There are two approaches to converting WAV files to synth code:

1. **Wavetable Synthesis** (Recommended) - Convert samples into wavetables that can be played back with pitch shifting
2. **Analysis-Based Synthesis** - Analyze samples and recreate them procedurally (more complex)

This guide covers the wavetable approach, which is simpler and preserves the original sound character.

## Step-by-Step Process

### 1. Download the WAV Samples

Use the provided PowerShell script to download all samples:

```powershell
.\download-808-samples.ps1
```

This creates a directory structure like:
```
808-samples/
├── kick/
│   ├── wa_808tape_kick_01_clean.wav
│   ├── wa_808tape_kick_01_sat.wav
│   └── ...
├── snare/
└── ...
```

### 2. Convert WAV Files to Wavetables

For the 14 basic samples (all in one directory), use:

```bash
node scripts/convert-all-samples-to-wavetable.js 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js
```

This will:
- Read all WAV files from the input directory
- Parse the audio data
- Normalize to a fixed wavetable length (2048 samples)
- Organize samples by drum type (kick, snare, etc.)
- Generate a JavaScript file with wavetable arrays

**Alternative:** For individual drum types with multiple variations:

```bash
node scripts/convert-wav-to-wavetable.js 808-samples/kick src/lib/audio/synths/drums/wavetables/kickWavetables.js
```

### 3. Include Wavetables in Build

Add the wavetable file to `scripts/build-worklet.js` so it's included in the AudioWorklet bundle:

```javascript
// In build-worklet.js, add to the appropriate section:
const wavetableFiles = [
    'src/lib/audio/synths/drums/wavetables/kickWavetables.js',
    // ... other wavetable files
];
```

### 4. Use WavetableDrumSynth

Create a synth instance with the wavetables:

```javascript
// For all drum samples in one file:
import { wavetables, defaultSamples } from './wavetables/allDrumWavetables.js';

// Create kick synth
const kickSynth = new SampleBasedKickSynth({
    wavetables: wavetables.kick,  // Just the kick samples
    selectedSample: defaultSamples.kick, // Use first sample
    attack: 0.001,
    decay: 0.3,
    sustain: 0.0,
    release: 0.1
}, sampleRate);

// Or for individual wavetable files:
import { wavetables as kickWavetables } from './wavetables/kickWavetables.js';

const synth = new SampleBasedKickSynth({
    wavetables: kickWavetables,
    selectedSample: 0, // or sample name like 'wa_808tape_kick_01_clean'
    attack: 0.001,
    decay: 0.3,
    sustain: 0.0,
    release: 0.1
}, sampleRate);
```

### 5. Switch Between Samples

You can switch between different sample variations:

```javascript
// By index
synth.updateSettings({ selectedSample: 5 });

// By name
synth.updateSettings({ selectedSample: 'wa_808tape_kick_15_clean' });
```

## How It Works

### Wavetable Synthesis

The `WavetableDrumSynth` class:

1. **Stores wavetables** - Pre-processed audio samples as arrays
2. **Plays back samples** - Uses phase accumulation to read through the wavetable
3. **Supports pitch shifting** - Adjusts playback speed based on MIDI pitch
4. **Applies envelopes** - Uses ADSR envelopes for realistic decay
5. **Handles retriggering** - Smooth transitions when retriggering quickly

### Wavetable Format

Each wavetable is a normalized array of 2048 samples:
- Values range from -1.0 to 1.0
- Samples are stored as Float32Array for performance
- Can be pitch-shifted by adjusting playback speed

## Example: Converting All 14 Basic Samples

For the simplified workflow (14 samples in one directory):

```bash
# Download 14 basic samples (one per drum type)
.\download-808-samples.ps1

# Convert all samples to a single organized wavetable file
node scripts/convert-all-samples-to-wavetable.js 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js
```

This creates a single file with all samples organized by drum type:
- `wavetables.kick['wa_808tape_kick_01_clean']`
- `wavetables.snare['wa_808tape_snare_01_clean']`
- etc.

**Alternative:** If you download all variations and want separate files:

```bash
# Convert each drum type separately
node scripts/convert-wav-to-wavetable.js 808-samples/kick src/lib/audio/synths/drums/wavetables/kickWavetables.js
node scripts/convert-wav-to-wavetable.js 808-samples/snare src/lib/audio/synths/drums/wavetables/snareWavetables.js
# ... etc
```

## Advantages of Wavetable Approach

✅ **Preserves original sound** - Exact reproduction of samples  
✅ **Small file size** - Normalized wavetables are compact  
✅ **Pitch shifting** - Can transpose samples  
✅ **Fast playback** - Efficient wavetable lookup  
✅ **Multiple variations** - Easy to switch between samples  

## Limitations

⚠️ **Fixed length** - Wavetables are normalized to 2048 samples  
⚠️ **No real-time synthesis** - Not procedurally generated  
⚠️ **Memory usage** - All samples loaded in memory  

## Alternative: Analysis-Based Synthesis

For true procedural synthesis, you would need to:

1. Analyze the frequency content of samples
2. Extract synthesis parameters (oscillator frequencies, filter settings, etc.)
3. Recreate using oscillators, filters, and envelopes

This is more complex but allows for real-time parameter control. The `io-808` reference implementation shows how to do this for TR-808 sounds.

## Files Created

- `scripts/convert-wav-to-wavetable.js` - Conversion script
- `src/lib/audio/synths/drums/WavetableDrumSynth.js` - Base wavetable synth class
- `src/lib/audio/synths/drums/SampleBasedKickSynth.js` - Example implementation
- `download-808-samples.ps1` - Sample download script

## Next Steps

1. Download samples for the drum types you want
2. Convert them to wavetables
3. Create synth classes for each drum type (like `SampleBasedKickSynth`)
4. Add them to `SynthFactory.js` and `build-worklet.js`
5. Test and adjust ADSR parameters as needed

