import { supabase } from './supabase';
import type { Project } from '$lib/stores/projectStore.types';
import type { StandaloneInstrument } from '$lib/types/pattern';
import type { Pattern } from '$lib/types/pattern';
import type { Effect, Envelope } from '$lib/types/effects';

/**
 * Save a project to Supabase
 */
export async function saveProject(project: Project): Promise<{ success: boolean; error?: string }> {
	try {
		// Get current user
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return { success: false, error: 'Not authenticated' };
		}

		// Generate slug from title
		const slug = project.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');

		// Save or update project
		const { data: projectData, error: projectError } = await supabase
			.from('projects')
			.upsert({
				id: project.id,
				owner_id: user.id,
				title: project.title,
				slug: slug,
				bpm: project.bpm,
				timeline: project.timeline || null,
				automation: project.automation || null,
				base_meter_track_id: project.baseMeterTrackId || null,
				updated_at: new Date().toISOString()
			}, {
				onConflict: 'id'
			})
			.select()
			.single();

		if (projectError) {
			console.error('Error saving project:', projectError);
			return { success: false, error: projectError.message };
		}

		// Save standalone instruments
		if (project.standaloneInstruments && project.standaloneInstruments.length > 0) {
			const instruments = project.standaloneInstruments.map((inst: StandaloneInstrument) => ({
				id: inst.id,
				project_id: project.id,
				instrument_type: inst.instrumentType,
				pattern_tree: inst.patternTree,
				settings: inst.settings,
				instrument_settings: inst.instrumentSettings || null,
				volume: inst.volume,
				pan: inst.pan,
				color: inst.color,
				mute: inst.mute || false,
				solo: inst.solo || false,
				updated_at: new Date().toISOString()
			}));

			// Delete existing instruments for this project
			await supabase
				.from('standalone_instruments')
				.delete()
				.eq('project_id', project.id);

			// Insert new instruments
			const { error: instError } = await supabase
				.from('standalone_instruments')
				.insert(instruments);

			if (instError) {
				console.error('Error saving instruments:', instError);
			}
		}

		// Save patterns
		if (project.patterns && project.patterns.length > 0) {
			const patterns = project.patterns.map((pattern: Pattern) => ({
				id: pattern.id,
				project_id: project.id,
				name: pattern.name,
				base_meter: pattern.baseMeter,
				mute: pattern.mute || false,
				solo: pattern.solo || false,
				pattern_data: pattern, // Store full pattern object
				updated_at: new Date().toISOString()
			}));

			// Delete existing patterns for this project
			await supabase
				.from('patterns')
				.delete()
				.eq('project_id', project.id);

			// Insert new patterns
			const { error: patternError } = await supabase
				.from('patterns')
				.insert(patterns);

			if (patternError) {
				console.error('Error saving patterns:', patternError);
			}
		}

		// Save effects
		if (project.effects && project.effects.length > 0) {
			const effects = project.effects.map((effect: Effect) => ({
				id: effect.id,
				project_id: project.id,
				name: effect.name,
				type: effect.type,
				settings: effect.settings,
				color: effect.color,
				updated_at: new Date().toISOString()
			}));

			// Delete existing effects for this project
			await supabase
				.from('effects')
				.delete()
				.eq('project_id', project.id);

			// Insert new effects
			const { error: effectError } = await supabase
				.from('effects')
				.insert(effects);

			if (effectError) {
				console.error('Error saving effects:', effectError);
			}
		}

		// Save envelopes
		if (project.envelopes && project.envelopes.length > 0) {
			const envelopes = project.envelopes.map((envelope: Envelope) => ({
				id: envelope.id,
				project_id: project.id,
				name: envelope.name,
				type: envelope.type,
				settings: envelope.settings,
				color: envelope.color,
				updated_at: new Date().toISOString()
			}));

			// Delete existing envelopes for this project
			await supabase
				.from('envelopes')
				.delete()
				.eq('project_id', project.id);

			// Insert new envelopes
			const { error: envelopeError } = await supabase
				.from('envelopes')
				.insert(envelopes);

			if (envelopeError) {
				console.error('Error saving envelopes:', envelopeError);
			}
		}

		return { success: true };
	} catch (error: any) {
		console.error('Error saving project:', error);
		return { success: false, error: error.message || 'Failed to save project' };
	}
}

/**
 * Load a project from Supabase
 */
