import type { RequestHandler } from './$types';
import { searchProducts } from '$lib/inventory/products.server';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { fetchBranchCompanyId } from '$lib/companyInvestors.server';

export const GET: RequestHandler = async ({ request, url }) => {
  const q = url.searchParams.get('q') ?? '';
  const companyId = url.searchParams.get('companyId') ?? '';
  const branchId = url.searchParams.get('branchId') ?? '';

  if (!companyId) {
    return new Response(JSON.stringify([]), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const resolvedCompanyId = companyId;

  try {
    const products = await searchProducts(resolvedCompanyId, q, {
      limit: 50,
      branchId: branchId || undefined,
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
