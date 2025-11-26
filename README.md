# DAWDUCTION

A web-based Digital Audio Workstation (DAW) that uses tree-based rhythmic structures for creating complex polyrhythmic patterns. All audio synthesis happens procedurally in the browser using AudioWorklets - no samples required.

## What is DAWDUCTION?

DAWDUCTION is a browser-based music production tool that lets you create patterns using a visual tree structure. Instead of traditional grid-based sequencers, you build patterns by subdividing time into smaller and smaller parts, creating complex polyrhythms and intricate timing patterns.

### Key Concepts

- **Tree-Based Patterns**: Each pattern is represented as a tree where nodes represent time divisions. The root node defines the total pattern length, and child nodes subdivide that time.
- **Polyrhythm-First Design**: No assumptions about 4/4 time - you can create patterns of any length (5 beats, 7 beats, 22 beats, etc.).
- **Procedural Synthesis**: All sounds are generated in real-time using mathematical algorithms - no audio samples needed.
- **Infinite Canvas**: Visualize and edit your patterns on an infinite canvas with pan and zoom capabilities.

## Features

### Audio Engine
- Real-time procedural synthesis running in AudioWorklet for stable, sample-accurate timing
- Multiple drum synthesizers: Kick, Snare, Clap, Tom, Hi-Hat, Cymbal, Rimshot, Shaker
- Multiple melodic synthesizers: Subtractive, FM, Wavetable, Supersaw, Pluck, Bass
- Real-time parameter updates without stopping playback
- Effects processing and envelope automation
- Audio export functionality

### Pattern Editor
- Visual tree-based pattern creation
- Add, edit, and delete nodes with keyboard shortcuts
- Adjust division values to create custom timing
- Set velocity and pitch for individual notes
- Multiple instruments per pattern
- Mute and solo controls

### Arrangement View
- Timeline-based arrangement of patterns
- Drag and drop pattern clips
- Multiple timeline tracks
- Effects and automation tracks
- Visual playback indicator

### User Interface
- Dark mode, high-contrast design
- Infinite canvas with pan (middle mouse) and zoom (mouse wheel)
- Sidebar with instrument controls and mixer
- Context menus for quick actions
- Keyboard shortcuts for common operations

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or pnpm package manager
- A modern web browser with AudioWorklet support (Chrome, Firefox, Edge, Safari 14.1+)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd dawduction
```

2. Install dependencies:
```bash
npm install
```

3. Build the AudioWorklet processor:
```bash
npm run build:worklet
```

Note: The worklet is automatically built when you run `npm run dev`, but you may need to build it manually if you encounter audio issues.

### Running the Development Server

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Building for Production

To create a production build:
```bash
npm run build
```

To preview the production build:
```bash
npm run preview
```

## How to Use

### Creating a New Project

1. Click "New Project" on the home page
2. You'll be taken to the arrangement view with an empty timeline

### Adding Instruments

**In Pattern Editor:**
- Click the "+ Instrument" button in the toolbar
- Select an instrument type from the dropdown
- A root node will appear on the canvas

**In Arrangement View:**
- Use the Instrument Selector in the sidebar to add instruments to timeline tracks

### Building Patterns

1. Navigate to a pattern by clicking on it in the timeline or using the pattern editor route
2. Click on a node to select it
3. Add child nodes by:
   - Right-clicking and selecting "Add Child" from the context menu
   - Pressing the 'A' key when a node is selected
4. Edit division values by double-clicking the number or using the sidebar
5. Adjust velocity and pitch for leaf nodes (nodes with no children)

### Playing Your Project

- Click the Play button in the toolbar to start playback
- Adjust BPM using the BPM control in the toolbar
- Use the Stop button to halt playback

### Canvas Navigation

- **Pan**: Hold middle mouse button and drag, or use two-finger drag on trackpad
- **Zoom**: Scroll with mouse wheel or pinch on trackpad
- **Select Node**: Click on a node
- **Multi-select**: Ctrl+Click to add nodes to selection, or drag-select
- **Move Nodes**: Drag selected nodes to reposition them (visual only, doesn't affect timing)

### Keyboard Shortcuts

- **A**: Add child node to selected node
- **Delete/Backspace**: Delete selected node (and all its children)
- **Escape**: Deselect nodes or close sidebar

### Editing Node Properties

- **Division**: Double-click the number on a node or edit in the sidebar
- **Velocity**: Select a leaf node and adjust the velocity slider in the sidebar
- **Pitch**: Select a leaf node and adjust pitch in the sidebar (for melodic instruments)

### Instrument Controls

When a root node is selected, the sidebar shows:
- Instrument type selector
- Synth-specific parameters (varies by instrument)
- Mixer controls (volume, pan, mute, solo)

## Project Structure

```
src/
  lib/
    audio/
      engine/          # AudioWorklet engine and processor
      synths/          # Procedural synthesizers
        drums/         # Drum synthesizers
        melodic/       # Melodic synthesizers
        shared/        # Shared audio utilities
      utils/           # Audio utilities (event flattening, MIDI, export)
    canvas/            # Canvas rendering and interactions
      handlers/        # Mouse, keyboard, and context menu handlers
      utils/           # Rendering utilities
    components/        # Svelte components
      sidebar/         # Sidebar components (instrument controls, mixer)
    stores/            # Svelte stores for state management
    styles/            # CSS stylesheets
    types/             # TypeScript type definitions
    utils/             # General utilities
  routes/              # SvelteKit routes
    project/           # Project editor routes
      [id]/            # Arrangement view
      [id]/pattern/    # Pattern editor
