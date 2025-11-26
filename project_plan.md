# DAWDUCTION - Project Plan

**Web-Based Procedural-Synthesis DAW Using Tree-Based Rhythmic Structures**

**Stack:** SvelteKit (Vercel) + Supabase (Auth/DB/Storage) + AudioWorklets  
**UI:** Infinite Canvas + Inspector Sidebar  
**Engine:** Fully procedural synthesizers (drums + synths) inside AudioWorklets  
**Patterns:** Infinite-depth subdivision trees, event flattening playback

---

## 1. GOALS

Build a browser-based DAW that uses tree-like rhythmic structures similar to Andy Chamberlain's videos.

- Allow users to create patterns, assign instruments, and generate sound entirely in-browser
- Make the UI an infinite canvas where each subdivision node appears as a draggable circle
- Support procedural drum synthesis and multiple synth voices
- Support user accounts, public sharing, forking, and project galleries
- Keep hosting cost near zero using Vercel + Supabase
- **Polyrhythm-first design** - no assumptions about 4/4 time, maximum user control

---

## 2. HIGH-LEVEL ARCHITECTURE

### FRONTEND (SvelteKit)

- Canvas-based editor (infinite pan/zoom)
- Svelte stores for project state
- Sidebar UI for instrument and mixer controls
- Separate threads: UI = SvelteKit, Audio Engine = Worklet
- Communication via MessagePort
- Benefits: No UI re-render risk affecting timing, easier debugging, engine can evolve independently

### BACKEND (Supabase)

- Authentication (email + optional OAuth)
- DB for projects, tracks, profiles
- Storage for optional user samples

### AUDIO ENGINE

- Runs entirely in AudioWorkletProcessor
- UI controls through MessagePort
- Procedural synthesis modules loaded per instrument
- Event scheduling uses event-flattening for sample-accurate timing
- Schedule events 100–150ms ahead for precise clocking
- The UI never directly touches audio timing

---

## 3. FILE STRUCTURE

```
src/
  lib/
    audio/
      engine/
        EngineWorklet.ts              // Main worklet class
        EngineWorkletProcessor.js     // Worklet processor (separate file)
        scheduler.ts                  // Event scheduling logic
      synths/
        drums/
          kick.ts
          snare.ts
          clap.ts
          tom.ts
          hihat.ts
          cymbal.ts
          shaker.ts
        fm/
          fmSynth.ts
        subtractive/
          subtractiveSynth.ts
        wavetable/
          wavetableSynth.ts
          wavetables.ts              // Pre-computed wavetables
        pluck/
          karplusStrong.ts
        noise/
          noiseSynth.ts
        additive/
          additiveSynth.ts
        base/
          synthBase.ts               // Common synth interface
      utils/
        eventFlatten.ts              // Tree → events conversion
        patternMath.ts               // Division calculations
    canvas/
      Canvas.svelte                  // Main canvas component
      NodeRenderer.ts                // Drawing logic
      Viewport.ts                    // Pan/zoom transform
      interactions/
        nodeCreation.ts
        nodeSelection.ts
        nodeDeletion.ts
    stores/
      projectStore.ts                // Project state
      canvasStore.ts                 // Canvas viewport state
      selectionStore.ts              // Selected nodes
    components/
      Sidebar.svelte
      InstrumentPanel.svelte
      Mixer.svelte
      Toolbar.svelte
      NodeContextMenu.svelte
  routes/
    +layout.svelte
    +page.svelte                     // Home
    project/
      [id]/
        +page.svelte                 // Editor
        +page.server.ts              // Load project
    profile/
      [slug]/
        +page.svelte                 // User profile
    gallery/
      +page.svelte                   // Public projects
    login/
      +page.svelte
    register/
      +page.svelte
```

---

## 4. SUPABASE SCHEMA

### profiles
- `id: uuid` (PK, same as auth)
- `username: text UNIQUE` - Required, URL-friendly
- `slug: text UNIQUE` - Auto-generated from username (lowercase, hyphenated)
- `display_name: text` - Optional friendly name
- `bio: text`
- `avatar_url: text`
- `created_at: timestamp`

### projects
- `id: uuid PK`
- `owner_id: uuid FK -> profiles`
- `title: text`
- `slug: text` - URL-friendly identifier (auto-generated from title, unique per user)
- `description: text` - Optional project description
- `bpm: integer`
- `is_public: boolean`
- `allow_forking: boolean`
- `forked_from: uuid` - Reference to original project if this is a fork (nullable)
- `created_at: timestamp`
- `updated_at: timestamp`

