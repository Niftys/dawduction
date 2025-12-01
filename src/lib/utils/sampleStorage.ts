import { supabase } from './supabase';

/**
 * Sample metadata stored in database
 */
export interface SampleMetadata {
	id: string;
	projectId: string;
	userId: string;
	fileName: string;
	fileSize: number;
	duration: number; // in seconds
	sampleRate: number;
	storagePath: string; // Path in Supabase Storage
	createdAt: string;
}

/**
 * Upload a sample file to Supabase Storage
 * @param file - The audio file to upload
 * @param projectId - The project ID this sample belongs to
 * @returns Sample metadata including storage path
 */
export async function uploadSample(
	file: File,
	projectId: string
): Promise<{ success: boolean; sample?: SampleMetadata; error?: string }> {
	try {
		// Get current user
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return { success: false, error: 'Not authenticated' };
		}

		// Validate that the project exists and belongs to the user
		const { data: projectData, error: projectError } = await supabase
			.from('projects')
			.select('id, owner_id')
			.eq('id', projectId)
			.single();

		if (projectError || !projectData) {
			return { success: false, error: 'Project not found' };
		}

		if (projectData.owner_id !== user.id) {
			return { success: false, error: 'You do not have permission to add samples to this project' };
		}

		// Generate unique ID for the sample
		const sampleId = crypto.randomUUID();
		
		// Create storage path: {userId}/{projectId}/{sampleId}.{ext}
		// Note: Don't include 'samples/' prefix - Supabase Storage automatically prefixes with bucket name
		const fileExt = file.name.split('.').pop() || 'wav';
		const storagePath = `${user.id}/${projectId}/${sampleId}.${fileExt}`;

		// Upload file to Supabase Storage
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from('samples')
			.upload(storagePath, file, {
				cacheControl: '3600',
				upsert: false
			});

		if (uploadError) {
			console.error('Error uploading sample:', uploadError);
			return { success: false, error: uploadError.message };
		}

		// Decode audio to get metadata (duration, sample rate)
		const audioContext = new AudioContext();
		const arrayBuffer = await file.arrayBuffer();
		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
		
		const duration = audioBuffer.duration;
		const sampleRate = audioBuffer.sampleRate;

		// Save metadata to database
		// Use snake_case column names to match database schema
		const { data: dbData, error: dbError } = await supabase
			.from('samples')
			.insert({
				id: sampleId,
				project_id: projectId,
				user_id: user.id,
				file_name: file.name,
				file_size: file.size,
				duration: duration,
				sample_rate: sampleRate,
				storage_path: storagePath,
				created_at: new Date().toISOString()
			})
			.select()
			.single();

		if (dbError) {
			console.error('Error saving sample metadata:', dbError);
			// Try to delete the uploaded file if database insert fails
			await supabase.storage.from('samples').remove([storagePath]);
			return { success: false, error: dbError.message };
		}

		return {
			success: true,
			sample: {
				id: dbData.id,
				projectId: dbData.project_id,
				userId: dbData.user_id,
				fileName: dbData.file_name,
				fileSize: dbData.file_size,
				duration: dbData.duration,
				sampleRate: dbData.sample_rate,
				storagePath: dbData.storage_path,
				createdAt: dbData.created_at
			}
		};
	} catch (error: any) {
		console.error('Error uploading sample:', error);
		return { success: false, error: error.message || 'Failed to upload sample' };
	}
}

/**
 * Get all samples for a project
 */
export async function getProjectSamples(projectId: string): Promise<SampleMetadata[]> {
	try {
		const { data, error } = await supabase
			.from('samples')
			.select('*')
			.eq('project_id', projectId)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching samples:', error);
			return [];
		}

		return (data || []).map((row: any) => ({
			id: row.id,
			projectId: row.project_id,
			userId: row.user_id,
			fileName: row.file_name,
			fileSize: row.file_size,
			duration: row.duration,
			sampleRate: row.sample_rate,
			storagePath: row.storage_path,
			createdAt: row.created_at
		}));
	} catch (error) {
		console.error('Error fetching samples:', error);
		return [];
	}
}

/**
 * Download and decode a sample file
 * @param sampleId - The sample ID
 * @returns Decoded audio buffer
 */
export async function loadSampleAudio(sampleId: string): Promise<AudioBuffer | null> {
	try {
		// Get sample metadata
		const { data: sampleData, error: fetchError } = await supabase
			.from('samples')
			.select('storage_path')
			.eq('id', sampleId)
			.single();

		if (fetchError || !sampleData) {
			console.error('Error fetching sample metadata:', fetchError);
			return null;
		}

		// Download file from storage
		// storage_path should already be in format: {userId}/{projectId}/{sampleId}.{ext}
		// (without 'samples/' prefix since .from('samples') handles that)
		const { data: fileData, error: downloadError } = await supabase.storage
			.from('samples')
			.download(sampleData.storage_path);

		if (downloadError || !fileData) {
			console.error('Error downloading sample:', downloadError);
			return null;
		}

		// Decode audio
		const audioContext = new AudioContext();
		const arrayBuffer = await fileData.arrayBuffer();
		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

		return audioBuffer;
	} catch (error) {
		console.error('Error loading sample audio:', error);
		return null;
	}
}

/**
 * Delete a sample
 */
export async function deleteSample(sampleId: string): Promise<{ success: boolean; error?: string }> {
	try {
		// Get sample metadata to find storage path
		const { data: sampleData, error: fetchError } = await supabase
			.from('samples')
			.select('storage_path')
			.eq('id', sampleId)
			.single();

		if (fetchError || !sampleData) {
			return { success: false, error: 'Sample not found' };
		}

		// Delete from storage
		const { error: storageError } = await supabase.storage
			.from('samples')
			.remove([sampleData.storage_path]);

		if (storageError) {
			console.error('Error deleting sample from storage:', storageError);
		}

		// Delete from database
		const { error: dbError } = await supabase
			.from('samples')
			.delete()
			.eq('id', sampleId);

		if (dbError) {
			console.error('Error deleting sample from database:', dbError);
			return { success: false, error: dbError.message };
		}

		return { success: true };
	} catch (error: any) {
		console.error('Error deleting sample:', error);
		return { success: false, error: error.message || 'Failed to delete sample' };
	}
}

