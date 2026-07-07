import type { PageServerLoad, Actions } from './$types';
import { error } from '@sveltejs/kit';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import {
  fetchBranchCompanyId,
  fetchInvestorsForCompany,
} from '$lib/companyInvestors.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { subscriptionWriteActionBlockedForRequest } from '$lib/subscription/server';

const FETCH_STOCK_BY_PK_QUERY = `
  query GetStockByPk($id: uuid!) {
    stock_by_pk(id: $id) {
      id
      branch
      origin
      type
      product_type
      attributes
      created_by
      investors
      merchant {
        id
        first_name
        last_name
      }
      purchased_price
      quantity
      selling_price
      unit
      model_number
      country
      color
      figure
      thickness
      factor
      product {
        id
        name
        product_type {
          id
          name
        }
        attributes
      }
    }
  }
`;

async function fetchStockByPk(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_STOCK_BY_PK_QUERY,
        variables: { id },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.stock_by_pk ?? null;
  } catch {
    return null;
  }
}

const FETCH_BRANCH_BY_PK_QUERY = `
  query BranchByPk($id: uuid!) {
    branches_by_pk(id: $id) {
      id
      company
      name
    }
  }
`;

const FETCH_BRANCHES_SAME_COMPANY_QUERY = `
  query BranchesSameCompany($companyId: uuid!, $excludeBranchId: uuid!) {
    branches(
      where: {
        _and: [
          { company: { _eq: $companyId } }
          { id: { _neq: $excludeBranchId } }
        ]
      }
    ) {
      id
      name
    }
  }
`;

const FETCH_PRODUCT_TYPES_QUERY = `
  query StockProductTypes($merchantId: uuid!) {
    product_types(
      where: { merchant_id: { _eq: $merchantId } }
      order_by: [{ name: asc }, { created_at: asc }]
    ) {
      id
      name
    }
  }
`;

async function fetchBranchByPk(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_BRANCH_BY_PK_QUERY,
        variables: { id },
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (result.errors) return null;

    return result.data.branches_by_pk ?? null;
  } catch {
    return null;
  }
}

async function fetchProductTypes(merchantId: string | null) {
  if (!merchantId) return [];
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_PRODUCT_TYPES_QUERY,
        variables: { merchantId },
      }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    if (result.errors) return [];
    return result.data.product_types ?? [];
  } catch {
    return [];
  }
}

async function fetchTransferTargetBranches(companyId: string, excludeBranchId: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_BRANCHES_SAME_COMPANY_QUERY,
        variables: { companyId, excludeBranchId },
      }),
    });

    if (!response.ok) return [];

    const result = await response.json();
    if (result.errors) return [];

    return result.data.branches ?? [];
  } catch {
    return [];
  }
}

const MERCHANTS_IN_BRANCHES_QUERY = `
  query MerchantsInBranches($branchIds: [uuid!]!) {
    merchant(where: { branch: { _in: $branchIds } }) {
      id
      first_name
      last_name
      branch
    }
  }
`;

const MERCHANT_BY_PK_QUERY = `
  query MerchantByPkForTransfer($id: uuid!) {
    merchant_by_pk(id: $id) {
      id
      branch
    }
  }
`;

async function fetchMerchantsInBranches(branchIds: string[]) {
  if (branchIds.length === 0) return [];
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: MERCHANTS_IN_BRANCHES_QUERY,
        variables: { branchIds },
      }),
    });

    if (!response.ok) return [];

    const result = await response.json();
    if (result.errors) return [];

    return result.data.merchant ?? [];
  } catch {
    return [];
  }
}