### tracks
- `id: uuid PK`
- `project_id: uuid FK -> projects`
- `instrument_type: text` - 'kick', 'snare', 'fm', 'subtractive', 'wavetable', etc
- `pattern_tree: jsonb` - Full recursive tree structure (includes node IDs and positions)
- `settings: jsonb` - Synth parameters (different schema per instrument type)
- `volume: float`
- `pan: float`
- `color: text`
- `created_at: timestamp`
- `updated_at: timestamp`

---

## 5. PATTERN TREE FORMAT

### Node Structure

```typescript
{
  id: string;              // Unique ID for referencing (UUID)
  division: number;        // Subdivision value
  x?: number;              // Canvas X position (optional, for visual layout)
  y?: number;              // Canvas Y position (optional, for visual layout)
  children: Node[];        // Recursive children
  velocity?: number;       // 0-1, leaf nodes only
  pitch?: number;          // MIDI number (0-127), leaf nodes only
}
```

### Key Concepts

- **Tree root determines instrument assignment** - The root (mother) node chooses "Kick", "Snare", "Synth", etc.
- **All descendant leaves inherit the instrument** unless overridden (advanced mode)
- **Patterns may have infinite depth**, limited only by memory
- **Node positions** (`x, y`) are stored directly in `pattern_tree` JSONB - purely visual, don't affect timing
- **Intermediate branches** may have no pitch/velocity (only leaf nodes have these)

### Division Semantics

- The `division` number represents the subdivision value (e.g., 22 splits into 10+12)
- Each child node gets a **proportional share** of the parent's duration
- Example: If parent has duration D and children have divisions [10, 12]:
  - Child 1 gets: `D * (10 / (10+12)) = D * (10/22)`
  - Child 2 gets: `D * (12 / (10+12)) = D * (12/22)`
- This allows for **polyrhythmic patterns** (unequal subdivisions)

### Time Base & Pattern Length

- **Root node's `division` value is USER-CONFIGURABLE** (not fixed to 4)
- Root node represents the total pattern length in "units" (user-defined)
- **Pattern length in beats = root.division** (so division=22 = 22 beats)
- This allows for complex polyrhythms: 5/4, 7/8, 11/16, 22-beat patterns, etc.
- **NO assumption of 4/4 time** - this is a polyrhythm-first DAW
- Pattern loops automatically when playback reaches the end
- Users can create patterns of any length: 3 beats, 7 beats, 22 beats, 100+ beats

---

## 6. EVENT FLATTENING

### Purpose

Converts a recursive pattern tree into a flat list of timed events for playback.

### Output Format

```typescript
{
  time: number;        // In BEATS (relative to BPM)
  velocity: number;    // 0-1
  pitch: number;       // MIDI number (0-127)
  instrumentId: string;
}
```

### Algorithm

```typescript
function flattenTree(
  node: Node, 
  parentDuration: number, 
  startTime: number, 
  instrumentId: string
): Event[] {
  if (node.children.length === 0) {
    // Leaf node - create event
    return [{
      time: startTime,
      velocity: node.velocity ?? 0.8,
      pitch: node.pitch ?? 60, // Middle C default
      instrumentId
    }];
  }
  
  // Calculate total division sum
  const totalDivision = node.children.reduce((sum, child) => sum + child.division, 0);
  
  // Recursively process children
  let currentTime = startTime;
  const events: Event[] = [];
  
  for (const child of node.children) {
    const childDuration = parentDuration * (child.division / totalDivision);
    events.push(...flattenTree(child, childDuration, currentTime, instrumentId));
    currentTime += childDuration;
  }
  
  return events;
}
```

### Usage

- Root node call: `flattenTree(rootNode, rootNode.division, 0.0, trackId)`
- Root division = pattern length in beats (user-defined)
- `time` in events is in BEATS (relative to BPM)
- Conversion to seconds: `timeInSeconds = (timeInBeats / bpm) * 60`
- This makes tempo changes simple (just recalculate, no need to re-flatten)
- Leaf nodes trigger at their calculated time with zero duration (instant triggers)
- For melodic synths, duration comes from ADSR envelope settings, not the tree

---

## 7. AUDIO ENGINE MODULES

### 7.1 Engine Worklet

**Files:**
- `/src/lib/audio/engine/EngineWorklet.ts` - Main worklet class
- `/src/lib/audio/engine/EngineWorkletProcessor.js` - Worklet processor (separate file)
- `/src/lib/audio/engine/scheduler.ts` - Event scheduling logic

