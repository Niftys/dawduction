<script lang="ts">
	let {
		isOpen = $bindable(false),
		onClose,
		onEnter
	}: {
		isOpen?: boolean;
		onClose?: () => void;
		onEnter?: () => void;
	} = $props();

	function closeModal() {
		isOpen = false;
		onClose?.();
	}

	function handleEnterSandbox() {
		onEnter?.();
		closeModal();
	}

	// Close on Escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			closeModal();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="modal-overlay" on:click={closeModal} on:keydown={(e) => e.key === 'Escape' && closeModal()}>
		<div class="modal-content" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<button class="close-button" on:click={closeModal} aria-label="Close modal">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>

			<div class="modal-icon">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</div>

			<h2 id="modal-title" class="modal-title">Sandbox Mode</h2>
			
			<div class="modal-body">
				<p class="warning-text">
					You're about to enter <strong>Sandbox Mode</strong> - a read-only environment where you can explore the editor without an account.
				</p>
				
				<div class="info-box">
					<h3>⚠️ Important:</h3>
					<ul>
						<li>Your work will <strong>NOT be saved</strong></li>
						<li>Projects cannot be exported or persisted</li>
						<li>All changes will be lost when you close the browser</li>
					</ul>
				</div>

				<p class="account-prompt">
					To save your work and access all features, please <strong>create an account</strong> by clicking "Sign In" on the home page.
				</p>
			</div>

			<div class="modal-footer">
				<button class="cancel-button" on:click={closeModal}>
					Cancel
				</button>
				<button class="enter-button" on:click={handleEnterSandbox}>
					Enter Sandbox
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
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 2rem;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 12px;
		width: 100%;
		max-width: 500px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		position: relative;
		display: flex;
		flex-direction: column;
	}

	.close-button {
		position: absolute;
		top: 16px;
		right: 16px;
		background: transparent;
		border: none;
		color: #b8b8b8;
		cursor: pointer;
		padding: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.2s ease;
		z-index: 1;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #e8e8e8;
	}

	.modal-icon {
		display: flex;
		justify-content: center;
		margin-top: 32px;
		margin-bottom: 16px;
		color: #ffc107;
	}

	.modal-title {
		text-align: center;
		font-size: 24px;
		font-weight: 700;
		color: #e8e8e8;
		margin: 0 0 24px 0;
		padding: 0 32px;
	}

	.modal-body {
		padding: 0 32px 32px 32px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.warning-text {
		color: #b8b8b8;
		line-height: 1.6;
		margin: 0;
		font-size: 15px;
	}

	.warning-text strong {
		color: #ffc107;
	}

	.info-box {
		background: rgba(255, 193, 7, 0.1);
		border: 1px solid rgba(255, 193, 7, 0.3);
		border-radius: 8px;
		padding: 16px;
	}

	.info-box h3 {
		margin: 0 0 12px 0;
		color: #ffc107;
		font-size: 16px;
		font-weight: 600;
	}

	.info-box ul {
		margin: 0;
		padding-left: 20px;
		color: #e8e8e8;
		line-height: 1.8;
	}

	.info-box li {
		margin-bottom: 8px;
	}

	.info-box li:last-child {
		margin-bottom: 0;
	}

	.info-box strong {
		color: #ff6b6b;
	}

	.account-prompt {
		color: #b8b8b8;
		line-height: 1.6;
		margin: 0;
		font-size: 14px;
		text-align: center;
	}

	.account-prompt strong {
		color: #7ab8ff;
	}

	.modal-footer {
		display: flex;
		gap: 12px;
		padding: 0 32px 32px 32px;
		justify-content: flex-end;
	}

	.cancel-button {
		background: transparent;
		color: #b8b8b8;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 12px 24px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.cancel-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #e8e8e8;
		border-color: rgba(255, 255, 255, 0.3);
	}

	.enter-button {
		background: #ffc107;
		color: #0f0f0f;
		border: none;
		padding: 12px 24px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.enter-button:hover {
		background: #ffd54f;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(255, 193, 7, 0.3);
	}
</style>

