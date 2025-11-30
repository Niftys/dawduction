<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/utils/supabase';
	import { loadingStore } from '$lib/stores/loadingStore';
	import { browser } from '$app/environment';

	let email = '';
	let password = '';
	let error = '';
	let loading = false;

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;
		loadingStore.startLoading('Signing in...');

		try {
			const { data, error: authError } = await supabase.auth.signInWithPassword({
				email,
				password
			});

			if (authError) throw authError;

			if (data.user) {
				await goto('/');
			}
		} catch (err: any) {
			error = err.message || 'Failed to sign in';
			console.error('Login error:', err);
		} finally {
			loading = false;
			loadingStore.stopLoading();
		}
	}

	async function handleGoogleSignIn() {
		if (!browser) return;
		
		error = '';
		loading = true;
		loadingStore.startLoading('Signing in with Google...');

		try {
			const redirectUrl = `${window.location.origin}/auth/callback`;
			const { error: authError } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: redirectUrl
				}
			});

			if (authError) throw authError;
			// The redirect will happen automatically
		} catch (err: any) {
			error = err.message || 'Failed to sign in with Google';
			console.error('Google sign-in error:', err);
			loading = false;
			loadingStore.stopLoading();
		}
	}
</script>

<div class="auth-container">
	<div class="auth-card">
		<h1>Sign In</h1>
		<p class="subtitle">Sign in to save and load your projects</p>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		<!-- Google Sign In Button -->
		<button type="button" class="google-button" on:click={handleGoogleSignIn} disabled={loading}>
			<svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
				<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
				<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
				<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
				<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
			</svg>
			Continue with Google
		</button>

		<div class="divider">
			<span>or</span>
		</div>

		<!-- Email/Password Form -->
		<form on:submit={handleLogin}>
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
				/>
			</div>

			<button type="submit" class="submit-button" disabled={loading}>
				{loading ? 'Signing in...' : 'Sign In'}
			</button>
		</form>

		<div class="auth-footer">
			<p>
				Don't have an account?
				<a href="/register">Sign up</a>
			</p>
		</div>
	</div>
</div>

<style>
	.auth-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		background: #0a0a0a;
	}

	.auth-card {
		width: 100%;
		max-width: 400px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 2rem;
	}

	h1 {
		margin: 0 0 0.5rem 0;
		font-size: 2rem;
		color: #ffffff;
		font-weight: 600;
	}

	.subtitle {
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
		background: #00ffff;
		color: #000;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
		margin-top: 0.5rem;
	}

	.submit-button:hover:not(:disabled) {
		background: #00cccc;
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

	.auth-footer a {
		color: #00ffff;
		text-decoration: none;
		margin-left: 0.25rem;
	}

	.auth-footer a:hover {
		text-decoration: underline;
	}

	.google-button {
		width: 100%;
		padding: 0.75rem;
		background: #0a0a0a;
		color: #e8e8e8;
		border: 1px solid #333;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		margin-bottom: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}

	.google-button:hover:not(:disabled) {
		background: #1a1a1a;
		border-color: #00ffff;
		color: #ffffff;
	}

	.google-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.google-icon {
		flex-shrink: 0;
		filter: brightness(0.9);
		transition: filter 0.2s;
	}

	.google-button:hover:not(:disabled) .google-icon {
		filter: brightness(1.1);
	}

	.divider {
		display: flex;
		align-items: center;
		text-align: center;
		margin: 1.5rem 0;
		color: #888;
		font-size: 0.9rem;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		border-bottom: 1px solid #333;
	}

	.divider span {
		padding: 0 1rem;
	}

	/* Responsive tweaks for smaller screens */
	@media (max-width: 768px) {
		.auth-container {
			padding: 1.5rem;
		}

		.auth-card {
			padding: 1.5rem;
		}

		h1 {
			font-size: 1.75rem;
		}
	}

	@media (max-width: 480px) {
		.auth-container {
			padding: 1.25rem 1rem;
		}

		.auth-card {
			padding: 1.5rem 1.25rem;
		}

		h1 {
			font-size: 1.6rem;
		}

		.subtitle {
			font-size: 0.85rem;
		}
	}
</style>

