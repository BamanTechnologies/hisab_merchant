import { config, getGraphQLHeaders } from "$lib/config";
import { allocateFifo, parseMoney, parseQty } from "$lib/inventory/fifo";
import { insertStockMovements } from "$lib/inventory/movements.server";
import type { FifoBatchRow } from "$lib/inventory/types";

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
    headers: getGraphQLHeaders(),
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const result = await response.json();
  if (result.errors)
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  return result.data as T;
}

const FETCH_PRODUCT_BATCHES_FOR_TRANSFER_QUERY = `
  query ProductBatchesForTransfer($productId: uuid!, $branchId: uuid!) {
    stock(
      where: {
        _and: [
          { product_id: { _eq: $productId } }
          { branch: { _eq: $branchId } }
          { quantity: { _gt: 0 } }
        ]
      }
      order_by: [{ created_at: asc }, { id: asc }]
    ) {
      id
      quantity
      selling_price
      created_at
      batch_number
      product_id
      branch
      purchased_price
      unit
      investors
      type
      product_type
      attributes
      model_number
      country
      color
      figure
      thickness
      factor
      expiry_date
      product {
        id
        name
        default_unit
        factor
        attributes
        investors
        product_type {
          id
          name
        }
      }
    }
  }
`;

const INSERT_STOCK_TRANSFER_MUTATION = `
  mutation InsertStockTransfer($object: stock_transfers_insert_input!) {
    insert_stock_transfers_one(object: $object) {
      id
    }
  }
`;

const INSERT_STOCK_TRANSFER_BATCHES_BULK = `
  mutation InsertStockTransferBatches($objects: [stock_transfer_batches_insert_input!]!) {
    insert_stock_transfer_batches(objects: $objects) {
      affected_rows
    }
  }
`;

const INSERT_STOCK_MUTATION = `
  mutation InsertStockForTransfer($object: stock_insert_input!) {
    insert_stock_one(object: $object) {
      id
    }
  }
`;

const UPDATE_STOCK_QUANTITY_MUTATION = `
  mutation UpdateStockQuantity($id: uuid!, $delta: numeric!) {
    update_stock_by_pk(pk_columns: { id: $id }, _inc: { quantity: $delta }) {
      id
    }
  }
`;

type StockRowForTransfer = {
  id: string;
  quantity: unknown;
  selling_price?: unknown;
  purchased_price?: unknown;
  branch?: string | null;
  product_id?: string | null;
  unit?: string | null;
  investors?: string[] | null;
  type?: string | null;
  product_type?: unknown;
  attributes?: Record<string, unknown> | null;
  model_number?: string | null;
  country?: string | null;
  color?: string | null;
  figure?: string | null;
  thickness?: unknown;
  factor?: unknown;
  expiry_date?: string | null;
  batch_number?: string | null;
  created_at?: string | null;
  product?: {
    default_unit?: string | null;
    factor?: unknown;
    attributes?: Record<string, unknown> | null;
    investors?: string[] | null;
  } | null;
};

export type TransferSlice = {
  stock_id: string;
  quantity: number;
  selling_price: number;
  batch_number?: string | null;
};

export type TransferPlan = {
  product_id: string;
  quantity: number;
  branch_id: string;
  slices: TransferSlice[];
};

async function fetchProductBatches(
  productId: string,
  branchId: string,
): Promise<StockRowForTransfer[]> {
  const data = await gql<{ stock: StockRowForTransfer[] }>(
    FETCH_PRODUCT_BATCHES_FOR_TRANSFER_QUERY,
    { productId, branchId },
  );
  return data.stock ?? [];
}

