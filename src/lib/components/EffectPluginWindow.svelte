<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { effectPluginStore, type OpenEffectPluginWindow } from '$lib/stores/effectPluginStore';
	import { projectStore } from '$lib/stores/projectStore';
	import type { Effect } from '$lib/types/effects';
	import EqualizerPlugin from './effectPlugins/EqualizerPlugin.svelte';
	import '$lib/styles/components/SynthPluginWindow.css';

	const { window }: { window: OpenEffectPluginWindow } = $props();
	
	// Alias to avoid conflict with global window object in template
	const pluginWindow = $derived(window);

	let project: any;
	projectStore.subscribe((p) => (project = p));

	let windowElement: HTMLDivElement;
	let headerElement: HTMLDivElement;
	let isDragging = $state(false);
	let dragOffset = { x: 0, y: 0 };
	let position = $state({ x: 100, y: 100 }); // Default position

	// Get the active effect
	const activeEffect = $derived(() => {
		if (!project || !pluginWindow) return null;
		return project.effects?.find((e: Effect) => e.id === pluginWindow.effectId) || null;
	});

	function handleHeaderMouseDown(e: MouseEvent) {
		if (!headerElement || !windowElement) return;
		isDragging = true;
		const rect = windowElement.getBoundingClientRect();
		dragOffset.x = e.clientX - rect.left;
		dragOffset.y = e.clientY - rect.top;
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || !windowElement) return;
		position.x = e.clientX - dragOffset.x;
		position.y = e.clientY - dragOffset.y;
		
		// Constrain to viewport
		const maxX = globalThis.window.innerWidth - windowElement.offsetWidth;
		const maxY = globalThis.window.innerHeight - windowElement.offsetHeight;
		position.x = Math.max(0, Math.min(maxX, position.x));
		position.y = Math.max(0, Math.min(maxY, position.y));
		
		windowElement.style.left = `${position.x}px`;
		windowElement.style.top = `${position.y}px`;
	}

	function handleMouseUp() {
		isDragging = false;
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	}

	function closeWindow() {
		effectPluginStore.closeWindow(window.id);
	}

	onMount(() => {
		// Load saved position from localStorage if available
		const saved = localStorage.getItem(`effectPlugin:${window.id}`);
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				position = { x: parsed.x || 100, y: parsed.y || 100 };
			} catch (e) {
				// Ignore parse errors
			}
		}
	});

	onDestroy(() => {
		// Save position to localStorage
		if (windowElement) {
			const rect = windowElement.getBoundingClientRect();
			localStorage.setItem(`effectPlugin:${window.id}`, JSON.stringify({
				x: rect.left,
				y: rect.top
			}));
		}
		handleMouseUp();
	});
</script>

<div
	class="synth-plugin-window"
	bind:this={windowElement}
	style="left: {position.x}px; top: {position.y}px;"
	class:dragging={isDragging}
>
	<div
		class="plugin-header"
		bind:this={headerElement}
		role="button"
		tabindex="0"
		aria-label="Plugin window header - drag to move"
		on:mousedown={handleHeaderMouseDown}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
			}
		}}
		style="border-color: {activeEffect?.color || '#7ab8ff'};"
	>
		<div class="plugin-title">
			<span class="plugin-icon">🎚️</span>
			<span class="plugin-name">{pluginWindow.label}</span>
		</div>
		<button class="plugin-close" on:click={closeWindow} title="Close">×</button>
	</div>
	
	<div class="plugin-content">
		{#if pluginWindow.effectType === 'equalizer'}
			<EqualizerPlugin 
				key={pluginWindow.id} 
				selectedEffect={activeEffect} 
				effectId={pluginWindow.effectId}
			/>
		{:else}
			<div style="padding: 20px; color: #b8b8b8; text-align: center;">
				Loading effect data...
			</div>
		{/if}
	</div>
</div>