async function fetchMerchantByPkForTransfer(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: MERCHANT_BY_PK_QUERY,
        variables: { id },
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (result.errors) return null;

    return result.data.merchant_by_pk ?? null;
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

  const [stockRaw, investors, productTypes] = await Promise.all([
    fetchStockByPk(params.id),
    fetchInvestorsForCompany(companyId),
    fetchProductTypes(merchantId),
  ]);

  const typeById = new Map<string, { id: string; name?: string | null }>();
  for (const raw of productTypes as Array<Record<string, unknown>>) {
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!id) continue;
    const name = raw.name == null ? null : String(raw.name);
    typeById.set(id, { id, name });
  }
  const productTypeRef =
    stockRaw && typeof (stockRaw as Record<string, unknown>).product_type === 'string'
      ? String((stockRaw as Record<string, unknown>).product_type)
      : '';
  const productTypeObj = productTypeRef ? typeById.get(productTypeRef) : undefined;
  const stock = (stockRaw
    ? {
        ...(stockRaw as Record<string, unknown>),
        product_type: productTypeObj
          ? { id: productTypeObj.id, name: productTypeObj.name ?? null }
          : null,
      }
    : null) as Record<string, unknown> | null;

  if (!stock) {
    error(404, 'Stock not found');
  }

  const stockBranch = typeof stock?.branch === 'string' ? stock.branch : null;
  const stockOrigin = typeof stock?.origin === 'string' ? stock.origin : null;

  if (
    merchantBranchId != null &&
    stockBranch != null &&
    stockBranch !== merchantBranchId
  ) {
    const homeBranch = await fetchBranchByPk(stockBranch);
    const branchName =
      homeBranch?.name != null && String(homeBranch.name).trim() !== ''
        ? String(homeBranch.name)
        : `${stockBranch.slice(0, 8)}…`;
    return {
      stock: null,
      investors,
      merchantId,
      originBranchName: null,
      transferTargetBranches: [],
      merchantsInTransferBranches: [],
      stockHeldAtBranch: { id: stockBranch, name: branchName },
    };
  }

  let originBranchName: string | null = null;
  if (stockOrigin) {
    const ob = await fetchBranchByPk(stockOrigin);
    originBranchName = ob?.name != null && String(ob.name).trim() !== '' ? String(ob.name) : null;
  }

  let transferTargetBranches: { id: string; name?: string | null }[] = [];
  if (stockBranch) {
    const sourceBranch = await fetchBranchByPk(stockBranch);
    const companyId = sourceBranch?.company;
    if (companyId) {
      transferTargetBranches = await fetchTransferTargetBranches(companyId, stockBranch);
    }
  }

  const transferBranchIds = transferTargetBranches.map((b) => b.id);
  const merchantsInTransferBranches = await fetchMerchantsInBranches(transferBranchIds);

  return {
    stock,
    investors,
    merchantId,
    originBranchName,
    transferTargetBranches,
    merchantsInTransferBranches,
    stockHeldAtBranch: null,
  };
};

/**
 * Partial (or full) transfer: insert destination row, decrement source + updated_by,
 * record transfer. One GraphQL request; Hasura runs root fields in a transaction.
 */
const PARTIAL_TRANSFER_STOCK_MUTATION = `
  mutation PartialTransferStock(
    $newStock: stock_insert_input!
    $sourceId: uuid!
    $remainingQty: numeric!
    $actorId: uuid!
    $transfer: transfers_insert_input!
  ) {
    insert_stock(objects: [$newStock]) {
      returning {
        id
      }
    }
    update_stock_by_pk(
      pk_columns: { id: $sourceId }
      _set: { quantity: $remainingQty, updated_by: $actorId }
    ) {
      id
    }
    insert_transfers(objects: [$transfer]) {
      returning {
        id
      }
    }
  }
`;

const REUSE_TRANSFER_STOCK_MUTATION = `
  mutation ReuseTransferStock(
    $destinationId: uuid!
    $transferQty: numeric!
    $assigneeId: uuid!
    $sourceId: uuid!
    $remainingQty: numeric!
    $actorId: uuid!
    $transfer: transfers_insert_input!
  ) {
    update_destination: update_stock_by_pk(
      pk_columns: { id: $destinationId }
      _inc: { quantity: $transferQty }
      _set: { updated_by: $assigneeId }
    ) {
      id
    }
    update_source: update_stock_by_pk(
      pk_columns: { id: $sourceId }
      _set: { quantity: $remainingQty, updated_by: $actorId }
    ) {
      id
    }
    insert_transfers(objects: [$transfer]) {
      returning {
        id
      }
    }
  }
`;

const FIND_REUSABLE_DESTINATION_TRANSFER_QUERY = `
  query FindReusableDestinationTransfer($sourceId: uuid!, $from: uuid!, $to: uuid!) {
    transfers(
      where: {
        _or: [
          {
            stock: { _eq: $sourceId }
            from: { _eq: $from }
            to: { _eq: $to }
            destination_stock: { _is_null: false }
          }
          {
            destination_stock: { _eq: $sourceId }
            from: { _eq: $to }
            to: { _eq: $from }
          }
        ]
      }
      order_by: [{ created_at: desc }, { id: desc }]
      limit: 5
    ) {
      stock
      from
      to
      destination_stock
    }
  }
`;

const FETCH_STOCK_BRANCH_BY_PK_QUERY = `
  query StockBranchByPk($id: uuid!) {
    stock_by_pk(id: $id) {
      id
      branch
    }
  }
`;

