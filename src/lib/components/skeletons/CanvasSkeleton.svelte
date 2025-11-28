<div class="canvas-skeleton">
	<div class="skeleton-grid"></div>
	<div class="skeleton-nodes">
		<div class="skeleton-node skeleton-node-large"></div>
		<div class="skeleton-node"></div>
		<div class="skeleton-node"></div>
		<div class="skeleton-node"></div>
		<div class="skeleton-node"></div>
	</div>
</div>

<style>
	.canvas-skeleton {
		width: 100%;
		height: 100%;
		background: #1a1a1a;
		position: relative;
		overflow: hidden;
	}

	.skeleton-grid {
		position: absolute;
		inset: 0;
		background-image: 
			linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
		background-size: 50px 50px;
		opacity: 0.5;
	}

	.skeleton-nodes {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 40px;
		flex-wrap: wrap;
	}

	.skeleton-node {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: linear-gradient(
			90deg,
			rgba(122, 184, 255, 0.1) 0%,
			rgba(122, 184, 255, 0.2) 50%,
			rgba(122, 184, 255, 0.1) 100%
		);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.5s ease-in-out infinite;
		border: 1px solid rgba(122, 184, 255, 0.2);
	}

	.skeleton-node-large {
		width: 100px;
		height: 100px;
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

