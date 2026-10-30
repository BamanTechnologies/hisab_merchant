import { derived, writable } from 'svelte/store';
import { computeSubscriptionSnapshot } from './status';
import type { CompanySubscription, SubscriptionSnapshot } from './types';

export type SubscriptionStoreState = {
	loaded: boolean;
	error: string | null;
	subscription: CompanySubscription | null;
	hasActiveSubscription: boolean | null;
};

const initialState: SubscriptionStoreState = {
	loaded: false,
	error: null,
	subscription: null,
	hasActiveSubscription: null
};

const state = writable<SubscriptionStoreState>(initialState);

export const subscriptionSnapshot = derived(state, ($state): SubscriptionSnapshot =>
	computeSubscriptionSnapshot(
		$state.subscription,
		$state.hasActiveSubscription,
		new Date(),
		$state.error
	)
);

export const subscriptionBlocksMutations = derived(
	state,
	($state) => {
		if (!$state.loaded || $state.error) return false;
		return $state.hasActiveSubscription === false;
	}
);

export const subscriptionStore = {
	subscribe: state.subscribe,
	setFromServer(payload: {
		subscription: CompanySubscription | null;
		hasActiveSubscription: boolean | null;
		error: string | null;
		loaded?: boolean;
	}) {
		state.set({
			loaded: payload.loaded ?? true,
			error: payload.error,
			subscription: payload.subscription,
			hasActiveSubscription: payload.hasActiveSubscription
		});
	},
	reset() {
		state.set(initialState);
	}
};
