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
	
	// Throttle cleanup to avoid doing it on every update
	let lastCleanupTime = 0;
	const CLEANUP_INTERVAL_MS = 50; // Clean up every 50ms

	return {
		subscribe,
		set,
		update,
		updatePlayback: (time: number, eventIds: string[]) => {
			const now = Date.now();
			update((state) => {
				// Only do full cleanup periodically to reduce overhead
				const needsCleanup = (now - lastCleanupTime) >= CLEANUP_INTERVAL_MS;
				
				if (needsCleanup) {
					// Full cleanup: remove stale nodes
					for (const [nodeId, lastSeen] of nodeLastSeen.entries()) {
						if ((now - lastSeen) >= NODE_PERSISTENCE_MS) {
							nodeLastSeen.delete(nodeId);
						}
					}
					lastCleanupTime = now;
				}
				
				// Build new playing nodes set efficiently
				const newPlayingNodes = new Set<string>();
				
				// Add nodes that are still within persistence window
				if (needsCleanup) {
					// Full rebuild after cleanup
					for (const [nodeId, lastSeen] of nodeLastSeen.entries()) {
						if ((now - lastSeen) < NODE_PERSISTENCE_MS) {
							newPlayingNodes.add(nodeId);
						}
					}
				} else {
					// Fast path: just copy existing nodes (they're all still valid)
					for (const nodeId of state.playingNodes) {
						newPlayingNodes.add(nodeId);
					}
				}
				
				// Add new nodes and mark them as seen
				for (const eventId of eventIds) {
					newPlayingNodes.add(eventId);
					nodeLastSeen.set(eventId, now);
				}
				
				// Only update if something changed to reduce reactivity overhead
				if (state.currentTime === time && 
				    newPlayingNodes.size === state.playingNodes.size &&
				    [...newPlayingNodes].every(id => state.playingNodes.has(id))) {
					return state; // No change, return same state
				}
				
				return {
					currentTime: time,
					playingNodes: newPlayingNodes
				};
			});
		},
		clear: () => {
			nodeLastSeen.clear();
			lastCleanupTime = 0;
			set({
				currentTime: 0,
				playingNodes: new Set()
			});
		}
	};
}

export const playbackStore = createPlaybackStore();

