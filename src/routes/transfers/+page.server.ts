import type { PageServerLoad, Actions } from "./$types";
import { getUserIdFromRequest } from "$lib/auth";
import { config, getGraphQLHeaders } from "$lib/config";
import { fetchBranchCompanyId } from "$lib/companyInvestors.server";
import { fetchMerchantBranchId } from "$lib/merchantBranch.server";
import { buildStockLabel, type StockLabelInput } from "$lib/stockLabel";
import {
  executeTransfer,
  FETCH_STOCK_TRANSFERS_QUERY,
  planTransfer,
} from "$lib/inventory/stockTransfers.server";
import { subscriptionWriteActionBlockedForRequest } from "$lib/subscription/server";

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

/** Same as client `chosenStockId`: sender → source; receiver → destination or legacy source. */
function transferLinkStockId(
  t: TransferRow,
  merchantId: string,
): string | null {
  const nonEmpty = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };
  const isSender =
    String(t.created_by ?? "").trim() === String(merchantId).trim();
  if (isSender) return nonEmpty(t.stock);
  return nonEmpty(t.destination_stock) ?? nonEmpty(t.stock);
}

function stockRowForLabel(row: Record<string, unknown>): StockLabelInput {
  const pt = row.product_type;
  const product_type =
    pt && typeof pt === "object" && pt !== null && "name" in (pt as object)
      ? String((pt as { name?: unknown }).name ?? "").trim() || null
      : typeof pt === "string"
        ? pt.trim() || null
        : null;
  let attributes: Record<string, unknown> = {};
  const raw = row.attributes;
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    attributes = raw as Record<string, unknown>;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        attributes = parsed as Record<string, unknown>;
      }
    } catch {
      attributes = {};
    }
  }
  return {
    id: String(row.id ?? ""),
    type: (row.type as string | null) ?? null,
    product_type,
    attributes,
    model_number: (row.model_number as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    thickness: row.thickness as number | string | null,
    color: (row.color as string | null) ?? null,
    figure: (row.figure as string | null) ?? null,
  };
}

type TransferRowEnriched = TransferRow & {
  stock_link_id: string | null;
  stock_display_name: string;
};

type BranchRow = { id: string; name?: string | null };
type MerchantRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  branch?: string | null;
};

const FETCH_TRANSFERS_FOR_MERCHANT_QUERY = `
  query TransfersForMerchant($filter: transfers_bool_exp, $order: [transfers_order_by!], $limit: Int, $offset: Int) {
    transfers(
      where: $filter
      order_by: $order
      limit: $limit
      offset: $offset
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
    total_transfers: transfers_aggregate(where: $filter) {
      aggregate {
        count
      }
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
      branch
    }
  }
`;

const FETCH_STOCKS_BY_IDS_FOR_TRANSFERS_QUERY = `
  query TransferStocksByIds($ids: [uuid!]!) {
    stock(where: { id: { _in: $ids } }) {
      id
      type
      product_type
      attributes
      model_number
      country
      thickness
      color
      figure
    }
  }
`;

