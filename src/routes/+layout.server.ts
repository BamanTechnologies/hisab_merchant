import type { LayoutServerLoad } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantAppContext } from '$lib/merchantContext.server';

/**
 * Resolve merchant → branch → company once for the session navigation tree.
 * Child `+page.server.ts` files use `await parent()` to read `merchantContext` and avoid
 * repeating the same Hasura round trips on every route.
 */
export const load: LayoutServerLoad = async ({ request }) => {
  const merchantId = getUserIdFromRequest(request);

  if (!merchantId) {
    return { merchantContext: null };
  }

  const merchantContext = await fetchMerchantAppContext(merchantId);

  return { merchantContext };
};
