import type { RequestHandler } from './$types';
import { searchProducts } from '$lib/inventory/products.server';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { fetchBranchCompanyId } from '$lib/companyInvestors.server';

export const GET: RequestHandler = async ({ request, url }) => {
  const q = url.searchParams.get('q') ?? '';
  const companyId = url.searchParams.get('companyId') ?? '';
  const branchId = url.searchParams.get('branchId') ?? '';

  const userId = getUserIdFromRequest(request);
  let resolvedBranchId = branchId;
  if (!resolvedBranchId && userId) {
    resolvedBranchId = (await fetchMerchantBranchId(userId)) ?? '';
  }

  if (!companyId || !resolvedBranchId) {
    return new Response(JSON.stringify([]), {
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const products = await searchProducts(companyId, q, {
      limit: 50,
      branchId: resolvedBranchId,
      includeStocks: true,
    });
    return new Response(JSON.stringify(products), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[search products]', err);
    return new Response(JSON.stringify({ error: 'Failed to search products' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
