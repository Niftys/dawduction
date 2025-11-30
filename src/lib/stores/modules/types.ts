import type { Project } from '../projectStore.types';

/**
 * Shared types for project store modules
 */

export type UpdateFn = (updater: (project: Project | null) => Project | null, skipHistory?: boolean) => void;
export type GetCurrent = () => Project | null;

