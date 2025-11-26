import type { Project } from './projectStore.types';

/**
 * Deep clone project for history
 */
export function cloneProject(project: Project | null): Project | null {
	if (!project) return null;
	return JSON.parse(JSON.stringify(project));
}

/**
 * Deep copy settings object
 */
export function deepCopySettings(settings: any): any {
	if (!settings || typeof settings !== 'object') return settings;
	return JSON.parse(JSON.stringify(settings));
}

