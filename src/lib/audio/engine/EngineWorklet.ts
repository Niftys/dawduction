import type { StandaloneInstrument, AudioEvent } from '$lib/types/pattern';
import type { TimelineClip } from '$lib/stores/projectStore';
import { flattenTrackPattern } from '../utils/eventFlatten';

/**
 * Main AudioWorklet class for managing the audio engine
 * Handles communication between UI and audio processor
 */
export class EngineWorklet {
	private audioContext: AudioContext;
	private workletNode: AudioWorkletNode | null = null;
	private isInitialized = false;

	constructor() {
		this.audioContext = new AudioContext({ sampleRate: 44100 });
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		try {
			// Load the worklet processor from static directory
			await this.audioContext.audioWorklet.addModule('/EngineWorkletProcessor.js');

			// Create worklet node
			this.workletNode = new AudioWorkletNode(
				this.audioContext,
				'engine-worklet-processor'
			);

			// Connect to output
			this.workletNode.connect(this.audioContext.destination);

			// Set up message handler
			this.workletNode.port.onmessage = (event) => {
				this.handleMessage(event.data);
			};

			this.isInitialized = true;
			this.sendMessage({ type: 'ready' });
		} catch (error) {
			console.error('Failed to initialize audio worklet:', error);
			throw error;
		}
	}

	private handleMessage(message: any) {
		// Handle messages from worklet to UI
		if (message.type === 'playbackUpdate' || message.type === 'playbackPosition') {
			// message.time is in beats
			this.notifyPlaybackUpdate(message.time, message.eventIds || []);
		} else if (message.type === 'debug') {
			// Log debug messages from worklet
			console.log(`[Worklet Debug] ${message.message}:`, message.data);
		} else {
			console.log('Message from worklet:', message);
		}
	}

	sendMessage(message: any) {
		if (this.workletNode) {
			this.workletNode.port.postMessage(message);
		}
	}

