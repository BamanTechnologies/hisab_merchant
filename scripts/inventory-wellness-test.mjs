#!/usr/bin/env node
/**
 * Inventory wellness test — end-to-end FIFO, batches, movements, and cancel restore.
 *
 * Usage:
 *   node scripts/inventory-wellness-test.mjs
 *   node scripts/inventory-wellness-test.mjs --keep     # leave test rows in DB
 *   node scripts/inventory-wellness-test.mjs --verbose
 *
 * Optional env overrides (defaults: auto-discover from Baman Test / first merchant):
 *   GRAPHQL_ENDPOINT, HASURA_ADMIN_SECRET
 *   WELLNESS_MERCHANT_ID, WELLNESS_BRANCH_ID, WELLNESS_COMPANY_ID
 *   WELLNESS_CUSTOMER_ID, WELLNESS_INVESTOR_ID, WELLNESS_PRODUCT_TYPE_ID
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── env ────────────────────────────────────────────────────────────────────

function loadDotEnv() {
	const path = resolve(ROOT, '.env');
	try {
		const text = readFileSync(path, 'utf8');
		for (const line of text.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const eq = trimmed.indexOf('=');
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim();
			let val = trimmed.slice(eq + 1).trim();
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) {
				val = val.slice(1, -1);
			}
			if (process.env[key] == null) process.env[key] = val;
		}
	} catch {
		/* optional */
	}
}

loadDotEnv();

const ENDPOINT = process.env.GRAPHQL_ENDPOINT ?? 'http://localhost:8080/v1/graphql';
const ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET ?? '';
const KEEP_DATA = process.argv.includes('--keep');
const VERBOSE = process.argv.includes('--verbose');

if (!ADMIN_SECRET) {
	console.error('HASURA_ADMIN_SECRET is required (set in .env)');
	process.exit(1);
}

// ─── helpers ────────────────────────────────────────────────────────────────

const RUN_ID = Date.now().toString(36);
const PREFIX = `WELLNESS_${RUN_ID}`;

function log(section, msg) {
	console.log(`\n[${section}] ${msg}`);
}