export async function loadProject(projectId: string): Promise<{ project: Project | null; error?: string }> {
	try {
		// Get current user
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return { project: null, error: 'Not authenticated' };
		}

		// Load project
		const { data: projectData, error: projectError } = await supabase
			.from('projects')
			.select('*')
			.eq('id', projectId)
			.single();

		if (projectError || !projectData) {
			return { project: null, error: projectError?.message || 'Project not found' };
		}

		// Load standalone instruments
		const { data: instrumentsData } = await supabase
			.from('standalone_instruments')
			.select('*')
			.eq('project_id', projectId);

		// Load patterns
		const { data: patternsData } = await supabase
			.from('patterns')
			.select('*')
			.eq('project_id', projectId);

		// Load effects
		const { data: effectsData } = await supabase
			.from('effects')
			.select('*')
			.eq('project_id', projectId);

		// Load envelopes
		const { data: envelopesData } = await supabase
			.from('envelopes')
			.select('*')
			.eq('project_id', projectId);

		// Reconstruct project
		const project: Project = {
			id: projectData.id,
			title: projectData.title,
			bpm: projectData.bpm,
			standaloneInstruments: (instrumentsData || []).map((inst: any) => ({
				id: inst.id,
				projectId: inst.project_id,
				instrumentType: inst.instrument_type,
				patternTree: inst.pattern_tree,
				settings: inst.settings,
				instrumentSettings: inst.instrument_settings,
				volume: inst.volume,
				pan: inst.pan,
				color: inst.color,
				mute: inst.mute,
				solo: inst.solo
			})),
			patterns: (patternsData || []).map((pat: any) => pat.pattern_data as Pattern),
			effects: (effectsData || []).map((eff: any) => ({
				id: eff.id,
				projectId: eff.project_id,
				name: eff.name,
				type: eff.type,
				settings: eff.settings,
				color: eff.color,
				createdAt: new Date(eff.created_at).getTime(),
				updatedAt: new Date(eff.updated_at).getTime()
			})),
			envelopes: (envelopesData || []).map((env: any) => ({
				id: env.id,
				projectId: env.project_id,
				name: env.name,
				type: env.type,
				settings: env.settings,
				color: env.color,
				createdAt: new Date(env.created_at).getTime(),
				updatedAt: new Date(env.updated_at).getTime()
			})),
			timeline: projectData.timeline || {
				tracks: [],
				clips: [],
				effects: [],
				envelopes: [],
				totalLength: 64 // 16 measures at 4/4 time (16 * 4 = 64 beats)
			},
			automation: projectData.automation || undefined,
			baseMeterTrackId: projectData.base_meter_track_id || undefined
		};

		return { project };
	} catch (error: any) {
		console.error('Error loading project:', error);
		return { project: null, error: error.message || 'Failed to load project' };
	}
}

/**
 * Update project title/name
 */
export async function updateProjectTitle(projectId: string, newTitle: string): Promise<{ success: boolean; error?: string }> {
	try {
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return { success: false, error: 'Not authenticated' };
		}

		// Generate slug from title
		const slug = newTitle
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');

		const { error } = await supabase
			.from('projects')
			.update({
				title: newTitle,
				slug: slug,
				updated_at: new Date().toISOString()
			})
			.eq('id', projectId)
			.eq('owner_id', user.id); // Ensure user owns the project

		if (error) {
			console.error('Error updating project title:', error);
			return { success: false, error: error.message };
		}

		return { success: true };
	} catch (error: any) {
		console.error('Error updating project title:', error);
		return { success: false, error: error.message || 'Failed to update project title' };
	}
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
	try {
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return { success: false, error: 'Not authenticated' };
		}

		// Delete project (cascade will delete all related data)
		const { error } = await supabase
			.from('projects')
			.delete()
			.eq('id', projectId)
			.eq('owner_id', user.id); // Ensure user owns the project

		if (error) {
			console.error('Error deleting project:', error);
			return { success: false, error: error.message };
		}

		return { success: true };
	} catch (error: any) {
		console.error('Error deleting project:', error);
		return { success: false, error: error.message || 'Failed to delete project' };
	}
}

/**
 * Get all projects for the current user
 */
export async function getUserProjects(): Promise<{ projects: any[]; error?: string }> {
	try {
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return { projects: [], error: 'Not authenticated' };
		}

		const { data, error } = await supabase
			.from('projects')
			.select('id, title, slug, bpm, created_at, updated_at')
			.eq('owner_id', user.id)
			.order('updated_at', { ascending: false });

		if (error) {
			return { projects: [], error: error.message };
		}

		return { projects: data || [] };
	} catch (error: any) {
		console.error('Error loading user projects:', error);
		return { projects: [], error: error.message || 'Failed to load projects' };
	}
}