async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
) {
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

type StockTransferRow = {
  id: string;
  from?: string | null;
  to?: string | null;
  destination_merchant?: string | null;
  request_hash?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  stock_transfer_batches?: Array<{
    id: string;
    stock_id?: string | null;
    destination_stock?: string | null;
    quantity?: number | string | null;
    created_at?: string | null;
  }> | null;
};

async function fetchStockTransfers(
  merchantId: string,
  companyId: string | null,
  branchId: string | null,
  page: number,
  pageSize: number,
  filters?: { from?: string; to?: string; destination_merchant?: string; created_by?: string },
): Promise<{ transfers: StockTransferRow[]; totalCount: number }> {
  const conditions: Record<string, unknown>[] = [
    {
      _or: [
        { created_by: { _eq: merchantId } },
        { destination_merchant: { _eq: merchantId } },
      ],
    },
  ];

  if (branchId) {
    conditions.push({
      _or: [
        { from: { _eq: branchId } },
        { to: { _eq: branchId } },
      ],
    });
  } else if (companyId) {
    conditions.push({
      _or: [
        { from_branch: { company: { _eq: companyId } } },
        { to_branch: { company: { _eq: companyId } } },
      ],
    });
  }

  if (filters?.from) conditions.push({ from: { _eq: filters.from } });
  if (filters?.to) conditions.push({ to: { _eq: filters.to } });
  if (filters?.destination_merchant) conditions.push({ destination_merchant: { _eq: filters.destination_merchant } });
  if (filters?.created_by) conditions.push({ created_by: { _eq: filters.created_by } });

  const filter = { _and: conditions };
  const order = [{ created_at: "desc" as const }, { id: "desc" as const }];
  const offset = (page - 1) * pageSize;

  try {
    const data = await gqlRequest<{
      stock_transfers: StockTransferRow[];
      total_stock_transfers: { aggregate: { count: number } };
    }>(FETCH_STOCK_TRANSFERS_QUERY, { filter, order, limit: pageSize, offset });
    return {
      transfers: data.stock_transfers ?? [],
      totalCount: data.total_stock_transfers?.aggregate?.count ?? 0,
    };
  } catch {
    return { transfers: [], totalCount: 0 };
  }
}

const FETCH_BRANCH_BY_PK_QUERY = `
  query BranchByPkForTransferAction($id: uuid!) {
    branches_by_pk(id: $id) {
      id
      company
      name
    }
  }
`;

const MERCHANT_BY_PK_QUERY = `
  query MerchantByPkForTransferAction($id: uuid!) {
    merchant_by_pk(id: $id) {
      id
      branch
    }
  }
`;

async function fetchBranchByPk(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({ query: FETCH_BRANCH_BY_PK_QUERY, variables: { id } }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (result.errors) return null;
    return result.data.branches_by_pk ?? null;
  } catch {
    return null;
  }
}

async function fetchMerchantByPkForTransfer(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({ query: MERCHANT_BY_PK_QUERY, variables: { id } }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (result.errors) return null;
    return result.data.merchant_by_pk ?? null;
  } catch {
    return null;
  }
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
      totalCount: 0,
      branches: [],
      merchants: [],
      merchantId: null,
      merchantBranchId: null,
      stockTransfers: [],
      stockTransfersTotal: 0,
      productsForTransfer: [],
    };
  }

  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const destinationMerchant = url.searchParams.get("destination_merchant") ?? "";
  const createdBy = url.searchParams.get("created_by") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 10);
  const offset = (page - 1) * pageSize;
  const stPage = Math.max(1, Number(url.searchParams.get("st_page")) || 1);
  const stPageSize = Math.max(1, Number(url.searchParams.get("st_pageSize")) || 10);

  const conditions: Record<string, unknown>[] = [
    {
      _or: [
        { created_by: { _eq: merchantId } },
        { destination_merchant: { _eq: merchantId } },
      ],
    },
  ];
  if (from) conditions.push({ from: { _eq: from } });
  if (to) conditions.push({ to: { _eq: to } });
  if (destinationMerchant)
    conditions.push({ destination_merchant: { _eq: destinationMerchant } });
  if (createdBy) conditions.push({ created_by: { _eq: createdBy } });

  const filter: Record<string, unknown> = { _and: conditions };
  const order = [{ created_at: "desc" }, { id: "desc" }];

  try {
    const [transferData, merchantData] = await Promise.all([
      gqlRequest<{
        transfers: TransferRow[];
        total_transfers: { aggregate: { count: number } };
      }>(FETCH_TRANSFERS_FOR_MERCHANT_QUERY, {
        filter,
        order,
        limit: pageSize,
        offset,
      }),
      gqlRequest<{ merchant: MerchantRow[] }>(FETCH_MERCHANTS_QUERY),
    ]);

    const transfers = transferData.transfers ?? [];
    const totalCount = transferData.total_transfers?.aggregate?.count ?? 0;

    const stockIdSet = new Set<string>();
    for (const t of transfers) {
      const a = t.stock != null ? String(t.stock).trim() : "";
      const b =
        t.destination_stock != null ? String(t.destination_stock).trim() : "";
      if (a) stockIdSet.add(a);
      if (b) stockIdSet.add(b);
    }
    const stockIds = [...stockIdSet];
    const labelByStockId = new Map<string, string>();
    if (stockIds.length > 0) {
      try {
        const stockPack = await gqlRequest<{
          stock: Record<string, unknown>[];
        }>(FETCH_STOCKS_BY_IDS_FOR_TRANSFERS_QUERY, { ids: stockIds });
        for (const row of stockPack.stock ?? []) {
          const id = String(row.id ?? "").trim();
          if (!id) continue;
          labelByStockId.set(id, buildStockLabel(stockRowForLabel(row)));
        }
      } catch {
        // Labels fall back to short id below
      }
    }

    const transfersEnriched: TransferRowEnriched[] = transfers.map((t) => {
      const linkId = merchantId ? transferLinkStockId(t, merchantId) : null;
      const label =
        linkId != null
          ? (labelByStockId.get(linkId) ?? `${linkId.slice(0, 8)}…`)
          : "—";
      return {
        ...t,
        stock_link_id: linkId,
        stock_display_name: label,
      };
    });

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

    const stFilters = { from, to, destination_merchant: destinationMerchant, created_by: createdBy };
    const stockTransfersResult = await fetchStockTransfers(merchantId, companyId, merchantBranchId, stPage, stPageSize, stFilters);

    return {
      transfers: transfersEnriched,
      totalCount,
      branches,
      merchants: merchantData.merchant ?? [],
      merchantId,
      merchantBranchId,
      companyId,
      stockTransfers: stockTransfersResult.transfers,
      stockTransfersTotal: stockTransfersResult.totalCount,
    };
  } catch (_error) {
    const stFilters = { from, to, destination_merchant: destinationMerchant, created_by: createdBy };
    const stockTransfersFallback = merchantId
      ? await fetchStockTransfers(merchantId, companyId, merchantBranchId, stPage, stPageSize, stFilters).catch(() => ({
          transfers: [],
          totalCount: 0,
        }))
      : { transfers: [], totalCount: 0 };
    return {
      transfers: [],
      totalCount: 0,
      branches: [],
      merchants: [],
      merchantId,
      merchantBranchId,
      companyId,
      stockTransfers: stockTransfersFallback.transfers,
      stockTransfersTotal: stockTransfersFallback.totalCount,
    };
  }
};