	async loadProject(standaloneInstruments: StandaloneInstrument[], bpm: number, baseMeterTrackId?: string, timeline?: any, patterns?: any[], effects?: any[], envelopes?: any[]) {
		await this.ensureInitialized();

		// If timeline exists, use timeline-based scheduling with patterns
		if (timeline && timeline.clips && timeline.clips.length > 0 && patterns) {
			// Timeline mode: schedule events from pattern clips
			const allEvents: AudioEvent[] = [];
			const patternMap = new Map(patterns.map((p: any) => [p.id, p]));
			
			// Determine a safe timeline length (fallback to clips max or 4 beats)
			const timelineClips = timeline.clips || [];
			const clipsMaxEnd = timelineClips.length > 0
				? Math.max(...timelineClips.map((clip: TimelineClip) => clip.startBeat + clip.duration))
				: 0;
			const safeTimelineLength = Math.max(timeline.totalLength || 0, clipsMaxEnd, 4);

			// Create temporary tracks from patterns for engine compatibility
			const patternTracks: any[] = [];
			const patternToTrackId = new Map<string, string>();
			
			// First pass: create tracks for all instruments in each unique pattern
			for (const clip of timeline.clips) {
				const pattern = patternMap.get(clip.patternId);
				if (!pattern) continue;
				
				// Get all instruments from pattern (handles both new and legacy formats)
				let patternInstruments: any[] = [];
				if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
					// New format: use instruments array
					patternInstruments = pattern.instruments;
				} else if (pattern.instrumentType && pattern.patternTree) {
					// Legacy format: convert single instrument
					patternInstruments = [{
						id: pattern.id,
						instrumentType: pattern.instrumentType,
						patternTree: pattern.patternTree,
						settings: pattern.settings || {},
						instrumentSettings: pattern.instrumentSettings,
						color: pattern.color || '#7ab8ff',
						volume: pattern.volume ?? 1.0,
						pan: pattern.pan ?? 0.0,
						mute: pattern.mute,
						solo: pattern.solo
					}];
				}
				
				// Create a track for each instrument in the pattern
				// All instruments in a pattern play simultaneously
				for (const instrument of patternInstruments) {
					// Create unique track ID for this instrument in this pattern
					const trackId = `__pattern_${clip.patternId}_${instrument.id}`;
					
					// Only create if we haven't already created a track for this instrument
					if (!patternToTrackId.has(`${clip.patternId}_${instrument.id}`)) {
						patternToTrackId.set(`${clip.patternId}_${instrument.id}`, trackId);
						
						// Get pattern tree - prefer instrument's tree, but fallback if incomplete
						let patternTree = instrument.patternTree;
						
						// If pattern tree has no children (incomplete), try to find the corresponding instrument
						if (!patternTree || !patternTree.children || patternTree.children.length === 0) {
							const tempTrackId = `__pattern_${clip.patternId}`;
							const tempInstrument = standaloneInstruments.find(i => i.id === tempTrackId);
							if (tempInstrument && tempInstrument.patternTree && tempInstrument.patternTree.children && tempInstrument.patternTree.children.length > 0) {
								console.log(`[EngineWorklet] Instrument tree incomplete, using temporary instrument's patternTree for pattern ${clip.patternId} instrument ${instrument.id}`);
								patternTree = tempInstrument.patternTree;
							}
						}
						
						// Only create track if we have a valid patternTree
						if (patternTree) {
							patternTracks.push({
								id: trackId,
								projectId: pattern.projectId,
								instrumentType: instrument.instrumentType || 'kick',
								patternTree: patternTree,
								settings: instrument.settings || {},
								instrumentSettings: instrument.instrumentSettings || {},
								volume: instrument.volume ?? 1.0,
								pan: instrument.pan ?? 0.0,
								color: instrument.color || '#7ab8ff',
								mute: (pattern.mute ?? false) || (instrument.mute ?? false), // Pattern or instrument muted
								solo: instrument.solo ?? false
							});
						} else {
							console.warn(`[EngineWorklet] Cannot create instrument track for pattern ${clip.patternId} instrument ${instrument.id}: no valid patternTree found`);
						}
					}
				}
			}
			
			// Second pass: schedule events for all instruments in each pattern clip
			for (const clip of timeline.clips) {
				const pattern = patternMap.get(clip.patternId);
				if (!pattern) continue;
				
				// Get all instruments from pattern (handles both new and legacy formats)
				let patternInstruments: any[] = [];
				if (pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0) {
					// New format: use instruments array
					patternInstruments = pattern.instruments;
				} else if (pattern.instrumentType && pattern.patternTree) {
					// Legacy format: convert single instrument
					patternInstruments = [{
						id: pattern.id,
						instrumentType: pattern.instrumentType,
						patternTree: pattern.patternTree,
						settings: pattern.settings || {},
						instrumentSettings: pattern.instrumentSettings,
						color: pattern.color || '#7ab8ff',
						volume: pattern.volume ?? 1.0,
						pan: pattern.pan ?? 0.0,
						mute: pattern.mute,
						solo: pattern.solo
					}];
				}
				
				// Schedule events for each instrument in the pattern (all play simultaneously)
				for (const instrument of patternInstruments) {
					const trackId = patternToTrackId.get(`${clip.patternId}_${instrument.id}`);
					if (!trackId) continue;
				
					// Get pattern tree - prefer instrument's tree, but fallback if incomplete
					let patternTree = instrument.patternTree;
					
					// If pattern tree has no children (incomplete), try to find the corresponding track
					if (!patternTree || !patternTree.children || patternTree.children.length === 0) {
						// Look for a track that matches this instrument
						const matchingTrack = patternTracks.find(t => t.id === trackId);
						if (matchingTrack && matchingTrack.patternTree && matchingTrack.patternTree.children && matchingTrack.patternTree.children.length > 0) {
							console.log(`[EngineWorklet] Instrument tree incomplete, using temporary instrument's patternTree for pattern ${clip.patternId} instrument ${instrument.id}`);
							patternTree = matchingTrack.patternTree;
						}
					}
					
					if (!patternTree) {
						console.warn(`[EngineWorklet] No valid patternTree found for pattern ${clip.patternId} instrument ${instrument.id}`);
						continue;
					}
					
					const patternLength = patternTree.division || pattern.baseMeter || 4;
					
					const patternEvents = flattenTrackPattern(patternTree, trackId);
					
					// Apply offset if specified
					const offset = clip.offsetBeats || 0;
					
					// Schedule pattern events at clip's start time, repeating if clip duration > pattern length
					// All instruments in the pattern play simultaneously
					let clipTime = clip.startBeat;
					while (clipTime < clip.startBeat + clip.duration) {
						for (const event of patternEvents) {
							// Calculate event time relative to pattern start (0 to patternLength)
							// Apply offset and wrap within pattern length if needed
							let relativeEventTime = event.time + offset;
							// Normalize to pattern length (wrap if offset pushes it beyond pattern)
							if (relativeEventTime >= patternLength) {
								relativeEventTime = relativeEventTime % patternLength;
							} else if (relativeEventTime < 0) {
								relativeEventTime = patternLength + (relativeEventTime % patternLength);
							}
							
							// Add to clip time to get absolute timeline position
							const absoluteEventTime = clipTime + relativeEventTime;
							
							// Only add if event is within clip bounds
							if (absoluteEventTime >= clip.startBeat && absoluteEventTime < clip.startBeat + clip.duration) {
								allEvents.push({
									...event,
									time: absoluteEventTime,
									instrumentId: trackId, // Use track ID for engine
									patternId: clip.patternId // Store pattern ID for effect/envelope assignment
								});
							}
						}
						clipTime += patternLength;
					}
				}
			}
			
			// Sort events by time
			allEvents.sort((a, b) => a.time - b.time);
			
			// Debug: Log final events
			console.log(`[EngineWorklet] Final events for arrangement view:`, {
				totalEvents: allEvents.length,
				events: allEvents.map(e => ({ time: e.time, instrumentId: e.instrumentId, pitch: e.pitch, patternId: e.patternId }))
			});
			
			// Send to worklet with timeline, pattern tracks, effects, and envelopes
			// Also send pattern-to-track mapping for effect/envelope assignment
			this.sendMessage({
				type: 'loadProject',
				tracks: patternTracks,
				bpm,
				events: allEvents,
				baseMeterTrackId: patternTracks[0]?.id,
				timeline: {
					clips: timeline.clips,
					effects: timeline.effects || [],
					envelopes: timeline.envelopes || [],
					totalLength: safeTimelineLength
				},
				effects: effects || [],
				envelopes: envelopes || [],
				viewMode: 'arrangement', // Arrangement view mode
				patternToTrackId: Array.from(patternToTrackId.entries()) // Send as array for serialization
			});
			return;
		}

