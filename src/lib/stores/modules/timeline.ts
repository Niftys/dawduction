import type { Project } from '../projectStore.types';
import type { TimelineTrack, TimelineClip } from '../projectStore.types';
import type { TimelineEffect, TimelineEnvelope } from '$lib/types/effects';
import type { UpdateFn, GetCurrent } from './types';

/**
 * Timeline Management Module
 * Handles timeline tracks, clips, effects, and envelopes
 */

// Performance limits to prevent excessive data
const MAX_TIMELINE_LENGTH = 10000; // Maximum timeline length in beats
const MAX_CLIPS_PER_TRACK = 500; // Maximum clips per track
const MAX_TOTAL_CLIPS = 2000; // Maximum total clips across all tracks

export function createTimelineModule(updateFn: UpdateFn, getCurrent: GetCurrent) {
	return {
		// Timeline clip management
		addTimelineClip: (clip: TimelineClip) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				
				// Performance check: Limit total clips
				const currentClips = timeline.clips || [];
				if (currentClips.length >= MAX_TOTAL_CLIPS) {
					console.warn(`[Timeline] Maximum total clips limit reached (${MAX_TOTAL_CLIPS}). Cannot add more clips.`);
					return project;
				}
				
				// Performance check: Limit clips per track
				const clipsOnTrack = currentClips.filter((c: TimelineClip) => c.trackId === clip.trackId);
				if (clipsOnTrack.length >= MAX_CLIPS_PER_TRACK) {
					console.warn(`[Timeline] Maximum clips per track limit reached (${MAX_CLIPS_PER_TRACK}) for track ${clip.trackId}. Cannot add more clips.`);
					return project;
				}
				
				// Performance check: Limit timeline length
				const newEndBeat = clip.startBeat + clip.duration;
				if (newEndBeat > MAX_TIMELINE_LENGTH) {
					console.warn(`[Timeline] Maximum timeline length reached (${MAX_TIMELINE_LENGTH} beats). Cannot add clip beyond this limit.`);
					return project;
				}
				
				const updatedTimeline = {
					...timeline,
					clips: [...currentClips, clip],
					totalLength: Math.min(Math.max(timeline.totalLength, newEndBeat), MAX_TIMELINE_LENGTH)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineClip: (clipId: string, updates: Partial<TimelineClip>) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				
				// Find the clip being updated
				const clip = project.timeline.clips.find((c: TimelineClip) => c.id === clipId);
				if (!clip) return project;
				
				// Apply updates to create new clip state
				const updatedClip = { ...clip, ...updates };
				
				// Performance check: Limit timeline length
				const newEndBeat = updatedClip.startBeat + updatedClip.duration;
				if (newEndBeat > MAX_TIMELINE_LENGTH) {
					console.warn(`[Timeline] Cannot move/resize clip beyond maximum timeline length (${MAX_TIMELINE_LENGTH} beats).`);
					// Clamp the clip to the maximum length
					if (updatedClip.startBeat >= MAX_TIMELINE_LENGTH) {
						updatedClip.startBeat = Math.max(0, MAX_TIMELINE_LENGTH - updatedClip.duration);
					}
					updatedClip.duration = Math.min(updatedClip.duration, MAX_TIMELINE_LENGTH - updatedClip.startBeat);
				}
				
				const updatedTimeline = {
					...project.timeline,
					clips: project.timeline.clips.map((c: TimelineClip) =>
						c.id === clipId ? updatedClip : c
					),
					totalLength: project.timeline.totalLength
				};
				// Recalculate total length (clamped to max)
				if (updates.startBeat !== undefined || updates.duration !== undefined) {
					const maxEnd = Math.max(
						...updatedTimeline.clips.map((c: TimelineClip) => c.startBeat + c.duration),
						updatedTimeline.totalLength
					);
					updatedTimeline.totalLength = Math.min(maxEnd, MAX_TIMELINE_LENGTH);
				}
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		deleteTimelineClip: (clipId: string) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					clips: (project.timeline.clips || []).filter((clip: TimelineClip) => clip.id !== clipId)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineLength: (length: number) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				
				// Performance check: Limit timeline length
				const clampedLength = Math.min(length, MAX_TIMELINE_LENGTH);
				if (length > MAX_TIMELINE_LENGTH) {
					console.warn(`[Timeline] Timeline length limited to ${MAX_TIMELINE_LENGTH} beats for performance.`);
				}
				
				return {
					...project,
					timeline: {
						...timeline,
						totalLength: Math.min(Math.max(clampedLength, timeline.totalLength), MAX_TIMELINE_LENGTH)
					}
				};
			});
		},
		// Timeline effect management
		addTimelineEffect: (effect: TimelineEffect) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				
				// Performance check: Limit timeline length
				const newEndBeat = effect.startBeat + effect.duration;
				if (newEndBeat > MAX_TIMELINE_LENGTH) {
					console.warn(`[Timeline] Maximum timeline length reached (${MAX_TIMELINE_LENGTH} beats). Cannot add effect beyond this limit.`);
					return project;
				}
				
				const updatedTimeline = {
					...timeline,
					effects: [...(timeline.effects || []), effect],
					totalLength: Math.min(Math.max(timeline.totalLength, newEndBeat), MAX_TIMELINE_LENGTH)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineEffect: (effectId: string, updates: Partial<TimelineEffect>) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					effects: (project.timeline.effects || []).map((effect: TimelineEffect) =>
						effect.id === effectId ? { ...effect, ...updates } : effect
					),
					totalLength: project.timeline.totalLength
				};
				// Recalculate total length
				if (updates.startBeat !== undefined || updates.duration !== undefined) {
					const maxEnd = Math.max(
						...(updatedTimeline.effects || []).map((e: TimelineEffect) => e.startBeat + e.duration),
						updatedTimeline.totalLength
					);
					updatedTimeline.totalLength = maxEnd;
				}
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		deleteTimelineEffect: (effectId: string) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					effects: (project.timeline.effects || []).filter((effect: TimelineEffect) => effect.id !== effectId)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		// Timeline envelope management
		addTimelineEnvelope: (envelope: TimelineEnvelope) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				
				// Performance check: Limit timeline length
				const newEndBeat = envelope.startBeat + envelope.duration;
				if (newEndBeat > MAX_TIMELINE_LENGTH) {
					console.warn(`[Timeline] Maximum timeline length reached (${MAX_TIMELINE_LENGTH} beats). Cannot add envelope beyond this limit.`);
					return project;
				}
				
				const updatedTimeline = {
					...timeline,
					envelopes: [...(timeline.envelopes || []), envelope],
					totalLength: Math.min(Math.max(timeline.totalLength, newEndBeat), MAX_TIMELINE_LENGTH)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineEnvelope: (envelopeId: string, updates: Partial<TimelineEnvelope>) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					envelopes: (project.timeline.envelopes || []).map((envelope: TimelineEnvelope) =>
						envelope.id === envelopeId ? { ...envelope, ...updates } : envelope
					),
					totalLength: project.timeline.totalLength
				};
				// Recalculate total length
				if (updates.startBeat !== undefined || updates.duration !== undefined) {
					const maxEnd = Math.max(
						...(updatedTimeline.envelopes || []).map((e: TimelineEnvelope) => e.startBeat + e.duration),
						updatedTimeline.totalLength
					);
					updatedTimeline.totalLength = maxEnd;
				}
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		deleteTimelineEnvelope: (envelopeId: string) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					envelopes: (project.timeline.envelopes || []).filter((envelope: TimelineEnvelope) => envelope.id !== envelopeId)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		/**
		 * Create a TRACK (TimelineTrack) - the actual track in arrangement view
		 * Tracks are where patterns, effects, and envelopes are manipulated to create songs.
		 * Tracks exist ONLY in the arrangement view timeline editor.
		 */
		createTimelineTrack: (type: 'pattern' | 'effect' | 'envelope', patternId?: string, name?: string): TimelineTrack => {
			const now = Date.now();
			const defaultNames = {
				pattern: 'Pattern Track',
				effect: 'Effect Track',
				envelope: 'Envelope Track'
			};
			
			// Default colors for each track type
			const defaultColors = {
				pattern: '#7ab8ff', // Blue
				effect: '#9b59b6', // Purple
				envelope: '#2ecc71' // Green
			};
			
			// Get order number based on track type
			const project = getCurrent();
			const existingTracks: TimelineTrack[] = project?.timeline?.tracks || [];
			
			let order: number;
			if (type === 'pattern') {
				// Pattern tracks go at the top - use negative or low positive numbers
				const patternTracks = existingTracks.filter((t: TimelineTrack) => t.type === 'pattern');
				if (patternTracks.length === 0) {
					order = 0; // First pattern track
				} else {
					const minPatternOrder = Math.min(...patternTracks.map((t: TimelineTrack) => t.order));
					order = minPatternOrder - 1; // Insert at the top
				}
			} else {
				// Effect and envelope tracks go at the bottom - use high positive numbers
				const maxOrder = existingTracks.length > 0 
					? Math.max(...existingTracks.map((t: TimelineTrack) => t.order))
					: 999; // Start at 1000 if no tracks exist
				order = maxOrder + 1; // Insert at the bottom
			}
			
			return {
				id: crypto.randomUUID(),
				type,
				name: name || `${defaultNames[type]} ${existingTracks.filter((t: TimelineTrack) => t.type === type).length + 1}`,
				patternId,
				order,
				volume: 1.0, // Default volume
				mute: false, // Default mute state
				solo: false, // Default solo state
				color: defaultColors[type], // Default color based on track type
				createdAt: now
			};
		},
		addTimelineTrack: (track: TimelineTrack) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				const updatedTimeline = {
					...timeline,
					tracks: [...(timeline.tracks || []), track]
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		deleteTimelineTrack: (trackId: string) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				// Also remove all clips/effects/envelopes that belong to this track
				const updatedTimeline = {
					...project.timeline,
					tracks: (project.timeline.tracks || []).filter((track: TimelineTrack) => track.id !== trackId),
					clips: (project.timeline.clips || []).filter((clip: TimelineClip) => clip.trackId !== trackId),
					effects: (project.timeline.effects || []).filter((effect: TimelineEffect) => effect.trackId !== trackId),
					envelopes: (project.timeline.envelopes || []).filter((envelope: TimelineEnvelope) => envelope.trackId !== trackId)
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		},
		updateTimelineTrack: (trackId: string, updates: Partial<TimelineTrack>) => {
			updateFn((project) => {
				if (!project || !project.timeline) return project;
				const updatedTimeline = {
					...project.timeline,
					tracks: (project.timeline.tracks || []).map((track: TimelineTrack) =>
						track.id === trackId ? { ...track, ...updates } : track
					) as TimelineTrack[]
				};
				return {
					...project,
					timeline: updatedTimeline
				};
			});
		}
	};
}