export const actions: Actions = {
  transferStockFifo: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return { success: false, message: 'Authentication required' };
    }

    const productId = formData.get('product_id') as string;
    const quantityRaw = formData.get('quantity');
    const toBranch = formData.get('to_branch') as string;
    const destinationMerchant = formData.get('destination_merchant') as string;

    if (!productId) return { success: false, message: 'Select a product' };
    if (!toBranch) return { success: false, message: 'Select a destination branch' };
    if (!destinationMerchant) return { success: false, message: 'Select a merchant' };

    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, message: 'Invalid quantity' };
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);
    if (!merchantBranchId) {
      return { success: false, message: 'No branch assigned to your account' };
    }

    if (toBranch === merchantBranchId) {
      return { success: false, message: 'Choose a different branch' };
    }

    const fromRow = await fetchBranchByPk(merchantBranchId);
    const toRow = await fetchBranchByPk(toBranch);
    if (!fromRow || !toRow) {
      return { success: false, message: 'Branch not found' };
    }
    if (!fromRow.company || fromRow.company !== toRow.company) {
      return { success: false, message: 'Branches must belong to the same company' };
    }

    const assignee = await fetchMerchantByPkForTransfer(destinationMerchant);
    if (!assignee || assignee.branch !== toBranch) {
      return { success: false, message: 'Selected merchant must belong to the destination branch' };
    }

    try {
      const plan = await planTransfer({ productId, branchId: merchantBranchId, quantity });
      await executeTransfer({
        plan,
        fromBranch: merchantBranchId,
        toBranch,
        actorId: userId,
        destinationMerchant,
        companyId: fromRow.company,
      });
    } catch (err) {
      return {
        success: false,
        message: `Failed to transfer: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    return {
      success: true,
      message: `Transferred ${quantity} units via FIFO.`,
    };
  },
};
