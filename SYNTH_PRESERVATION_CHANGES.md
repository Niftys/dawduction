# Synth Preservation Changes Log

## Approach #1: Preserve Active Synths (Selective Clearing) - REVERTED

**Status: REVERTED** - This approach was reverted because preserving synths prevented the performance benefits of reloading. The reload needs to clear all state to fix performance issues.

## Approach #2: Quiet Period Detection - ACTIVE

**Status: ACTIVE** - Detects quiet periods in audio (when all instruments are at low volume ~10%) and schedules reloads during these moments to minimize audible interruption.

### Changes Made:

1. **src/lib/audio/engine/modules/AudioProcessor.js**:
   - Added quiet period detection that monitors mixed audio output levels
   - Detects when output is below 10% threshold (0.06 out of ~0.6 max)
   - Requires 100ms of continuous quiet to trigger
   - Sends `quietPeriod` messages to main thread with cooldown (3 seconds)

2. **src/lib/audio/engine/EngineWorklet.ts**:
   - Added handler for `quietPeriod` messages from worklet
   - Dispatches `quietPeriodDetected` custom event to main thread

3. **src/lib/components/Toolbar.svelte**:
   - Listens for `quietPeriodDetected` events
   - Schedules reloads immediately when quiet periods are detected
   - Falls back to beat-boundary reloads if quiet periods aren't detected
   - Minimum 3 seconds between reloads to prevent excessive reloading

### How It Works:

- AudioProcessor monitors mixed output level every 100ms
- When output stays below 10% threshold for 100ms, it's considered a quiet period
- Quiet period detection sends message to main thread (max once per 3 seconds)
- Main thread schedules reload immediately during quiet period
- Falls back to beat-boundary reloads every 8 beats if no quiet periods detected

### Benefits:

- Reloads happen during naturally quiet moments
- Minimizes audible interruption
- Still maintains performance benefits of reloading
- Automatic fallback ensures reloads still happen even if detection fails

### Changes Made:

1. **src/lib/audio/engine/modules/SynthManager.js** - Modified `clear()` method:
   - Added `clearInactive()` method that only clears synths where `isActive === false`
   - Modified `clear()` to preserve active synths by default (can force clear with `clear(true)`)
   - Added debug logging to track preservation stats
   - Preserves synths that have `isActive === true`

2. **src/lib/audio/engine/EngineWorkletProcessor.core.js** - Updated `loadProject()`:
   - Changed from `this.synthManager.clear()` to `this.synthManager.clearInactive()`
   - Added comment explaining the preservation behavior
   - This preserves synths that are currently playing notes

3. **static/EngineWorkletProcessor.js** - Updated both `loadProject()` and `SynthManager.clear()`:
   - Updated `loadProject()` to use `clearInactive()` instead of `clear()`
   - Updated `SynthManager.clear()` method to match source implementation
   - Note: This file is built from source, but updated manually for immediate use

### How It Works:

- Before clearing synths, we check each synth's `isActive` property
- Only synths with `isActive === false` are removed
- Active synths continue playing through the reload
- New synths are created as needed for new tracks/patterns

### Rollback Instructions:

To revert these changes:
1. Restore `SynthManager.clear()` to original: `this.synths.clear()`
2. Restore `loadProject()` calls to use `this.synthManager.clear()`
3. Remove `clearInactive()` method if added

### Potential Issues:

- If `isActive` isn't perfectly accurate, some inactive synths might be kept
- Track IDs might change between reloads, causing orphaned synths
- Settings changes might not apply to preserved synths immediately

