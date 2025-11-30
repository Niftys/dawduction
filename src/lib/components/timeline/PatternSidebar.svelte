<script lang="ts">
	import { page } from '$app/stores';
	import { projectStore } from '$lib/stores/projectStore';
	import type { Pattern } from '$lib/types/pattern';
	import EffectsEnvelopesPanel from '$lib/components/EffectsEnvelopesPanel.svelte';

	let {
		patterns,
		sidebarWidth,
		editingPatternId = $bindable<string | null>(null),
		viewMode,
		createPattern,
		deletePattern,
		selectPattern,
		handleEffectEnvelopeDragStart,
		handlePatternDragStart = undefined,
		onTouchDragStart = undefined,
		onEffectEnvelopeTouchDragStart = undefined
	}: {
		patterns: Pattern[];
		sidebarWidth: number;
		editingPatternId?: string | null;
		viewMode: string;
		createPattern: () => void;
		deletePattern: (id: string) => void;
		selectPattern: (id: string) => void;
		handleEffectEnvelopeDragStart: (e: DragEvent, data: { type: 'effect' | 'envelope', id: string }) => void;
		handlePatternDragStart?: ((e: DragEvent, patternId: string) => void) | undefined;
		onTouchDragStart?: ((patternId: string) => void) | undefined;
		onEffectEnvelopeTouchDragStart?: ((data: { type: 'effect' | 'envelope', id: string }) => void) | undefined;
	} = $props();
	
	let editingPatternInput: HTMLInputElement | null = null;
	
	// Focus input when editing starts
	$effect(() => {
		if (editingPatternId && editingPatternInput) {
			setTimeout(() => editingPatternInput?.focus(), 0);
		}
	});
	
	function handleDragStart(e: DragEvent, patternId: string) {
		if (viewMode !== 'arrangement') {
			e.preventDefault();
			return;
		}
		if (editingPatternId === patternId) {
			e.preventDefault();
			return;
		}
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copy';
			e.dataTransfer.setData('text/plain', patternId);
			e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pattern', id: patternId }));
		}
		// Notify parent component about drag start (for desktop drag)
		if (handlePatternDragStart) {
			handlePatternDragStart(e, patternId);
		}
	}
	
	// Touch drag state for mobile
	let touchDragState: { patternId: string; startX: number; startY: number } | null = null;
	let touchDragElement: HTMLElement | null = null;
	
	function handleTouchStart(e: TouchEvent, patternId: string) {
		if (viewMode !== 'arrangement' || editingPatternId === patternId) return;
		if (e.touches.length !== 1) return;
		
		const touch = e.touches[0];
		touchDragState = {
			patternId,
			startX: touch.clientX,
			startY: touch.clientY
		};
		touchDragElement = e.currentTarget as HTMLElement;
		
		// Set dragged pattern ID for timeline drop detection
		if (onTouchDragStart) {
			onTouchDragStart(patternId);
		}
		
		e.preventDefault();
	}
	
	function handleTouchMove(e: TouchEvent) {
		if (!touchDragState || e.touches.length !== 1) return;
		
		const touch = e.touches[0];
		const moveX = touch.clientX - touchDragState.startX;
		const moveY = touch.clientY - touchDragState.startY;
		const distanceSq = moveX * moveX + moveY * moveY;
		
		// Start drag after 100ms pause and 5px movement
		if (distanceSq > 25) {
			// Create a visual drag indicator (optional - could show a ghost element)
			// For now, just allow the drag to proceed
			e.preventDefault();
		}
	}
	
	function handleTouchEnd(e: TouchEvent) {
		if (!touchDragState) return;
		
		// If we have a valid drag state, we'll handle drop in the timeline area
		// The timeline drop handlers will check for the dragged pattern ID
		touchDragState = null;
		touchDragElement = null;
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
				on:touchstart={(e) => handleTouchStart(e, pattern.id)}
				on:touchmove={handleTouchMove}
				on:touchend={handleTouchEnd}
				on:touchcancel={handleTouchEnd}
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
				{#if viewMode !== 'arrangement'}
					<button 
						class="pattern-delete" 
						on:click|stopPropagation={() => deletePattern(pattern.id)} 
						title="Delete pattern"
					>
						×
					</button>
				{/if}
			</button>
		{/each}
		{#if patterns.length === 0}
			<div class="empty-state">No patterns yet. Create one to get started!</div>
		{/if}
	</div>
	<EffectsEnvelopesPanel onDragStart={handleEffectEnvelopeDragStart} onTouchDragStart={onEffectEnvelopeTouchDragStart} />
</div>

