<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import type { Effect, Envelope } from '$lib/types/effects';
	import '$lib/styles/components/EffectsEnvelopesPanel.css';

	let project: any;
	projectStore.subscribe((p) => (project = p));

	let activeTab: 'effects' | 'envelopes' = 'effects';
	
	// Rename state
	let editingEffectId: string | null = null;
	let editingEnvelopeId: string | null = null;
	let editingEffectInput: HTMLInputElement | null = null;
	let editingEnvelopeInput: HTMLInputElement | null = null;
	
	// Focus inputs when editing starts
	$: if (editingEffectId && editingEffectInput) {
		setTimeout(() => editingEffectInput?.focus(), 0);
	}
	$: if (editingEnvelopeId && editingEnvelopeInput) {
		setTimeout(() => editingEnvelopeInput?.focus(), 0);
	}
	
	// Dropdown state
	let showEffectDropdown = false;
	let showEnvelopeDropdown = false;
	
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
	
	function handleCreateEffect(type: Effect['type']) {
		createEffect(type);
		showEffectDropdown = false;
	}
	
	function handleCreateEnvelope(type: Envelope['type']) {
		createEnvelope(type);
		showEnvelopeDropdown = false;
	}
	
	function closeDropdowns() {
		showEffectDropdown = false;
		showEnvelopeDropdown = false;
	}
	
	// Close dropdowns when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (!showEffectDropdown && !showEnvelopeDropdown) return;
		
		const target = event.target as HTMLElement;
		if (!target.closest('.create-dropdown-wrapper')) {
			closeDropdowns();
		}
	}
	
	// Listen for clicks outside when dropdown is open
	onMount(() => {
		document.addEventListener('click', handleClickOutside, true);
		return () => {
			document.removeEventListener('click', handleClickOutside, true);
		};
	});

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
				<div class="create-dropdown-wrapper">
					<button 
						class="create-dropdown-trigger"
						on:click={() => {
							showEffectDropdown = !showEffectDropdown;
							showEnvelopeDropdown = false;
						}}
						title="Create new effect"
					>
						<span>+ Create Effect</span>
						<svg 
							class="dropdown-arrow {showEffectDropdown ? 'open' : ''}" 
							width="12" 
							height="12" 
							viewBox="0 0 12 12" 
							fill="none" 
							xmlns="http://www.w3.org/2000/svg"
						>
							<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
					{#if showEffectDropdown}
						<div class="create-dropdown-menu">
							{#each effectTypes as type}
								<button 
									class="dropdown-menu-item"
									on:click={() => handleCreateEffect(type.value)}
									title="Create {type.label}"
								>
									{type.label}
								</button>
							{/each}
						</div>
					{/if}
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
									bind:this={editingEffectInput}
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
								/>
							{:else}
								<span 
									class="item-name"
									role="button"
									tabindex="0"
									aria-label="Double-click to rename effect"
									on:dblclick|stopPropagation={() => editingEffectId = effect.id}
									on:keydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											editingEffectId = effect.id;
										}
									}}
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
				<div class="create-dropdown-wrapper">
					<button 
						class="create-dropdown-trigger"
						on:click={() => {
							showEnvelopeDropdown = !showEnvelopeDropdown;
							showEffectDropdown = false;
						}}
						title="Create new envelope"
					>
						<span>+ Create Envelope</span>
						<svg 
							class="dropdown-arrow {showEnvelopeDropdown ? 'open' : ''}" 
							width="12" 
							height="12" 
							viewBox="0 0 12 12" 
							fill="none" 
							xmlns="http://www.w3.org/2000/svg"
						>
							<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
					{#if showEnvelopeDropdown}
						<div class="create-dropdown-menu">
							{#each envelopeTypes as type}
								<button 
									class="dropdown-menu-item"
									on:click={() => handleCreateEnvelope(type.value)}
									title="Create {type.label}"
								>
									{type.label}
								</button>
							{/each}
						</div>
					{/if}
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
									bind:this={editingEnvelopeInput}
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
								/>
							{:else}
								<span 
									class="item-name"
									role="button"
									tabindex="0"
									aria-label="Double-click to rename envelope"
									on:dblclick|stopPropagation={() => editingEnvelopeId = envelope.id}
									on:keydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											editingEnvelopeId = envelope.id;
										}
									}}
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

