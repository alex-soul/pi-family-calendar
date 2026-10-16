// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			admin: { pinEnabled: boolean; unlocked: boolean };
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
