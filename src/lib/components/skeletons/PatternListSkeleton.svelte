<div class="pattern-list-skeleton">
	<div class="skeleton-header">
		<div class="skeleton-title"></div>
		<div class="skeleton-button"></div>
	</div>
	<div class="skeleton-grid">
		<div class="skeleton-card"></div>
		<div class="skeleton-card"></div>
		<div class="skeleton-card"></div>
		<div class="skeleton-card"></div>
	</div>
</div>

<style>
	.pattern-list-skeleton {
		width: 100%;
		height: 100%;
		background: #1a1a1a;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.skeleton-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.skeleton-title {
		width: 120px;
		height: 28px;
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

	.skeleton-button {
		width: 140px;
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

	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 16px;
	}

	.skeleton-card {
		aspect-ratio: 4 / 3;
		background: linear-gradient(
			90deg,
			rgba(122, 184, 255, 0.05) 0%,
			rgba(122, 184, 255, 0.1) 50%,
			rgba(122, 184, 255, 0.05) 100%
		);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.5s ease-in-out infinite;
		border-radius: 8px;
		border: 1px solid rgba(122, 184, 255, 0.1);
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

