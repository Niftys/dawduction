import { writable } from 'svelte/store';

export interface PlaybackState {
	currentTime: number; // Current playback position in beats
	playingNodes: Set<string>; // Set of node IDs that are currently playing (format: "trackId:time")
	playedNodes: Set<string>; // Set of node IDs that have been played in this loop cycle
	isLoopStart: boolean; // True when we're at the start of a new loop
}

function createPlaybackStore() {
	const { subscribe, set, update } = writable<PlaybackState>({
		currentTime: 0,
		playingNodes: new Set(),
		playedNodes: new Set(),
		isLoopStart: false
	});

	// Track when nodes were last seen (using timestamps to handle loops)
	const nodeLastSeen = new Map<string, number>();
	let lastPlaybackBeat = 0;
	const LOOP_RESET_EPSILON = 0.0005;
	
	// Track the maximum time we've seen to detect loops more reliably
	let maxTimeSeen = 0;
	// Track if we were near the end of a pattern (to detect wrap-around)
	let wasNearPatternEnd = false;
	
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
				
				// Detect loop: time is normalized (mod patternLength), so it wraps from patternLength to 0
				// Detect when we were near the end (>= 3.5 for a 4-beat pattern) and now we're near the start (< 0.5)
				// This reliably detects every loop reset
				const NEAR_END_THRESHOLD = 3.5; // For 4-beat patterns, detect when >= 3.5
				const NEAR_START_THRESHOLD = 0.5; // Detect when < 0.5 after being near end
				
				const isNearEnd = time >= NEAR_END_THRESHOLD;
				const isNearStart = time < NEAR_START_THRESHOLD;
				const looped = wasNearPatternEnd && isNearStart;
				
				
				// Update tracking for next loop detection
				wasNearPatternEnd = isNearEnd;
				lastPlaybackBeat = time;
				if (time > maxTimeSeen) {
					maxTimeSeen = time;
				}
				
				if (looped) {
					// Reset everything on loop - clear all tracking
					// This ensures the next loop starts fresh, just like the first time
					nodeLastSeen.clear();
					lastCleanupTime = 0;
					maxTimeSeen = time; // Reset max time
					wasNearPatternEnd = false; // Reset for next loop
					
					// IMPORTANT: Don't process any events from the old loop
					// Start completely fresh with the new loop's events
					// Add the new events as if it's the first time
					const freshPlayingNodes = new Set<string>();
					const freshPlayedNodes = new Set<string>();
					
					// Add new events from this update (they're the start of the new loop)
					for (const eventId of eventIds) {
						freshPlayingNodes.add(eventId);
						nodeLastSeen.set(eventId, now);
					}
					
					return {
						currentTime: time,
						playingNodes: freshPlayingNodes,
						playedNodes: freshPlayedNodes,
						isLoopStart: true // Mark as loop start
					};
				}
				
				// Build new playing nodes set efficiently
				const newPlayingNodes = new Set<string>();
				const newPlayedNodes = new Set<string>(state.playedNodes);
				
				// Track which eventIds are currently being played (from this update)
				const currentEventIds = new Set(eventIds);
				
				// FIRST: Add new events immediately - they should flash right away
				for (const eventId of eventIds) {
					// Always add to playingNodes - this ensures the node flashes when the event plays
					newPlayingNodes.add(eventId);
					// Update timestamp to keep it in the persistence window
					nodeLastSeen.set(eventId, now);
					// Remove from played set if it's playing again (new loop - node can flash again)
					newPlayedNodes.delete(eventId);
				}
				
				// THEN: Process all nodes in nodeLastSeen to determine their current state
				// This handles nodes that are still within their persistence window
				const nodesToDelete: string[] = [];
				for (const [eventId, lastSeen] of nodeLastSeen.entries()) {
					// Skip if we just added this event above
					if (currentEventIds.has(eventId)) {
						continue; // Already handled
					}
					
					const timeSinceLastSeen = now - lastSeen;
					
					if (timeSinceLastSeen < NODE_PERSISTENCE_MS) {
						// Still within persistence window - node is playing
						newPlayingNodes.add(eventId);
						// Remove from played set if it's playing again
						newPlayedNodes.delete(eventId);
					} else {
						// Node has expired from persistence window
						// Mark as played BEFORE deleting
						newPlayedNodes.add(eventId);
						// Mark for deletion (but keep in playedNodes)
						nodesToDelete.push(eventId);
					}
				}
				
				// Clean up old nodes from nodeLastSeen (but keep them in playedNodes)
				const needsCleanup = (now - lastCleanupTime) >= CLEANUP_INTERVAL_MS;
				if (needsCleanup) {
					for (const nodeId of nodesToDelete) {
						nodeLastSeen.delete(nodeId);
					}
					lastCleanupTime = now;
				}
				
				// isLoopStart should remain true until we have played nodes
				// This ensures the glow persists until nodes actually start being marked as played
				const stillAtLoopStart = state.isLoopStart && newPlayedNodes.size === 0;
				
				const newState = {
					currentTime: time,
					playingNodes: newPlayingNodes,
					playedNodes: newPlayedNodes,
					isLoopStart: stillAtLoopStart
				};
				
				
				return newState;
			});
		},
		clear: () => {
			nodeLastSeen.clear();
			lastCleanupTime = 0;
			lastPlaybackBeat = 0;
			maxTimeSeen = 0;
			wasNearPatternEnd = false;
			set({
				currentTime: 0,
				playingNodes: new Set(),
				playedNodes: new Set(),
				isLoopStart: false
			});
		}
	};
}

export const playbackStore = createPlaybackStore();

