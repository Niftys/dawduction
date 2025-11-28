<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/utils/supabase';
	import { loadingStore } from '$lib/stores/loadingStore';

	let email = '';
	let password = '';
	let confirmPassword = '';
	let username = '';
	let error = '';
	let loading = false;

	async function handleRegister(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		// Validation
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 6) {
			error = 'Password must be at least 6 characters';
			return;
		}

		if (!username || username.length < 3) {
			error = 'Username must be at least 3 characters';
			return;
		}

		// Validate username format (alphanumeric, hyphens, underscores)
		if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
			error = 'Username can only contain letters, numbers, hyphens, and underscores';
			return;
		}

		loading = true;
		loadingStore.startLoading('Creating account...');

		try {
			// Sign up with email/password
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
				// User created successfully
				// The profile will be created automatically by the trigger function
				await goto('/');
			}
		} catch (err: any) {
			error = err.message || 'Failed to create account';
			console.error('Registration error:', err);
		} finally {
			loading = false;
			loadingStore.stopLoading();
		}
	}
</script>

<div class="auth-container">
	<div class="auth-card">
		<h1>Sign Up</h1>
		<p class="subtitle">Create an account to save your projects</p>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		<!-- Email/Password Form -->
		<form on:submit={handleRegister}>
			<div class="form-group">
				<label for="username">Username</label>
				<input
					id="username"
					type="text"
					bind:value={username}
					required
					disabled={loading}
					placeholder="username"
					pattern="[a-zA-Z0-9_-]+"
					title="Letters, numbers, hyphens, and underscores only"
				/>
			</div>

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

			<button type="submit" class="submit-button" disabled={loading}>
				{loading ? 'Creating account...' : 'Sign Up'}
			</button>
		</form>

		<div class="auth-footer">
			<p>
				Already have an account?
				<a href="/login">Sign in</a>
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
</style>

