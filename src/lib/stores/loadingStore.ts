import { writable } from 'svelte/store';

export type LoadingState = {
	isLoading: boolean;
	message?: string;
};

function createLoadingStore() {
	const { subscribe, set, update } = writable<LoadingState>({
		isLoading: false,
		message: undefined
	});

	return {
		subscribe,
		setLoading: (isLoading: boolean, message?: string) => {
			set({ isLoading, message });
		},
		startLoading: (message?: string) => {
			set({ isLoading: true, message });
		},
		stopLoading: () => {
			set({ isLoading: false, message: undefined });
		}
	};
}

export const loadingStore = createLoadingStore();

