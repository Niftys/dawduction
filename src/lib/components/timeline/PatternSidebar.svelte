<script lang="ts">
	import { page } from '$app/stores';
	import { projectStore } from '$lib/stores/projectStore';
	import type { Pattern } from '$lib/types/pattern';
	import EffectsEnvelopesPanel from '$lib/components/EffectsEnvelopesPanel.svelte';

	export let patterns: Pattern[];
	export let sidebarWidth: number;
	export let editingPatternId: string | null = null;
	export let viewMode: string;
	
	export let createPattern: () => void;
	export let deletePattern: (id: string) => void;
	export let selectPattern: (id: string) => void;
	export let handleEffectEnvelopeDragStart: (e: DragEvent, data: { type: 'effect' | 'envelope', id: string }) => void;
	
	let editingPatternInput: HTMLInputElement | null = null;
	
	// Focus input when editing starts
	$: if (editingPatternId && editingPatternInput) {
		setTimeout(() => editingPatternInput?.focus(), 0);
	}
	
	function handleDragStart(e: DragEvent, patternId: string) {
		if (viewMode !== 'arrangement') return;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copy';
			e.dataTransfer.setData('text/plain', patternId);
			e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pattern', id: patternId }));
		}
	}
</script>

<div class="pattern-sidebar" style="width: {sidebarWidth}px;">
	<div class="sidebar-header">
		<h3>Patterns</h3>
		<button class="create-pattern-btn" on:click={createPattern} title="Create new pattern">
			+
		</button>
	</div>
	<div class="patterns-list">
		{#each patterns as pattern}
			<button
				class="pattern-item {$page.url.pathname.includes(`/pattern/${pattern.id}`) ? 'active' : ''}"
				on:click={() => {
					if (editingPatternId !== pattern.id) {
						selectPattern(pattern.id);
					}
				}}
				on:dragstart={(e) => {
					if (editingPatternId !== pattern.id) {
						handleDragStart(e, pattern.id);
					}
				}}
				draggable={viewMode === 'arrangement' && editingPatternId !== pattern.id}
				tabindex="0"
			>
				<div class="pattern-color" style="background: {pattern.color};"></div>
				{#if editingPatternId === pattern.id}
					<input
						type="text"
						class="pattern-name-input-inline"
						value={pattern.name}
						bind:this={editingPatternInput}
						on:blur={(e) => {
							const newName = e.currentTarget.value.trim() || pattern.name;
							projectStore.updatePattern(pattern.id, { name: newName });
							editingPatternId = null;
						}}
						on:keydown={(e) => {
							if (e.key === 'Enter') {
								e.currentTarget.blur();
							} else if (e.key === 'Escape') {
								editingPatternId = null;
							}
						}}
						on:click|stopPropagation
					/>
				{:else}
					<span 
						class="pattern-name"
						role="button"
						tabindex="0"
						aria-label="Double-click to rename pattern"
						on:dblclick|stopPropagation={() => editingPatternId = pattern.id}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								editingPatternId = pattern.id;
							}
						}}
						title="Double-click to rename"
					>
						{pattern.name}
					</span>
				{/if}
				<span class="pattern-instrument">{pattern.instrumentType}</span>
				<button 
					class="pattern-delete" 
					on:click|stopPropagation={() => deletePattern(pattern.id)} 
					title="Delete pattern"
				>
					×
				</button>
			</button>
		{/each}
		{#if patterns.length === 0}
			<div class="empty-state">No patterns yet. Create one to get started!</div>
		{/if}
	</div>
	<EffectsEnvelopesPanel onDragStart={handleEffectEnvelopeDragStart} />
</div>