```

## Tech Stack

- **Frontend Framework**: SvelteKit with TypeScript
- **Audio**: Web Audio API with AudioWorklets
- **Rendering**: HTML5 Canvas 2D
- **State Management**: Svelte stores
- **Build Tool**: Vite
- **Styling**: CSS with custom design system

## Architecture

### Audio Engine

The audio engine runs entirely in an AudioWorkletProcessor, separate from the main UI thread. This ensures:
- Stable, sample-accurate timing
- No audio glitches from UI re-renders
- Real-time parameter updates
- Low-latency playback

Communication between the UI and audio engine happens via MessagePort, allowing the engine to evolve independently from the UI.

### Pattern Tree System

Patterns are stored as recursive tree structures where:
- Each node has a `division` value that determines its time share
- Child nodes subdivide their parent's time proportionally
- Leaf nodes (nodes with no children) trigger audio events
- The root node's division defines the total pattern length in beats

### Event Flattening

The pattern tree is converted to a flat list of timed events for playback:
- Tree traversal calculates precise timing for each leaf node
- Events are scheduled 100-150ms ahead for precise playback
- Pattern loops automatically when reaching the end

## Development

### Available Scripts

- `npm run dev` - Start development server (builds worklet automatically)
- `npm run build` - Build for production
- `npm run build:worklet` - Build AudioWorklet processor only
- `npm run preview` - Preview production build
- `npm run check` - Run TypeScript type checking
- `npm run check:watch` - Run TypeScript type checking in watch mode

### Code Style

- TypeScript for type safety
- Svelte components for UI
- Modular architecture with clear separation of concerns
- Well-commented code for maintainability

## Browser Compatibility

DAWDUCTION requires modern browser features:
- AudioWorklet support (Chrome 66+, Firefox 76+, Edge 79+, Safari 14.1+)
- ES6+ JavaScript features
- Canvas 2D API

## Known Limitations

- Projects are currently stored in browser memory only (no persistence yet)
- Supabase integration is planned but not yet implemented
- Some advanced features from the project plan are still in development

## Troubleshooting

### Audio Not Working

- Make sure you've interacted with the page (browsers require user interaction before audio can play)
- Check browser console for errors
- Verify that AudioWorklet is supported in your browser
- Try rebuilding the worklet: `npm run build:worklet`

### Worklet Not Loading

- Ensure `/static/EngineWorkletProcessor.js` exists
- Check browser console for loading errors
- Try clearing browser cache and reloading

### TypeScript Errors

- Run `npm run check` to see detailed error messages
- Make sure all dependencies are installed: `npm install`

## Contributing

This is a personal project, but feedback and suggestions are welcome. If you encounter bugs or have feature requests, please open an issue on GitHub.

## License

[Add your license here]

## Acknowledgments

Inspired by tree-based rhythmic structures and procedural synthesis techniques. Built with modern web technologies to bring powerful music production tools to the browser.