export async function planTransfer(input: {
  productId: string;
  branchId: string;
  quantity: number;
}): Promise<TransferPlan> {
  const batches = await fetchProductBatches(input.productId, input.branchId);
  if (batches.length === 0) {
    throw new Error("No available stock for this product at the source branch");
  }

  const fifoBatches: FifoBatchRow[] = batches.map((b) => ({
    id: b.id,
    quantity: parseQty(b.quantity),
    selling_price: parseMoney(b.selling_price),
    created_at: b.created_at ?? "",
    batch_number: b.batch_number,
  }));

  const { slices, remaining } = allocateFifo(fifoBatches, input.quantity);
  if (remaining > 0) {
    throw new Error("Transfer quantity exceeds available stock");
  }
  if (slices.length === 0) {
    throw new Error("No stock available for transfer");
  }

  return {
    product_id: input.productId,
    quantity: input.quantity,
    branch_id: input.branchId,
    slices: slices.map((s) => ({
      stock_id: s.stock_id,
      quantity: s.quantity,
      selling_price: s.selling_price,
      batch_number: s.batch_number,
    })),
  };
}

async function decrementStockQuantity(
  stockId: string,
  delta: number,
): Promise<void> {
  if (!Number.isFinite(delta) || delta >= 0) {
    throw new Error("Invalid stock quantity delta");
  }
  const data = await gql<{ update_stock_by_pk: { id: string } | null }>(
    UPDATE_STOCK_QUANTITY_MUTATION,
    { id: stockId, delta },
  );
  if (!data.update_stock_by_pk?.id)
    throw new Error("Failed to decrement stock");
}

async function insertDestinationStock(
  stockData: Record<string, unknown>,
): Promise<string> {
  const data = await gql<{ insert_stock_one: { id: string } | null }>(
    INSERT_STOCK_MUTATION,
    { object: stockData },
  );
  if (!data.insert_stock_one?.id)
    throw new Error("Failed to create destination stock");
  return data.insert_stock_one.id;
}

export async function executeTransfer(input: {
  plan: TransferPlan;
  fromBranch: string;
  toBranch: string;
  actorId: string;
  destinationMerchant: string;
  companyId: string;
}): Promise<{ transferId: string; destinationStockIds: string[] }> {
  const {
    plan,
    fromBranch,
    toBranch,
    actorId,
    destinationMerchant,
    companyId,
  } = input;
  const sourceBatches = await fetchProductBatches(plan.product_id, fromBranch);
  const batchById = new Map(sourceBatches.map((b) => [b.id, b]));

  const batchInserts: Array<{
    transfer_id: string;
    stock_id: string;
    destination_stock: string;
    quantity: number;
    created_by: string;
  }> = [];

  const destinationStockIds: string[] = [];
  const movements: Parameters<typeof insertStockMovements>[0] = [];

  const transferResult = await gql<{
    insert_stock_transfers_one: { id: string } | null;
  }>(INSERT_STOCK_TRANSFER_MUTATION, {
    object: {
      from: fromBranch,
      to: toBranch,
      destination_merchant: destinationMerchant,
      created_by: actorId,
    },
  });
  const transferId = transferResult.insert_stock_transfers_one?.id;
  if (!transferId) throw new Error("Failed to create stock transfer");

  for (const slice of plan.slices) {
    const source = batchById.get(slice.stock_id);
    if (!source) throw new Error(`Source batch ${slice.stock_id} not found`);

    await decrementStockQuantity(slice.stock_id, -slice.quantity);

    const productTypeId =
      source.product_type && typeof source.product_type === "object"
        ? ((source.product_type as { id?: string }).id ?? null)
        : typeof source.product_type === "string"
          ? source.product_type
          : null;

    const destStockData: Record<string, unknown> = {
      branch: toBranch,
      origin: fromBranch,
      product_id: source.product_id,
      batch_number: source.batch_number,
      expiry_date: source.expiry_date ?? null,
      quantity: slice.quantity,
      purchased_price: source.purchased_price ?? null,
      selling_price: slice.selling_price,
      unit: source.unit ?? null,
      investors: Array.isArray(source.investors) ? source.investors : [],
      created_by: destinationMerchant,
      updated_by: destinationMerchant,
      product_type: productTypeId,
      attributes: source.attributes ?? {},
      type: source.type ?? null,
      model_number: source.model_number ?? null,
      country: source.country ?? null,
      color: source.color ?? null,
      figure: source.figure ?? null,
      thickness: source.thickness ?? null,
      factor: source.factor ?? null,
    };

    const destId = await insertDestinationStock(destStockData);
    destinationStockIds.push(destId);

    batchInserts.push({
      transfer_id: transferId,
      stock_id: slice.stock_id,
      destination_stock: destId,
      quantity: slice.quantity,
      created_by: actorId,
    });

    movements.push({
      company_id: companyId,
      branch_id: fromBranch,
      stock_id: slice.stock_id,
      product_id: plan.product_id,
      movement_type: "TRANSFER_OUT",
      quantity_delta: -slice.quantity,
      unit: source.unit ?? null,
      unit_cost: parseMoney(source.purchased_price),
      unit_price: slice.selling_price,
      reference: transferId,
      reference_type: "stock_transfer",
      note: `Transfer out to ${toBranch}`,
      created_by: actorId,
    });

    movements.push({
      company_id: companyId,
      branch_id: toBranch,
      stock_id: destId,
      product_id: plan.product_id,
      movement_type: "TRANSFER_IN",
      quantity_delta: slice.quantity,
      unit: source.unit ?? null,
      unit_cost: parseMoney(source.purchased_price),
      unit_price: slice.selling_price,
      reference: transferId,
      reference_type: "stock_transfer",
      note: `Transfer in from ${fromBranch}`,
      created_by: actorId,
    });
  }

  if (batchInserts.length > 0) {
    const batchData = await gql<{
      insert_stock_transfer_batches: { affected_rows: number } | null;
    }>(INSERT_STOCK_TRANSFER_BATCHES_BULK, { objects: batchInserts });
    const affected =
      batchData.insert_stock_transfer_batches?.affected_rows ?? 0;
    if (affected !== batchInserts.length) {
      throw new Error(
        `Transfer batch insert mismatch: expected ${batchInserts.length}, got ${affected}`,
      );
    }
  }

  await insertStockMovements(movements);

  return { transferId, destinationStockIds };
}

