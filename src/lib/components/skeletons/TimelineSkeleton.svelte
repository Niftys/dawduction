<div class="timeline-skeleton">
	<div class="skeleton-ruler">
		<div class="skeleton-ruler-mark"></div>
		<div class="skeleton-ruler-mark"></div>
		<div class="skeleton-ruler-mark"></div>
		<div class="skeleton-ruler-mark"></div>
		<div class="skeleton-ruler-mark"></div>
	</div>
	<div class="skeleton-tracks">
		<div class="skeleton-track">
			<div class="skeleton-track-header"></div>
			<div class="skeleton-track-content">
				<div class="skeleton-clip"></div>
				<div class="skeleton-clip"></div>
			</div>
		</div>
		<div class="skeleton-track">
			<div class="skeleton-track-header"></div>
			<div class="skeleton-track-content">
				<div class="skeleton-clip"></div>
			</div>
		</div>
		<div class="skeleton-track">
			<div class="skeleton-track-header"></div>
			<div class="skeleton-track-content"></div>
		</div>
	</div>
</div>

<style>
	.timeline-skeleton {
		width: 100%;
		height: 100%;
		background: #1a1a1a;
		display: flex;
		flex-direction: column;
	}

	.skeleton-ruler {
		height: 40px;
		background: #222;
		border-bottom: 1px solid #333;
		display: flex;
		align-items: center;
		padding: 0 20px;
		gap: 40px;
	}

	.skeleton-ruler-mark {
		width: 40px;
		height: 16px;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0.05) 0%,
			rgba(255, 255, 255, 0.1) 50%,
			rgba(255, 255, 255, 0.05) 100%
		);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.5s ease-in-out infinite;
		border-radius: 2px;
	}

	.skeleton-tracks {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.skeleton-track {
		display: flex;
		border-bottom: 1px solid #333;
		min-height: 80px;
	}

	.skeleton-track-header {
		width: 200px;
		background: #222;
		border-right: 1px solid #333;
		display: flex;
		align-items: center;
		padding: 0 16px;
	}

	.skeleton-track-header::before {
		content: '';
		width: 80%;
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

	.skeleton-track-content {
		flex: 1;
		background: #1a1a1a;
		display: flex;
		align-items: center;
		padding: 0 20px;
		gap: 20px;
		position: relative;
	}

	.skeleton-clip {
		width: 120px;
		height: 50px;
		background: linear-gradient(
			90deg,
			rgba(122, 184, 255, 0.1) 0%,
			rgba(122, 184, 255, 0.2) 50%,
			rgba(122, 184, 255, 0.1) 100%
		);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.5s ease-in-out infinite;
		border-radius: 4px;
		border: 1px solid rgba(122, 184, 255, 0.2);
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

