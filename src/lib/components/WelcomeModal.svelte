<script lang="ts">
	const { isOpen = false }: { isOpen?: boolean } = $props();

	function handleUnderstand() {
		// Reload the page when user clicks "I understand"
		if (typeof window !== 'undefined') {
			window.location.reload();
		}
	}

	// Close on Escape key (but don't reload)
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			// Don't close on Escape - user must click "I understand" to proceed
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
		<div class="modal-content" on:click|stopPropagation>
			<h2 id="modal-title" class="modal-title">Welcome to DAWDUCTION</h2>
			
			<div class="modal-body">
				<p class="intro-text">
					Here's how to get started:
				</p>
				
				<div class="info-section">
					<h3>Making Patterns</h3>
					<ul>
						<li>Click <strong>"+ New Pattern"</strong> in the pattern sidebar to create a new pattern</li>
						<li>Click on a pattern to open the pattern editor</li>
						<li>In the pattern editor, you can add instruments, create tree-based rhythms, and adjust velocities and pitches</li>
					</ul>
				</div>

				<div class="info-section">
					<h3>Instrument Tree Structure</h3>
					<ul>
						<li>Instruments use a <strong>tree-based structure</strong> where nodes represent time divisions</li>
						<li>The <strong>root node</strong> defines the total instrument length in beats</li>
						<li><strong>Child nodes</strong> subdivide time proportionally based on their division values</li>
						<li>Each node can have its own <strong>velocity</strong> and <strong>pitch</strong> settings</li>
						<li>This allows you to create complex <strong>polyrhythmic instruments</strong> of any length</li>
						<li>You can add multiple <strong>instruments</strong> to a pattern, each with its own tree structure</li>
					</ul>
				</div>

				<div class="info-section">
					<h3>Arranging Patterns</h3>
					<ul>
						<li>Drag patterns from the sidebar onto the timeline to place them</li>
						<li>Drag clips to move them, or drag the edges to resize them</li>
						<li>Right click on a clip or track to delete it</li>
					</ul>
				</div>

				<div class="info-section">
					<h3>Effects & Envelopes</h3>
					<ul>
						<li>Create effects and envelopes in the pattern sidebar</li>
						<li>Drag them onto the effects/envelope tracks to apply them to your arrangement</li>
						<li>Click on effect/envelope clips to adjust their properties</li>
						<li>Create automation curves by clicking the curve tool when selecting an effect clip</li>
					</ul>
				</div>
			</div>

			<div class="modal-footer">
				<button class="understand-button" on:click={handleUnderstand}>
					I UNDERSTAND
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		padding: 1rem;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 12px;
		width: 100%;
		max-width: 600px;
		max-height: calc(100vh - 2rem);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		position: relative;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-title {
		text-align: center;
		font-size: 22px;
		font-weight: 700;
		color: #e8e8e8;
		margin: 0;
		padding: 20px 24px 12px 24px;
	}

	.modal-body {
		padding: 0 24px 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		flex: 1;
		overflow-y: auto;
	}

	.intro-text {
		color: #b8b8b8;
		line-height: 1.5;
		margin: 0 0 4px 0;
		font-size: 14px;
		text-align: center;
	}

	.info-section {
		background: rgba(131, 131, 131, 0.068);
		border: 1px solid rgba(60, 79, 100, 0.24);
		border-radius: 6px;
		padding: 10px 14px;
	}

	.info-section h3 {
		margin: 0 0 6px 0;
		color: #7ab8ff;
		font-size: 15px;
		font-weight: 600;
	}

	.info-section ul {
		margin: 0;
		padding-left: 18px;
		color: #e8e8e8;
		line-height: 1.5;
	}

	.info-section li {
		margin-bottom: 4px;
		font-size: 13px;
	}

	.info-section li:last-child {
		margin-bottom: 0;
	}

	.info-section strong {
		color: #7ab8ff;
	}

	.modal-footer {
		display: flex;
		justify-content: center;
		padding: 16px 24px 20px 24px;
		flex-shrink: 0;
	}

	.understand-button {
		background: #7ab8ff;
		color: #0f0f0f;
		border: none;
		padding: 12px 32px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 15px;
		font-weight: 600;
		transition: all 0.2s ease;
		min-width: 180px;
	}

	.understand-button:hover {
		background: #9ac8ff;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(122, 184, 255, 0.3);
	}

	.understand-button:active {
		transform: translateY(0);
	}
</style>

