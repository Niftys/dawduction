<script lang="ts">
	import '../app.css';
	import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
</script>

<main>
	<slot />
</main>

<!-- Global loading overlay - appears for any loading state -->
<LoadingOverlay />

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #1a1a1a;
		color: #e8e8e8;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
			sans-serif;
		overflow: hidden;
	}

	:global(*) {
		box-sizing: border-box;
	}
</style>

