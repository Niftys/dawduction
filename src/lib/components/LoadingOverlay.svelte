<script lang="ts">
	import LoadingSpinner from './LoadingSpinner.svelte';
	import { loadingStore } from '$lib/stores/loadingStore';
	import { onMount } from 'svelte';

	$: loadingState = $loadingStore;
	
	// Only show overlay for operations with messages (specific actions)
	// Not for full page loads (which use skeletons)
	$: shouldShow = loadingState.isLoading && loadingState.message;
</script>

{#if shouldShow}
	<div class="loading-overlay" role="status" aria-live="polite" aria-label="Loading">
		<div class="loading-overlay-content">
			<LoadingSpinner size="large" message={loadingState.message} />
		</div>
	</div>
{/if}

<style>
	.loading-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(26, 26, 26, 0.95);
		backdrop-filter: blur(4px);
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.2s ease-in;
	}

	.loading-overlay-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 24px;
		padding: 40px;
		background: rgba(42, 42, 42, 0.9);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>

