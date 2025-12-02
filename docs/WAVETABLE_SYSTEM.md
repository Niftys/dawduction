# Wavetable System Documentation

## Overview

The "wavetables" in this system are actually **full-length audio samples** (not traditional wavetables used for synthesis). They're pre-recorded TR-808 drum samples that have been converted from WAV files into JavaScript arrays for playback in the AudioWorklet.

## Terminology Clarification

**Traditional Wavetables**: Short waveform cycles (typically 2048-4096 samples) used for oscillators in synthesis. You loop through them to generate tones.

**Our "Wavetables"**: Full-length audio samples (can be seconds long) that are played back once, like a sampler. We call them "wavetables" because they're stored as arrays of sample values, but they're really just audio samples.

## The Conversion Pipeline

### Step 1: Source Files
- **Location**: `808-samples/` directory
- **Format**: WAV files (e.g., `wa_808tape_kick_01_clean.wav`)
- **Content**: Pre-recorded TR-808 drum samples at various sample rates (often 48kHz)

### Step 2: Conversion Script
**File**: `scripts/convert-all-samples-to-wavetable.cjs`

**Process**:
1. **Parse WAV files**: Reads RIFF/WAVE headers, extracts audio data
2. **Convert to normalized floats**: Converts 16-bit/24-bit/32-bit PCM to -1.0 to 1.0 float arrays
3. **Resample to 44.1kHz**: Uses linear interpolation to match AudioContext sample rate
4. **Preserve full length**: Keeps the entire sample (no truncation to 2048)
5. **Organize by drum type**: Groups samples by type (kick, snare, clap, etc.)
6. **Generate JavaScript**: Outputs a JS file with Float32Array data

**Output Structure**:
```javascript
export const wavetables = {
  "kick": {
    "wa_808tape_kick_01_clean": Float32Array([0.001, -0.002, ...]), // Full sample
    "wa_808tape_kick_02_clean": Float32Array([...]),
    // ... more kick samples
  },
  "snare": {
    "wa_808tape_snare_01_clean": Float32Array([...]),
    // ... more snare samples
  },
  // ... other drum types
};
```

**Key Features**:
- Samples are resampled to 44.1kHz to match AudioContext
- Full sample length is preserved (no truncation)
- Each sample is a Float32Array for performance
- Organized hierarchically: `wavetables[drumType][sampleName]`

### Step 3: Build Script Injection
**File**: `scripts/build-worklet.js`

**Process**:
1. Reads `allDrumWavetables.js`
2. Converts `export const wavetables = ...` to `const wavetables = ...` (removes export)
3. Injects it into the bundled `EngineWorkletProcessor.js`
4. Makes `wavetables` available as a global variable in the AudioWorklet scope

**Result**: The wavetable data is embedded directly in the worklet processor file, making it available to all synth classes.

### Step 4: Synth Initialization
**File**: `src/lib/audio/synths/drums/TR808WavetableKickSynth.js`

**Process**:
```javascript
class TR808WavetableKickSynth extends WavetableDrumSynth {
  constructor(settings, sampleRate) {
    // Get wavetables from global scope (injected by build script)
    const allWavetables = typeof wavetables !== 'undefined' ? wavetables : {};
    const kickWavetables = allWavetables.kick || {};
    
    const defaultSettings = {
      // ... ADSR settings
      wavetables: kickWavetables,  // Pass to base class
      sampleNames: Object.keys(kickWavetables).sort(),
      // ...
    };
    
    super(defaultSettings, sampleRate);
  }
}
```

**Flow**:
1. Synth constructor accesses global `wavetables` variable
2. Extracts the relevant drum type (e.g., `kick`, `snare`)
3. Passes wavetables to base class `WavetableDrumSynth` via settings
4. Base class stores them in `this.wavetables`

## Playback System

### Base Class: WavetableDrumSynth
**File**: `src/lib/audio/synths/drums/WavetableDrumSynth.js`

**Key Components**:

1. **Wavetable Storage**:
   ```javascript
   this.wavetables = this.settings.wavetables || {};  // All samples for this drum type
   this.currentWavetable = null;  // Currently selected sample (Float32Array)
   this.wavetableLength = 0;  // Length of current wavetable
   ```

2. **Sample Selection**:
   ```javascript
   selectWavetable() {
     // Selects a sample by index or name
     // Sets this.currentWavetable to the Float32Array
     // Sets this.wavetableLength to the array length
   }
   ```

3. **Playback State**:
   ```javascript
   this.phase = 0;  // Current position in wavetable (can be fractional for interpolation)
   this.playbackSpeed = 1.0;  // For pitch shifting (1.0 = normal speed)
   this.isActive = false;  // Whether currently playing
   ```

