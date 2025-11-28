<script lang="ts">
	import CanvasSkeleton from './CanvasSkeleton.svelte';
	import SidebarSkeleton from './SidebarSkeleton.svelte';
	import TimelineSkeleton from './TimelineSkeleton.svelte';
	import PatternListSkeleton from './PatternListSkeleton.svelte';
	import { viewStore } from '$lib/stores/viewStore';

	// Allow explicit viewMode prop to override store value
	// Also allow specifying if this is a pattern editor (which uses canvas) vs pattern list view
	export let viewMode: 'arrangement' | 'pattern' | null = null;
	export let isPatternEditor: boolean = false;

	// Use prop if provided, otherwise use store value
	$: effectiveViewMode = viewMode ?? $viewStore;
</script>

<div class="project-skeleton">
	<div class="skeleton-toolbar">
		<div class="skeleton-toolbar-button"></div>
		<div class="skeleton-toolbar-button"></div>
		<div class="skeleton-toolbar-button skeleton-toolbar-button-large"></div>
		<div class="skeleton-toolbar-button"></div>
		<div class="skeleton-toolbar-button"></div>
	</div>
	<div class="skeleton-main">
		<div class="skeleton-sidebar">
			<SidebarSkeleton />
		</div>
		<div class="skeleton-content">
			{#if effectiveViewMode === 'arrangement'}
				<TimelineSkeleton />
			{:else if isPatternEditor}
				<CanvasSkeleton />
			{:else}
				<PatternListSkeleton />
			{/if}
		</div>
	</div>
</div>

<style>
	.project-skeleton {
		width: 100%;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: #1a1a1a;
	}

	.skeleton-toolbar {
		height: 60px;
		background: #222;
		border-bottom: 1px solid #333;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 0 20px;
	}

	.skeleton-toolbar-button {
		width: 80px;
		height: 36px;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.05) 0%,
			rgba(255, 255, 255, 0.1) 50%,
			rgba(255, 255, 255, 0.05) 100%
		);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.5s ease-in-out infinite;
		border-radius: 4px;
	}

	.skeleton-toolbar-button-large {
		width: 120px;
	}

	.skeleton-main {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.skeleton-sidebar {
		width: 280px;
		border-right: 1px solid #333;
	}

	.skeleton-content {
		flex: 1;
		overflow: hidden;
	}

	@keyframes skeleton-shimmer {
		0% {
			background-position: -200% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}
</style>

