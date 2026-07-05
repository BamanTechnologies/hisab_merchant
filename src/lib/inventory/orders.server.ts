import { config, getGraphQLHeaders } from '$lib/config';
import { allocateFifo, parseMoney, parseQty } from '$lib/inventory/fifo';
import { insertStockMovements } from '$lib/inventory/movements.server';
import type { FifoBatchRow } from '$lib/inventory/types';

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

const FETCH_PRODUCT_BATCHES_QUERY = `
  query ProductBatchesForOrder($productIds: [uuid!]!, $branchId: uuid!) {
    stock(
      where: {
        _and: [
          { product_id: { _in: $productIds } }
          { branch: { _eq: $branchId } }
          { quantity: { _gt: 0 } }
        ]
      }
      order_by: [{ created_at: asc }, { id: asc }]
    ) {
      id
      product_id
      quantity
      selling_price
      created_at
      batch_number
    }
    products(where: { id: { _in: $productIds } }) {
      id
      default_unit
      factor
      attributes
    }
  }
`;

const INSERT_ORDER_ITEM_BATCHES_BULK = `
  mutation InsertOrderItemBatches($objects: [order_item_batches_insert_input!]!) {
    insert_order_item_batches(objects: $objects) {
      affected_rows
    }
  }
`;

export type OrderLinePlan = {
	product_id: string;
	quantity: number;
	unit_price: number;
	factor: number;
	line_total: number;
	unit: string | null;
	legacy_stock_id: string;
	slices: Array<{
		stock_id: string;
		quantity: number;
		unit_price_snapshot: number;
		factor_snapshot: number;
		line_total: number;
	}>;
};

export function resolveProductFactor(product: {
	factor?: unknown;
	attributes?: Record<string, unknown> | null;
}): number {
	const attrFactor = product.attributes?.factor;
	if (attrFactor != null) {
		const n = parseQty(attrFactor);
		if (n > 0) return n;
	}
	const f = parseMoney(product.factor);
	return f > 0 ? f : 1;
}

export async function planOrderLines(input: {
	lines: Array<{ product_id: string; quantity: number; unit_price: number }>;
	branchId: string;
}): Promise<OrderLinePlan[]> {
	const productIds = [...new Set(input.lines.map((l) => l.product_id))];
	const data = await gql<{
		stock: (FifoBatchRow & { product_id: string })[];
		products: Array<{
			id: string;
			default_unit?: string | null;
			factor?: unknown;
			attributes?: Record<string, unknown> | null;
		}>;
	}>(FETCH_PRODUCT_BATCHES_QUERY, {
		productIds,
		branchId: input.branchId,
	});

	const productById = new Map(data.products.map((p) => [p.id, p]));
	const batchesByProduct = new Map<string, FifoBatchRow[]>();
	for (const batch of data.stock ?? []) {
		const pid = String(batch.product_id ?? '').trim();
		if (!pid) continue;
		const list = batchesByProduct.get(pid) ?? [];
		list.push({
			id: batch.id,
			quantity: parseQty(batch.quantity),
			selling_price: parseMoney(batch.selling_price),
			created_at: batch.created_at ?? '',
			batch_number: batch.batch_number,
		});
		batchesByProduct.set(pid, list);
	}

	const plans: OrderLinePlan[] = [];

	for (const line of input.lines) {
		const product = productById.get(line.product_id);
		if (!product) throw new Error('One or more products were not found');

		const batches = batchesByProduct.get(line.product_id) ?? [];
		const { slices, remaining } = allocateFifo(batches, line.quantity);
		if (remaining > 0) {
			throw new Error('Quantity exceeds available stock for one or more lines');
		}
		if (slices.length === 0) {
			throw new Error('No stock available for one or more products');
		}

		const factor = resolveProductFactor(product);
		const lineTotal = line.quantity * line.unit_price * factor;
		const unit =
			product.default_unit != null && String(product.default_unit).trim() !== ''
				? String(product.default_unit).trim()
				: null;

		plans.push({
			product_id: line.product_id,
			quantity: line.quantity,
			unit_price: line.unit_price,
			factor,
			line_total: lineTotal,
			unit,
			legacy_stock_id: slices[0].stock_id,
			slices: slices.map((s) => ({
				stock_id: s.stock_id,
				quantity: s.quantity,
				unit_price_snapshot: line.unit_price,
				factor_snapshot: factor,
				line_total: s.quantity * line.unit_price * factor,
			})),
		});
	}

	return plans;
}

export async function insertOrderItemBatches(
	objects: Array<{
		order_item_id: string;
		stock_id: string;
		quantity: number;
		unit_price: number;
		factor_snapshot: number;
		line_total: number;
		created_by: string;
	}>,
): Promise<void> {
	if (objects.length === 0) return;
	const data = await gql<{
		insert_order_item_batches: { affected_rows: number } | null;
	}>(INSERT_ORDER_ITEM_BATCHES_BULK, { objects });
	const affected = data.insert_order_item_batches?.affected_rows ?? 0;
	if (affected !== objects.length) {
		throw new Error(`Batch allocation insert mismatch: expected ${objects.length}, got ${affected}`);
	}
}