4. **Trigger**:
   ```javascript
   trigger(velocity, pitch) {
     this.phase = 0;  // Reset to start
     this.isActive = true;
     // Calculate playbackSpeed based on pitch for pitch shifting
     this.playbackSpeed = Math.pow(2, (pitch - basePitch) / 12);
   }
   ```

5. **Process (per sample)**:
   ```javascript
   process() {
     // 1. Check if we've reached the end
     if (this.phase >= this.wavetableLength) {
       this.isActive = false;
       return 0;
     }
     
     // 2. Read from wavetable with linear interpolation
     const index1 = Math.floor(this.phase);
     const index2 = Math.min(index1 + 1, this.wavetableLength - 1);
     const frac = this.phase - index1;
     const sample = this.currentWavetable[index1] * (1 - frac) + 
                    this.currentWavetable[index2] * frac;
     
     // 3. Apply envelope (attack/decay)
     const envelope = calculateEnvelope();
     
     // 4. Apply velocity and gain
     let output = sample * envelope * this.velocity * 1.5;
     
     // 5. Advance phase
     this.phase += this.playbackSpeed;  // Can be > 1.0 for pitch shifting
     
     return output;
   }
   ```

## Key Design Decisions

### Why "Wavetables"?
- The term is a bit misleading, but it's used because:
  - The data is stored as arrays of sample values (like wavetables)
  - It differentiates from "samples" which might imply AudioBuffer usage
  - The playback mechanism (phase accumulator) is similar to wavetable synthesis

### Why Full-Length Samples?
- **Original Issue**: Samples were truncated to 2048 samples, cutting off long tails
- **Solution**: Preserve full sample length to maintain original timing and character
- **Result**: 808 kicks can ring out for their full duration (often 2-3 seconds)

### Why Resample to 44.1kHz?
- AudioContext runs at 44.1kHz (or 48kHz, but we standardize on 44.1kHz)
- If source is 48kHz and we play at 44.1kHz without resampling, playback is too slow
- Resampling ensures correct playback speed

### Why Linear Interpolation?
- `this.phase` can be fractional (e.g., 100.5)
- We need to read between array indices
- Linear interpolation: `sample[index1] * (1 - frac) + sample[index2] * frac`
- Provides smooth playback, especially when pitch shifting

### Why Pitch Shifting via Playback Speed?
- `playbackSpeed = 1.0` means play 1 wavetable sample per audio sample (normal speed)
- `playbackSpeed = 2.0` means play 2 wavetable samples per audio sample (2x speed = +1 octave)
- `playbackSpeed = 0.5` means play 0.5 wavetable samples per audio sample (0.5x speed = -1 octave)
- Formula: `playbackSpeed = 2^((pitch - basePitch) / 12)`

## Data Flow Summary

```
WAV Files (808-samples/)
    ↓
convert-all-samples-to-wavetable.cjs
    ↓
allDrumWavetables.js (Float32Arrays)
    ↓
build-worklet.js (injects as global)
    ↓
EngineWorkletProcessor.js (bundled)
    ↓
AudioWorklet (global wavetables variable)
    ↓
TR808WavetableKickSynth (accesses wavetables.kick)
    ↓
WavetableDrumSynth (stores in this.wavetables)
    ↓
process() method (reads samples, applies envelope)
    ↓
Audio output
```

## File Locations

- **Conversion Script**: `scripts/convert-all-samples-to-wavetable.cjs`
- **Wavetable Data**: `src/lib/audio/synths/drums/wavetables/allDrumWavetables.js`
- **Base Synth Class**: `src/lib/audio/synths/drums/WavetableDrumSynth.js`
- **TR-808 Synths**: `src/lib/audio/synths/drums/TR808Wavetable*.js`
- **Build Script**: `scripts/build-worklet.js`
- **Output**: `static/EngineWorkletProcessor.js`

## Regenerating Wavetables

If you need to regenerate the wavetables (e.g., after adding new samples):

```bash
node scripts/convert-all-samples-to-wavetable.cjs 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js
```

Then rebuild the worklet:
```bash
node scripts/build-worklet.js
```

## Performance Considerations

- **Memory**: Full-length samples can be large (e.g., 3-second kick at 44.1kHz = 132,300 samples = ~529KB per sample)
- **Interpolation**: Linear interpolation is fast but could be improved with cubic interpolation for better quality
- **Caching**: Samples are loaded once and reused (no per-note loading)
- **Float32Array**: Used for better performance than regular arrays

