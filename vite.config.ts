import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		fs: {
			allow: ['.']
		}
	},
	worker: {
		format: 'es'
	},
	define: {
		// Polyfill Node.js globals for browser compatibility
		global: 'globalThis',
		'process.env': '{}',
		// Polyfill __dirname and __filename for libflacjs
		'__dirname': '"/"',
		'__filename': '""'
	},
	optimizeDeps: {
		exclude: ['lamejs'] // Exclude from optimization - will be loaded dynamically
	}
});

