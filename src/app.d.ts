// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { MerchantAppContext } from '$lib/merchantContext.server';
import type { SubscriptionLoadResult } from '$lib/subscription/types';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		interface LayoutData {
			merchantContext: MerchantAppContext | null;
			subscriptionLoad: SubscriptionLoadResult;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
