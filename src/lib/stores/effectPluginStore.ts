import { writable } from 'svelte/store';

export interface OpenEffectPluginWindow {
	id: string; // Effect ID
	effectType: 'equalizer';
	effectId: string;
	label: string; // Display name
}

function createEffectPluginStore() {
	const { subscribe, set, update } = writable<OpenEffectPluginWindow[]>([]);

	return {
		subscribe,
		openWindow: (window: OpenEffectPluginWindow) => {
			update((windows) => {
				// Check if window already exists
				const existingIndex = windows.findIndex((w) => w.id === window.id);
				if (existingIndex >= 0) {
					// Replace existing window
					const newWindows = [...windows];
					newWindows[existingIndex] = window;
					return newWindows;
				}
				// Add new window
				const newWindows = [...windows, window];
				return newWindows;
			});
		},
		closeWindow: (windowId: string) => {
			update((windows) => windows.filter((w) => w.id !== windowId));
		},
		closeAll: () => {
			set([]);
		}
	};
}

export const effectPluginStore = createEffectPluginStore();

