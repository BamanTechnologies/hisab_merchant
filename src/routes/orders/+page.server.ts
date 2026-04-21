import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { createPaymentRecord } from '$lib/payments.server';
import {
  fetchCustomerLatestBalance,
  insertCustomerTransaction,
  sumOrderLedgerOrderDebits,
} from '$lib/customerTransactions.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { buildStockLabel } from '$lib/stockLabel';

const FETCH_BRANCH_BY_PK_QUERY = `
  query OrdersBranchByPk($id: uuid!) {
    branches_by_pk(id: $id) {
      id
      company
    }
  }
`;

/** `customer` on `company_customer` is a UUID column — scoped by company + branch; then load `customers`. */
const FETCH_COMPANY_CUSTOMER_IDS_QUERY = `
  query CompanyCustomerIds($companyId: uuid!, $branchId: uuid!) {
    company_customer(
      where: {
        _and: [
          { company: { _eq: $companyId } }
          { branch: { _eq: $branchId } }
        ]
      }
    ) {
      id
      customer
    }
  }
`;

const FETCH_CUSTOMERS_BY_IDS_QUERY = `
  query CustomersByIds($ids: [uuid!]!) {
    customers(where: { id: { _in: $ids } }) {
      id
      first_name
      last_name
      phone_number
      address
    }
  }
`;

const VERIFY_COMPANY_CUSTOMER_JUNCTION_QUERY = `
  query VerifyCompanyCustomerJunction($companyId: uuid!, $customerId: uuid!, $branchId: uuid!) {
    company_customer(
      where: {
        _and: [
          { company: { _eq: $companyId } }
          { customer: { _eq: $customerId } }
          { branch: { _eq: $branchId } }
        ]
      }
      limit: 1
    ) {
      id
    }
  }
`;

const FETCH_CUSTOMER_BY_PK_QUERY = `
  query CustomerByPk($id: uuid!) {
    customers_by_pk(id: $id) {
      id
      first_name
      last_name
      phone_number
      address
    }
  }
`;

const FETCH_BRANCHES_FOR_COMPANY_QUERY = `
  query OrdersBranchesForCompany($companyId: uuid!) {
    branches(where: { company: { _eq: $companyId } }) {
      id
      name
    }
  }
`;

const FETCH_STOCKS_BY_BRANCH_QUERY = `
  query OrdersStocksByBranch($branchId: uuid!) {
    stock(where: { branch: { _eq: $branchId } }) {
      id
      branch
      origin
      product_type
      attributes
      quantity
      selling_price
      factor
      model_number
      type
      country
      unit
      thickness
      color
      figure
    }
  }
`;

const FETCH_STOCKS_BY_IDS_QUERY = `
  query OrdersStocksByIds($ids: [uuid!]!) {
    stock(where: { id: { _in: $ids } }) {
      id
      branch
      product_type
      attributes
      type
      quantity
      selling_price
      factor
      unit
    }
  }
`;

// GraphQL query to fetch orders for the logged-in merchant
const FETCH_ORDERS_QUERY = `
  query GetOrders($merchantId: uuid!) {
    orders(
      where: { created_by: { _eq: $merchantId } }
      order_by: { created_at: desc }
    ) {
      created_at
      created_by
      customer_address
      customer_name
      customer_phone
      id
      order_quantity
      status
      stock_id
      total_amount
      outstanding_amount
      unit
      stock {
        unit
        type
        product_type
        attributes
        model_number
        country
        color
        figure
        thickness
      }
    }
  }
`;

const FETCH_ORDER_FOR_MERCHANT_QUERY = `
  query OrderForMerchant($id: uuid!, $merchantId: uuid!) {
    orders(
      where: { _and: [{ id: { _eq: $id } }, { created_by: { _eq: $merchantId } }] }
      limit: 1
    ) {
      id
      stock_id
      order_quantity
      status
    }
  }
`;

const FETCH_ORDER_CANCEL_CONTEXT_QUERY = `
  query OrderCancelContext($id: uuid!, $merchantId: uuid!) {
    orders(
      where: { _and: [{ id: { _eq: $id } }, { created_by: { _eq: $merchantId } }] }
      limit: 1
    ) {
      id
      stock_id
      order_quantity
      status
      customer_id
      total_amount
      outstanding_amount
      stock {
        branch
        type
        product_type
        attributes
      }
    }
  }
`;

