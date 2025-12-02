# Wavetable Conversion Guide

## Overview

This guide explains how to convert TR-808 samples to wavetables for use in the DAW. There are multiple conversion methods available.

## Method 1: Improved Conversion (Recommended)

Uses better normalization and format handling:

```bash
node scripts/convert-samples-improved.cjs 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js
```

**Features:**
- Peak normalization to 0.95 (prevents clipping)
- Resamples to 44.1kHz (matches AudioContext)
- Preserves full sample length
- 32-bit float format
- No external dependencies

## Method 2: Using okwt (Advanced)

Uses the [okwt](https://github.com/drzhnn/okwt) tool for professional-grade wavetable formatting:

### Installation

```bash
pip install okwt
```

### Usage

```bash
node scripts/convert-with-okwt.cjs 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js
```

**Features:**
- Uses okwt for proper wavetable formatting
- Adds metadata chunks (uhWT, srge)
- Professional normalization
- Handles various input formats

## Method 3: Original Conversion

The original conversion script (still available):

```bash
node scripts/convert-all-samples-to-wavetable.cjs 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js
```

## After Conversion

After converting samples, rebuild the worklet:

```bash
node scripts/build-worklet.js
```

This injects the wavetable data into the AudioWorklet processor.

## Troubleshooting

### Samples sound wrong or don't play

1. **Check sample rate**: Ensure samples are resampled to 44.1kHz
2. **Check normalization**: Samples should be normalized to prevent clipping
3. **Check format**: Samples should be 32-bit float
4. **Rebuild worklet**: Always rebuild after converting samples

### okwt not found

If using Method 2, ensure okwt is installed:
```bash
pip install okwt
# Or
python -m pip install okwt
```

### Samples are too quiet or too loud

The improved conversion script normalizes to 0.95 peak. If you need different levels:
- Edit `scripts/convert-samples-improved.cjs`
- Change the `0.95` value in the `normalizeSamples` function

## File Structure

After conversion, the wavetables are organized as:

```javascript
wavetables = {
  "kick": {
    "wa_808tape_kick_01_clean": Float32Array([...]),
    "wa_808tape_kick_02_clean": Float32Array([...]),
    // ...
  },
  "snare": {
    // ...
  },
  // ...
}
```

## Verification

To verify conversion worked:

1. Check the output file exists: `src/lib/audio/synths/drums/wavetables/allDrumWavetables.js`
2. Check file size (should be several MB for all samples)
3. Rebuild worklet and test in the DAW
4. Check browser console for errors

## References

- [okwt GitHub](https://github.com/drzhnn/okwt) - Professional wavetable tool
- [WAVETABLE_SYSTEM.md](./WAVETABLE_SYSTEM.md) - System architecture
- [TR808_WAVETABLE_ANALYSIS.md](./TR808_WAVETABLE_ANALYSIS.md) - Processing analysis

