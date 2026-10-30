import { config, getGraphQLHeaders } from "$lib/config";
import { getMerchantIdFromRequest } from "$lib/auth";
import { fetchMerchantAppContext } from "$lib/merchantContext.server";
import { SUBSCRIPTION_BLOCKED_MESSAGE } from "./status";
import type { CompanySubscription, SubscriptionLoadResult } from "./types";

const GET_COMPANY_SUBSCRIPTION_QUERY = `
  query GetCompanySubscription($companyId: uuid!) {
    companies_by_pk(id: $companyId) {
      has_active_subscription
    }
    subscriptions: billing_subscriptions(
      where: {company_id: {_eq: $companyId}}
      order_by: {end_date: desc}
      limit: 1
    ) {
    id
    company_id
    start_date
    end_date
    plan_pricing: pricing_plan_frequency_price {
      price
      billing_cycle: frequency
      id
      plan: pricing_plan {
        id
        name
      }
    }
  }
  }
`;

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
    headers: getGraphQLHeaders(),
    body: JSON.stringify({ query, variables }),
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
  companyId: string | null | undefined,
): Promise<SubscriptionLoadResult> {
  if (!companyId) {
    return {
      subscription: null,
      hasActiveSubscription: null,
      error: null,
      loaded: true,
    };
  }

  try {
    const data = await gql<{
      companies_by_pk: { has_active_subscription: boolean | null } | null;
      subscriptions: CompanySubscription[];
    }>(GET_COMPANY_SUBSCRIPTION_QUERY, { companyId });

    return {
      subscription: data.subscriptions?.[0] ?? null,
      hasActiveSubscription:
        data.companies_by_pk?.has_active_subscription ?? null,
      error: null,
      loaded: true,
    };
  } catch (error) {
    return {
      subscription: null,
      hasActiveSubscription: null,
      error:
        error instanceof Error ? error.message : "Failed to load subscription",
      loaded: true,
    };
  }
}

function subscriptionActionBlockedResult(): {
  success: false;
  message: string;
} {
  return { success: false, message: SUBSCRIPTION_BLOCKED_MESSAGE };
}

function subscriptionWriteActionBlocked(
  load: SubscriptionLoadResult,
): { success: false; message: string } | null {
  if (!load.loaded || load.error) return null;
  if (load.subscription && load.hasActiveSubscription !== false) return null;
  return subscriptionActionBlockedResult();
}

async function fetchSubscriptionLoadForRequest(
  request: Request,
): Promise<SubscriptionLoadResult> {
  const merchantId = getMerchantIdFromRequest(request);
  if (!merchantId) {
    return {
      subscription: null,
      hasActiveSubscription: null,
      error: null,
      loaded: true,
    };
  }

  const { companyId } = await fetchMerchantAppContext(merchantId);
  return fetchCompanySubscription(companyId);
}

/** Guard for form actions — load subscription from the request (actions cannot use `parent()`). */
export async function subscriptionWriteActionBlockedForRequest(
  request: Request,
): Promise<{ success: false; message: string } | null> {
  const load = await fetchSubscriptionLoadForRequest(request);
  return subscriptionWriteActionBlocked(load);
}
