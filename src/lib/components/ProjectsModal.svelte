<script lang="ts">
	import { getUserProjects, loadProject, deleteProject } from '$lib/utils/projectSaveLoad';
	import { projectStore } from '$lib/stores/projectStore';
	import { loadingStore } from '$lib/stores/loadingStore';
	import { goto } from '$app/navigation';
	import { createEventDispatcher } from 'svelte';

	export let isOpen = false;

	const dispatch = createEventDispatcher();

	let projects: any[] = [];
	let loading = false;
	let error = '';
	let showDeleteConfirm = false;
	let projectToDelete: any = null;

	async function loadProjects() {
		if (!isOpen) return;
		
		loading = true;
		error = '';
		const { projects: userProjects, error: projectsError } = await getUserProjects();
		
		if (projectsError) {
			error = projectsError;
		} else {
			projects = userProjects || [];
		}
		loading = false;
	}

	$: if (isOpen) {
		loadProjects();
	}

	function closeModal() {
		isOpen = false;
		dispatch('close');
	}

	async function openProject(projectId: string) {
		loadingStore.startLoading('Loading project...');
		try {
			const { project, error: loadError } = await loadProject(projectId);
			if (loadError || !project) {
				console.error('Error loading project:', loadError);
				loadingStore.stopLoading();
				return;
			}
			projectStore.set(project);
			closeModal();
			await goto(`/project/${projectId}`);
		} catch (err) {
			console.error('Error opening project:', err);
			loadingStore.stopLoading();
		}
	}

	function handleDeleteClick(project: any, e: MouseEvent) {
		e.stopPropagation(); // Prevent opening the project
		projectToDelete = project;
		showDeleteConfirm = true;
	}

	async function handleDeleteProject() {
		if (!projectToDelete) return;

		loadingStore.startLoading('Deleting project...');
		
		try {
			const { success, error: deleteError } = await deleteProject(projectToDelete.id);
			
			if (!success) {
				console.error('Failed to delete project:', deleteError);
				alert('Failed to delete project: ' + (deleteError || 'Unknown error'));
				loadingStore.stopLoading();
				showDeleteConfirm = false;
				projectToDelete = null;
				return;
			}

			// Reload projects list
			await loadProjects();
			showDeleteConfirm = false;
			projectToDelete = null;
		} catch (err: any) {
			console.error('Error deleting project:', err);
			alert('Failed to delete project');
			loadingStore.stopLoading();
			showDeleteConfirm = false;
			projectToDelete = null;
		} finally {
			loadingStore.stopLoading();
		}
	}

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { 
			month: 'short', 
			day: 'numeric', 
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// Close on Escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			closeModal();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="modal-overlay" on:click={closeModal} on:keydown={(e) => e.key === 'Escape' && closeModal()}>
		<div class="modal-content" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<button class="close-button" on:click={closeModal} aria-label="Close modal">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>

			<h2 id="modal-title" class="modal-title">Your Projects</h2>

			{#if loading}
				<div class="loading-state">Loading projects...</div>
			{:else if error}
				<div class="error-message">{error}</div>
			{:else if projects.length === 0}
				<div class="empty-state">
					<p>No saved projects yet.</p>
					<p class="empty-hint">Create a new project to get started!</p>
				</div>
			{:else}
				<div class="projects-list">
					{#each projects as project (project.id)}
						<div class="project-card">
							<button
								class="project-card-button"
								on:click={() => openProject(project.id)}
								on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										openProject(project.id);
									}
								}}
							>
								<div class="project-card-content">
									<h3 class="project-title">{project.title || 'Untitled'}</h3>
									<div class="project-details">
										<div class="project-detail">
											<span class="detail-label">BPM:</span>
											<span class="detail-value">{project.bpm}</span>
										</div>
										<div class="project-detail">
											<span class="detail-label">Updated:</span>
											<span class="detail-value">{formatDate(project.updated_at)}</span>
										</div>
										<div class="project-detail">
											<span class="detail-label">Created:</span>
											<span class="detail-value">{formatDate(project.created_at)}</span>
										</div>
									</div>
								</div>
								<svg class="project-arrow" width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							</button>
							<button
								class="delete-project-button"
								on:click={(e) => handleDeleteClick(project, e)}
								title="Delete project"
							>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7.5V11.5M10 7.5V11.5M4 4L4.5 13C4.5 13.5523 4.94772 14 5.5 14H10.5C11.0523 14 11.5 13.5523 11.5 13L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Delete Confirmation Dialog -->
{#if showDeleteConfirm && projectToDelete}
	<div 
		class="delete-dialog-overlay" 
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-dialog-title"
		on:click={() => {
			showDeleteConfirm = false;
			projectToDelete = null;
		}}
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				showDeleteConfirm = false;
				projectToDelete = null;
			}
		}}
		tabindex="-1"
	>
		<div 
			class="delete-dialog" 
			on:click|stopPropagation 
			role="document"
			on:keydown={(e) => e.stopPropagation()}
		>
			<h3 id="delete-dialog-title">Delete Project</h3>
			<p>Are you sure you want to delete "{projectToDelete.title || 'this project'}"? This action cannot be undone.</p>
			<div class="dialog-buttons">
				<button class="cancel-button" on:click={() => {
					showDeleteConfirm = false;
					projectToDelete = null;
				}}>
					Cancel
				</button>
				<button class="delete-button" on:click={handleDeleteProject}>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 2rem;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 12px;
		padding: 2rem;
		width: 100%;
		max-width: 600px;
		max-height: 80vh;
		position: relative;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
	}

	.close-button {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		padding: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.modal-title {
		margin: 0 0 1.5rem 0;
		font-size: 2rem;
		color: #ffffff;
		font-weight: 600;
	}

	.loading-state,
	.empty-state {
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
		padding: 3rem 1rem;
	}

	.empty-hint {
		margin-top: 0.5rem;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.4);
	}

	.error-message {
		background: #ff4444;
		color: white;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.projects-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
		flex: 1;
		padding-right: 0.5rem;
	}

	.projects-list::-webkit-scrollbar {
		width: 8px;
	}

	.projects-list::-webkit-scrollbar-track {
		background: #0a0a0a;
		border-radius: 4px;
	}

	.projects-list::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 4px;
	}

	.projects-list::-webkit-scrollbar-thumb:hover {
		background: #444;
	}

	.project-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: #0a0a0a;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 1.5rem;
		transition: all 0.2s;
		text-align: left;
		width: 100%;
	}

	.project-card:hover {
		background: #111;
		border-color: rgba(255, 255, 255, 0.2);
	}

	.project-card-button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		padding: 0;
		color: inherit;
	}

	.delete-project-button {
		background: transparent;
		border: 1px solid rgba(255, 68, 68, 0.3);
		color: #ff4444;
		width: 36px;
		height: 36px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		flex-shrink: 0;
	}

	.delete-project-button:hover {
		background: rgba(255, 68, 68, 0.1);
		border-color: #ff4444;
	}

	.project-card-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.delete-dialog-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		backdrop-filter: blur(4px);
	}

	.delete-dialog {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 12px;
		padding: 2rem;
		max-width: 400px;
		width: 90%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.delete-dialog h3 {
		margin: 0 0 1rem 0;
		color: #ffffff;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.delete-dialog p {
		margin: 0 0 1.5rem 0;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.5;
	}

	.dialog-buttons {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.cancel-button,
	.delete-button {
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.cancel-button {
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.cancel-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.delete-button {
		background: #ff4444;
		color: #ffffff;
	}

	.delete-button:hover {
		background: #ff3333;
	}

	.project-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #ffffff;
	}

	.project-details {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.project-detail {
		display: flex;
		gap: 0.75rem;
		font-size: 0.9rem;
	}

	.detail-label {
		color: rgba(255, 255, 255, 0.5);
		font-weight: 500;
		min-width: 70px;
	}

	.detail-value {
		color: rgba(255, 255, 255, 0.8);
	}

	.project-arrow {
		color: rgba(255, 255, 255, 0.4);
		transition: transform 0.2s, color 0.2s;
		flex-shrink: 0;
	}

	.project-card:hover .project-arrow {
		transform: translateX(4px);
		color: rgba(255, 255, 255, 0.7);
	}
</style>

