import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	// This page handles OAuth callbacks from Supabase
	// After successful OAuth, Supabase redirects here with a code
	// The Supabase client will automatically handle the code exchange
	
	// Check if there's an error in the URL
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');
	
	if (error) {
		// Redirect to login with error
		throw redirect(302, `/login?error=${encodeURIComponent(errorDescription || error)}`);
	}
	
	// If successful, redirect to home
	// The session will be automatically set by Supabase client
	throw redirect(302, '/');
};

