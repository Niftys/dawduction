import type { Project } from '../projectStore.types';
import type { Envelope } from '$lib/types/effects';

export type UpdateFn = (updater: (project: Project | null) => Project | null, skipHistory?: boolean) => void;
export type GetCurrent = () => Project | null;

export function createEnvelopesModule(updateFn: UpdateFn, getCurrent: GetCurrent) {
	return {
		createEnvelope: (projectId: string, name: string, type: Envelope['type']): Envelope => {
			const now = Date.now();
			const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'];
			const colorIndex = Math.floor(Math.random() * colors.length);
			
			// Default settings based on type
			const defaultSettings: Record<string, Record<string, any>> = {
				volume: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 },
				filter: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2, cutoffStart: 0.2, cutoffEnd: 0.8 },
				pitch: { attack: 0.01, decay: 0.1, sustain: 0.0, release: 0.2, pitchStart: 0, pitchEnd: 12 },
				pan: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2, panStart: -0.5, panEnd: 0.5 }
			};
			
			return {
				id: crypto.randomUUID(),
				projectId,
				name,
				type,
				settings: defaultSettings[type] || {},
				color: colors[colorIndex],
				createdAt: now,
				updatedAt: now
			};
		},
		addEnvelope: (envelope: Envelope) => {
			updateFn((project) => {
				if (!project) {
					console.warn('Cannot add envelope: no project exists');
					return project;
				}
				if (!Array.isArray(project.envelopes)) {
					project.envelopes = [];
				}
				return {
					...project,
					envelopes: [...project.envelopes, envelope]
				};
			});
		},
		updateEnvelope: (envelopeId: string, updates: Partial<Envelope>) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					envelopes: (project.envelopes || []).map((envelope) =>
						envelope.id === envelopeId 
							? { ...envelope, ...updates, updatedAt: Date.now() }
							: envelope
					)
				};
			});
		},
		deleteEnvelope: (envelopeId: string) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					envelopes: (project.envelopes || []).filter((e: Envelope) => e.id !== envelopeId)
				};
			});
		}
	};
}

