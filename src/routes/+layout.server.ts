import type { LayoutServerLoad } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantAppContext } from '$lib/merchantContext.server';
import { fetchCompanySubscription } from '$lib/subscription/server';

/**
 * Resolve merchant → branch → company once for the session navigation tree.
 * Loads company subscription for the global warning bar and client store.
 * Page `load` functions may use `await parent()` for `merchantContext`.
 * Form actions must use `subscriptionWriteActionBlockedForRequest(request)`.
 */
export const load: LayoutServerLoad = async ({ request }) => {
  const merchantId = getUserIdFromRequest(request);

  if (!merchantId) {
    return {
      merchantContext: null,
      subscriptionLoad: { subscription: null, error: null, loaded: false },
    };
  }

  const merchantContext = await fetchMerchantAppContext(merchantId);
  const subscriptionLoad = await fetchCompanySubscription(merchantContext.companyId);

  return { merchantContext, subscriptionLoad };
};
