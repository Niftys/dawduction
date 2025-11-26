<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { PatternNode } from '$lib/types/pattern';
	import '$lib/styles/components/NodeContextMenu.css';

	export let x: number;
	export let y: number;
	export let node: PatternNode | null;
	export let isRoot: boolean;
	export let patternId: string | null = null;
	export let trackId: string | null = null;

	const dispatch = createEventDispatcher();

	function handleAddChild(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		if (node) {
			dispatch('addChild', { type: 'addChild', node });
		}
	}

	function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		if (node) {
			dispatch('delete', { type: 'delete', node });
		}
	}

	function handleEdit(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		if (node) {
			dispatch('edit', { type: 'edit', node });
		}
	}

	function handleCopy(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		if (node) {
			dispatch('copy', { type: 'copy', node });
		}
	}
</script>

<div 
	class="context-menu" 
	style="left: {x}px; top: {y}px;"
	on:mousedown|stopPropagation
	role="menu"
	tabindex="-1"
>
	{#if isRoot}
		<button class="menu-item" on:click={handleCopy}>
			Copy Instrument
		</button>
	{/if}
	<button class="menu-item" on:click={handleAddChild}>
		Add Child <span class="shortcut">(A)</span>
	</button>
	<button class="menu-item" on:click={handleEdit}>
		Edit Division
	</button>
	<button class="menu-item danger" on:click={handleDelete}>
		{isRoot ? (patternId ? 'Delete Pattern' : 'Delete Track') : 'Delete Node'}
	</button>
</div>

