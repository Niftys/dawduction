<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import type { Effect, Envelope } from '$lib/types/effects';
	import { effectPluginStore } from '$lib/stores/effectPluginStore';
	import '$lib/styles/components/EffectsEnvelopesPanel.css';

	let project: any = $state(null);
	projectStore.subscribe((p) => (project = p));

	let activeTab: 'effects' | 'envelopes' = $state('effects');
	
	// Rename state
	let editingEffectId: string | null = $state(null);
	let editingEnvelopeId: string | null = $state(null);
	let editingEffectInput: HTMLInputElement | null = $state(null);
	let editingEnvelopeInput: HTMLInputElement | null = $state(null);
	
	// Focus inputs when editing starts
	$effect(() => {
		if (editingEffectId && editingEffectInput) {
			setTimeout(() => editingEffectInput?.focus(), 0);
		}
	});
	$effect(() => {
		if (editingEnvelopeId && editingEnvelopeInput) {
			setTimeout(() => editingEnvelopeInput?.focus(), 0);
		}
	});
	
	// Dropdown state
	let showEffectDropdown = $state(false);
	let showEnvelopeDropdown = $state(false);
	
	const effects = $derived(project?.effects || []);
	const envelopes = $derived(project?.envelopes || []);
	const projectId = $derived($page.params.id);

	const effectTypes: Array<{ value: Effect['type']; label: string }> = [
		{ value: 'equalizer', label: 'Equalizer' },
		{ value: 'compressor', label: 'Compressor' },
		{ value: 'reverb', label: 'Reverb' },
		{ value: 'delay', label: 'Delay' },
		{ value: 'filter', label: 'Filter' },
		{ value: 'saturator', label: 'Saturator' },
		{ value: 'distortion', label: 'Distortion' },
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

	const {
		onDragStart = undefined,
		onTouchDragStart = undefined
	}: {
		onDragStart?: ((e: DragEvent, data: { type: 'effect' | 'envelope', id: string }) => void) | undefined;
		onTouchDragStart?: ((data: { type: 'effect' | 'envelope', id: string }) => void) | undefined;
	} = $props();
	
	function handleEffectTouchStart(e: TouchEvent, effectId: string) {
		if (editingEffectId !== effectId && e.touches.length === 1 && onTouchDragStart) {
			const data: { type: 'effect', id: string } = { type: 'effect', id: effectId };
			onTouchDragStart(data);
			e.preventDefault();
		}
	}
	
	function handleEnvelopeTouchStart(e: TouchEvent, envelopeId: string) {
		if (editingEnvelopeId !== envelopeId && e.touches.length === 1 && onTouchDragStart) {
			const data: { type: 'envelope', id: string } = { type: 'envelope', id: envelopeId };
			onTouchDragStart(data);
			e.preventDefault();
		}
	}
	
	function handleEffectDragStart(e: DragEvent, effectId: string) {
		if (editingEffectId !== effectId) {
			const data: { type: 'effect', id: string } = { type: 'effect', id: effectId };
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'copy';
				e.dataTransfer.setData('text/plain', effectId);
				e.dataTransfer.setData('application/json', JSON.stringify(data));
			}
			if (onDragStart) {
				onDragStart(e, data);
			}
		}
	}
	
	function handleEnvelopeDragStart(e: DragEvent, envelopeId: string) {
		if (editingEnvelopeId !== envelopeId) {
			const data: { type: 'envelope', id: string } = { type: 'envelope', id: envelopeId };
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'copy';
				e.dataTransfer.setData('text/plain', envelopeId);
				e.dataTransfer.setData('application/json', JSON.stringify(data));
			}
			if (onDragStart) {
				onDragStart(e, data);
			}
		}
	}

	function openPluginWindow(effect: Effect) {
		if (effect.type !== 'equalizer') {
			return;
		}
		
		effectPluginStore.openWindow({
			id: effect.id,
			effectType: 'equalizer',
			effectId: effect.id,
			label: effect.name
		});
	}
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
					<div
						class="item {effect.type}"
						draggable={editingEffectId !== effect.id}
						on:dragstart={(e) => handleEffectDragStart(e, effect.id)}
						on:touchstart={(e) => handleEffectTouchStart(e, effect.id)}
						role="button"
						tabindex="0"
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
							{#if effect.type === 'equalizer'}
								<button 
									class="item-plugin" 
									on:click|stopPropagation={() => openPluginWindow(effect)} 
									title="Open plugin window"
								>
									🔌
								</button>
							{/if}
							<button 
								class="item-delete" 
								on:click|stopPropagation={() => deleteEffect(effect.id)} 
								title="Delete effect"
							>
								×
							</button>
						</div>
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
					<div
						class="item {envelope.type}"
						draggable={editingEnvelopeId !== envelope.id}
						on:dragstart={(e) => handleEnvelopeDragStart(e, envelope.id)}
						on:touchstart={(e) => handleEnvelopeTouchStart(e, envelope.id)}
						role="button"
						tabindex="0"
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
					</div>
					{/each}
					{#if envelopes.length === 0}
						<div class="empty-state">No envelopes yet. Create one above!</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

