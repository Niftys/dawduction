<script lang="ts">
	import type { PatternNode } from '$lib/types/pattern';
	import '$lib/styles/components/NodeContextMenu.css';

	let contextMenuElement: HTMLDivElement;

	const {
		x,
		y,
		node,
		isRoot,
		patternId = null,
		trackId = null,
		onAddChild,
		onDelete,
		onEdit,
		onCopy
	}: {
		x: number;
		y: number;
		node: PatternNode | null;
		isRoot: boolean;
		patternId?: string | null;
		trackId?: string | null;
		onAddChild?: (event: CustomEvent<{ type: 'addChild', node: PatternNode }>) => void;
		onDelete?: (event: CustomEvent<{ type: 'delete', node: PatternNode }>) => void;
		onEdit?: (event: CustomEvent<{ type: 'edit', node: PatternNode }>) => void;
		onCopy?: (event: CustomEvent<{ type: 'copy', node: PatternNode }>) => void;
	} = $props();

	function handleAddChild(e: MouseEvent) {
		e.stopPropagation();
		e.stopImmediatePropagation();
		if (node && onAddChild) {
			const customEvent = new CustomEvent('action', {
				detail: { type: 'addChild', node },
				bubbles: false,
				cancelable: true
			});
			onAddChild(customEvent);
		}
	}

	function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		e.stopImmediatePropagation();
		if (node && onDelete) {
			const customEvent = new CustomEvent('action', {
				detail: { type: 'delete', node },
				bubbles: false,
				cancelable: true
			});
			onDelete(customEvent);
		}
	}

	function handleEdit(e: MouseEvent) {
		e.stopPropagation();
		e.stopImmediatePropagation();
		if (node && onEdit) {
			const customEvent = new CustomEvent('action', {
				detail: { type: 'edit', node },
				bubbles: false,
				cancelable: true
			});
			onEdit(customEvent);
		}
	}

	function handleCopy(e: MouseEvent) {
		e.stopPropagation();
		e.stopImmediatePropagation();
		if (node && onCopy) {
			const customEvent = new CustomEvent('action', {
				detail: { type: 'copy', node },
				bubbles: false,
				cancelable: true
			});
			onCopy(customEvent);
		}
	}
</script>

<div 
	bind:this={contextMenuElement}
	class="context-menu" 
	style="left: {x}px; top: {y}px; pointer-events: auto;"
	on:mousedown|stopPropagation
	on:click|stopPropagation
	on:mouseup|stopPropagation
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

