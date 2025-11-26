# DAWDUCTION

Web-Based Procedural-Synthesis DAW Using Tree-Based Rhythmic Structures

## Tech Stack

- **Frontend:** SvelteKit
- **Backend:** Supabase (Auth, DB, Storage)
- **Audio:** AudioWorklets for procedural synthesis
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit `http://localhost:5173`

## Project Structure

- `src/lib/audio/` - Audio engine and synthesizers
- `src/lib/canvas/` - Canvas rendering and viewport
- `src/lib/stores/` - Svelte stores for state management
- `src/lib/components/` - Reusable components
- `src/routes/` - SvelteKit routes

## MVP Features

- ✅ Basic canvas with nodes
- ✅ Single track, kick drum synth
- ✅ Play/stop transport
- ✅ Event flattening + scheduling
- ✅ Dark mode, high-contrast design

## Next Steps

See `PROJECT_PLAN.md` for full implementation roadmap.

