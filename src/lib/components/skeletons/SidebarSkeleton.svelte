<div class="sidebar-skeleton">
	<div class="skeleton-section">
		<div class="skeleton-title"></div>
		<div class="skeleton-controls">
			<div class="skeleton-control"></div>
			<div class="skeleton-control"></div>
			<div class="skeleton-control"></div>
		</div>
	</div>
	<div class="skeleton-section">
		<div class="skeleton-title"></div>
		<div class="skeleton-list">
			<div class="skeleton-item"></div>
			<div class="skeleton-item"></div>
			<div class="skeleton-item"></div>
		</div>
	</div>
</div>

<style>
	.sidebar-skeleton {
		width: 100%;
		height: 100%;
		background: #1a1a1a;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.skeleton-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.skeleton-title {
		width: 60%;
		height: 20px;
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

	.skeleton-controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-control {
		width: 100%;
		height: 40px;
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

	.skeleton-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-item {
		width: 100%;
		height: 60px;
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

	@keyframes skeleton-shimmer {
		0% {
			background-position: -200% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}
</style>

