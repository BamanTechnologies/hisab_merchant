import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { fetchBranchCompanyId } from '$lib/companyInvestors.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { buildProductLabel } from '$lib/inventory/productLabel';

const FETCH_PRODUCT_DETAIL_QUERY = `
  query ProductDetail($id: uuid!, $companyId: uuid!) {
    products(
      where: { _and: [{ id: { _eq: $id } }, { company_id: { _eq: $companyId } }] }
      limit: 1
    ) {
      id
      name
      default_unit
      factor
      attributes
      investors
      is_active
      barcode
      qr_code
      created_at
      product_type {
        id
        name
      }
    }
    stock_movements(
      where: { product_id: { _eq: $id } }
      order_by: [{ created_at: desc }, { id: desc }]
      limit: 500
    ) {
      id
      movement_type
      quantity_delta
      unit
      unit_cost
      unit_price
      reference
      reference_type
      note
      created_at
      stock {
        id
        batch_number
      }
    }
    stock(
      where: { product_id: { _eq: $id } }
      order_by: [{ created_at: asc }, { id: asc }]
    ) {
      id
      batch_number
      quantity
      purchased_price
      selling_price
      created_at
      branch
    }
  }
`;

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
	const response = await fetch(config.graphql.endpoint, {
		method: 'POST',
		headers: getGraphQLHeaders(),
		body: JSON.stringify({ query, variables }),
	});

	if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
	const result = await response.json();
	if (result.errors) throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
	return result.data as T;
}

export const load: PageServerLoad = async ({ params, request, parent }) => {
	const { merchantContext } = await parent();
	if (merchantContext && !merchantContext.routeAccess.products) {
		throw redirect(302, '/stocks');
	}
	const merchantId =
		merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
	const merchantBranchId =
		merchantContext?.merchantBranchId ??
		(merchantId ? await fetchMerchantBranchId(merchantId) : null);

	let companyId = merchantContext?.companyId ?? null;
	if (!companyId && merchantBranchId) {
		companyId = await fetchBranchCompanyId(merchantBranchId);
	}

	if (!companyId) throw error(404, 'Product not found');

	const data = await gql<{
		products: Record<string, unknown>[];
		stock_movements: Record<string, unknown>[];
		stock: Record<string, unknown>[];
	}>(FETCH_PRODUCT_DETAIL_QUERY, { id: params.id, companyId });

	const productRaw = data.products?.[0];
	if (!productRaw) throw error(404, 'Product not found');

	const product = {
		...productRaw,
		displayName: buildProductLabel(productRaw as Parameters<typeof buildProductLabel>[0]),
	};

	return {
		product,
		movements: data.stock_movements ?? [],
		batches: data.stock ?? [],
		canViewPurchasePrice: merchantContext?.routeAccess.viewPurchasePrice ?? true,
	};
};