**Responsibilities:**
- Convert pattern → event list → schedule
- Schedule events 100–150ms ahead
- Precise clocking
- Host synth DSP for drums + melodic synths
- Output mixer bus

**Loading:**
- Keep `EngineWorkletProcessor.js` as a separate file
- Use Vite's `?url` import to get the file path
- Load via: `audioContext.audioWorklet.addModule(workletUrl)`
- This keeps worklet code separate and easier to debug

### 7.2 Procedural Drum Synths

**Folder:** `src/lib/audio/synths/drums/`

**Implement:**
- **Kick** - Exponential pitch envelope
- **Snare** - Bandpass + noise + envelope
- **Clap** - Multi-burst noise + pre-delay
- **Tom** - Descending pitch
- **Hi-Hat** - Metallic noise + HPF
- **Cymbal** - Ring-mod + bandpass
- **Shaker/Perc** - Noise + transient shaping

All DSP inline or in WASM modules.

### 7.3 Procedural Synth Voices

**Folder:** `src/lib/audio/synths/`

**Include:**
- **Subtractive Synth** - 2 osc + filter + ADSR
- **FM Synth** - 2/4-operator with simple routing
- **Wavetable Synth** - Small wavetable set stored in assets
- **Noise Synth** - Pink/white/brown noise selectable
- **Pluck Synth** - Karplus-Strong
- **Additive Synth** - Basic harmonic generator

All synthesized on-the-fly in the worklet.

---

## 8. ENGINE COMMUNICATION PROTOCOL

### Messages (UI → Engine)

```typescript
// Load project
{
  type: "loadProject",
  tracks: [...],
  bpm: number
}

// Transport control
{
  type: "setTransport",
  state: "play" | "stop" | "pause",
  position?: number  // In beats (0 = start of pattern)
}

// Tempo change
{
  type: "setTempo",
  bpm: number
}

// Update instrument settings
{
  type: "updateTrackSettings",
  trackId: string,
  settings: object
}

// Update pattern tree
{
  type: "updatePatternTree",
  trackId: string,
  pattern_tree: Node
}

// Offline rendering
{
  type: "requestOfflineRender",
  repetitions?: number  // Number of pattern loops (default: 1)
}
```

### Messages (Engine → UI)

```typescript
{ type: "ready" }
{ type: "cpuLoadUpdate", load: number }
{ type: "onRenderFinished", file: Blob }
{ type: "meterUpdate", db: number }
```

---

## 9. SYNTH PARAMETERS STRUCTURE

Settings are stored as JSONB in the `tracks.settings` field, with different schemas per instrument type.

### Drums (Kick, Snare, etc.)

```typescript
{
  attack: number;      // 0-1
  decay: number;       // 0-1
  sustain: number;     // 0-1
  release: number;     // 0-1
  pitch?: number;      // For kick/tom
  noiseAmount?: number; // For snare/hihat
}
```

### Subtractive Synth

```typescript
{
  osc1Type: "sine" | "saw" | "square" | "triangle";
  osc2Type: "sine" | "saw" | "square" | "triangle";
  osc2Detune: number;  // -12 to +12 semitones
  filterType: "lowpass" | "highpass" | "bandpass";
  filterCutoff: number; // 20-20000 Hz
  filterResonance: number; // 0-1
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}
```

### FM Synth

```typescript
{
  operators: [
    { frequency: number, amplitude: number, waveform: string },
    // ... up to 4 operators
  ];
  modulationMatrix: number[][]; // How operators modulate each other
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}
```

### Default Values

- Each instrument type has a "default preset" with sensible starting values
- Stored in code as TypeScript objects
- Applied when creating new track or resetting instrument

### New Project/Track Defaults

- **NO assumption of 4/4 time** - this is a polyrhythm-first DAW
- New track root node: Start with a simple, editable division (e.g., division=5 or division=7)
- User can immediately change root division to any value they want
- Default BPM: 120 (standard, but pattern length is independent)
- New track starts with minimal tree: root node only (user builds from there)
- This gives maximum creative control from the start

---

## 10. UI SPECIFICATION

### 10.1 Infinite Canvas Layout

**Canvas Technology:**
- Use HTML5 Canvas 2D (not SVG, not WebGL)
- Best performance for many nodes, simpler than WebGL, more flexible than SVG
- Use requestAnimationFrame for smooth rendering
- Implement viewport transform (pan/zoom) via canvas context transforms