type StockRowForTransfer = {
  id: string;
  branch?: string | null;
  type?: string | null;
  product_type?:
    | { id?: string | null; name?: string | null }
    | string
    | null;
  attributes?: Record<string, unknown> | null;
  investors?: string[] | null;
  purchased_price?: unknown;
  quantity: unknown;
  selling_price?: unknown;
  unit?: string | null;
};

async function fetchReusableDestinationStockId(input: {
  sourceId: string;
  fromBranch: string;
  toBranch: string;
}) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FIND_REUSABLE_DESTINATION_TRANSFER_QUERY,
        variables: {
          sourceId: input.sourceId,
          from: input.fromBranch,
          to: input.toBranch,
        },
      }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    if (result.errors) return null;

    const rows = Array.isArray(result.data?.transfers) ? result.data.transfers : [];
    let destId: string | null = null;
    for (const row of rows) {
      const rowFrom = typeof row?.from === 'string' ? row.from : '';
      const rowTo = typeof row?.to === 'string' ? row.to : '';
      const rowStock = typeof row?.stock === 'string' ? row.stock : '';
      const rowDest =
        typeof row?.destination_stock === 'string' && row.destination_stock.trim() !== ''
          ? row.destination_stock
          : null;

      // Forward repeat transfer: same source line and direction.
      if (rowFrom === input.fromBranch && rowTo === input.toBranch && rowDest) {
        destId = rowDest;
        break;
      }

      // Reverse transfer: current source was previous destination.
      if (
        rowFrom === input.toBranch &&
        rowTo === input.fromBranch &&
        rowStock &&
        rowStock.trim() !== ''
      ) {
        destId = rowStock;
        break;
      }
    }
    if (!destId) return null;

    // Guard against stale references when a destination stock row was deleted.
    const stockResp = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_STOCK_BRANCH_BY_PK_QUERY,
        variables: { id: destId },
      }),
    });
    if (!stockResp.ok) return null;
    const stockResult = await stockResp.json();
    if (stockResult.errors) return null;

    const destStock = stockResult.data?.stock_by_pk;
    if (!destStock?.id) return null;
    if (destStock.branch !== input.toBranch) return null;
    return String(destStock.id);
  } catch {
    return null;
  }
}

function buildNewStockInsertInput(
  row: StockRowForTransfer,
  toBranch: string,
  transferQty: number,
  assigneeId: string,
  /** Branch the quantity was transferred from (initiator’s / source branch). */
  originBranchId: string,
  destinationStockId?: string,
): Record<string, unknown> {
  const inv = Array.isArray(row.investors) ? row.investors : [];
  const productTypeId =
    row.product_type && typeof row.product_type === 'object'
      ? (row.product_type.id ?? null)
      : typeof row.product_type === 'string'
        ? row.product_type
        : null;
  return {
    ...(destinationStockId ? { id: destinationStockId } : {}),
    branch: toBranch,
    origin: originBranchId,
    quantity: transferQty,
    created_by: assigneeId,
    updated_by: assigneeId,
    product_type: productTypeId,
    attributes: row.attributes ?? {},
    type: row.type ?? null,
    purchased_price: row.purchased_price ?? null,
    selling_price: row.selling_price ?? null,
    unit: row.unit ?? null,
    investors: inv,
  };
}