		// Pattern loop mode (original behavior)
		// Find base meter instrument to determine pattern length
		const baseMeterId = baseMeterTrackId || standaloneInstruments[0]?.id;
		const baseMeterInstrument = standaloneInstruments.find(i => i.id === baseMeterId);
		const baseMeterLength = baseMeterInstrument?.patternTree?.division || 4;

		// Flatten all pattern trees, repeating shorter patterns
		const allEvents: AudioEvent[] = [];
		for (const instrument of standaloneInstruments) {
			const instrumentPatternLength = instrument.patternTree?.division;
			if (!instrumentPatternLength || instrumentPatternLength <= 0) continue;
			
			// If instrument's pattern is shorter than base meter, repeat it until base meter loops
			if (instrumentPatternLength < baseMeterLength) {
				// Generate pattern once, then repeat with offsets until we reach base meter length
				const baseEvents = flattenTrackPattern(instrument.patternTree, instrument.id);
				
				if (baseEvents.length > 0) {
					// Keep repeating until we've covered the entire base meter length
					// This may result in a partial repetition at the end
					let offset = 0;
					while (offset < baseMeterLength) {
						// Add events with time offset, but only if they're within base meter length
						for (const event of baseEvents) {
							const eventTime = event.time + offset;
							if (eventTime < baseMeterLength) {
								allEvents.push({
									...event,
									time: eventTime
								});
							}
						}
						offset += instrumentPatternLength;
					}
				}
			} else {
				// Pattern is same length or longer, just flatten once
				const events = flattenTrackPattern(instrument.patternTree, instrument.id);
				if (events.length > 0) {
					allEvents.push(...events);
				}
			}
		}

