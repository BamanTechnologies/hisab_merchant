import type { PageServerLoad } from "./$types";
import { getUserIdFromRequest } from "$lib/auth";
import { config, getGraphQLHeaders } from "$lib/config";
import { fetchBranchCompanyId } from "$lib/companyInvestors.server";

type TransferRow = {
  id: string;
  stock?: string | null;
  destination_stock?: string | null;
  from?: string | null;
  to?: string | null;
  created_by?: string | null;
  destination_merchant?: string | null;
  quantity?: number | string | null;
  created_at?: string | null;
};

type BranchRow = { id: string; name?: string | null };
type MerchantRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
};

const FETCH_TRANSFERS_FOR_MERCHANT_QUERY = `
  query TransfersForMerchant($merchantId: uuid!) {
    transfers(
      where: {
        _or: [
          { created_by: { _eq: $merchantId } }
          { destination_merchant: { _eq: $merchantId } }
        ]
      }
      order_by: [{ created_at: desc }, { id: desc }]
    ) {
      id
      stock
      destination_stock
      from
      to
      created_by
      destination_merchant
      quantity
      created_at
    }
  }
`;

const FETCH_BRANCHES_BY_COMPANY_QUERY = `
  query TransferFilterBranchesByCompany($companyId: uuid!) {
    branches(
      where: { company: { _eq: $companyId } }
      order_by: [{ name: asc }, { id: asc }]
    ) {
      id
      name
    }
  }
`;

const FETCH_MERCHANTS_QUERY = `
  query TransferFilterMerchants {
    merchant(order_by: [{ first_name: asc }, { last_name: asc }, { id: asc }]) {
      id
      first_name
      last_name
    }
  }
`;

async function gqlRequest<T>(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
    headers: getGraphQLHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

export const load: PageServerLoad = async ({ request, url, parent }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  const merchantBranchId = merchantContext?.merchantBranchId ?? null;
  let companyId = merchantContext?.companyId ?? null;
  if (!companyId && merchantBranchId) {
    companyId = await fetchBranchCompanyId(merchantBranchId);
  }

  if (!merchantId) {
    return {
      transfers: [],
      branches: [],
      merchants: [],
      merchantId: null,
    };
  }

  try {
    const [transferData, merchantData] = await Promise.all([
      gqlRequest<{ transfers: TransferRow[] }>(FETCH_TRANSFERS_FOR_MERCHANT_QUERY, {
        merchantId,
      }),
      gqlRequest<{ merchant: MerchantRow[] }>(FETCH_MERCHANTS_QUERY),
    ]);

    const transfers = transferData.transfers ?? [];

    let branches: BranchRow[] = [];
    if (companyId) {
      const branchData = await gqlRequest<{ branches: BranchRow[] }>(
        FETCH_BRANCHES_BY_COMPANY_QUERY,
        { companyId },
      );
      branches = branchData.branches ?? [];
    } else {
      const involvedBranchIds = new Set<string>();
      for (const t of transfers) {
        if (t.from) involvedBranchIds.add(t.from);
        if (t.to) involvedBranchIds.add(t.to);
      }
      branches = Array.from(involvedBranchIds).map((id) => ({ id, name: id }));
    }

    return {
      transfers,
      branches,
      merchants: merchantData.merchant ?? [],
      merchantId,
    };
  } catch (_error) {
    return {
      transfers: [],
      branches: [],
      merchants: [],
      merchantId,
    };
  }
};