async function transferStockPartial(input: {
  sourceRow: StockRowForTransfer;
  transferQty: number;
  fromBranch: string;
  toBranch: string;
  actorId: string;
  assigneeId: string;
}) {
  const { sourceRow, transferQty, fromBranch, toBranch, actorId, assigneeId } = input;
  const sourceQty = Number(sourceRow.quantity);
  const remainingQty = sourceQty - transferQty;
  if (!(remainingQty >= 0) || !Number.isFinite(remainingQty)) {
    throw new Error('Invalid remaining quantity');
  }

  const reusableDestinationId = await fetchReusableDestinationStockId({
    sourceId: sourceRow.id,
    fromBranch,
    toBranch,
  });

  if (reusableDestinationId) {
    const transfer: Record<string, unknown> = {
      stock: sourceRow.id,
      from: fromBranch,
      to: toBranch,
      quantity: transferQty,
      created_by: actorId,
      destination_merchant: assigneeId,
      destination_stock: reusableDestinationId,
    };

    const reuseResp = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: REUSE_TRANSFER_STOCK_MUTATION,
        variables: {
          destinationId: reusableDestinationId,
          transferQty,
          assigneeId,
          sourceId: sourceRow.id,
          remainingQty,
          actorId,
          transfer,
        },
      }),
    });

    if (!reuseResp.ok) {
      const errorText = await reuseResp.text();
      throw new Error(`HTTP error! status: ${reuseResp.status}, body: ${errorText}`);
    }

    const reuseResult = await reuseResp.json();
    if (reuseResult.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(reuseResult.errors)}`);
    }

    const updatedDest = reuseResult.data?.update_destination;
    const updatedSource = reuseResult.data?.update_source;
    const insertedTr = reuseResult.data?.insert_transfers?.returning?.[0];
    if (!updatedDest?.id || !updatedSource?.id || !insertedTr?.id) {
      throw new Error('Transfer did not complete');
    }

    return {
      destinationStockId: updatedDest.id as string,
      transferId: insertedTr.id as string,
    };
  }

  const newDestinationStockId = crypto.randomUUID();
  const newStockWithFixedId = buildNewStockInsertInput(
    sourceRow,
    toBranch,
    transferQty,
    assigneeId,
    fromBranch,
    newDestinationStockId,
  );

  const insertTransfer: Record<string, unknown> = {
    stock: sourceRow.id,
    from: fromBranch,
    to: toBranch,
    quantity: transferQty,
    created_by: actorId,
    destination_merchant: assigneeId,
    destination_stock: newDestinationStockId,
  };

  const insertVariables = {
    newStock: newStockWithFixedId,
    sourceId: sourceRow.id,
    remainingQty,
    actorId,
    transfer: insertTransfer,
  };

  const insertResp = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: PARTIAL_TRANSFER_STOCK_MUTATION,
      variables: insertVariables,
    }),
  });

  if (!insertResp.ok) {
    const errorText = await insertResp.text();
    throw new Error(`HTTP error! status: ${insertResp.status}, body: ${errorText}`);
  }

  const insertResult = await insertResp.json();
  if (insertResult.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(insertResult.errors)}`);
  }

  const insertedStock = insertResult.data?.insert_stock?.returning?.[0];
  const updated = insertResult.data?.update_stock_by_pk;
  const insertedTr = insertResult.data?.insert_transfers?.returning?.[0];
  if (!insertedStock?.id || !updated?.id || !insertedTr?.id) {
    throw new Error('Transfer did not complete');
  }

  return {
    destinationStockId: insertedStock.id as string,
    transferId: insertedTr.id as string,
  };
}

export const actions: Actions = {
  transferStock: async ({ request, params }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return { success: false, message: 'Authentication required' };
    }

    const stock_id = params.id;
    const to_branch = formData.get('to_branch') as string;
    const new_stock_created_by = formData.get('stock_created_by') as string;
    const quantityRaw = formData.get('quantity');

    if (!to_branch) {
      return { success: false, message: 'Select a destination branch' };
    }

    if (!new_stock_created_by) {
      return { success: false, message: 'Select a merchant for the destination branch' };
    }

    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, message: 'Invalid quantity' };
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);
    const stockRow = await fetchStockByPk(stock_id);
    if (!stockRow) {
      return { success: false, message: 'Stock not found' };
    }
    if (merchantBranchId != null && stockRow.branch !== merchantBranchId) {
      return { success: false, message: 'Stock not found' };
    }

    const stockQty = Number(stockRow.quantity);
    if (!Number.isFinite(stockQty) || stockQty <= 0) {
      return { success: false, message: 'Invalid stock quantity' };
    }
    if (quantity > stockQty) {
      return {
        success: false,
        message: 'Transfer quantity cannot exceed available quantity',
      };
    }

    const fromBranchId = stockRow.branch;
    if (!fromBranchId) {
      return { success: false, message: 'Stock has no branch assigned' };
    }

    if (to_branch === fromBranchId) {
      return { success: false, message: 'Choose a different branch than the current one' };
    }

    const fromRow = await fetchBranchByPk(fromBranchId);
    const toRow = await fetchBranchByPk(to_branch);
    if (!fromRow || !toRow) {
      return { success: false, message: 'Branch not found' };
    }

    if (!fromRow.company || fromRow.company !== toRow.company) {
      return {
        success: false,
        message: 'Destination branch must belong to the same company as this stock’s branch',
      };
    }

    const assignee = await fetchMerchantByPkForTransfer(new_stock_created_by);
    if (!assignee || assignee.branch !== to_branch) {
      return {
        success: false,
        message: 'Selected merchant must belong to the destination branch',
      };
    }

    try {
      await transferStockPartial({
        sourceRow: stockRow as StockRowForTransfer,
        transferQty: quantity,
        fromBranch: fromBranchId,
        toBranch: to_branch,
        actorId: userId,
        assigneeId: new_stock_created_by,
      });
    } catch (err) {
      return {
        success: false,
        message: `Failed to transfer: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    return {
      success: true,
      message: `Transferred ${quantity} to the destination branch. Quantities were updated.`,
    };
  },
};