export async function applyOrderStockEffects(input: {
	plans: OrderLinePlan[];
	companyId: string;
	branchId: string;
	orderId: string;
	userId: string;
}): Promise<void> {
	const movements: Parameters<typeof insertStockMovements>[0] = [];

	for (const plan of input.plans) {
		for (const slice of plan.slices) {
			movements.push({
				company_id: input.companyId,
				branch_id: input.branchId,
				stock_id: slice.stock_id,
				product_id: plan.product_id,
				movement_type: 'SALE',
				quantity_delta: -slice.quantity,
				unit: plan.unit,
				unit_price: slice.unit_price_snapshot,
				reference: input.orderId,
				reference_type: 'order',
				note: 'Order sale',
				created_by: input.userId,
			});
		}
	}

	await insertStockMovements(movements);
}

export async function restoreOrderStockEffects(input: {
	slices: Array<{ stock_id: string; quantity: number; product_id?: string | null }>;
	companyId: string;
	branchId: string | null;
	orderId: string;
	userId: string;
	unit?: string | null;
}): Promise<void> {
	if (input.slices.length === 0) return;

	const movements: Parameters<typeof insertStockMovements>[0] = input.slices.map((slice) => ({
		company_id: input.companyId,
		branch_id: input.branchId,
		stock_id: slice.stock_id,
		product_id: slice.product_id ?? null,
		movement_type: 'RETURN' as const,
		quantity_delta: slice.quantity,
		unit: input.unit ?? null,
		reference: input.orderId,
		reference_type: 'order',
		note: 'Order cancelled — stock returned',
		created_by: input.userId,
	}));

	await insertStockMovements(movements);
}

const INCREMENT_STOCK = `
  mutation IncrementStockQuantity($id: uuid!, $delta: numeric!) {
    update_stock_by_pk(pk_columns: { id: $id }, _inc: { quantity: $delta }) {
      id
    }
  }
`;

export async function incrementStockQuantity(stockId: string, delta: number): Promise<void> {
	if (!Number.isFinite(delta) || delta === 0) {
		throw new Error('Invalid stock quantity delta');
	}
	const data = await gql<{ update_stock_by_pk: { id: string } | null }>(INCREMENT_STOCK, {
		id: stockId,
		delta,
	});
	if (!data.update_stock_by_pk?.id) throw new Error('Stock row was not updated');
}

export async function decrementStockSlices(
	slices: Array<{ stock_id: string; quantity: number }>,
): Promise<void> {
	for (const slice of slices) {
		await incrementStockQuantity(slice.stock_id, -slice.quantity);
	}
}

export async function incrementStockSlices(
	slices: Array<{ stock_id: string; quantity: number }>,
): Promise<void> {
	for (const slice of slices) {
		await incrementStockQuantity(slice.stock_id, slice.quantity);
	}
}

const FETCH_CANCEL_ALLOCATIONS_QUERY = `
  query OrderCancelAllocations($orderId: uuid!) {
    order_items(where: { order_id: { _eq: $orderId } }) {
      id
      quantity
      unit
      product_id
      stock_id
      order_item_batches {
        stock_id
        quantity
        order_item {
          product_id
        }
      }
    }
  }
`;

export type CancelRestoreSlice = {
	stock_id: string;
	quantity: number;
	product_id: string | null;
};

export async function fetchCancelRestoreSlices(orderId: string): Promise<{
	slices: CancelRestoreSlice[];
	unit: string | null;
}> {
	const data = await gql<{
		order_items: Array<{
			id: string;
			quantity?: unknown;
			unit?: string | null;
			product_id?: string | null;
			stock_id?: string | null;
			order_item_batches?: Array<{
				stock_id?: string | null;
				quantity?: unknown;
				order_item?: { product_id?: string | null } | null;
			}> | null;
		}>;
	}>(FETCH_CANCEL_ALLOCATIONS_QUERY, { orderId });

	const slices: CancelRestoreSlice[] = [];
	let unit: string | null = null;

	for (const item of data.order_items ?? []) {
		if (unit == null && item.unit) unit = String(item.unit).trim() || null;
		const batches = item.order_item_batches ?? [];
		if (batches.length > 0) {
			for (const b of batches) {
				const stock_id = String(b.stock_id ?? '').trim();
				const quantity = parseQty(b.quantity);
				if (!stock_id || quantity <= 0) continue;
				slices.push({
					stock_id,
					quantity,
					product_id: b.order_item?.product_id ?? item.product_id ?? null,
				});
			}
		} else {
			const stock_id = String(item.stock_id ?? '').trim();
			const quantity = parseQty(item.quantity);
			if (stock_id && quantity > 0) {
				slices.push({
					stock_id,
					quantity,
					product_id: item.product_id ?? null,
				});
			}
		}
	}

	return { slices, unit };
}

export const FETCH_PRODUCTS_FOR_ORDERS_QUERY = `
  query ProductsForOrders($companyId: uuid!, $branchId: uuid!) {
    products(
      where: { _and: [{ company_id: { _eq: $companyId } }, { is_active: { _eq: true } }] }
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
        where: { _and: [{ branch: { _eq: $branchId } }] }
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
