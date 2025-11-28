import { writable } from 'svelte/store';

export interface OpenSynthPluginWindow {
	id: string; // Unique ID: trackId or patternId:instrumentId
	instrumentType: 'pad' | 'organ';
	trackId?: string; // Standalone instrument ID
	patternId?: string; // Pattern ID (if pattern instrument)
	instrumentId?: string; // Instrument ID within pattern
	label: string; // Display name
}

function createSynthPluginStore() {
	const { subscribe, set, update } = writable<OpenSynthPluginWindow[]>([]);

	return {
		subscribe,
		openWindow: (window: OpenSynthPluginWindow) => {
			console.log('synthPluginStore.openWindow called with:', window);
			update((windows) => {
				// Check if window already exists
				const existingIndex = windows.findIndex((w) => w.id === window.id);
				if (existingIndex >= 0) {
					// Replace existing window
					const newWindows = [...windows];
					newWindows[existingIndex] = window;
					console.log('Replaced existing window, new windows:', newWindows);
					return newWindows;
				}
				// Add new window
				const newWindows = [...windows, window];
				console.log('Added new window, total windows:', newWindows.length, newWindows);
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

export const synthPluginStore = createSynthPluginStore();