const INCREMENT_STOCK_QUANTITY_MUTATION = `
  mutation IncrementStockQuantity($id: uuid!, $delta: numeric!) {
    update_stock_by_pk(pk_columns: { id: $id }, _inc: { quantity: $delta }) {
      id
      quantity
    }
  }
`;

const CANCEL_ORDER_MUTATION = `
  mutation CancelOrderById($id: uuid!) {
    update_orders_by_pk(pk_columns: { id: $id }, _set: { status: "cancelled" }) {
      id
      status
    }
  }
`;

const CREATE_ORDERS_BULK_MUTATION = `
  mutation CreateOrdersBulk($objects: [orders_insert_input!]!) {
    insert_orders(objects: $objects) {
      affected_rows
      returning {
        id
      }
    }
  }
`;

const INSERT_CUSTOMER_MUTATION = `
  mutation InsertCustomer(
    $first_name: String!
    $last_name: String!
    $phone_number: String!
    $address: String!
  ) {
    insert_customers_one(
      object: {
        first_name: $first_name
        last_name: $last_name
        phone_number: $phone_number
        address: $address
      }
    ) {
      id
      first_name
      last_name
      phone_number
      address
    }
  }
`;

const INSERT_COMPANY_CUSTOMER_MUTATION = `
  mutation LinkCompanyCustomer($company: uuid!, $customer: uuid!, $branch: uuid!) {
    insert_company_customer(
      objects: { company: $company, customer: $customer, branch: $branch }
    ) {
      returning {
        id
      }
    }
  }
`;

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

async function fetchBranchCompany(branchId: string): Promise<string | null> {
  try {
    const data = await gql<{ branches_by_pk: { company: string } | null }>(
      FETCH_BRANCH_BY_PK_QUERY,
      { id: branchId },
    );
    return data.branches_by_pk?.company ?? null;
  } catch {
    return null;
  }
}

type CustomerRecord = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  /** Alias for UI that still expects `phone_number` */
  phone_number?: string | null;
};

function normalizeCustomer(c: CustomerRecord): CustomerRecord {
  const phone = c.phone ?? c.phone_number ?? null;
  return {
    ...c,
    phone,
    phone_number: phone,
  };
}