export const FETCH_PRODUCTS_FOR_TRANSFER_QUERY = `
  query ProductsForTransfer($companyId: uuid!, $branchId: uuid!,$merchantBranchId: uuid!) {
    products(
      where: { _and: [{ company_id: { _eq: $companyId } },{branch_id: { _eq: $merchantBranchId }}, { is_active: { _eq: true } }] }
      order_by: [{ name: asc }]
    ) {
      id
      name
      default_unit
      factor
      attributes
      product_type {
        id
        name
      }
      stocks(
        where: { _and: [{ branch: { _eq: $branchId } }, { quantity: { _gt: 0 } }] }
        order_by: [{ created_at: asc }, { id: asc }]
      ) {
        id
        quantity
        selling_price
        created_at
        batch_number
      }
    }
  }
`;

export const FETCH_STOCK_TRANSFERS_QUERY = `
  query StockTransfers($filter: stock_transfers_bool_exp, $order: [stock_transfers_order_by!], $limit: Int, $offset: Int) {
    stock_transfers(where: $filter, order_by: $order, limit: $limit, offset: $offset) {
      id
      from
      to
      destination_merchant
      request_hash
      created_by
      created_at
      updated_at
      stock_transfer_batches {
        id
        stock_id
        destination_stock
        quantity
        created_at
      }
    }
    total_stock_transfers: stock_transfers_aggregate(where: $filter) {
      aggregate {
        count
      }
    }
  }
`;

export const FETCH_STOCK_TRANSFER_BY_PK_QUERY = `
  query StockTransferByPk($id: uuid!) {
    stock_transfers_by_pk(id: $id) {
      id
      from
      to
      destination_merchant
      request_hash
      created_by
      created_at
      updated_at
      stock_transfer_batches(order_by: [{ created_at: asc }, { id: asc }]) {
        id
        stock_id
        destination_stock
        quantity
        created_at
        stockByStock {
          id
          batch_number
          quantity
          selling_price
          product {
            id
            name
            product_type {
              id
              name
            }
          }
        }
        stockByDestinationStock {
          id
          batch_number
          quantity
        }
      }
    }
  }
`;
