import type { Project } from '../projectStore.types';
import type { Effect } from '$lib/types/effects';

export type UpdateFn = (updater: (project: Project | null) => Project | null, skipHistory?: boolean) => void;
export type GetCurrent = () => Project | null;

export function createEffectsModule(updateFn: UpdateFn, getCurrent: GetCurrent) {
	return {
		createEffect: (projectId: string, name: string, type: Effect['type']): Effect => {
			const now = Date.now();
			const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'];
			const colorIndex = Math.floor(Math.random() * colors.length);
			
			// Default settings based on type
			const defaultSettings: Record<string, Record<string, any>> = {
				reverb: { roomSize: 0.5, dampening: 0.5, wet: 0.3, dry: 0.7 },
				delay: { time: 0.25, feedback: 0.3, wet: 0.3, dry: 0.7 },
				filter: { type: 'lowpass', frequency: 0.5, resonance: 0.5 },
				distortion: { amount: 0.3, drive: 0.5 },
				compressor: { threshold: 0.7, ratio: 4, attack: 0.01, release: 0.1 },
				chorus: { rate: 0.5, depth: 0.3, delay: 0.02, wet: 0.3 }
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
		addEffect: (effect: Effect) => {
			updateFn((project) => {
				if (!project) {
					console.warn('Cannot add effect: no project exists');
					return project;
				}
				if (!Array.isArray(project.effects)) {
					project.effects = [];
				}
				return {
					...project,
					effects: [...project.effects, effect]
				};
			});
		},
		updateEffect: (effectId: string, updates: Partial<Effect>) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					effects: (project.effects || []).map((effect) =>
						effect.id === effectId 
							? { ...effect, ...updates, updatedAt: Date.now() }
							: effect
					)
				};
			});
		},
		deleteEffect: (effectId: string) => {
			updateFn((project) => {
				if (!project) return project;
				return {
					...project,
					effects: (project.effects || []).filter((e: Effect) => e.id !== effectId)
				};
			});
		}
	};
}

