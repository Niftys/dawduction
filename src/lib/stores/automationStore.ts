import { writable } from 'svelte/store';

export interface OpenAutomationWindow {
	id: string; // Unique ID for this window
	targetType: 'effect' | 'envelope';
	targetId: string; // Effect or envelope ID
	parameterKey: string; // Parameter name
	timelineInstanceId?: string; // Optional timeline instance ID
	label: string; // Display label (e.g., "Reverb - Room Size")
}

function createAutomationStore() {
	const { subscribe, set, update } = writable<OpenAutomationWindow[]>([]);

	return {
		subscribe,
		openWindow: (window: OpenAutomationWindow) => {
			update((windows) => {
				// Only allow one window at a time - replace existing window
				return [window];
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

export const automationStore = createAutomationStore();