**Canvas Behavior:**
- Pan with middle-mouse or two-finger drag
- Zoom with mouse wheel
- Infinite scroll in any direction
- Nodes are draggable circles
- Parent-child relationships shown via lines or bezier curves
- Canvas is state-driven via Svelte stores
- Canvas manages only drawing & input; state is elsewhere

**Node Appearance:**
- Circle (80px default)
- Division number centered
- Color determined by root instrument (inherited from root)
- Root nodes are visually distinct (larger, different border style)
- Hover: Shows timestamp, instrument, depth
- Click: Opens sidebar

**Node Interactions:**
- **Single click:** Select node (opens sidebar)
- **Ctrl+Click:** Add to selection (multi-select)
- **Shift+Click:** Select range (if we implement list view)
- **Right-click:** Context menu
- **Double-click division:** Edit inline
- **Drag node:** Reposition (visual only, doesn't affect timing)
- **Middle mouse drag:** Pan canvas
- **Mouse wheel:** Zoom

**Node Creation:**
- Right-click on any node → context menu with "Add Child" option
- Creates a new child node with default division value (equal split)
- User can then edit the division number
- Alternative: Toolbar "Add Node" button → click on canvas to place root node (new track)

**Node Editing:**
- Double-click division number → inline text input (or click → sidebar editor)
- Can change division value directly
- **Root node division is fully editable** - changing it changes the entire pattern length
- Example: Change root from 22 to 15 → pattern becomes 15 beats long (polyrhythm changes)
- Validation: division must be > 0, sum of siblings should equal parent (or allow free-form)
- Root node has no parent, so its division is independent (defines pattern length)

**Node Deletion:**
- Right-click → "Delete Node" (or Delete key when selected)
- Deleting a node deletes all its children (cascade delete)
- Cannot delete root node (would delete entire track - use "Delete Track" instead)

**Multiple Tracks on Canvas:**
- All tracks visible on one canvas simultaneously
- Each track is a separate tree with its own root node
- Trees can overlap visually (user responsibility to organize)
- Track selector in toolbar to show/hide specific tracks (future enhancement)

### 10.2 Sidebar (Right Side)

**When clicking root node:**
- Right Sidebar containing:
  - Instrument type selector
  - All synth parameters (dynamic per instrument)
  - Mixer strip:
    - Volume (fader)
    - Pan
    - FX sends
    - Mute/Solo

**When clicking leaf node:**
- Velocity slider
- Pitch input (piano roll style)
- (Future: per-leaf FX, modulation)

**Sidebar Behavior:**
- Right side, slide-in panel (300-400px wide)
- Closes when clicking outside or pressing Escape
- Different content based on selection:
  - Root node: Full instrument panel + mixer
  - Leaf node: Velocity + pitch controls
  - Multiple nodes: Bulk edit options (future)

### 10.3 Toolbar

**Components:**
- Play/Stop button
- BPM control (number input + slider)
- Zoom controls (zoom in/out/reset)
- "New Track" button
- Save button (auto-save also happens on changes)
- Export audio button (triggers offline render)
- User menu (profile, logout)

### 10.4 Visual Feedback

**During Playback:**
- Nodes highlight/glow when their event triggers (brief flash, ~100ms)
- Use CSS animation or canvas drawing with opacity fade
- Playhead indicator: Thin vertical line on canvas showing current beat (optional, can be toggle)

### 10.5 Visual Design & Theme

**Design Philosophy:**
- **Dark-mode only** - No light mode option
- **High contrast** - Maximum readability and visual clarity
- **Tech-forward aesthetic** - Designed for tech-savvy users into alternative/experimental music
- **Minimalist but functional** - Clean interface that doesn't get in the way of creativity

**Color Palette:**
- **Background:** Deep black/dark gray (`#0a0a0a` or `#111111`)
- **Canvas background:** Slightly lighter dark (`#1a1a1a` or `#1e1e1e`) for contrast
- **Primary text:** High contrast white/light gray (`#ffffff` or `#e0e0e0`)
- **Secondary text:** Medium gray (`#888888` or `#999999`)
- **Accent colors:** Vibrant, saturated colors for instrument nodes (high contrast against dark)
- **UI elements:** Bright borders/outlines (`#ffffff` or `#00ffff` for tech aesthetic)
- **Selection/highlight:** Bright accent color (cyan, magenta, or instrument-specific)
- **Links/buttons:** High contrast, bright colors on dark background

**Typography:**
- **Monospace font** for technical elements (division numbers, BPM, timestamps)
- **Sans-serif** for UI text (clean, modern)
- **Bold weights** for emphasis and hierarchy
- **High contrast** - text should be easily readable at all sizes

**UI Elements:**
- **Buttons:** High contrast borders, bright hover states
- **Inputs:** Dark background with bright borders when focused
- **Sliders/Knobs:** Bright accent colors, clear visual feedback
- **Sidebar:** Dark background with bright borders/separators
- **Toolbar:** Dark with high-contrast icons and text

**Canvas & Nodes:**
- **Canvas background:** Dark (`#1a1a1a`) with subtle grid (optional, very low opacity)
- **Node circles:** Bright, saturated colors (one per instrument type)
- **Node borders:** Bright white or accent color when selected
- **Connection lines:** Bright colors matching instrument, or white/gray
- **Root nodes:** Larger, more prominent with distinct styling

**Visual Effects:**
- **Glow effects** on hover and selection (bright, high-contrast)
- **Smooth animations** but not excessive
- **Particle effects** or subtle animations during playback (optional, tech aesthetic)
- **High contrast shadows** for depth (bright edges, not dark shadows)

**Accessibility:**
- **WCAG AAA contrast ratios** where possible
- **Clear visual hierarchy** through size, color, and spacing
- **Keyboard navigation** with visible focus indicators (bright outlines)
- **No reliance on color alone** - use shape, size, and text as well

**Inspiration:**
- Terminal/CLI aesthetics
- Audio production software (Ableton, Bitwig dark themes)
- Cyberpunk/tech aesthetic
- High-contrast developer tools

---

## 11. PAGES & ROUTES

### `/` (Home)
- Landing page + "New Project" button

### `/project/[id]`
- Main editor view
- Loads project + tracks from Supabase
- Initializes audio engine
- Renders canvas

### `/gallery`
- Listing of public projects
- Filter/search/sort

### `/profile/[slug]`
- Public profile
- Avatar
- Bio
- Public projects list

### `/login`, `/register`
- Supabase auth

---

## 12. ACCOUNT + SHARING SYSTEM

**Users Can:**
- Make projects public
- Have a profile page showing public projects
- Appear in a global gallery
- Fork others' projects
- Generate a share link

**Permissions:**
- `is_public: boolean`
- `allow_forking: boolean`

**Sharing:**
- Unique slug like: `/user/sethlowery/project/my-polyrhythm-grid`

**Forking Implementation:**
- When forking: Copy all tracks with new IDs
- Set `forked_from` to original project ID
- Copy all track data (pattern_tree, settings, etc.)
- New owner is the forking user

---

## 13. OFFLINE RENDERING

- Output format: WAV (using Web Audio API OfflineAudioContext)
- Render full pattern loop by default (pattern length = root.division beats)
- User can specify number of pattern repetitions to render (1, 2, 4, 8, 16 loops)
- Maximum: 16 pattern repetitions (reasonable limit to prevent browser crashes)
- Pattern length is user-defined (not fixed to bars), so "bars" becomes "pattern loops"
- Render happens in chunks if needed to avoid blocking

---

## 14. TRANSPORT CONTROLS

- `setTransport` message includes: `{ type: "setTransport", state: "play" | "stop" | "pause", position?: number }`
- `position` is in beats (0 = start of pattern)
- Scrubbing: User can drag playhead on timeline (future: visual timeline component)
- Loop points: Not in v1, but structure supports it (add `loopStart`, `loopEnd` beats later)
- When transport stops and restarts, it resets to beat 0

---

## 15. HOSTING + PERFORMANCE

**Vercel:**
- SvelteKit SSR
- API routes for sharing pages
- Static assets (wavetables)

**Supabase:**
- Auth, DB, Storage

**Browser-side:**
- Worklets ensure stable timing
- WASM optional for high-end synths later

---

## 16. IMPLEMENTATION PRIORITY

### Phase 1 (MVP)
- Basic canvas with nodes (no interactions)
- Single track, single instrument
- Simple kick drum synth
- Play/stop transport
- Event flattening + scheduling

### Phase 2
- Node creation/deletion
- Multiple tracks
- All drum synths
- Instrument selection
- Sidebar UI

### Phase 3
- Melodic synths
- Pattern tree editing
- Save/load from Supabase
- User accounts

### Phase 4
- Sharing, forking, gallery
- Advanced features
- Polish & optimization
