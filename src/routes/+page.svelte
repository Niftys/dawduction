<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { projectStore } from '$lib/stores/projectStore';
	import { loadingStore } from '$lib/stores/loadingStore';
	import { supabase, getCurrentUser } from '$lib/utils/supabase';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import ProjectsModal from '$lib/components/ProjectsModal.svelte';
	import SandboxModal from '$lib/components/SandboxModal.svelte';
	import '$lib/styles/pages/Home.css';

	const circleText = 'DAWDUCTION • '.repeat(5);

	let user: any = null;
	let showAuthModal = false;
	let showProjectsModal = false;
	let showSandboxModal = false;

	onMount(async () => {
		// Check if user is authenticated
		user = await getCurrentUser();

		// Listen for auth state changes
		supabase.auth.onAuthStateChange((_event, session) => {
			user = session?.user ?? null;
			if (!user) {
				showProjectsModal = false;
			}
		});
	});

	function handleAuthSuccess() {
		showAuthModal = false;
		// User will be updated via auth state change listener
	}

	async function createNewProject() {
		if (!user) {
			showAuthModal = true;
			return;
		}

		loadingStore.startLoading('Creating new project...');
		
		try {
			// Small delay to show loading state
			await new Promise(resolve => setTimeout(resolve, 100));
			
			const projectId = crypto.randomUUID();
			const newProject = {
				id: projectId,
				title: 'New Project',
				bpm: 120,
				standaloneInstruments: [],
				patterns: [],
				effects: [],
				envelopes: [],
				timeline: {
					tracks: [], // TimelineTracks (not standalone instruments)
					clips: [],
					effects: [],
					envelopes: [],
					totalLength: 64 // 16 measures at 4/4 time (16 * 4 = 64 beats)
				}
			};
			projectStore.set(newProject);
			
			// Automatically create Pattern 1 (empty, no default instruments)
			const defaultPattern = projectStore.createPattern(projectId, 'Pattern 1');
			projectStore.addPattern(defaultPattern);
			
			// Create default timeline tracks
			const patternTrack = projectStore.createTimelineTrack('pattern', defaultPattern.id, 'Pattern 1');
			const effectTrack = projectStore.createTimelineTrack('effect', undefined, 'Effects');
			const envelopeTrack = projectStore.createTimelineTrack('envelope', undefined, 'Envelopes');
			
			projectStore.addTimelineTrack(patternTrack);
			projectStore.addTimelineTrack(effectTrack);
			projectStore.addTimelineTrack(envelopeTrack);
			
			await goto(`/project/${projectId}`);
		} finally {
			// Loading will be stopped by the project page once it's loaded
		}
	}

	async function handleLogout() {
		loadingStore.startLoading('Signing out...');
		try {
			await supabase.auth.signOut();
			user = null;
			showProjectsModal = false;
		} catch (err) {
			console.error('Error signing out:', err);
		} finally {
			loadingStore.stopLoading();
		}
	}

	async function handleEnterSandbox() {
		// Create a sandbox project ID
		const sandboxId = 'sandbox-' + crypto.randomUUID();
		
		// Create a new project in the store (won't be saved to database)
		const newProject = {
			id: sandboxId,
			title: 'Sandbox Project',
			bpm: 120,
			standaloneInstruments: [],
			patterns: [],
			effects: [],
			envelopes: [],
			timeline: {
				tracks: [],
				clips: [],
				effects: [],
				envelopes: [],
				totalLength: 64
			}
		};
		
		projectStore.set(newProject);
		
		// Create default pattern and tracks
		const defaultPattern = projectStore.createPattern(sandboxId, 'Pattern 1');
		projectStore.addPattern(defaultPattern);
		
		const patternTrack = projectStore.createTimelineTrack('pattern', defaultPattern.id, 'Pattern 1');
		const effectTrack = projectStore.createTimelineTrack('effect', undefined, 'Effects');
		const envelopeTrack = projectStore.createTimelineTrack('envelope', undefined, 'Envelopes');
		
		projectStore.addTimelineTrack(patternTrack);
		projectStore.addTimelineTrack(effectTrack);
		projectStore.addTimelineTrack(envelopeTrack);
		
		// Navigate to sandbox project
		await goto(`/project/${sandboxId}`);
	}
</script>

<div class="home">
	<div class="home-content">
		<!-- Top Right: New Project Button (only when authenticated) -->
		{#if user}
			<div class="top-right-section">
				<button class="new-project-top-button" on:click={createNewProject}>New Project</button>
				<button class="logout-button" on:click={handleLogout}>Sign Out</button>
			</div>
		{/if}

		<!-- Main Content -->
		<div class="main-content">
			<div class="circle-wrapper">
				<svg class="circle-text" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
					<defs>
						<path
							id="text-ring"
							d="M200,200 m-170,0 a170,170 0 1,1 340,0 a170,170 0 1,1 -340,0"
						/>
					</defs>
					<text>
						<textPath href="#text-ring" startOffset="0%">
							{circleText}
						</textPath>
					</text>
				</svg>
				
				{#if user}
					<button class="view-projects-button" on:click={() => showProjectsModal = true}>
						View Projects
					</button>
				{:else}
					<div class="button-group">
						<button class="sandbox-button" on:click={() => showSandboxModal = true}>
							Sandbox
						</button>
						<button class="sign-in-button" on:click={() => showAuthModal = true}>
							Sign In
						</button>
					</div>
				{/if}
				
				<p class="subtitle">Procedural-Synthesis DAW with Tree-Based Rhythmic Structures</p>
			</div>
		</div>
	</div>
</div>

<!-- Auth Modal -->
<AuthModal 
	bind:isOpen={showAuthModal} 
	on:success={handleAuthSuccess}
	on:close={() => showAuthModal = false}
/>

<!-- Projects Modal -->
{#if user}
	<ProjectsModal 
		bind:isOpen={showProjectsModal}
		on:close={() => showProjectsModal = false}
	/>
{/if}

<!-- Sandbox Modal -->
<SandboxModal 
	bind:isOpen={showSandboxModal}
	on:enter={handleEnterSandbox}
	on:close={() => showSandboxModal = false}
/>

