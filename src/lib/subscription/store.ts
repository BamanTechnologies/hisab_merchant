import { derived, writable } from 'svelte/store';
import { computeSubscriptionSnapshot } from './status';
import type { CompanySubscription, SubscriptionSnapshot } from './types';

export type SubscriptionStoreState = {
	loaded: boolean;
	error: string | null;
	subscription: CompanySubscription | null;
};

const initialState: SubscriptionStoreState = {
	loaded: false,
	error: null,
	subscription: null
};

const state = writable<SubscriptionStoreState>(initialState);

export const subscriptionSnapshot = derived(state, ($state): SubscriptionSnapshot =>
	computeSubscriptionSnapshot($state.subscription)
);

export const subscriptionBlocksMutations = derived(
	[state, subscriptionSnapshot],
	([$state, $snapshot]) => {
		if (!$state.loaded || $state.error) return false;
		return $snapshot.status === 'SUSPENDED';
	}
);

export const subscriptionStore = {
	subscribe: state.subscribe,
	setFromServer(payload: {
		subscription: CompanySubscription | null;
		error: string | null;
		loaded?: boolean;
	}) {
		state.set({
			loaded: payload.loaded ?? true,
			error: payload.error,
			subscription: payload.subscription
		});
	},
	reset() {
		state.set(initialState);
	}
};
