import { writable } from 'svelte/store';

export interface Viewport {
	x: number;
	y: number;
	zoom: number;
}

function createCanvasStore() {
	const { subscribe, set, update } = writable<Viewport>({
		x: 0,
		y: 0,
		zoom: 1.0
	});

	return {
		subscribe,
		set,
		update,
		pan: (dx: number, dy: number) => {
			update((viewport) => ({
				...viewport,
				x: viewport.x + dx,
				y: viewport.y + dy
			}));
		},
		zoom: (delta: number, screenX?: number, screenY?: number) => {
			update((viewport) => {
				const oldZoom = viewport.zoom;
				const newZoom = Math.max(0.1, Math.min(5.0, viewport.zoom + delta));
				// Zoom towards screen point if provided
				if (screenX !== undefined && screenY !== undefined) {
					// Convert screen point to world coordinates before zoom
					const worldX = screenX / oldZoom + viewport.x;
					const worldY = screenY / oldZoom + viewport.y;
					// After zoom, adjust viewport so the same world point is under the cursor
					return {
						x: worldX - screenX / newZoom,
						y: worldY - screenY / newZoom,
						zoom: newZoom
					};
				}
				return { ...viewport, zoom: newZoom };
			});
		},
		reset: () => {
			set({ x: 0, y: 0, zoom: 1.0 });
		}
	};
}

export const canvasStore = createCanvasStore();

