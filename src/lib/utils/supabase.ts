import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Initialize Supabase client
// This creates a singleton instance that can be reused across the app
export const supabase = createClient(
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY,
	{
		auth: {
			// Persist session in localStorage
			persistSession: true,
			// Auto-refresh session
			autoRefreshToken: true,
			// Detect session from URL (for OAuth callbacks)
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

