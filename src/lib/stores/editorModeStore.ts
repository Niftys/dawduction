import { writable } from 'svelte/store';

export type EditorMode = 'pitch' | 'velocity';

function createEditorModeStore() {
	const { subscribe, set, update } = writable<EditorMode>('pitch');

	return {
		subscribe,
		set,
		update,
		setMode: (mode: EditorMode) => set(mode),
		toggle: () => update((current) => current === 'pitch' ? 'velocity' : 'pitch')
	};
}

export const editorModeStore = createEditorModeStore();

