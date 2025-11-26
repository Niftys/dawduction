import { writable } from 'svelte/store';

export interface PlaybackState {
	currentTime: number; // Current playback position in beats
	playingNodes: Set<string>; // Set of node IDs that are currently playing (format: "trackId:time")
}

function createPlaybackStore() {
	const { subscribe, set, update } = writable<PlaybackState>({
		currentTime: 0,
		playingNodes: new Set()
	});

	// Track when nodes were last seen (using timestamps to handle loops)
	const nodeLastSeen = new Map<string, number>();
	
	// Keep nodes active for a short duration after they're triggered (150ms)
	const NODE_PERSISTENCE_MS = 150;

	return {
		subscribe,
		set,
		update,
		updatePlayback: (time: number, eventIds: string[]) => {
			const now = Date.now();
			update((state) => {
				// Start with existing nodes
				const newPlayingNodes = new Set<string>();
				
				// Keep nodes that are still within the persistence window
				for (const nodeId of state.playingNodes) {
					const lastSeen = nodeLastSeen.get(nodeId);
					if (lastSeen !== undefined && (now - lastSeen) < NODE_PERSISTENCE_MS) {
						newPlayingNodes.add(nodeId);
					} else {
						// Remove stale nodes
						nodeLastSeen.delete(nodeId);
					}
				}
				
				// Add new nodes and mark them as seen
				for (const eventId of eventIds) {
					newPlayingNodes.add(eventId);
					nodeLastSeen.set(eventId, now);
				}
				
				return {
					currentTime: time,
					playingNodes: newPlayingNodes
				};
			});
		},
		clear: () => {
			nodeLastSeen.clear();
			set({
				currentTime: 0,
				playingNodes: new Set()
			});
		}
	};
}

export const playbackStore = createPlaybackStore();

