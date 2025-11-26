<script lang="ts">
	import { goto } from '$app/navigation';
	import { projectStore } from '$lib/stores/projectStore';
	import '$lib/styles/pages/Home.css';

	const circleText = 'DAWDUCTION • '.repeat(5);

	function createNewProject() {
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
				totalLength: 16
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
		
		goto(`/project/${projectId}`);
	}
</script>

<div class="home">
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
		<button class="new-project-button" on:click={createNewProject}>New Project</button>
		<p class="subtitle">Procedural-Synthesis DAW with Tree-Based Rhythmic Structures</p>
	</div>
</div>

