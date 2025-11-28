<script lang="ts">
	import LoadingSpinner from './LoadingSpinner.svelte';
	
	export let message: string | null = null;
</script>

<div class="loading-screen">
	<div class="loading-screen-content">
		<LoadingSpinner size="large" message={message} />
	</div>
</div>

<style>
	.loading-screen {
		width: 100%;
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #1a1a1a;
	}

	.loading-screen-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 24px;
		padding: 40px;
	}
</style>

