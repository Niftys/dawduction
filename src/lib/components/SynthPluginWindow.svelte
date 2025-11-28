<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { synthPluginStore, type OpenSynthPluginWindow } from '$lib/stores/synthPluginStore';
	import { projectStore } from '$lib/stores/projectStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import PadSynthPlugin from './synthPlugins/PadSynthPlugin.svelte';
	import OrganSynthPlugin from './synthPlugins/OrganSynthPlugin.svelte';
	import '$lib/styles/components/SynthPluginWindow.css';

	export let window: OpenSynthPluginWindow;
	
	// Alias to avoid conflict with global window object in template
	// Use reactive statement to keep it in sync with the prop
	$: pluginWindow = window;

	let project: any;
	projectStore.subscribe((p) => (project = p));
	

	let windowElement: HTMLDivElement;
	let headerElement: HTMLDivElement;
	let isDragging = false;
	let dragOffset = { x: 0, y: 0 };
	let position = { x: 100, y: 100 }; // Default position

	// Get the active instrument/track
	$: activeItem = (() => {
		if (!project || !pluginWindow) return null;
		
		if (pluginWindow.trackId) {
			return project.standaloneInstruments?.find((i: any) => i.id === pluginWindow.trackId) || null;
		}
		
		if (pluginWindow.patternId && pluginWindow.instrumentId) {
			const pattern = project.patterns?.find((p: any) => p.id === pluginWindow.patternId);
			if (pattern) {
				const instruments = pattern.instruments && Array.isArray(pattern.instruments) && pattern.instruments.length > 0
					? pattern.instruments
					: (pattern.instrumentType && pattern.patternTree ? [{
						id: pattern.id,
						instrumentType: pattern.instrumentType,
						patternTree: pattern.patternTree,
						settings: pattern.settings || {},
						instrumentSettings: pattern.instrumentSettings,
						color: pattern.color || '#7ab8ff',
						volume: pattern.volume ?? 1.0,
						pan: pattern.pan ?? 0.0,
						mute: pattern.mute,
						solo: pattern.solo
					}] : []);
				return instruments.find((inst: any) => inst.id === pluginWindow.instrumentId) || instruments[0] || null;
			}
		}
		
		return null;
	})();

	$: trackSettings = activeItem?.settings || {};
	
	// Pre-compute values for template to avoid using reactive statement in complex expressions
	$: selectedTrackForPlugin = pluginWindow.trackId ? project?.standaloneInstruments?.find((i: any) => i.id === pluginWindow.trackId) : undefined;
	$: selectedPatternForPlugin = pluginWindow.patternId ? project?.patterns?.find((p: any) => p.id === pluginWindow.patternId) : undefined;

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
		
		// Constrain to viewport - use globalThis.window to avoid conflict with prop name
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
		synthPluginStore.closeWindow(window.id);
	}

	onMount(() => {
		// Load saved position from localStorage if available
		const saved = localStorage.getItem(`synthPlugin:${window.id}`);
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
			localStorage.setItem(`synthPlugin:${window.id}`, JSON.stringify({
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
		style="border-color: {activeItem?.color || '#7ab8ff'};"
	>
		<div class="plugin-title">
			<span class="plugin-icon">{pluginWindow.instrumentType === 'pad' ? '🎹' : '🎹'}</span>
			<span class="plugin-name">{pluginWindow.label}</span>
		</div>
		<button class="plugin-close" on:click={closeWindow} title="Close">×</button>
	</div>
	
	<div class="plugin-content">
		{#if activeItem}
			{#if pluginWindow.instrumentType === 'pad'}
				<PadSynthPlugin
					selectedTrack={selectedTrackForPlugin}
					selectedPattern={selectedPatternForPlugin}
					selectedInstrument={activeItem}
					{trackSettings}
				/>
			{:else if pluginWindow.instrumentType === 'organ'}
				<OrganSynthPlugin
					selectedTrack={selectedTrackForPlugin}
					selectedPattern={selectedPatternForPlugin}
					selectedInstrument={activeItem}
					{trackSettings}
				/>
			{/if}
		{:else}
			<div style="padding: 20px; color: #b8b8b8; text-align: center;">
				Loading instrument data...
			</div>
		{/if}
	</div>
</div>

