import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	// Authentication is checked client-side in the page components
	// Server-side check is difficult with Supabase client-side auth
	// The page components will redirect if not authenticated
	return {};
};

