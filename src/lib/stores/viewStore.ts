import { writable } from 'svelte/store';

export type ViewMode = 'arrangement' | 'pattern';

function createViewStore() {
	const { subscribe, set, update } = writable<ViewMode>('arrangement');
	
	// Store the current pattern ID being edited (for navigation)
	let currentPatternId: string | null = null;

	return {
		subscribe,
		set,
		update,
		toggle: () => {
			update((mode) => (mode === 'arrangement' ? 'pattern' : 'arrangement'));
		},
		setArrangement: () => set('arrangement'),
		setPattern: () => set('pattern'),
		setCurrentPatternId: (id: string | null) => {
			currentPatternId = id;
		},
		getCurrentPatternId: () => currentPatternId
	};
}

export const viewStore = createViewStore();

