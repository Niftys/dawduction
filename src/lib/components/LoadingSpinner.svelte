<script lang="ts">
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let message: string | null = null;
	
	$: sizeClass = `spinner-${size}`;
</script>

<div class="loading-spinner-container">
	<div class="loading-spinner {sizeClass}">
		<div class="spinner-ring"></div>
		<div class="spinner-ring"></div>
		<div class="spinner-ring"></div>
	</div>
	{#if message}
		<div class="loading-message">{message}</div>
	{/if}
</div>

<style>
	.loading-spinner-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
	}

	.loading-spinner {
		position: relative;
		display: inline-block;
	}

	.spinner-small {
		width: 24px;
		height: 24px;
	}

	.spinner-medium {
		width: 40px;
		height: 40px;
	}

	.spinner-large {
		width: 64px;
		height: 64px;
	}

	.spinner-ring {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border: 3px solid transparent;
		border-top-color: #7ab8ff;
		border-radius: 50%;
		animation: spinner-rotate 1s linear infinite;
	}

	.spinner-ring:nth-child(1) {
		animation-delay: 0s;
		opacity: 1;
	}

	.spinner-ring:nth-child(2) {
		animation-delay: 0.2s;
		opacity: 0.7;
		border-top-color: #5a9fff;
	}

	.spinner-ring:nth-child(3) {
		animation-delay: 0.4s;
		opacity: 0.5;
		border-top-color: #3a7fff;
	}

	.loading-message {
		color: #b0b0b0;
		font-size: 14px;
		text-align: center;
		max-width: 300px;
	}

	@keyframes spinner-rotate {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
</style>

