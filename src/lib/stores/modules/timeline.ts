import type { Project } from '../projectStore.types';
import type { TimelineTrack, TimelineClip } from '../projectStore.types';
import type { TimelineEffect, TimelineEnvelope } from '$lib/types/effects';
import type { UpdateFn, GetCurrent } from './types';

/**
 * Timeline Management Module
 * Handles timeline tracks, clips, effects, and envelopes
 */

export function createTimelineModule(updateFn: UpdateFn, getCurrent: GetCurrent) {
	return {
		// Timeline clip management
		addTimelineClip: (clip: TimelineClip) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				const updatedTimeline = {
					...timeline,
					clips: [...(timeline.clips || []), clip],
					totalLength: Math.max(timeline.totalLength, clip.startBeat + clip.duration)
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
				const updatedTimeline = {
					...project.timeline,
					clips: project.timeline.clips.map((clip: TimelineClip) =>
						clip.id === clipId ? { ...clip, ...updates } : clip
					),
					totalLength: project.timeline.totalLength
				};
				// Recalculate total length
				if (updates.startBeat !== undefined || updates.duration !== undefined) {
					const maxEnd = Math.max(
						...updatedTimeline.clips.map((c: TimelineClip) => c.startBeat + c.duration),
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
				return {
					...project,
					timeline: {
						...timeline,
						totalLength: Math.max(length, timeline.totalLength)
					}
				};
			});
		},
		// Timeline effect management
		addTimelineEffect: (effect: TimelineEffect) => {
			updateFn((project) => {
				if (!project) return project;
				const timeline = project.timeline || { tracks: [], clips: [], effects: [], envelopes: [], totalLength: 64 };
				const updatedTimeline = {
					...timeline,
					effects: [...(timeline.effects || []), effect],
					totalLength: Math.max(timeline.totalLength, effect.startBeat + effect.duration)
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
				const updatedTimeline = {
					...timeline,
					envelopes: [...(timeline.envelopes || []), envelope],
					totalLength: Math.max(timeline.totalLength, envelope.startBeat + envelope.duration)
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

