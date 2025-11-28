<script lang="ts">
	import { supabase } from '$lib/utils/supabase';
	import { loadingStore } from '$lib/stores/loadingStore';
	import { createEventDispatcher } from 'svelte';

	export let isOpen = false;

	const dispatch = createEventDispatcher();

	let isSignIn = true; // Toggle between sign in and sign up
	let email = '';
	let password = '';
	let confirmPassword = '';
	let username = '';
	let error = '';
	let loading = false;

	function closeModal() {
		isOpen = false;
		dispatch('close');
		// Reset form
		email = '';
		password = '';
		confirmPassword = '';
		username = '';
		error = '';
		isSignIn = true;
	}

	function toggleMode() {
		isSignIn = !isSignIn;
		error = '';
		email = '';
		password = '';
		confirmPassword = '';
		username = '';
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;
		loadingStore.startLoading(isSignIn ? 'Signing in...' : 'Creating account...');

		try {
			if (isSignIn) {
				// Sign in
				const { data, error: authError } = await supabase.auth.signInWithPassword({
					email,
					password
				});

				if (authError) throw authError;

				if (data.user) {
					closeModal();
					dispatch('success');
				}
			} else {
				// Sign up
				// Validation
				if (password !== confirmPassword) {
					error = 'Passwords do not match';
					loading = false;
					loadingStore.stopLoading();
					return;
				}

				if (password.length < 6) {
					error = 'Password must be at least 6 characters';
					loading = false;
					loadingStore.stopLoading();
					return;
				}

				if (!username || username.length < 3) {
					error = 'Username must be at least 3 characters';
					loading = false;
					loadingStore.stopLoading();
					return;
				}

				if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
					error = 'Username can only contain letters, numbers, hyphens, and underscores';
					loading = false;
					loadingStore.stopLoading();
					return;
				}

				const { data, error: authError } = await supabase.auth.signUp({
					email,
					password,
					options: {
						data: {
							username: username
						}
					}
				});

				if (authError) throw authError;

				if (data.user) {
					closeModal();
					dispatch('success');
				}
			}
		} catch (err: any) {
			// Handle network/CORS errors with user-friendly messages
			if (err?.name === 'AuthRetryableFetchError' || err?.message?.includes('NetworkError') || err?.message?.includes('CORS')) {
				error = 'Network error. Please check your internet connection and try again.';
			} else {
				error = err.message || (isSignIn ? 'Failed to sign in' : 'Failed to create account');
			}
			// Only log non-network errors
			if (err?.name !== 'AuthRetryableFetchError') {
				console.error('Auth error:', err);
			}
		} finally {
			loading = false;
			loadingStore.stopLoading();
		}
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

			<h2 id="modal-title" class="modal-title">{isSignIn ? 'Sign In' : 'Sign Up'}</h2>
			<p class="modal-subtitle">
				{isSignIn ? 'Sign in to access your projects' : 'Create an account to save your projects'}
			</p>

			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			<form on:submit={handleSubmit}>
				{#if !isSignIn}
					<div class="form-group">
						<label for="username">Username</label>
						<input
							id="username"
							type="text"
							bind:value={username}
							required
							disabled={loading}
							placeholder="username"
							title="Letters, numbers, hyphens, and underscores only"
						/>
					</div>
				{/if}

				<div class="form-group">
					<label for="email">Email</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						disabled={loading}
						placeholder="your@email.com"
					/>
				</div>

				<div class="form-group">
					<label for="password">Password</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						required
						disabled={loading}
						placeholder="••••••••"
						minlength="6"
					/>
				</div>

				{#if !isSignIn}
					<div class="form-group">
						<label for="confirmPassword">Confirm Password</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							required
							disabled={loading}
							placeholder="••••••••"
							minlength="6"
						/>
					</div>
				{/if}

				<button type="submit" class="submit-button" disabled={loading}>
					{loading ? (isSignIn ? 'Signing in...' : 'Creating account...') : (isSignIn ? 'Sign In' : 'Sign Up')}
				</button>
			</form>

			<div class="auth-footer">
				<p>
					{isSignIn ? "Don't have an account? " : 'Already have an account? '}
					<button type="button" class="toggle-link" on:click={toggleMode}>
						{isSignIn ? 'Sign up' : 'Sign in'}
					</button>
				</p>
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
		padding: 2rem;
		width: 100%;
		max-width: 420px;
		position: relative;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.close-button {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		padding: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.modal-title {
		margin: 0 0 0.5rem 0;
		font-size: 2rem;
		color: #ffffff;
		font-weight: 600;
	}

	.modal-subtitle {
		margin: 0 0 2rem 0;
		color: #888;
		font-size: 0.9rem;
	}

	.error-message {
		background: #ff4444;
		color: white;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.form-group {
		margin-bottom: 1.25rem;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		color: #e0e0e0;
		font-size: 0.9rem;
		font-weight: 500;
	}

	input {
		width: 100%;
		padding: 0.75rem;
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 4px;
		color: #ffffff;
		font-size: 1rem;
		box-sizing: border-box;
	}

	input:focus {
		outline: none;
		border-color: #00ffff;
	}

	input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.submit-button {
		width: 100%;
		padding: 0.75rem;
		background: #ff5f5f;
		color: #0f0f0f;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
		margin-top: 0.5rem;
	}

	.submit-button:hover:not(:disabled) {
		background: #ff4444;
	}

	.submit-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.auth-footer {
		margin-top: 1.5rem;
		text-align: center;
		color: #888;
		font-size: 0.9rem;
	}

	.toggle-link {
		background: none;
		border: none;
		color: #00ffff;
		cursor: pointer;
		text-decoration: underline;
		padding: 0;
		font-size: inherit;
	}

	.toggle-link:hover {
		color: #00cccc;
	}
</style>

