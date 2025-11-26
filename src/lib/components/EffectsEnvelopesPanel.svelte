<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { page } from '$app/stores';
	import type { Effect, Envelope } from '$lib/types/effects';
	import '$lib/styles/components/EffectsEnvelopesPanel.css';

	let project: any;
	projectStore.subscribe((p) => (project = p));

	let activeTab: 'effects' | 'envelopes' = 'effects';
	
	// Rename state
	let editingEffectId: string | null = null;
	let editingEnvelopeId: string | null = null;
	
	$: effects = project?.effects || [];
	$: envelopes = project?.envelopes || [];
	$: projectId = $page.params.id;

	const effectTypes: Array<{ value: Effect['type']; label: string }> = [
		{ value: 'reverb', label: 'Reverb' },
		{ value: 'delay', label: 'Delay' },
		{ value: 'filter', label: 'Filter' },
		{ value: 'distortion', label: 'Distortion' },
		{ value: 'compressor', label: 'Compressor' },
		{ value: 'chorus', label: 'Chorus' }
	];

	const envelopeTypes: Array<{ value: Envelope['type']; label: string }> = [
		{ value: 'volume', label: 'Volume' },
		{ value: 'filter', label: 'Filter' },
		{ value: 'pitch', label: 'Pitch' },
		{ value: 'pan', label: 'Pan' }
	];

	function createEffect(type: Effect['type']) {
		if (!project || !projectId) {
			console.error('Cannot create effect: project or projectId missing', { project, projectId });
			return;
		}
		try {
			// Count only effects of the same type
			const sameTypeCount = effects.filter(e => e.type === type).length;
			const newEffect = projectStore.createEffect(
				projectId,
				`${type.charAt(0).toUpperCase() + type.slice(1)} ${sameTypeCount + 1}`,
				type
			);
			projectStore.addEffect(newEffect);
		} catch (error) {
			console.error('Error creating effect:', error);
		}
	}

	function createEnvelope(type: Envelope['type']) {
		if (!project || !projectId) {
			console.error('Cannot create envelope: project or projectId missing', { project, projectId });
			return;
		}
		try {
			// Count only envelopes of the same type
			const sameTypeCount = envelopes.filter(e => e.type === type).length;
			const newEnvelope = projectStore.createEnvelope(
				projectId,
				`${type.charAt(0).toUpperCase() + type.slice(1)} ${sameTypeCount + 1}`,
				type
			);
			projectStore.addEnvelope(newEnvelope);
		} catch (error) {
			console.error('Error creating envelope:', error);
		}
	}

	function deleteEffect(effectId: string) {
		projectStore.deleteEffect(effectId);
	}

	function deleteEnvelope(envelopeId: string) {
		projectStore.deleteEnvelope(envelopeId);
	}

	export let onDragStart: ((e: DragEvent, data: { type: 'effect' | 'envelope', id: string }) => void) | undefined = undefined;
</script>

<div class="effects-envelopes-panel">
	<div class="panel-tabs">
		<button 
			class="tab {activeTab === 'effects' ? 'active' : ''}"
			on:click={() => activeTab = 'effects'}
		>
			Effects
		</button>
		<button 
			class="tab {activeTab === 'envelopes' ? 'active' : ''}"
			on:click={() => activeTab = 'envelopes'}
		>
			Envelopes
		</button>
	</div>

	<div class="panel-content">
		{#if activeTab === 'effects'}
			<div class="effects-section">
				<div class="create-buttons">
					{#each effectTypes as type}
						<button 
							class="create-effect-btn"
							on:click={() => createEffect(type.value)}
							title="Create {type.label}"
						>
							+ {type.label}
						</button>
					{/each}
				</div>
				<div class="items-list">
					{#each effects as effect}
						<button
							class="item {effect.type}"
							draggable={editingEffectId !== effect.id}
							on:dragstart={(e) => {
								if (editingEffectId !== effect.id) {
								const data = { type: 'effect', id: effect.id };
								if (e.dataTransfer) {
									e.dataTransfer.effectAllowed = 'copy';
									e.dataTransfer.setData('text/plain', effect.id);
									e.dataTransfer.setData('application/json', JSON.stringify(data));
								}
								if (onDragStart) {
									onDragStart(e, data);
									}
								}
							}}
						>
							<div class="item-color" style="background: {effect.color};"></div>
							{#if editingEffectId === effect.id}
								<input
									type="text"
									class="item-name-input"
									value={effect.name}
									on:blur={(e) => {
										const newName = e.currentTarget.value.trim() || effect.name;
										projectStore.updateEffect(effect.id, { name: newName });
										editingEffectId = null;
									}}
									on:keydown={(e) => {
										if (e.key === 'Enter') {
											e.currentTarget.blur();
										} else if (e.key === 'Escape') {
											editingEffectId = null;
										}
									}}
									on:click|stopPropagation
									autofocus
								/>
							{:else}
								<span 
									class="item-name"
									on:dblclick|stopPropagation={() => editingEffectId = effect.id}
									title="Double-click to rename"
								>
									{effect.name}
								</span>
							{/if}
							<span class="item-type">{effect.type}</span>
							<button 
								class="item-delete" 
								on:click|stopPropagation={() => deleteEffect(effect.id)} 
								title="Delete effect"
							>
								×
							</button>
						</button>
					{/each}
					{#if effects.length === 0}
						<div class="empty-state">No effects yet. Create one above!</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="envelopes-section">
				<div class="create-buttons">
					{#each envelopeTypes as type}
						<button 
							class="create-envelope-btn"
							on:click={() => createEnvelope(type.value)}
							title="Create {type.label}"
						>
							+ {type.label}
						</button>
					{/each}
				</div>
				<div class="items-list">
					{#each envelopes as envelope}
						<button
							class="item {envelope.type}"
							draggable={editingEnvelopeId !== envelope.id}
							on:dragstart={(e) => {
								if (editingEnvelopeId !== envelope.id) {
								const data = { type: 'envelope', id: envelope.id };
								if (e.dataTransfer) {
									e.dataTransfer.effectAllowed = 'copy';
									e.dataTransfer.setData('text/plain', envelope.id);
									e.dataTransfer.setData('application/json', JSON.stringify(data));
								}
								if (onDragStart) {
									onDragStart(e, data);
									}
								}
							}}
						>
							<div class="item-color" style="background: {envelope.color};"></div>
							{#if editingEnvelopeId === envelope.id}
								<input
									type="text"
									class="item-name-input"
									value={envelope.name}
									on:blur={(e) => {
										const newName = e.currentTarget.value.trim() || envelope.name;
										projectStore.updateEnvelope(envelope.id, { name: newName });
										editingEnvelopeId = null;
									}}
									on:keydown={(e) => {
										if (e.key === 'Enter') {
											e.currentTarget.blur();
										} else if (e.key === 'Escape') {
											editingEnvelopeId = null;
										}
									}}
									on:click|stopPropagation
									autofocus
								/>
							{:else}
								<span 
									class="item-name"
									on:dblclick|stopPropagation={() => editingEnvelopeId = envelope.id}
									title="Double-click to rename"
								>
									{envelope.name}
								</span>
							{/if}
							<span class="item-type">{envelope.type}</span>
							<button 
								class="item-delete" 
								on:click|stopPropagation={() => deleteEnvelope(envelope.id)} 
								title="Delete envelope"
							>
								×
							</button>
						</button>
					{/each}
					{#if envelopes.length === 0}
						<div class="empty-state">No envelopes yet. Create one above!</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

