import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Validate environment variables
const url = PUBLIC_SUPABASE_URL || '';
const key = PUBLIC_SUPABASE_ANON_KEY || '';

if (!url || !key) {
	console.error('Missing Supabase environment variables!');
	console.error('PUBLIC_SUPABASE_URL:', url ? 'Set' : 'Missing');
	console.error('PUBLIC_SUPABASE_ANON_KEY:', key ? 'Set' : 'Missing');
}

// Initialize Supabase client
// Only enable browser-specific features when in browser
export const supabase: SupabaseClient = createClient(
	url || 'https://placeholder.supabase.co',
	key || 'placeholder-key',
	{
		auth: {
			// Persist session in localStorage (browser only)
			persistSession: browser,
			// Auto-refresh session (browser only)
			autoRefreshToken: browser,
			// Detect session from URL (for OAuth callbacks, browser only)
			detectSessionInUrl: browser
		}
	}
);

// Helper function to get the current user
export async function getCurrentUser() {
	const {
		data: { user },
		error
	} = await supabase.auth.getUser();
	
	if (error) {
		console.error('Error getting current user:', error);
		return null;
	}
	
	return user;
}

// Helper function to check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
	const user = await getCurrentUser();
	return user !== null;
}

