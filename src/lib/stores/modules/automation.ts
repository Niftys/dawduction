import type { UpdateFn, GetCurrent } from './types';

export function createAutomationModule(updateFn: UpdateFn, getCurrent: GetCurrent) {
	return {
		getAutomationId: (targetType: 'effect' | 'envelope', targetId: string, parameterKey: string, timelineInstanceId?: string): string => {
			return timelineInstanceId 
				? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}`
				: `${targetType}:${targetId}:${parameterKey}`;
		},
		getParameterAutomation: (targetType: 'effect' | 'envelope', targetId: string, parameterKey: string, timelineInstanceId?: string): import('$lib/types/effects').ParameterAutomation | null => {
			const current = getCurrent();
			if (!current || !current.automation) return null;
			const automationId = timelineInstanceId 
				? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}`
				: `${targetType}:${targetId}:${parameterKey}`;
			const automation = current.automation as import('$lib/types/effects').ProjectAutomation;
			return automation[automationId] || null;
		},
		setParameterAutomation: (automation: import('$lib/types/effects').ParameterAutomation, timelineInstanceId?: string) => {
			updateFn((project) => {
				if (!project) return project;
				const automationId = timelineInstanceId || automation.timelineInstanceId
					? `${automation.targetType}:${automation.targetId}:${timelineInstanceId || automation.timelineInstanceId}:${automation.parameterKey}`
					: `${automation.targetType}:${automation.targetId}:${automation.parameterKey}`;
				const currentAutomation = (project.automation || {}) as import('$lib/types/effects').ProjectAutomation;
				return {
					...project,
					automation: {
						...currentAutomation,
						[automationId]: {
							...automation,
							timelineInstanceId: timelineInstanceId || automation.timelineInstanceId
						}
					}
				};
			});
		},
		deleteParameterAutomation: (targetType: 'effect' | 'envelope', targetId: string, parameterKey: string, timelineInstanceId?: string) => {
			updateFn((project) => {
				if (!project || !project.automation) return project;
				const automationId = timelineInstanceId 
					? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}`
					: `${targetType}:${targetId}:${parameterKey}`;
				const currentAutomation = project.automation as import('$lib/types/effects').ProjectAutomation;
				const { [automationId]: removed, ...rest } = currentAutomation;
				return {
					...project,
					automation: rest
				};
			});
		},
		updateAutomationPoint: (targetType: 'effect' | 'envelope', targetId: string, parameterKey: string, pointIndex: number, point: Partial<import('$lib/types/effects').AutomationPoint>, timelineInstanceId?: string) => {
			updateFn((project) => {
				if (!project) return project;
				const automationId = timelineInstanceId 
					? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}`
					: `${targetType}:${targetId}:${parameterKey}`;
				const currentAutomation = project.automation?.[automationId] as import('$lib/types/effects').ParameterAutomation | undefined;
				if (!currentAutomation) return project;
				
				const updatedPoints = [...currentAutomation.points];
				updatedPoints[pointIndex] = { ...updatedPoints[pointIndex], ...point };
				
				const automation = (project.automation || {}) as import('$lib/types/effects').ProjectAutomation;
				return {
					...project,
					automation: {
						...automation,
						[automationId]: {
							...currentAutomation,
							points: updatedPoints
						}
					}
				};
			});
		},
		addAutomationPoint: (targetType: 'effect' | 'envelope', targetId: string, parameterKey: string, point: import('$lib/types/effects').AutomationPoint, timelineInstanceId?: string) => {
			updateFn((project) => {
				if (!project) return project;
				const automationId = timelineInstanceId 
					? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}`
					: `${targetType}:${targetId}:${parameterKey}`;
				const currentAutomation = project.automation?.[automationId] as import('$lib/types/effects').ParameterAutomation | undefined;
				
				if (!currentAutomation) {
					// Create new automation - need to get min/max from effect/envelope
					const effect = project.effects?.find((e) => e.id === targetId);
					const envelope = project.envelopes?.find((e) => e.id === targetId);
					
					// Default min/max - should be passed in, but fallback to 0-1
					const min = 0;
					const max = 1;
					
					const automation = (project.automation || {}) as import('$lib/types/effects').ProjectAutomation;
					return {
						...project,
						automation: {
							...automation,
							[automationId]: {
								targetType,
								targetId,
								parameterKey,
								timelineInstanceId,
								points: [point],
								min,
								max
							}
						}
					};
				}
				
				// Insert point in sorted order by beat
				const updatedPoints = [...currentAutomation.points, point].sort((a, b) => a.beat - b.beat);
				const automation = (project.automation || {}) as import('$lib/types/effects').ProjectAutomation;
				
				return {
					...project,
					automation: {
						...automation,
						[automationId]: {
							...currentAutomation,
							points: updatedPoints
						}
					}
				};
			});
		},
		removeAutomationPoint: (targetType: 'effect' | 'envelope', targetId: string, parameterKey: string, pointIndex: number, timelineInstanceId?: string) => {
			updateFn((project) => {
				if (!project) return project;
				const automationId = timelineInstanceId 
					? `${targetType}:${targetId}:${timelineInstanceId}:${parameterKey}`
					: `${targetType}:${targetId}:${parameterKey}`;
				const currentAutomation = project.automation?.[automationId] as import('$lib/types/effects').ParameterAutomation | undefined;
				if (!currentAutomation) return project;
				
				const updatedPoints = currentAutomation.points.filter((_, i) => i !== pointIndex);
				const automation = (project.automation || {}) as import('$lib/types/effects').ProjectAutomation;
				
				return {
					...project,
					automation: {
						...automation,
						[automationId]: {
							...currentAutomation,
							points: updatedPoints
						}
					}
				};
			});
		}
	};
}

