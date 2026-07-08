import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { fetchBranchCompanyId } from '$lib/companyInvestors.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { FETCH_STOCK_TRANSFER_BY_PK_QUERY } from '$lib/inventory/stockTransfers.server';

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

const FETCH_BRANCH_BY_PK_QUERY = `
  query BranchByPkForStockTransfer($id: uuid!) {
    branches_by_pk(id: $id) {
      id
      name
    }
  }
`;

const FETCH_MERCHANT_BY_PK_QUERY = `
  query MerchantByPkForStockTransfer($id: uuid!) {
    merchant_by_pk(id: $id) {
      id
      first_name
      last_name
    }
  }
`;

async function fetchBranchName(id: string | null): Promise<string | null> {
	if (!id) return null;
	try {
		const data = await gql<{ branches_by_pk: { name?: string | null } | null }>(
			FETCH_BRANCH_BY_PK_QUERY,
			{ id },
		);
		const name = data.branches_by_pk?.name?.trim();
		return name || null;
	} catch {
		return null;
	}
}

async function fetchMerchantName(id: string | null): Promise<string | null> {
	if (!id) return null;
	try {
		const data = await gql<{ merchant_by_pk: { first_name?: string | null; last_name?: string | null } | null }>(
			FETCH_MERCHANT_BY_PK_QUERY,
			{ id },
		);
		const m = data.merchant_by_pk;
		if (!m) return null;
		const full = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
		return full || null;
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ params, request, parent }) => {
	const { merchantContext } = await parent();
	const merchantId =
		merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
	const merchantBranchId =
		merchantContext?.merchantBranchId ??
		(merchantId ? await fetchMerchantBranchId(merchantId) : null);

	let companyId = merchantContext?.companyId ?? null;
	if (!companyId && merchantBranchId) {
		companyId = await fetchBranchCompanyId(merchantBranchId);
	}

	try {
		const data = await gql<{
			stock_transfers_by_pk: Record<string, unknown> | null;
		}>(FETCH_STOCK_TRANSFER_BY_PK_QUERY, { id: params.id });

		const transfer = data.stock_transfers_by_pk;
		if (!transfer) {
			error(404, 'Stock transfer not found');
		}

		const [fromName, toName, creatorName, destMerchantName] = await Promise.all([
			fetchBranchName(String(transfer.from ?? '')),
			fetchBranchName(String(transfer.to ?? '')),
			fetchMerchantName(String(transfer.created_by ?? '')),
			fetchMerchantName(String(transfer.destination_merchant ?? '')),
		]);

		return {
			transfer,
			fromName,
			toName,
			creatorName,
			destMerchantName,
			companyId,
		};
	} catch (err) {
		if ((err as { status?: number }).status === 404) throw err;
		error(500, 'Failed to load stock transfer');
	}
};
