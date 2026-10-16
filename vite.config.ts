import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => ({
	plugins: [
		sveltekit({
			// SvelteKit 3 fixes the trusted origin at build time; adapter-node no longer reads ORIGIN.
			paths: {
				origin:
					command === 'build'
						? process.env.APP_ORIGIN ||
							loadEnv(mode, process.cwd(), 'APP_').APP_ORIGIN ||
							'http://127.0.0.1:3000'
						: undefined
			},
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
}));