		// Sort events by time
		allEvents.sort((a, b) => a.time - b.time);

		// Send to worklet
		this.sendMessage({
			type: 'loadProject',
			tracks: standaloneInstruments,
			bpm,
			events: allEvents,
			baseMeterTrackId: baseMeterId,
			timeline: undefined,
			effects: effects || [],
			envelopes: envelopes || [],
			viewMode: 'pattern' // Pattern view mode
		});
	}

	setTransport(state: 'play' | 'stop' | 'pause', position?: number) {
		this.sendMessage({
			type: 'setTransport',
			state,
			position
		});
	}

	setTempo(bpm: number) {
		this.sendMessage({
			type: 'setTempo',
			bpm
		});
	}

	updatePatternTree(trackId: string, patternTree: any) {
		// Update the pattern tree in the worklet
		this.sendMessage({
			type: 'updatePatternTree',
			trackId,
			patternTree
		});
		
		// Re-flatten events for this track and update the worklet
		this.updateTrackEvents(trackId, patternTree);
	}
	
	private updateTrackEvents(trackId: string, patternTree: any) {
		// Re-flatten events for this track
		const newEvents = flattenTrackPattern(patternTree, trackId);
		
		// For pattern mode, we need to handle base meter repetition if the pattern is shorter than base meter
		// But we don't have access to base meter info here, so we'll just send the events as-is
		// The worklet's EventScheduler will handle looping based on pattern length
		// Note: Base meter repetition is only needed when loading the entire project to align all tracks
		// For single track updates, we just replace that track's events and let the scheduler handle looping
		
		// Send updated events to worklet
		this.sendMessage({
			type: 'updateTrackEvents',
			trackId,
			events: newEvents
		});
	}

	removeTrack(trackId: string) {
		// Remove track from worklet
		this.sendMessage({
			type: 'removeTrack',
			trackId
		});
	}

	updateTrackSettings(trackId: string, settings: Record<string, any>) {
		this.sendMessage({
			type: 'updateTrackSettings',
			trackId,
			settings
		});
	}

	updateTrack(trackId: string, instrument: StandaloneInstrument) {
		this.sendMessage({
			type: 'updateTrack',
			trackId,
			track: instrument
		});
	}

	updateTrackVolume(trackId: string, volume: number) {
		this.sendMessage({
			type: 'updateTrackVolume',
			trackId,
			volume
		});
	}

	updateTrackPan(trackId: string, pan: number) {
		this.sendMessage({
			type: 'updateTrackPan',
			trackId,
			pan
		});
	}

	updateTrackMute(trackId: string, mute: boolean) {
		this.sendMessage({
			type: 'updateTrackMute',
			trackId,
			mute
		});
	}

	updateTrackSolo(trackId: string, solo: boolean) {
		this.sendMessage({
			type: 'updateTrackSolo',
			trackId,
			solo
		});
	}

	// Callback for playback position updates
	private playbackCallbacks: Array<(time: number, eventIds: string[]) => void> = [];

	onPlaybackUpdate(callback: (time: number, eventIds: string[]) => void) {
		this.playbackCallbacks.push(callback);
	}

	private notifyPlaybackUpdate(time: number, eventIds: string[]) {
		for (const callback of this.playbackCallbacks) {
			callback(time, eventIds);
		}
	}

	private async ensureInitialized() {
		if (!this.isInitialized) {
			await this.initialize();
		}
	}

	async resume() {
		if (this.audioContext.state === 'suspended') {
			await this.audioContext.resume();
		}
	}

	/**
	 * Connect the worklet output to a destination node (for recording)
	 */
	connectToDestination(destination: AudioNode): void {
		if (this.workletNode) {
			this.workletNode.disconnect();
			this.workletNode.connect(destination);
		}
	}

	/**
	 * Reconnect to default audio output
	 */
	reconnectToOutput(): void {
		if (this.workletNode) {
			this.workletNode.disconnect();
			this.workletNode.connect(this.audioContext.destination);
		}
	}

	destroy() {
		if (this.workletNode) {
			this.workletNode.disconnect();
			this.workletNode = null;
		}
		if (this.audioContext.state !== 'closed') {
			this.audioContext.close();
		}
	}
}

