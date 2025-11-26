# DAWduction Development Changes Log

This document tracks all significant changes made during development to help maintain consistency and avoid regressions.

## Current State (Latest Session)

### Pattern Editor vs Arrangement View
- **Pattern Editor** (`/project/[id]/pattern/[patternId]`):
  - Shows pattern instruments on canvas
  - Has "+ Instrument" button to add instruments to pattern
  - Shows mute/solo buttons ONLY when a root node is selected
  - Uses `pattern.instruments` array (multi-instrument support)
  
- **Arrangement View** (`/project/[id]`):
  - Shows timeline with pattern clips
  - NO "+ Instrument" button (instruments are added via InstrumentSelector in sidebar)
  - NO mute/solo buttons (these are for pattern instruments only)
  - Uses standalone `tracks` array for arrangement editing

### Solo Logic
- Only ONE instrument can be soloed at a time
- When soloing an instrument, all other instruments in the same pattern are automatically unsoloed
- Works for both pattern instruments and arrangement tracks

### Canvas Rendering
- In **Pattern Editor**: Only renders `pattern.instruments` (not `project.tracks`)
- In **Arrangement View**: Only renders `project.tracks` (not pattern instruments)
- Handles both new format (`pattern.instruments` array) and legacy format (`pattern.instrumentType` + `pattern.patternTree`)

### Real-time Audio Updates
- Pattern tree changes (pitch, velocity, division, add/remove nodes) update audio engine in real-time without stopping playback
- Synth parameter changes update in real-time
- Instrument type changes recreate synth without stopping playback
- Event flattening happens in main thread, pre-flattened events sent to worklet

### Velocity Visualization
- Leaf nodes show velocity as vertical fill (0% = empty, 100% = full)
- Non-leaf nodes show standard fill

### Editor Mode Sync
- `editorModeStore` manages active editor mode ('pitch' or 'velocity')
- `NoteControls` and `MidiEditor` stay in sync via shared store
- Mode switch buttons available in sidebar for melodic instruments

## Recent Fixes

### Instrument Deletion Fix (Current Session)
- **Fixed**: Deleting an instrument's root node now completely removes the instrument from the pattern
- **Keyboard Delete**: When deleting root node via Delete/Backspace key, instrument is now removed instead of just clearing the tree
- **Context Menu Delete**: Improved logic to always remove the instrument when root node is deleted, even if instrumentId isn't explicitly set
- **Engine Update**: Triggers project reload after instrument removal to update audio engine

### Node Positioning and Group Movement (Current Session)
- **Arc Node Positioning**: New child nodes are placed in a small arc (60 degrees) below the parent node
- **Increased Distance**: Nodes are positioned at radius 160 (double the previous distance) to prevent overlaps
- **Gradual Angle Change**: Nodes are distributed within a small arc so they appear close together, starting from bottom center
- **Group Movement**: When multiple nodes are selected, dragging one moves all selected nodes together as a group
- Updated both `addChildNode` (tracks) and `addPatternChildNode` (pattern instruments) to use circular positioning

### Keyboard Shortcut for Adding Children (Current Session)
- Added 'A' key shortcut to add child nodes to selected node
- Works in both pattern editor and arrangement view
- Updated context menu to show "(A)" shortcut indicator next to "Add Child"
- Only works when a node is selected and not typing in input fields

### Child Node Playback Order (Current Session)
- Fixed: Children now play in the order they are created (first created plays first)
- Changed `addChildNode` and `addPatternChildNode` to append children at end of array instead of beginning
- Previously: `[newChild, ...node.children]` (last created played first)
- Now: `[...node.children, newChild]` (first created plays first)

### UI Cleanup - Arrangement View (Current Session)
- **Removed "+ Instrument" button from arrangement view** - Instruments are added via InstrumentSelector in sidebar
- **Removed mute/solo buttons from arrangement view** - These only appear in pattern editor when root node is selected
- Mute/solo buttons now only show when: in pattern editor page AND root node selected AND pattern instrument selected

### Solo Logic (Current Session)
- Fixed: Only one instrument can be soloed at a time
- When soloing, all other instruments in pattern/arrangement are unsoloed

### Ghost Kick Issue (Current Session)
- Removed "+ Instrument" button that was creating standalone tracks in pattern editor
- Fixed renderer to only show pattern instruments in pattern editor (not `project.tracks`)
- Restored "+ Instrument" button but now correctly creates pattern instruments

### Instrument Visibility (Current Session)
- Fixed renderer to handle both new and legacy pattern formats
- Added debug logging to trace instrument rendering

## Important Notes

1. **Pattern Editor**: Use `projectStore.addPatternInstrument()` to add instruments
2. **Arrangement View**: Use `projectStore.addTrack()` to add standalone tracks
3. **Mute/Solo**: Only visible in pattern editor when root node is selected
4. **Canvas**: Pattern editor shows pattern instruments, arrangement shows tracks
5. **Solo**: Exclusive - only one instrument soloed at a time

## Files to Watch

- `src/lib/components/Toolbar.svelte` - Mute/solo button visibility
- `src/lib/canvas/utils/renderer.ts` - Canvas rendering logic
- `src/routes/project/[id]/pattern/[patternId]/+page.svelte` - Pattern editor page
- `src/routes/project/[id]/+page.svelte` - Arrangement view page
- `src/lib/stores/projectStore.ts` - Pattern and track management