async function fetchCustomersByMerchant(
  _merchantId: string,
  merchantBranchId: string | null,
  knownCompanyId?: string | null,
): Promise<{ companyId: string | null; customers: CustomerRecord[] }> {
  if (!merchantBranchId) {
    return { companyId: knownCompanyId ?? null, customers: [] };
  }

  try {
    const companyId =
      knownCompanyId ?? (await fetchBranchCompany(merchantBranchId));
    if (!companyId) {
      return { companyId: null, customers: [] };
    }

    const junction = await gql<{
      company_customer: Array<{ id: string; customer: string } | null>;
    }>(FETCH_COMPANY_CUSTOMER_IDS_QUERY, {
      companyId,
      branchId: merchantBranchId,
    });

    const ids = [
      ...new Set(
        (junction.company_customer ?? [])
          .map((r) => r?.customer)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    if (ids.length === 0) {
      return { companyId, customers: [] };
    }

    const custData = await gql<{
      customers: CustomerRecord[];
    }>(FETCH_CUSTOMERS_BY_IDS_QUERY, { ids });

    const raw = (custData.customers ?? []).map((c) => normalizeCustomer(c));
    const seen = new Set<string>();
    const customers = raw.filter((c) => {
      if (!c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    return { companyId, customers };
  } catch {
    return { companyId: null, customers: [] };
  }
}

async function verifyCustomerInCompany(
  companyId: string,
  customerId: string,
  merchantBranchId: string | null,
): Promise<CustomerRecord | null> {
  if (!merchantBranchId) {
    return null;
  }

  try {
    const junction = await gql<{
      company_customer: Array<{ id: string } | null>;
    }>(VERIFY_COMPANY_CUSTOMER_JUNCTION_QUERY, {
      companyId,
      customerId,
      branchId: merchantBranchId,
    });

    if (!junction.company_customer?.[0]?.id) {
      return null;
    }

    const row = await gql<{ customers_by_pk: CustomerRecord | null }>(
      FETCH_CUSTOMER_BY_PK_QUERY,
      { id: customerId },
    );

    const c = row.customers_by_pk;
    return c?.id ? normalizeCustomer(c) : null;
  } catch {
    return null;
  }
}

async function fetchStocksForBranch(branchId: string) {
  try {
    const data = await gql<{ stock: unknown[] }>(FETCH_STOCKS_BY_BRANCH_QUERY, {
      branchId,
    });
    return data.stock ?? [];
  } catch {
    return [];
  }
}

async function fetchBranchesForCompany(companyId: string | null) {
  if (!companyId) return [];
  try {
    const data = await gql<{
      branches: { id: string; name?: string | null }[];
    }>(FETCH_BRANCHES_FOR_COMPANY_QUERY, { companyId });
    return data.branches ?? [];
  } catch {
    return [];
  }
}

async function fetchOrders(merchantId: string) {
  try {
    const data = await gql<{ orders: unknown[] }>(FETCH_ORDERS_QUERY, { merchantId });
    return (data.orders ?? []).map((row) => {
      if (!row || typeof row !== 'object') return row;
      const rec = row as Record<string, unknown>;
      const stock =
        rec.stock && typeof rec.stock === 'object'
          ? (rec.stock as Record<string, unknown>)
          : null;
      const fallbackId = String(rec.stock_id ?? '').slice(0, 8) + '…';
      return {
        ...rec,
        stock_name: stock ? buildStockLabel(stock) : fallbackId,
      };
    });
  } catch {
    return [];
  }
}

async function orderBelongsToMerchant(orderId: string, merchantId: string): Promise<boolean> {
  try {
    const data = await gql<{ orders: unknown[] }>(FETCH_ORDER_FOR_MERCHANT_QUERY, {
      id: orderId,
      merchantId,
    });
    return (data.orders ?? []).length > 0;
  } catch {
    return false;
  }
}

type MerchantOrderCancelRow = {
  id: string;
  stock_id: string;
  order_quantity: number;
  status: string;
  customer_id: string;
  total_amount: number;
  outstanding_amount: number;
  stock_branch: string | null;
};

function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function fetchMerchantOrderForCancel(
  orderId: string,
  merchantId: string,
): Promise<MerchantOrderCancelRow | null> {
  try {
    const data = await gql<{
      orders: Array<{
        id: string;
        stock_id?: string | null;
        order_quantity?: unknown;
        status?: string | null;
        customer_id?: string | null;
        total_amount?: unknown;
        outstanding_amount?: unknown;
        stock?: { branch?: string | null } | null;
      }>;
    }>(FETCH_ORDER_CANCEL_CONTEXT_QUERY, { id: orderId, merchantId });
    const row = data.orders?.[0];
    if (!row?.stock_id) return null;
    const q = Number(row.order_quantity);
    if (!Number.isFinite(q) || q <= 0) return null;
    const customerId = String(row.customer_id ?? '').trim();
    if (!customerId) return null;
    return {
      id: row.id,
      stock_id: row.stock_id,
      order_quantity: q,
      status: String(row.status ?? '').trim() || 'unpaid',
      customer_id: customerId,
      total_amount: parseMoney(row.total_amount),
      outstanding_amount: parseMoney(row.outstanding_amount),
      stock_branch: row.stock?.branch ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Ledger: positive sum = customer owes; negative sum = prepaid credit.
 * - `type: order` with **+amount** increases debt.
 * - Bank/cash payments (order detail): **−amount** reduces debt.
 * - Paying **from prepaid credit**: **+amount** on `customer_transactions` (consumes credit, moves sum toward zero).
 *
 * Flow:
 * - extra = 0: only `+total` `type: order`.
 * - extra ≥ order: `payment` row + `+total` `type: payment` (credit applied); no `type: order`.
 * - 0 < extra < order: `payment` + `+extra` `type: payment` then `+(order−extra)` `type: order`.
 */
async function postOrderLedgerAndAutoPay(opts: {
  userId: string;
  companyId: string;
  customerId: string;
  orderId: string;
  orderTotalAmount: number;
}): Promise<void> {
  const sumBefore = await fetchCustomerLatestBalance(opts.companyId, opts.customerId);
  const extra = Math.max(0, -sumBefore);
  const total = opts.orderTotalAmount;

  if (extra === 0) {
    await insertCustomerTransaction({
      company: opts.companyId,
      customer: opts.customerId,
      amount: total,
      type: 'order',
      reference: opts.orderId,
      reference_type: 'order',
      note: 'Order created',
      created_by: opts.userId,
    });
    return;
  }

  if (extra >= total) {
    await createPaymentRecord({
      amount: total,
      order_id: opts.orderId,
      payment_method: 'Customer balance',
      created_by: opts.userId,
    });

    await insertCustomerTransaction({
      company: opts.companyId,
      customer: opts.customerId,
      amount: total,
      type: 'payment',
      reference: opts.orderId,
      reference_type: 'order',
      note: 'Payment from customer balance',
      created_by: opts.userId,
    });
    return;
  }

  await createPaymentRecord({
    amount: extra,
    order_id: opts.orderId,
    payment_method: 'Customer balance',
    created_by: opts.userId,
  });

  await insertCustomerTransaction({
    company: opts.companyId,
    customer: opts.customerId,
    amount: extra,
    type: 'payment',
    reference: opts.orderId,
    reference_type: 'order',
    note: 'Partial payment from customer balance',
    created_by: opts.userId,
  });

  await insertCustomerTransaction({
    company: opts.companyId,
    customer: opts.customerId,
    amount: total - extra,
    type: 'order',
    reference: opts.orderId,
    reference_type: 'order',
    note: 'Order created (unpaid portion after credit)',
    created_by: opts.userId,
  });
}

async function incrementStockQuantity(stockId: string, delta: number): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Invalid stock quantity delta');
  }
  const data = await gql<{
    update_stock_by_pk: { id: string } | null;
  }>(INCREMENT_STOCK_QUANTITY_MUTATION, {
    id: stockId,
    delta,
  });
  if (!data.update_stock_by_pk?.id) {
    throw new Error('Stock row was not updated');
  }
}

async function cancelOrderInDatabase(orderId: string) {
  const data = await gql<{ update_orders_by_pk: { id: string } | null }>(
    CANCEL_ORDER_MUTATION,
    { id: orderId },
  );
  return data.update_orders_by_pk;
}

function phoneToNumeric(phone: string | number | null | undefined): number {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

type OrderInsertObject = {
  created_by: string;
  customer_id: string;
  customer_address: string;
  customer_name: string;
  customer_phone: number;
  order_quantity: number;
  stock_id: string;
  total_amount: number;
  outstanding_amount: number;
  status: string;
  unit: string | null;
};

async function insertOrdersBulk(objects: OrderInsertObject[]) {
  if (objects.length === 0) {
    throw new Error('No orders to insert');
  }

  const data = await gql<{
    insert_orders: {
      affected_rows: number;
      returning: { id: string }[];
    };
  }>(CREATE_ORDERS_BULK_MUTATION, { objects });

  const inserted = data.insert_orders?.returning ?? [];
  const affected = data.insert_orders?.affected_rows ?? 0;

  if (affected !== objects.length || inserted.length !== objects.length) {
    throw new Error(
      `Bulk insert mismatch: expected ${objects.length} rows, got ${inserted.length} (affected_rows=${affected})`,
    );
  }

  return inserted;
}

type StockRowForOrder = {
  id: string;
  branch?: string | null;
  type?: string | null;
  product_type?: string | null;
  attributes?: Record<string, unknown> | null;
  quantity: unknown;
  selling_price: unknown;
  factor?: unknown;
  unit?: string | null;
};

function parsePositiveNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n =
    typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveOrderFactor(stockRow: StockRowForOrder): number {
  const attrFactor = parsePositiveNumber(stockRow.attributes?.factor);
  if (attrFactor != null) return attrFactor;
  const legacyFactor = parsePositiveNumber(stockRow.factor);
  if (legacyFactor != null) return legacyFactor;
  return 1;
}

async function fetchStocksByIdsForOrder(stockIds: string[]): Promise<StockRowForOrder[]> {
  if (stockIds.length === 0) return [];
  try {
    const data = await gql<{ stock: StockRowForOrder[] }>(FETCH_STOCKS_BY_IDS_QUERY, {
      ids: stockIds,
    });
    return data.stock ?? [];
  } catch {
    return [];
  }
}

type OrderLineInput = { stock_id: string; quantity: number; unit_price: number; unit?: string };

export const load: PageServerLoad = async ({ request, parent }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (merchantId ? await fetchMerchantBranchId(merchantId) : null);
  const knownCompanyId = merchantContext?.companyId ?? null;

  const customerCtx =
    merchantId != null
      ? await fetchCustomersByMerchant(merchantId, merchantBranchId, knownCompanyId)
      : { companyId: null as string | null, customers: [] as CustomerRecord[] };

  let companyId = customerCtx.companyId;
  if (!companyId && merchantBranchId) {
    companyId = await fetchBranchCompany(merchantBranchId);
  }

  const [orders, stocks, branches] = await Promise.all([
    merchantId ? fetchOrders(merchantId) : Promise.resolve([]),
    merchantBranchId ? fetchStocksForBranch(merchantBranchId) : Promise.resolve([]),
    fetchBranchesForCompany(companyId),
  ]);

  return {
    orders,
    customers: customerCtx.customers,
    stocks,
    branches,
    merchantId,
    merchantBranchId,
    companyId,
  };
};

export const actions: Actions = {
  createOrders: async ({ request }) => {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return { success: false, message: 'Authentication required' };
    }

    const formData = await request.formData();
    const customerId = String(formData.get('customerId') ?? '').trim();
    const linesRaw = String(formData.get('lines') ?? '').trim();

    if (!customerId) {
      return { success: false, message: 'Select a customer' };
    }

    let lines: OrderLineInput[] = [];
    try {
      const parsed = JSON.parse(linesRaw) as unknown;
      if (!Array.isArray(parsed)) {
        return { success: false, message: 'Invalid order lines' };
      }
      lines = parsed as OrderLineInput[];
    } catch {
      return { success: false, message: 'Invalid order lines JSON' };
    }

    if (lines.length === 0) {
      return { success: false, message: 'Add at least one stock line' };
    }

    if (lines.length > 15) {
      return { success: false, message: 'Too many lines (max 15)' };
    }

    const uniqueStockIds = [...new Set(lines.map((l) => l.stock_id))];
    if (uniqueStockIds.length !== lines.length) {
      return { success: false, message: 'Duplicate stock in order lines' };
    }

    for (const line of lines) {
      const q = Number(line.quantity);
      const up = Number(line.unit_price);
      if (!line.stock_id) {
        return { success: false, message: 'Each line needs a stock item and quantity' };
      }
      if (!Number.isFinite(q) || q < 1) {
        return { success: false, message: 'Quantity must be at least 1' };
      }
      if (!Number.isFinite(up) || up <= 0) {
        return {
          success: false,
          message: 'Each line needs a valid unit price greater than zero',
        };
      }
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);
    const customerCtx = await fetchCustomersByMerchant(userId, merchantBranchId);
    let companyId = customerCtx.companyId;
    if (!companyId && merchantBranchId) {
      companyId = await fetchBranchCompany(merchantBranchId);
    }

    if (!companyId) {
      return {
        success: false,
        message: 'Company could not be resolved for your branch',
      };
    }

    const customer = await verifyCustomerInCompany(
      companyId,
      customerId,
      merchantBranchId,
    );
    if (!customer) {
      return {
        success: false,
        message: 'Customer is not valid for your company or branch',
      };
    }

    const customer_name = [customer.first_name, customer.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    const customer_address = String(customer.address ?? '').trim();
    const customer_phone = phoneToNumeric(customer.phone ?? customer.phone_number);

    const stockRows = await fetchStocksByIdsForOrder(uniqueStockIds);
    const stockById = new Map(stockRows.map((s) => [s.id, s]));

    const orderObjects: OrderInsertObject[] = [];

    for (const line of lines) {
      const stockRow = stockById.get(line.stock_id);
      if (!stockRow) {
        return { success: false, message: 'One or more stock items were not found' };
      }
      if (merchantBranchId != null && stockRow.branch !== merchantBranchId) {
        return { success: false, message: 'Stock is not in your branch' };
      }
      const available = Number(stockRow.quantity);
      const q = Number(line.quantity);
      const unitPrice = Number(line.unit_price);
      if (!Number.isFinite(available) || q > available) {
        return {
          success: false,
          message: `Quantity exceeds available stock for one or more lines`,
        };
      }

      const f = resolveOrderFactor(stockRow);
      const total_amount = q * unitPrice * f;
      const outstanding_amount = total_amount;

      const rawUnit = stockRow.unit;
      const orderUnit =
        rawUnit != null && String(rawUnit).trim() !== ''
          ? String(rawUnit).trim()
          : null;

      orderObjects.push({
        created_by: userId,
        customer_id: customerId,
        customer_name: customer_name || 'Customer',
        customer_address,
        customer_phone,
        order_quantity: q,
        stock_id: line.stock_id,
        total_amount,
        outstanding_amount,
        status: 'unpaid',
        unit: orderUnit,
      });
    }

    let inserted: { id: string }[];
    try {
      inserted = await insertOrdersBulk(orderObjects);
    } catch (err) {
      return {
        success: false,
        message: `Failed to create orders: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    for (let i = 0; i < inserted.length; i++) {
      const orderId = inserted[i].id;
      const obj = orderObjects[i];
      try {
        await postOrderLedgerAndAutoPay({
          userId,
          companyId,
          customerId,
          orderId,
          orderTotalAmount: obj.total_amount,
        });
      } catch (err) {
        return {
          success: false,
          message: `Orders created but ledger / balance step failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
      }
    }

    return {
      success: true,
      message:
        lines.length === 1
          ? 'Order created successfully'
          : `${lines.length} orders created successfully`,
    };
  },

  createCustomer: async ({ request }) => {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return { success: false, message: 'Authentication required' };
    }

    const formData = await request.formData();
    const first_name = String(formData.get('first_name') ?? '').trim();
    const last_name = String(formData.get('last_name') ?? '').trim();
    const address = String(formData.get('address') ?? '').trim();
    const phone = String(formData.get('phone_number') ?? '').trim();

    if (!first_name || !last_name) {
      return { success: false, message: 'First and last name are required' };
    }

    if (!phone) {
      return { success: false, message: 'Phone is required' };
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);
    const customerCtx = await fetchCustomersByMerchant(userId, merchantBranchId);
    let companyId = customerCtx.companyId;
    if (!companyId && merchantBranchId) {
      companyId = await fetchBranchCompany(merchantBranchId);
    }

    if (!companyId) {
      return {
        success: false,
        message: 'Company could not be resolved for your branch',
      };
    }

    if (!merchantBranchId) {
      return {
        success: false,
        message: 'You must be assigned to a branch to add customers',
      };
    }

    try {
      const ins = await gql<{
        insert_customers_one: CustomerRecord | null;
      }>(INSERT_CUSTOMER_MUTATION, {
        first_name,
        last_name,
        phone_number: phone,
        address: address || '',
      });

      const created = ins.insert_customers_one;
      if (!created?.id) {
        return { success: false, message: 'Customer was not created' };
      }

      await gql(INSERT_COMPANY_CUSTOMER_MUTATION, {
        company: companyId,
        customer: created.id,
        branch: merchantBranchId,
      });

      const customer = normalizeCustomer(created);

      return {
        success: true,
        message: 'Customer added',
        customer,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to add customer: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  },

  cancelOrder: async ({ request }) => {
    const formData = await request.formData();
    const orderId = formData.get('orderId') as string;

    if (!orderId) {
      return {
        success: false,
        message: 'Order ID is required',
      };
    }

    const merchantId = getUserIdFromRequest(request);
    if (!merchantId) {
      return { success: false, message: 'Authentication required' };
    }

    const orderRow = await fetchMerchantOrderForCancel(orderId, merchantId);
    if (!orderRow) {
      return { success: false, message: 'Order not found' };
    }

    if (orderRow.status === 'cancelled') {
      return { success: false, message: 'This order is already cancelled' };
    }
    if (orderRow.status === 'paid') {
      return { success: false, message: 'Paid orders cannot be cancelled' };
    }

    try {
      await incrementStockQuantity(orderRow.stock_id, orderRow.order_quantity);
    } catch (error) {
      return {
        success: false,
        message: `Could not restore stock quantity: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    try {
      const result = await cancelOrderInDatabase(orderId);
      if (!result?.id) {
        await incrementStockQuantity(orderRow.stock_id, -orderRow.order_quantity).catch(() => {});
        return { success: false, message: 'Order could not be cancelled' };
      }

      if (orderRow.stock_branch) {
        const companyId = await fetchBranchCompany(orderRow.stock_branch);
        if (companyId) {
          try {
            const orderDebitSum = await sumOrderLedgerOrderDebits(orderId);
            if (orderDebitSum > 0) {
              await insertCustomerTransaction({
                company: companyId,
                customer: orderRow.customer_id,
                amount: -orderDebitSum,
                type: 'adjustment',
                reference: orderId,
                reference_type: 'order',
                note: 'Order cancelled — ledger reversal',
                created_by: merchantId,
              });
            }
          } catch (ledgerErr) {
            return {
              success: false,
              message: `Order cancelled but ledger reversal failed: ${ledgerErr instanceof Error ? ledgerErr.message : 'Unknown error'}`,
              orderId: result.id,
            };
          }
        }
      }

      return {
        success: true,
        message: 'Order cancelled successfully',
        orderId: result.id,
      };
    } catch (error) {
      try {
        await incrementStockQuantity(orderRow.stock_id, -orderRow.order_quantity);
      } catch {
        // Rollback failed; stock may be overstated until corrected manually.
      }
      return {
        success: false,
        message: `Failed to cancel order: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
