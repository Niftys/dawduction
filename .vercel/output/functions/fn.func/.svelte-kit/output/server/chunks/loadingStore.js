import { w as writable } from "./index.js";
function createLoadingStore() {
  const { subscribe, set, update } = writable({
    isLoading: false,
    message: void 0
  });
  return {
    subscribe,
    setLoading: (isLoading, message) => {
      set({ isLoading, message });
    },
    startLoading: (message) => {
      set({ isLoading: true, message });
    },
    stopLoading: () => {
      set({ isLoading: false, message: void 0 });
    }
  };
}
const loadingStore = createLoadingStore();
export {
  loadingStore
};