function detail(label, value) {
	if (VERBOSE) console.log(`  ${label}:`, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

function assert(condition, message) {
	if (!condition) throw new Error(`ASSERT: ${message}`);
}

function parseQty(v) {
	if (v == null) return 0;
	if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
	const n = Number(String(v).replace(/[^0-9.-]/g, ''));
	return Number.isFinite(n) ? n : 0;
}

function companyCodeFromName(name) {
	const trimmed = name.trim();
	if (!trimmed) return 'BAT';
	const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
	if (words.length >= 2) {
		const initials = words
			.map((w) => w.replace(/[^a-zA-Z0-9]/g, '')[0])
			.filter(Boolean)
			.join('');
		if (initials.length >= 2) return initials.toUpperCase().slice(0, 4);
	}
	const alnum = trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
	return alnum.slice(0, 3) || 'BAT';
}

function generateBatchNumber(companyName) {
	const code = companyCodeFromName(companyName);
	const digits = Math.floor(Math.random() * 10_000)
		.toString()
		.padStart(4, '0');
	return `${code}-${digits}`;
}

function resolveUniqueBatchNumber(companyName, taken, preferred = null) {
	const takenNorm = new Set([...taken].map((s) => s.trim().toLowerCase()).filter(Boolean));
	const pref = preferred?.trim();
	if (pref && !takenNorm.has(pref.toLowerCase())) return pref;
	for (let i = 0; i < 100; i++) {
		const c = generateBatchNumber(companyName);
		if (!takenNorm.has(c.toLowerCase())) return c;
	}
	return `${companyCodeFromName(companyName)}-${Date.now().toString().slice(-6)}`;
}

function allocateFifo(batches, requestedQty) {
	const need = parseQty(requestedQty);
	let remaining = need;
	const slices = [];
	for (const batch of batches) {
		if (remaining <= 0) break;
		const available = parseQty(batch.quantity);
		if (available <= 0) continue;
		const take = Math.min(available, remaining);
		slices.push({ stock_id: batch.id, quantity: take, batch_number: batch.batch_number });
		remaining -= take;
	}
	return { slices, remaining };
}

async function gql(query, variables = {}) {
	const response = await fetch(ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-hasura-admin-secret': ADMIN_SECRET,
		},
		body: JSON.stringify({ query, variables }),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const result = await response.json();
	if (result.errors?.length) {
		throw new Error(`GraphQL: ${JSON.stringify(result.errors, null, 2)}`);
	}
	return result.data;
}

function table(rows, columns) {
	if (!rows.length) return '(empty)';
	const widths = columns.map((c) =>
		Math.max(c.label.length, ...rows.map((r) => String(r[c.key] ?? '').length)),
	);
	const header = columns.map((c, i) => c.label.padEnd(widths[i])).join(' | ');
	const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
	const body = rows
		.map((r) => columns.map((c, i) => String(r[c.key] ?? '').padEnd(widths[i])).join(' | '))
		.join('\n');
	return `${header}\n${sep}\n${body}`;
}

// ─── context ────────────────────────────────────────────────────────────────

async function resolveContext() {
	const overrides = {
		merchantId: process.env.WELLNESS_MERCHANT_ID?.trim() || null,
		branchId: process.env.WELLNESS_BRANCH_ID?.trim() || null,
		companyId: process.env.WELLNESS_COMPANY_ID?.trim() || null,
		customerId: process.env.WELLNESS_CUSTOMER_ID?.trim() || null,
		investorId: process.env.WELLNESS_INVESTOR_ID?.trim() || null,
		productTypeId: process.env.WELLNESS_PRODUCT_TYPE_ID?.trim() || null,
	};

	if (overrides.merchantId && overrides.branchId && overrides.companyId) {
		if (!overrides.investorId) {
			const links = await gql(
				`query ($c: uuid!) { company_investor(where: { company: { _eq: $c } }, limit: 1) { investor } }`,
				{ c: overrides.companyId },
			);
			overrides.investorId = links.company_investor?.[0]?.investor ?? null;
		}
		if (!overrides.customerId) {
			const cc = await gql(
				`query ($c: uuid!, $b: uuid!) {
          company_customer(where: { _and: [{ company: { _eq: $c } }, { branch: { _eq: $b } }] }, limit: 1) { customer }
        }`,
				{ c: overrides.companyId, b: overrides.branchId },
			);
			overrides.customerId = cc.company_customer?.[0]?.customer ?? null;
		}
		if (!overrides.productTypeId) {
			const pt = await gql(
				`query ($m: uuid!) { product_types(where: { merchant_id: { _eq: $m } }, limit: 1) { id name } }`,
				{ m: overrides.merchantId },
			);
			overrides.productTypeId = pt.product_types?.[0]?.id ?? null;
		}
		assert(overrides.investorId, 'Could not resolve investor for company');
		assert(overrides.customerId, 'Could not resolve customer for branch');
		assert(overrides.productTypeId, 'Could not resolve product type for merchant');
		return finalizeContext(overrides);
	}

	// Prefer Baman Test company when present
	const companies = await gql(`query { companies(where: { name: { _eq: "Baman Test" } }, limit: 1) { id name } }`);
	let company = companies.companies?.[0];
	if (!company) {
		const any = await gql(`query { companies(limit: 1) { id name } }`);
		company = any.companies?.[0];
	}
	assert(company?.id, 'No company found in database');

	const branches = await gql(
		`query ($c: uuid!) { branches(where: { company: { _eq: $c } }, limit: 1) { id name } }`,
		{ c: company.id },
	);
	const branch = branches.branches?.[0];
	assert(branch?.id, 'No branch found for company');

	const merchants = await gql(
		`query ($b: uuid!) { merchant(where: { branch: { _eq: $b } }, limit: 1) { id first_name last_name } }`,
		{ b: branch.id },
	);
	const merchant = merchants.merchant?.[0];
	assert(merchant?.id, 'No merchant assigned to branch');

	const links = await gql(
		`query ($c: uuid!) { company_investor(where: { company: { _eq: $c } }, limit: 1) { investor } }`,
		{ c: company.id },
	);
	const investorId = links.company_investor?.[0]?.investor;
	assert(investorId, 'No investor linked to company');

	const cc = await gql(
		`query ($c: uuid!, $b: uuid!) {
      company_customer(where: { _and: [{ company: { _eq: $c } }, { branch: { _eq: $b } }] }, limit: 1) { customer }
    }`,
		{ c: company.id, b: branch.id },
	);
	const customerId = cc.company_customer?.[0]?.customer;
	assert(customerId, 'No customer for branch');

	const pt = await gql(
		`query ($m: uuid!) { product_types(where: { merchant_id: { _eq: $m } }, limit: 1) { id name } }`,
		{ m: merchant.id },
	);
	const productTypeId = pt.product_types?.[0]?.id;
	assert(productTypeId, 'No product type for merchant');

	return finalizeContext({
		merchantId: merchant.id,
		branchId: branch.id,
		companyId: company.id,
		companyName: company.name,
		customerId,
		investorId,
		productTypeId,
		productTypeName: pt.product_types[0].name,
		merchantName: `${merchant.first_name ?? ''} ${merchant.last_name ?? ''}`.trim(),
		branchName: branch.name,
	});
}

function finalizeContext(ctx) {
	assert(ctx.merchantId && ctx.branchId && ctx.companyId, 'Incomplete context');
	return ctx;
}

// ─── domain operations (mirror app server flows) ────────────────────────────

async function fetchCompanyBatchNumbers(companyId) {
	const branches = await gql(
		`query ($companyId: uuid!) { branches(where: { company: { _eq: $companyId } }) { id } }`,
		{ companyId },
	);
	const branchIds = (branches.branches ?? []).map((b) => b.id).filter(Boolean);
	if (!branchIds.length) return [];
	const data = await gql(
		`query ($branchIds: [uuid!]!) {
      stock(where: { branch: { _in: $branchIds } }) { batch_number }
    }`,
		{ branchIds },
	);
	return (data.stock ?? [])
		.map((r) => r.batch_number)
		.filter((b) => typeof b === 'string' && b.trim());
}

async function createCatalogProduct(ctx, name) {
	const data = await gql(
		`mutation ($object: products_insert_input!) {
      insert_products_one(object: $object) { id name default_unit }
    }`,
		{
			object: {
				company_id: ctx.companyId,
				product_type_id: ctx.productTypeId,
				name,
				default_unit: 'pcs',
				attributes: { thickness: '3mm', color: 'clear', figure: 'plain', factor: 1 },
				investors: [ctx.investorId],
				factor: 1,
				is_active: true,
				created_by: ctx.merchantId,
			},
		},
	);
	const row = data.insert_products_one;
	assert(row?.id, 'Catalog product insert failed');
	return row;
}

async function receiveStockBatches(ctx, lines, batchNumber) {
	const stockIds = [];
	const productIds = new Set();

	for (const line of lines) {
		let productId = line.product_id;
		let unit = line.unit ?? 'pcs';
		let investors = [ctx.investorId];

		if (line.mode === 'new') {
			const ins = await gql(
				`mutation ($object: products_insert_input!) {
          insert_products_one(object: $object) { id default_unit investors }
        }`,
				{
					object: {
						company_id: ctx.companyId,
						product_type_id: ctx.productTypeId,
						name: line.name,
						default_unit: line.default_unit,
						attributes: line.attributes,
						investors: line.investors,
						factor: line.factor,
						is_active: true,
						created_by: ctx.merchantId,
					},
				},
			);
			assert(ins.insert_products_one?.id, 'Receive: product not created');
			productId = ins.insert_products_one.id;
			unit = line.default_unit;
			investors = line.investors;
		}

		productIds.add(productId);

		const stockIns = await gql(
			`mutation ($object: stock_insert_input!) {
        insert_stock_one(object: $object) { id product_id quantity batch_number created_at }
      }`,
			{
				object: {
					branch: ctx.branchId,
					product_id: productId,
					batch_number: batchNumber,
					purchased_price: line.purchased_price,
					selling_price: line.selling_price,
					quantity: line.quantity,
					unit,
					investors,
					created_by: ctx.merchantId,
					updated_by: ctx.merchantId,
				},
			},
		);
		const stockRow = stockIns.insert_stock_one;
		assert(stockRow?.id, 'Receive: batch not created');
		stockIds.push(stockRow.id);

		await gql(
			`mutation ($objects: [stock_movements_insert_input!]!) {
        insert_stock_movements(objects: $objects) { affected_rows }
      }`,
			{
				objects: [
					{
						company_id: ctx.companyId,
						branch_id: ctx.branchId,
						stock_id: stockRow.id,
						product_id: productId,
						movement_type: 'PURCHASE',
						quantity_delta: line.quantity,
						unit,
						unit_cost: line.purchased_price,
						unit_price: line.selling_price,
						reference_type: 'receive',
						note: `Receive batch ${batchNumber}`,
						created_by: ctx.merchantId,
					},
				],
			},
		);

		// Tiny gap so FIFO order_by created_at is deterministic across batches
		await new Promise((r) => setTimeout(r, 15));
	}

	return { stockIds, productId: [...productIds][0] };
}

async function fetchProductBatches(productId, branchId) {
	const data = await gql(
		`query ($productIds: [uuid!]!, $branchId: uuid!) {
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
        id quantity selling_price created_at batch_number
      }
      products(where: { id: { _in: $productIds } }) {
        id default_unit factor attributes
      }
    }`,
		{ productIds: [productId], branchId },
	);
	return {
		batches: data.stock ?? [],
		product: data.products?.[0] ?? null,
	};
}

async function fetchCustomer(customerId) {
	const data = await gql(
		`query ($id: uuid!) {
      customers_by_pk(id: $id) { id first_name last_name phone_number address }
    }`,
		{ id: customerId },
	);
	return data.customers_by_pk;
}

function resolveProductFactor(product) {
	const attr = product?.attributes?.factor;
	if (attr != null) {
		const n = parseQty(attr);
		if (n > 0) return n;
	}
	const f = parseQty(product?.factor);
	return f > 0 ? f : 1;
}

async function planOrderLine(productId, quantity, unitPrice, branchId) {
	const { batches, product } = await fetchProductBatches(productId, branchId);
	assert(product, 'Product not found for order planning');
	const { slices, remaining } = allocateFifo(batches, quantity);
	assert(remaining === 0, `Insufficient stock: ${remaining} units short`);
	assert(slices.length > 0, 'No FIFO slices allocated');

	const factor = resolveProductFactor(product);
	const unit =
		product.default_unit != null && String(product.default_unit).trim() !== ''
			? String(product.default_unit).trim()
			: null;

	return {
		product_id: productId,
		quantity,
		unit_price: unitPrice,
		factor,
		line_total: quantity * unitPrice * factor,
		unit,
		legacy_stock_id: slices[0].stock_id,
		slices: slices.map((s) => ({
			stock_id: s.stock_id,
			quantity: s.quantity,
			unit_price_snapshot: unitPrice,
			factor_snapshot: factor,
			line_total: s.quantity * unitPrice * factor,
		})),
	};
}

async function incrementStockQuantity(stockId, delta) {
	const data = await gql(
		`mutation ($id: uuid!, $delta: numeric!) {
      update_stock_by_pk(pk_columns: { id: $id }, _inc: { quantity: $delta }) { id quantity }
    }`,
		{ id: stockId, delta },
	);
	assert(data.update_stock_by_pk?.id, `Stock update failed for ${stockId}`);
	return parseQty(data.update_stock_by_pk.quantity);
}

async function createOrder(ctx, plan, customer) {
	for (const slice of plan.slices) {
		await incrementStockQuantity(slice.stock_id, -slice.quantity);
	}

	const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
	const phoneDigits = String(customer.phone_number ?? '').replace(/\D/g, '');
	const customerPhone = phoneDigits ? Number(phoneDigits) : 0;

	const orderIns = await gql(
		`mutation ($object: orders_insert_input!) { insert_orders_one(object: $object) { id status } }`,
		{
			object: {
				created_by: ctx.merchantId,
				customer_id: ctx.customerId,
				customer_name: customerName || 'Customer',
				customer_address: String(customer.address ?? ''),
				customer_phone: customerPhone,
				order_quantity: plan.quantity,
				stock_id: plan.legacy_stock_id,
				total_amount: plan.line_total,
				outstanding_amount: plan.line_total,
				status: 'unpaid',
				unit: plan.unit,
			},
		},
	);
	const orderId = orderIns.insert_orders_one?.id;
	assert(orderId, 'Order insert failed');

	const itemsIns = await gql(
		`mutation ($objects: [order_items_insert_input!]!) {
      insert_order_items(objects: $objects) { returning { id } affected_rows }
    }`,
		{
			objects: [
				{
					order_id: orderId,
					stock_id: plan.legacy_stock_id,
					product_id: plan.product_id,
					quantity: plan.quantity,
					unit_price: plan.unit_price,
					factor_snapshot: plan.factor,
					line_total: plan.line_total,
					unit: plan.unit,
					created_by: ctx.merchantId,
				},
			],
		},
	);
	const orderItemId = itemsIns.insert_order_items?.returning?.[0]?.id;
	assert(orderItemId, 'Order item insert failed');

	const batchObjects = plan.slices.map((slice) => ({
		order_item_id: orderItemId,
		stock_id: slice.stock_id,
		quantity: slice.quantity,
		unit_price: slice.unit_price_snapshot,
		factor_snapshot: slice.factor_snapshot,
		line_total: slice.line_total,
		created_by: ctx.merchantId,
	}));

	await gql(
		`mutation ($objects: [order_item_batches_insert_input!]!) {
      insert_order_item_batches(objects: $objects) { affected_rows }
    }`,
		{ objects: batchObjects },
	);

	const movements = plan.slices.map((slice) => ({
		company_id: ctx.companyId,
		branch_id: ctx.branchId,
		stock_id: slice.stock_id,
		product_id: plan.product_id,
		movement_type: 'SALE',
		quantity_delta: -slice.quantity,
		unit: plan.unit,
		unit_price: slice.unit_price_snapshot,
		reference: orderId,
		reference_type: 'order',
		note: 'Order sale',
		created_by: ctx.merchantId,
	}));

	await gql(
		`mutation ($objects: [stock_movements_insert_input!]!) {
      insert_stock_movements(objects: $objects) { affected_rows }
    }`,
		{ objects: movements },
	);

	return { orderId, orderItemId };
}

async function fetchCancelRestoreSlices(orderId) {
	const data = await gql(
		`query ($orderId: uuid!) {
      order_items(where: { order_id: { _eq: $orderId } }) {
        id quantity unit product_id stock_id
        order_item_batches { stock_id quantity order_item { product_id } }
      }
    }`,
		{ orderId },
	);

	const slices = [];
	let unit = null;
	for (const item of data.order_items ?? []) {
		if (unit == null && item.unit) unit = String(item.unit).trim() || null;
		const batches = item.order_item_batches ?? [];
		if (batches.length > 0) {
			for (const b of batches) {
				const stock_id = String(b.stock_id ?? '').trim();
				const quantity = parseQty(b.quantity);
				if (stock_id && quantity > 0) {
					slices.push({
						stock_id,
						quantity,
						product_id: b.order_item?.product_id ?? item.product_id ?? null,
					});
				}
			}
		}
	}
	return { slices, unit };
}

async function cancelOrder(ctx, orderId) {
	const { slices, unit } = await fetchCancelRestoreSlices(orderId);
	assert(slices.length > 0, 'No batch slices to restore on cancel');

	for (const slice of slices) {
		await incrementStockQuantity(slice.stock_id, slice.quantity);
	}

	await gql(
		`mutation ($id: uuid!) {
      update_orders_by_pk(pk_columns: { id: $id }, _set: { status: "cancelled" }) { id status }
    }`,
		{ id: orderId },
	);

	const movements = slices.map((slice) => ({
		company_id: ctx.companyId,
		branch_id: ctx.branchId,
		stock_id: slice.stock_id,
		product_id: slice.product_id,
		movement_type: 'RETURN',
		quantity_delta: slice.quantity,
		unit,
		reference: orderId,
		reference_type: 'order',
		note: 'Order cancelled — stock returned',
		created_by: ctx.merchantId,
	}));

	await gql(
		`mutation ($objects: [stock_movements_insert_input!]!) {
      insert_stock_movements(objects: $objects) { affected_rows }
    }`,
		{ objects: movements },
	);

	return slices;
}

async function fetchStockSnapshot(stockIds) {
	const data = await gql(
		`query ($ids: [uuid!]!) {
      stock(where: { id: { _in: $ids } }, order_by: [{ created_at: asc }, { id: asc }]) {
        id quantity batch_number created_at product_id
      }
    }`,
		{ ids: stockIds },
	);
	return data.stock ?? [];
}

async function fetchOrderItemBatches(orderItemId) {
	const data = await gql(
		`query ($id: uuid!) {
      order_item_batches(where: { order_item_id: { _eq: $id } }, order_by: [{ stock: { created_at: asc } }]) {
        stock_id quantity unit_price line_total
        stock { batch_number created_at quantity }
      }
    }`,
		{ id: orderItemId },
	);
	return data.order_item_batches ?? [];
}

async function fetchMovementsForReference(referenceId) {
	const data = await gql(
		`query ($ref: uuid!) {
      stock_movements(
        where: { reference: { _eq: $ref } }
        order_by: [{ created_at: asc }, { id: asc }]
      ) {
        id movement_type quantity_delta stock_id product_id reference_type note created_at
      }
    }`,
		{ ref: referenceId },
	);
	return data.stock_movements ?? [];
}

async function fetchPurchaseMovements(stockIds) {
	const data = await gql(
		`query ($ids: [uuid!]!) {
      stock_movements(
        where: { _and: [{ stock_id: { _in: $ids } }, { movement_type: { _eq: "PURCHASE" } }] }
        order_by: [{ created_at: asc }]
      ) { id stock_id quantity_delta movement_type note }
    }`,
		{ ids: stockIds },
	);
	return data.stock_movements ?? [];
}

async function cleanupOrderCascade(orderId) {
	const itemRes = await gql(
		`query ($id: uuid!) { order_items(where: { order_id: { _eq: $id } }) { id } }`,
		{ id: orderId },
	);
	const orderItemIds = (itemRes.order_items ?? []).map((r) => r.id).filter(Boolean);

	if (orderItemIds.length) {
		await gql(
			`mutation ($ids: [uuid!]!) {
        delete_order_item_batches(where: { order_item_id: { _in: $ids } }) { affected_rows }
      }`,
			{ ids: orderItemIds },
		);
	}

	await gql(
		`mutation ($id: uuid!) {
      delete_customer_transactions(where: {
        _and: [{ reference: { _eq: $id } }, { reference_type: { _eq: "order" } }]
      }) { affected_rows }
    }`,
		{ id: orderId },
	);

	await gql(
		`mutation ($id: uuid!) { delete_order_items(where: { order_id: { _eq: $id } }) { affected_rows } }`,
		{ id: orderId },
	);

	await gql(`mutation ($id: uuid!) { delete_orders_by_pk(id: $id) { id } }`, { id: orderId });
}

async function cleanupStockAndMovements(stockIds, productIds) {
	const filters = [];
	if (stockIds.length) filters.push({ stock_id: { _in: stockIds } });
	if (productIds.length) filters.push({ product_id: { _in: productIds } });

	if (filters.length) {
		await gql(
			`mutation ($where: stock_movements_bool_exp!) {
        delete_stock_movements(where: $where) { affected_rows }
      }`,
			{ where: filters.length === 1 ? filters[0] : { _or: filters } },
		);
	}

	if (stockIds.length) {
		await gql(
			`mutation ($ids: [uuid!]!) { delete_stock(where: { id: { _in: $ids } }) { affected_rows } }`,
			{ ids: stockIds },
		);
	}
}

async function cleanupProducts(productIds) {
	for (const productId of productIds) {
		await gql(`mutation ($id: uuid!) { delete_products_by_pk(id: $id) { id } }`, { id: productId });
	}
}

/** Remove all rows tied to WELLNESS_* products (current run + orphans from failed runs). */
async function sweepWellnessProducts() {
	const data = await gql(
		`query {
      products(where: { name: { _like: "WELLNESS_%" } }) {
        id
        stocks { id }
        order_items { order_id }
      }
    }`,
	);

	const products = data.products ?? [];
	if (!products.length) return 0;

	const productIds = products.map((p) => p.id);
	const stockIds = products.flatMap((p) => (p.stocks ?? []).map((s) => s.id));
	const orderIds = [
		...new Set(products.flatMap((p) => (p.order_items ?? []).map((oi) => oi.order_id)).filter(Boolean)),
	];

	for (const orderId of orderIds) {
		await cleanupOrderCascade(orderId);
	}
	await cleanupStockAndMovements(stockIds, productIds);
	await cleanupProducts(productIds);

	return productIds.length;
}

async function cleanup(_ctx, ids) {
	const errors = [];

	async function runStep(label, fn) {
		try {
			await fn();
		} catch (err) {
			errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	const orderIds = [...new Set(ids.orderIds ?? [])];
	const stockIds = [...new Set(ids.stockIds ?? [])];
	const productIds = [...new Set(ids.productIds ?? [])];

	for (const orderId of orderIds) {
		await runStep(`order ${orderId.slice(0, 8)}`, () => cleanupOrderCascade(orderId));
	}

	await runStep('stock + movements', () => cleanupStockAndMovements(stockIds, productIds));

	for (const productId of productIds) {
		await runStep(`product ${productId.slice(0, 8)}`, () =>
			gql(`mutation ($id: uuid!) { delete_products_by_pk(id: $id) { id } }`, { id: productId }),
		);
	}

	let swept = 0;
	await runStep('wellness orphan sweep', async () => {
		swept = await sweepWellnessProducts();
	});

	const remaining = await gql(
		`query { products(where: { name: { _like: "WELLNESS_%" } }) { id name } }`,
	);
	const leftover = remaining.products ?? [];

	if (leftover.length) {
		errors.push(
			`${leftover.length} WELLNESS product(s) still present: ${leftover.map((p) => p.name).join(', ')}`,
		);
	}

	if (errors.length) {
		log('cleanup', 'Completed with errors:');
		for (const e of errors) console.error(`  ✗ ${e}`);
		throw new Error('Cleanup incomplete — see errors above');
	}

	log(
		'cleanup',
		`Removed ${productIds.length} product(s), ${stockIds.length} batch(es), ${orderIds.length} order(s)` +
			(swept ? `; swept ${swept} orphan WELLNESS product(s)` : ''),
	);
}

// ─── main test ──────────────────────────────────────────────────────────────

async function main() {
	console.log('='.repeat(72));
	console.log('Inventory Wellness Test');
	console.log(`Run ID: ${RUN_ID}  |  keep data: ${KEEP_DATA}`);
	console.log('='.repeat(72));

	const ctx = await resolveContext();
	if (!ctx.companyName) {
		const co = await gql(`query ($id: uuid!) { companies_by_pk(id: $id) { name } }`, {
			id: ctx.companyId,
		});
		ctx.companyName = co.companies_by_pk?.name ?? 'Company';
	}

	log('context', `${ctx.companyName} / branch ${ctx.branchName ?? ctx.branchId} / merchant ${ctx.merchantName ?? ctx.merchantId}`);
	detail('context', ctx);

	const created = {
		productIds: [],
		stockIds: [],
		orderIds: [],
		orderItemIds: [],
	};

	const catalogName = `${PREFIX}_catalog_glass`;
	const fifoProductName = `${PREFIX}_fifo_glass`;

	try {
		// Step 1 — catalog product (products page flow)
		log('step 1', 'Create catalog-only product');
		const catalogProduct = await createCatalogProduct(ctx, catalogName);
		created.productIds.push(catalogProduct.id);
		assert(catalogProduct.default_unit === 'pcs', 'Catalog product unit mismatch');
		console.log(`  ✓ Product "${catalogName}" → ${catalogProduct.id}`);

		// Step 2 — receive stock: new product + 3 batches (10, 20, 30)
		log('step 2', 'Receive stock: new product + 3 batches');
		const taken = await fetchCompanyBatchNumbers(ctx.companyId);
		const batchNumber = resolveUniqueBatchNumber(ctx.companyName, taken, `${PREFIX}-BATCH`);

		const batchQtys = [10, 20, 30];
		const receiveLines = [
			{
				mode: 'new',
				name: fifoProductName,
				default_unit: 'pcs',
				attributes: { thickness: '5mm', color: 'blue', figure: 'plain', factor: 1 },
				investors: [ctx.investorId],
				factor: 1,
				quantity: batchQtys[0],
				purchased_price: 50,
				selling_price: 80,
			},
		];

		const { stockIds: firstStockIds, productId: fifoProductId } = await receiveStockBatches(
			ctx,
			receiveLines,
			batchNumber,
		);
		created.productIds.push(fifoProductId);
		created.stockIds.push(...firstStockIds);

		for (let i = 1; i < batchQtys.length; i++) {
			const { stockIds } = await receiveStockBatches(
				ctx,
				[
					{
						mode: 'existing',
						product_id: fifoProductId,
						quantity: batchQtys[i],
						purchased_price: 50 + i * 5,
						selling_price: 80 + i * 5,
					},
				],
				batchNumber,
			);
			created.stockIds.push(...stockIds);
		}

		const stockBefore = await fetchStockSnapshot(created.stockIds);
		console.log(`  ✓ Product "${fifoProductName}" → ${fifoProductId}`);
		console.log(`  ✓ Batch number: ${batchNumber}`);
		console.log(
			table(
				stockBefore.map((s, i) => ({
					'#': i + 1,
					id: s.id.slice(0, 8),
					qty: parseQty(s.quantity),
					batch: s.batch_number,
				})),
				[
					{ key: '#', label: '#' },
					{ key: 'id', label: 'stock' },
					{ key: 'qty', label: 'qty' },
					{ key: 'batch', label: 'batch_number' },
				],
			),
		);

		assert(stockBefore.length === 3, 'Expected 3 stock batches');
		for (let i = 0; i < 3; i++) {
			assert(parseQty(stockBefore[i].quantity) === batchQtys[i], `Batch ${i + 1} qty mismatch`);
			assert(stockBefore[i].batch_number === batchNumber, 'Batch numbers should match within receive');
		}

		const purchases = await fetchPurchaseMovements(created.stockIds);
		assert(purchases.length === 3, 'Expected 3 PURCHASE movements');

		// Step 3 — plan order with FIFO (order qty 35 → 10 + 20 + 5)
		log('step 3', 'Create order and verify FIFO allocation');
		const orderQty = 35;
		const unitPrice = 80;
		const plan = await planOrderLine(fifoProductId, orderQty, unitPrice, ctx.branchId);

		const expectedSlices = [
			{ batchIndex: 0, qty: 10 },
			{ batchIndex: 1, qty: 20 },
			{ batchIndex: 2, qty: 5 },
		];

		assert(plan.slices.length === 3, `Expected 3 FIFO slices, got ${plan.slices.length}`);
		for (let i = 0; i < expectedSlices.length; i++) {
			const exp = expectedSlices[i];
			const slice = plan.slices[i];
			const batchId = stockBefore[exp.batchIndex].id;
			assert(slice.stock_id === batchId, `Slice ${i + 1} should come from batch ${exp.batchIndex + 1}`);
			assert(slice.quantity === exp.qty, `Slice ${i + 1} qty should be ${exp.qty}`);
		}
		console.log('  ✓ FIFO plan matches expected 10 + 20 + 5');

		const customer = await fetchCustomer(ctx.customerId);
		assert(customer, 'Customer not found');

		const { orderId, orderItemId } = await createOrder(ctx, plan, customer);
		created.orderIds.push(orderId);
		created.orderItemIds.push(orderItemId);
		console.log(`  ✓ Order created → ${orderId}`);

		const stockAfterOrder = await fetchStockSnapshot(created.stockIds);
		const expectedAfterOrder = [0, 0, 25];
		for (let i = 0; i < 3; i++) {
			assert(
				parseQty(stockAfterOrder[i].quantity) === expectedAfterOrder[i],
				`After order batch ${i + 1}: expected ${expectedAfterOrder[i]}, got ${parseQty(stockAfterOrder[i].quantity)}`,
			);
		}
		console.log('  ✓ Stock quantities after order: 0, 0, 25');

		const oib = await fetchOrderItemBatches(orderItemId);
		assert(oib.length === 3, 'Expected 3 order_item_batches rows');
		console.log(
			'\n  order_item_batches:\n' +
				table(
					oib.map((r, i) => ({
						'#': i + 1,
						stock: String(r.stock_id).slice(0, 8),
						qty: parseQty(r.quantity),
						batch: r.stock?.batch_number ?? '',
					})),
					[
						{ key: '#', label: '#' },
						{ key: 'stock', label: 'stock' },
						{ key: 'qty', label: 'qty' },
						{ key: 'batch', label: 'batch' },
					],
				),
		);

		const saleMovements = await fetchMovementsForReference(orderId);
		const sales = saleMovements.filter((m) => m.movement_type === 'SALE');
		assert(sales.length === 3, 'Expected 3 SALE movements on order');
		const saleDeltaSum = sales.reduce((s, m) => s + parseQty(m.quantity_delta), 0);
		assert(saleDeltaSum === -orderQty, `SALE deltas should sum to -${orderQty}`);
		console.log('  ✓ stock_movements: 3 SALE rows, total delta -35');

		// Step 4 — cancel order and restore stock
		log('step 4', 'Cancel order and verify stock restore');
		await cancelOrder(ctx, orderId);

		const orderAfter = await gql(`query ($id: uuid!) { orders_by_pk(id: $id) { status } }`, {
			id: orderId,
		});
		assert(orderAfter.orders_by_pk?.status === 'cancelled', 'Order status should be cancelled');

		const stockAfterCancel = await fetchStockSnapshot(created.stockIds);
		for (let i = 0; i < 3; i++) {
			assert(
				parseQty(stockAfterCancel[i].quantity) === batchQtys[i],
				`After cancel batch ${i + 1}: expected ${batchQtys[i]}, got ${parseQty(stockAfterCancel[i].quantity)}`,
			);
		}
		console.log('  ✓ Stock quantities restored: 10, 20, 30');

		const allOrderMovements = await fetchMovementsForReference(orderId);
		const returns = allOrderMovements.filter((m) => m.movement_type === 'RETURN');
		assert(returns.length === 3, 'Expected 3 RETURN movements after cancel');
		const returnSum = returns.reduce((s, m) => s + parseQty(m.quantity_delta), 0);
		assert(returnSum === orderQty, `RETURN deltas should sum to +${orderQty}`);
		console.log('  ✓ stock_movements: 3 RETURN rows, total delta +35');

		console.log('\n' + '='.repeat(72));
		console.log('ALL CHECKS PASSED');
		console.log('='.repeat(72));
	} finally {
		if (!KEEP_DATA) {
			log('cleanup', 'Removing test data…');
			await cleanup(ctx, created);
		} else {
			log('cleanup', 'Skipped (--keep). Test IDs:');
			console.log(JSON.stringify(created, null, 2));
		}
	}
}

main().catch((err) => {
	console.error('\nFAILED:', err.message);
	if (VERBOSE && err.stack) console.error(err.stack);
	process.exit(1);
});
