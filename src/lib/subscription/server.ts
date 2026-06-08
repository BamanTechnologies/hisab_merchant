import { config, getGraphQLHeaders } from '$lib/config';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantAppContext } from '$lib/merchantContext.server';
import { isSubscriptionWriteBlocked, SUBSCRIPTION_BLOCKED_MESSAGE } from './status';
import type { CompanySubscription, SubscriptionLoadResult } from './types';

const GET_COMPANY_SUBSCRIPTION_QUERY = `
  query GetCompanySubscription($companyId: uuid!) {
    subscriptions(
      where: {
        company_id: { _eq: $companyId }
      }
      limit: 1
    ) {
      id
      company_id

      trial_started_at
      trial_ends_at

      current_period_start
      current_period_end

      plan_pricing {
        id
        billing_cycle
        price

        plan {
          id
          name
        }
      }
    }
  }
`;

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
	const response = await fetch(config.graphql.endpoint, {
		method: 'POST',
		headers: getGraphQLHeaders(),
		body: JSON.stringify({ query, variables })
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	const result = await response.json();
	if (result.errors) {
		throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
	}

	return result.data as T;
}

export async function fetchCompanySubscription(
	companyId: string | null | undefined
): Promise<SubscriptionLoadResult> {
	if (!companyId) {
		return { subscription: null, error: null, loaded: true };
	}

	try {
		const data = await gql<{
			subscriptions: CompanySubscription[];
		}>(GET_COMPANY_SUBSCRIPTION_QUERY, { companyId });

		return {
			subscription: data.subscriptions?.[0] ?? null,
			error: null,
			loaded: true
		};
	} catch (error) {
		return {
			subscription: null,
			error: error instanceof Error ? error.message : 'Failed to load subscription',
			loaded: true
		};
	}
}

function subscriptionActionBlockedResult(): { success: false; message: string } {
	return { success: false, message: SUBSCRIPTION_BLOCKED_MESSAGE };
}

function subscriptionWriteActionBlocked(
	load: SubscriptionLoadResult
): { success: false; message: string } | null {
	if (!load.loaded || load.error) return null;
	if (!isSubscriptionWriteBlocked(load.subscription)) return null;
	return subscriptionActionBlockedResult();
}

async function fetchSubscriptionLoadForRequest(request: Request): Promise<SubscriptionLoadResult> {
	const merchantId = getUserIdFromRequest(request);
	if (!merchantId) {
		return { subscription: null, error: null, loaded: true };
	}

	const { companyId } = await fetchMerchantAppContext(merchantId);
	return fetchCompanySubscription(companyId);
}

/** Guard for form actions — load subscription from the request (actions cannot use `parent()`). */
export async function subscriptionWriteActionBlockedForRequest(
	request: Request
): Promise<{ success: false; message: string } | null> {
	const load = await fetchSubscriptionLoadForRequest(request);
	return subscriptionWriteActionBlocked(load);
}
