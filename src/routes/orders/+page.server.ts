import type { PageServerLoad, Actions } from "./$types";
import { getUserIdFromRequest } from "$lib/auth";
import { fetchMerchantBranchId } from "$lib/merchantBranch.server";
import { createPaymentRecord } from "$lib/payments.server";
import {
  fetchCustomerLatestBalance,
  insertCustomerTransaction,
  sumOrderLedgerCustomerBalancePayments,
  sumOrderLedgerManualCashPayments,
  sumOrderLedgerOrderDebits,
} from "$lib/customerTransactions.server";
import { config, getGraphQLHeaders } from "$lib/config";
import { buildProductLabel } from "$lib/inventory/productLabel";
import {
  applyOrderStockEffects,
  decrementStockSlices,
  fetchCancelRestoreSlices,
  incrementStockSlices,
  insertOrderItemBatches,
  planOrderLines,
  restoreOrderStockEffects,
} from "$lib/inventory/orders.server";
import { buildStockLabel } from "$lib/stockLabel";
import { subscriptionWriteActionBlockedForRequest } from "$lib/subscription/server";

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
  query GetOrders(
    $filter: orders_bool_exp!
    $order: [orders_order_by!]
    $limit: Int
    $offset: Int
    $paymentFilter: payment_bool_exp!
    $paymentOrder: [payment_order_by!]
    $paymentLimit: Int
    $paymentOffset: Int
  ) {
    orders(
      where: $filter
      order_by: $order
      limit: $limit
      offset: $offset
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
      order_items(order_by: [{ created_at: asc }, { id: asc }]) {
        stock_id
        product_id
        quantity
        unit
        line_total
        unit_price
        factor_snapshot
        product {
          id
          name
          default_unit
          factor
          attributes
          product_type {
            id
            name
          }
        }
        order_item_batches {
          stock_id
          quantity
          unit_price
          line_total
          stock {
            batch_number
            selling_price
          }
        }
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
    total_orders: orders_aggregate(where: $filter) {
      aggregate {
        count
      }
    }
    summary_orders: orders(
      where: { _and: [$filter, { status: { _neq: "cancelled" } }] }
    ) {
      total_amount
    }
    payment(
      where: $paymentFilter
      order_by: $paymentOrder
      limit: $paymentLimit
      offset: $paymentOffset
    ) {
      id
      order_id
      amount
      created_at
      payment_method
      created_by
    }
    total_payments: payment_aggregate(where: $paymentFilter) {
      aggregate {
        count
      }
    }
    summary_payments: payment(where: $paymentFilter) {
      amount
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
      order_items(order_by: [{ created_at: asc }, { id: asc }]) {
        stock_id
        quantity
        stock {
          branch
          type
          product_type
          attributes
        }
      }
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

const CREATE_ORDER_MUTATION = `
  mutation CreateOrder($object: orders_insert_input!) {
    insert_orders_one(object: $object) {
      id
    }
  }
`;

const CREATE_ORDER_ITEMS_BULK_MUTATION = `
  mutation CreateOrderItemsBulk($objects: [order_items_insert_input!]!) {
    insert_order_items(objects: $objects) {
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

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
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
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
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

async function fetchOrders(
  merchantId: string,
  filter: Record<string, unknown>,
  order: Record<string, unknown>[],
  limit: number,
  offset: number,
  paymentFilter: Record<string, unknown>,
  paymentOrder: Record<string, unknown>[],
  paymentLimit: number,
  paymentOffset: number,
) {
  try {
    const data = await gql<{
      orders: unknown[];
      total_orders: { aggregate: { count: number } };
      summary_orders: Array<{ total_amount: unknown }>;
      payment: unknown[];
      total_payments: { aggregate: { count: number } };
      summary_payments: Array<{ amount: unknown }>;
    }>(FETCH_ORDERS_QUERY, {
      filter,
      order,
      limit,
      offset,
      paymentFilter,
      paymentOrder,
      paymentLimit,
      paymentOffset,
    });
    const orders = (data.orders ?? []).map((row) => {
      if (!row || typeof row !== "object") return row;
      const rec = row as Record<string, unknown>;
      const itemsRaw = Array.isArray(rec.order_items) ? rec.order_items : [];
      const items = itemsRaw.filter((x): x is Record<string, unknown> =>
        Boolean(x && typeof x === "object"),
      );
      const stock =
        rec.stock && typeof rec.stock === "object"
          ? (rec.stock as Record<string, unknown>)
          : null;
      const fallbackId = String(rec.stock_id ?? "").slice(0, 8) + "…";
      const itemNames = items
        .map((it) => {
          const p = it.product;
          if (p && typeof p === "object") {
            return buildProductLabel(
              p as Parameters<typeof buildProductLabel>[0],
            );
          }
          const s = it.stock;
          if (s && typeof s === "object")
            return buildStockLabel(s as Record<string, unknown>);
          const sid = String(it.stock_id ?? "").trim();
          return sid ? `${sid.slice(0, 8)}…` : "";
        })
        .filter((x) => x.length > 0);
      const mergedName =
        itemNames.length === 0
          ? null
          : itemNames.length <= 2
            ? itemNames.join(" + ")
            : `${itemNames[0]} +${itemNames.length - 1} more`;
      return {
        ...rec,
        stock_name: mergedName ?? (stock ? buildStockLabel(stock) : fallbackId),
      };
    });
    const payments = (data.payment ?? []).filter(
      (row): row is Record<string, unknown> =>
        Boolean(row && typeof row === "object"),
    );
    const parseMoney = (v: unknown): number => {
      if (v === null || v === undefined) return 0;
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      const n = Number(String(v).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };
    const totalOrdersAmount = (data.summary_orders ?? []).reduce(
      (sum, r) => sum + parseMoney(r.total_amount),
      0,
    );
    const totalPaymentsAmount = (data.summary_payments ?? []).reduce(
      (sum, r) => sum + parseMoney(r.amount),
      0,
    );
    return {
      orders,
      payments,
      totalOrders: data.total_orders?.aggregate?.count ?? 0,
      totalPayments: data.total_payments?.aggregate?.count ?? 0,
      totalOrdersAmount,
      totalPaymentsAmount,
    };
  } catch (e) {
    console.log("error loading orders new:", e);
    return {
      orders: [] as unknown[],
      payments: [] as Record<string, unknown>[],
      totalOrders: 0,
      totalPayments: 0,
      totalOrdersAmount: 0,
      totalPaymentsAmount: 0,
    };
  }
}

type MerchantOrderCancelRow = {
  id: string;
  status: string;
  customer_id: string;
  total_amount: number;
  outstanding_amount: number;
  stock_branch: string | null;
  lines: Array<{ stock_id: string; quantity: number }>;
};

function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
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
        status?: string | null;
        customer_id?: string | null;
        total_amount?: unknown;
        outstanding_amount?: unknown;
        order_items?: Array<{
          stock_id?: string | null;
          quantity?: unknown;
          stock?: { branch?: string | null } | null;
        }> | null;
        stock?: { branch?: string | null } | null;
      }>;
    }>(FETCH_ORDER_CANCEL_CONTEXT_QUERY, { id: orderId, merchantId });
    const row = data.orders?.[0];
    if (!row) return null;
    const lines = (row.order_items ?? [])
      .map((it) => ({
        stock_id: String(it?.stock_id ?? "").trim(),
        quantity: Number(it?.quantity),
      }))
      .filter(
        (it) =>
          it.stock_id !== "" && Number.isFinite(it.quantity) && it.quantity > 0,
      );
    const fallbackStockId = String(
      (row as { stock_id?: string | null }).stock_id ?? "",
    ).trim();
    const fallbackQty = Number(
      (row as { order_quantity?: unknown }).order_quantity,
    );
    const normalizedLines =
      lines.length > 0
        ? lines
        : fallbackStockId && Number.isFinite(fallbackQty) && fallbackQty > 0
          ? [{ stock_id: fallbackStockId, quantity: fallbackQty }]
          : [];
    if (normalizedLines.length === 0) return null;
    const customerId = String(row.customer_id ?? "").trim();
    if (!customerId) return null;
    const firstLineBranch =
      row.order_items?.find((x) => x?.stock?.branch)?.stock?.branch ?? null;
    return {
      id: row.id,
      status: String(row.status ?? "").trim() || "unpaid",
      customer_id: customerId,
      total_amount: parseMoney(row.total_amount),
      outstanding_amount: parseMoney(row.outstanding_amount),
      stock_branch: firstLineBranch ?? row.stock?.branch ?? null,
      lines: normalizedLines,
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
  const sumBefore = await fetchCustomerLatestBalance(
    opts.companyId,
    opts.customerId,
  );
  const extra = Math.max(0, -sumBefore);
  const total = opts.orderTotalAmount;

  if (extra === 0) {
    await insertCustomerTransaction({
      company: opts.companyId,
      customer: opts.customerId,
      amount: total,
      type: "order",
      reference: opts.orderId,
      reference_type: "order",
      note: "Order created",
      created_by: opts.userId,
    });
    return;
  }

  if (extra >= total) {
    await createPaymentRecord({
      amount: total,
      order_id: opts.orderId,
      payment_method: "Customer balance",
      created_by: opts.userId,
    });

    await insertCustomerTransaction({
      company: opts.companyId,
      customer: opts.customerId,
      amount: total,
      type: "payment",
      reference: opts.orderId,
      reference_type: "order",
      note: "Payment from customer balance",
      created_by: opts.userId,
    });
    return;
  }

  await createPaymentRecord({
    amount: extra,
    order_id: opts.orderId,
    payment_method: "Customer balance",
    created_by: opts.userId,
  });

  await insertCustomerTransaction({
    company: opts.companyId,
    customer: opts.customerId,
    amount: extra,
    type: "payment",
    reference: opts.orderId,
    reference_type: "order",
    note: "Partial payment from customer balance",
    created_by: opts.userId,
  });

  await insertCustomerTransaction({
    company: opts.companyId,
    customer: opts.customerId,
    amount: total - extra,
    type: "order",
    reference: opts.orderId,
    reference_type: "order",
    note: "Order created (unpaid portion after credit)",
    created_by: opts.userId,
  });
}

async function incrementStockQuantity(
  stockId: string,
  delta: number,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("Invalid stock quantity delta");
  }
  const data = await gql<{
    update_stock_by_pk: { id: string } | null;
  }>(INCREMENT_STOCK_QUANTITY_MUTATION, {
    id: stockId,
    delta,
  });
  if (!data.update_stock_by_pk?.id) {
    throw new Error("Stock row was not updated");
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
  const digits = String(phone ?? "").replace(/\D/g, "");
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

type OrderItemInsertObject = {
  order_id: string;
  stock_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  factor_snapshot: number;
  line_total: number;
  unit: string | null;
  created_by: string;
};

async function insertOrder(object: OrderInsertObject): Promise<{ id: string }> {
  const data = await gql<{
    insert_orders_one: { id: string } | null;
  }>(CREATE_ORDER_MUTATION, { object });
  const row = data.insert_orders_one;
  if (!row?.id) throw new Error("Order insert returned no row");
  return row;
}

async function insertOrderItemsBulk(objects: OrderItemInsertObject[]) {
  if (objects.length === 0) throw new Error("No order items to insert");
  const data = await gql<{
    insert_order_items: {
      affected_rows: number;
      returning: { id: string }[];
    };
  }>(CREATE_ORDER_ITEMS_BULK_MUTATION, { objects });
  const inserted = data.insert_order_items?.returning ?? [];
  const affected = data.insert_order_items?.affected_rows ?? 0;
  if (affected !== objects.length || inserted.length !== objects.length) {
    throw new Error(
      `Order items insert mismatch: expected ${objects.length} rows, got ${inserted.length} (affected_rows=${affected})`,
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
  if (typeof v === "string" && v.trim() === "") return null;
  const n =
    typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
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

async function fetchStocksByIdsForOrder(
  stockIds: string[],
): Promise<StockRowForOrder[]> {
  if (stockIds.length === 0) return [];
  try {
    const data = await gql<{ stock: StockRowForOrder[] }>(
      FETCH_STOCKS_BY_IDS_QUERY,
      {
        ids: stockIds,
      },
    );
    return data.stock ?? [];
  } catch {
    return [];
  }
}

type OrderLineInput = {
  product_id: string;
  quantity: number;
  unit_price: number;
};

export const load: PageServerLoad = async ({ request, parent, url }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (merchantId ? await fetchMerchantBranchId(merchantId) : null);
  const knownCompanyId = merchantContext?.companyId ?? null;

  const customerCtx =
    merchantId != null
      ? await fetchCustomersByMerchant(
          merchantId,
          merchantBranchId,
          knownCompanyId,
        )
      : { companyId: null as string | null, customers: [] as CustomerRecord[] };

  let companyId = customerCtx.companyId;
  if (!companyId && merchantBranchId) {
    companyId = await fetchBranchCompany(merchantBranchId);
  }

  const dateRange = url.searchParams.get("dateRange") ?? "all";
  const customerName = url.searchParams.get("customer") ?? "";
  const sort = url.searchParams.get("sort") ?? "none";
  const dir = url.searchParams.get("dir") ?? "desc";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 10);
  const offset = (page - 1) * pageSize;

  const conditions: Record<string, unknown>[] = [
    { created_by: { _eq: merchantId } },
  ];

  if (customerName) {
    conditions.push({ customer_name: { _eq: customerName } });
  }

  if (dateRange === "today") {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    ).toISOString();
    conditions.push({ created_at: { _gte: start, _lte: end } });
  } else if (dateRange === "last7") {
    const from = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    conditions.push({ created_at: { _gte: from } });
  } else if (dateRange === "last30") {
    const from = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    conditions.push({ created_at: { _gte: from } });
  } else if (dateRange === "custom") {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (from) conditions.push({ created_at: { _gte: from } });
    if (to) conditions.push({ created_at: { _lte: to } });
  }

  const filter: Record<string, unknown> = { _and: conditions };

  const sortFieldMap: Record<string, string> = {
    date: "created_at",
    stock: "stock_id",
    customer: "customer_name",
    quantity: "order_quantity",
    status: "status",
    total: "total_amount",
  };
  const sortField = sortFieldMap[sort];
  const order =
    sortField && sortField !== "none"
      ? [{ [sortField]: dir }]
      : [{ created_at: "desc" }];

  const paymentFilter: Record<string, unknown> = {
    created_by: { _eq: merchantId },
  };
  const paymentOrder = [{ created_at: "desc" }];

  const [ordersBlock, branches] = await Promise.all([
    merchantId
      ? fetchOrders(
          merchantId,
          filter,
          order,
          pageSize,
          offset,
          paymentFilter,
          paymentOrder,
          pageSize,
          offset,
        )
      : Promise.resolve({
          orders: [] as unknown[],
          payments: [] as Record<string, unknown>[],
          totalOrders: 0,
          totalPayments: 0,
          totalOrdersAmount: 0,
          totalPaymentsAmount: 0,
        }),
    fetchBranchesForCompany(companyId),
  ]);

  return {
    orders: ordersBlock.orders,
    payments: ordersBlock.payments,
    totalOrders: ordersBlock.totalOrders,
    totalPayments: ordersBlock.totalPayments,
    totalOrdersAmount: ordersBlock.totalOrdersAmount,
    totalPaymentsAmount: ordersBlock.totalPaymentsAmount,
    customers: customerCtx.customers,
    branches,
    merchantId,
    merchantBranchId,
    companyId,
  };
};

export const actions: Actions = {
  createOrders: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return { success: false, message: "Authentication required" };
    }

    const formData = await request.formData();
    const customerId = String(formData.get("customerId") ?? "").trim();
    const linesRaw = String(formData.get("lines") ?? "").trim();

    if (!customerId) {
      return { success: false, message: "Select a customer" };
    }

    let lines: OrderLineInput[] = [];
    try {
      const parsed = JSON.parse(linesRaw) as unknown;
      if (!Array.isArray(parsed)) {
        return { success: false, message: "Invalid order lines" };
      }
      lines = parsed as OrderLineInput[];
    } catch {
      return { success: false, message: "Invalid order lines JSON" };
    }

    if (lines.length === 0) {
      return { success: false, message: "Add at least one product line" };
    }

    if (lines.length > 15) {
      return { success: false, message: "Too many lines (max 15)" };
    }

    const uniqueProductIds = [...new Set(lines.map((l) => l.product_id))];
    if (uniqueProductIds.length !== lines.length) {
      return { success: false, message: "Duplicate product in order lines" };
    }

    for (const line of lines) {
      const q = Number(line.quantity);
      const up = Number(line.unit_price);
      if (!line.product_id) {
        return {
          success: false,
          message: "Each line needs a product and quantity",
        };
      }
      if (!Number.isFinite(q) || q < 1) {
        return { success: false, message: "Quantity must be at least 1" };
      }
      if (!Number.isFinite(up) || up <= 0) {
        return {
          success: false,
          message: "Each line needs a valid unit price greater than zero",
        };
      }
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);
    if (!merchantBranchId) {
      return {
        success: false,
        message: "You must be assigned to a branch to create orders",
      };
    }

    const customerCtx = await fetchCustomersByMerchant(
      userId,
      merchantBranchId,
    );
    let companyId = customerCtx.companyId;
    if (!companyId && merchantBranchId) {
      companyId = await fetchBranchCompany(merchantBranchId);
    }

    if (!companyId) {
      return {
        success: false,
        message: "Company could not be resolved for your branch",
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
        message: "Customer is not valid for your company or branch",
      };
    }

    const customer_name = [customer.first_name, customer.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const customer_address = String(customer.address ?? "").trim();
    const customer_phone = phoneToNumeric(
      customer.phone ?? customer.phone_number,
    );

    let plans;
    try {
      plans = await planOrderLines({
        lines: lines.map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
        })),
        branchId: merchantBranchId,
      });
    } catch (err) {
      return {
        success: false,
        message:
          err instanceof Error ? err.message : "Could not plan order lines",
      };
    }

    let totalOrderQuantity = 0;
    let totalOrderAmount = 0;
    let headerUnit: string | null = null;
    for (const plan of plans) {
      totalOrderQuantity += plan.quantity;
      totalOrderAmount += plan.line_total;
      headerUnit = headerUnit ?? plan.unit;
    }

    const orderObject: OrderInsertObject = {
      created_by: userId,
      customer_id: customerId,
      customer_name: customer_name || "Customer",
      customer_address,
      customer_phone,
      order_quantity: totalOrderQuantity,
      stock_id: plans[0].legacy_stock_id,
      total_amount: totalOrderAmount,
      outstanding_amount: totalOrderAmount,
      status: "unpaid",
      unit: headerUnit,
    };

    const allSlices = plans.flatMap((p) =>
      p.slices.map((s) => ({ stock_id: s.stock_id, quantity: s.quantity })),
    );

    try {
      await decrementStockSlices(allSlices);
    } catch (err) {
      return {
        success: false,
        message: `Failed to reserve stock quantities: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }

    let inserted: { id: string };
    try {
      inserted = await insertOrder(orderObject);
      const insertedItems = await insertOrderItemsBulk(
        plans.map((plan) => ({
          order_id: inserted.id,
          stock_id: plan.legacy_stock_id,
          product_id: plan.product_id,
          quantity: plan.quantity,
          unit_price: plan.unit_price,
          factor_snapshot: plan.factor,
          line_total: plan.line_total,
          unit: plan.unit,
          created_by: userId,
        })),
      );

      const batchObjects: Array<{
        order_item_id: string;
        stock_id: string;
        quantity: number;
        unit_price: number;
        factor_snapshot: number;
        line_total: number;
        created_by: string;
      }> = [];

      for (let i = 0; i < plans.length; i++) {
        const itemId = insertedItems[i]?.id;
        if (!itemId) throw new Error("Order item insert missing id");
        for (const slice of plans[i].slices) {
          batchObjects.push({
            order_item_id: itemId,
            stock_id: slice.stock_id,
            quantity: slice.quantity,
            unit_price: slice.unit_price_snapshot,
            factor_snapshot: slice.factor_snapshot,
            line_total: slice.line_total,
            created_by: userId,
          });
        }
      }

      await insertOrderItemBatches(batchObjects);
      await applyOrderStockEffects({
        plans,
        companyId,
        branchId: merchantBranchId,
        orderId: inserted.id,
        userId,
      });
    } catch (err) {
      await incrementStockSlices(allSlices).catch(() => {});
      return {
        success: false,
        message: `Failed to create order: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }

    try {
      await postOrderLedgerAndAutoPay({
        userId,
        companyId,
        customerId,
        orderId: inserted.id,
        orderTotalAmount: totalOrderAmount,
      });
    } catch (err) {
      return {
        success: false,
        message: `Order created but ledger / balance step failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }

    return {
      success: true,
      message: "Order created successfully",
    };
  },

  createCustomer: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return { success: false, message: "Authentication required" };
    }

    const formData = await request.formData();
    const first_name = String(formData.get("first_name") ?? "").trim();
    const last_name = String(formData.get("last_name") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const phone = String(formData.get("phone_number") ?? "").trim();

    if (!first_name || !last_name) {
      return { success: false, message: "First and last name are required" };
    }

    if (!phone) {
      return { success: false, message: "Phone is required" };
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);
    const customerCtx = await fetchCustomersByMerchant(
      userId,
      merchantBranchId,
    );
    let companyId = customerCtx.companyId;
    if (!companyId && merchantBranchId) {
      companyId = await fetchBranchCompany(merchantBranchId);
    }

    if (!companyId) {
      return {
        success: false,
        message: "Company could not be resolved for your branch",
      };
    }

    if (!merchantBranchId) {
      return {
        success: false,
        message: "You must be assigned to a branch to add customers",
      };
    }

    try {
      const ins = await gql<{
        insert_customers_one: CustomerRecord | null;
      }>(INSERT_CUSTOMER_MUTATION, {
        first_name,
        last_name,
        phone_number: phone,
        address: address || "",
      });

      const created = ins.insert_customers_one;
      if (!created?.id) {
        return { success: false, message: "Customer was not created" };
      }

      await gql(INSERT_COMPANY_CUSTOMER_MUTATION, {
        company: companyId,
        customer: created.id,
        branch: merchantBranchId,
      });

      const customer = normalizeCustomer(created);

      return {
        success: true,
        message: "Customer added",
        customer,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to add customer: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  },

  cancelOrder: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();
    const orderId = formData.get("orderId") as string;
    const partialRefundRaw = String(
      formData.get("partialCancelRefund") ?? "",
    ).trim();

    if (!orderId) {
      return {
        success: false,
        message: "Order ID is required",
      };
    }

    const merchantId = getUserIdFromRequest(request);
    if (!merchantId) {
      return { success: false, message: "Authentication required" };
    }

    const orderRow = await fetchMerchantOrderForCancel(orderId, merchantId);
    if (!orderRow) {
      return { success: false, message: "Order not found" };
    }

    const statusNorm = String(orderRow.status ?? "")
      .trim()
      .toLowerCase();

    if (statusNorm === "cancelled") {
      return { success: false, message: "This order is already cancelled" };
    }
    if (statusNorm === "paid") {
      return { success: false, message: "Paid orders cannot be cancelled" };
    }

    let partialCancelRefund: "" | "balance" | "cash" = "";
    if (partialRefundRaw === "balance" || partialRefundRaw === "cash") {
      partialCancelRefund = partialRefundRaw;
    }
    if (statusNorm === "partially_paid") {
      if (partialCancelRefund !== "balance" && partialCancelRefund !== "cash") {
        return {
          success: false,
          message:
            "Partially paid orders: choose whether you refunded the customer in cash or left the amount on their balance.",
        };
      }
    }

    let restoreSlices: Awaited<ReturnType<typeof fetchCancelRestoreSlices>> = {
      slices: [],
      unit: null,
    };
    try {
      restoreSlices = await fetchCancelRestoreSlices(orderId);
      if (restoreSlices.slices.length === 0) {
        return {
          success: false,
          message: "Order has no stock lines to restore",
        };
      }
      await incrementStockSlices(restoreSlices.slices);
    } catch (error) {
      return {
        success: false,
        message: `Could not restore stock quantity: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    try {
      const result = await cancelOrderInDatabase(orderId);
      if (!result?.id) {
        await decrementStockSlices(restoreSlices.slices).catch(() => {});
        return { success: false, message: "Order could not be cancelled" };
      }

      if (orderRow.stock_branch) {
        const companyId = await fetchBranchCompany(orderRow.stock_branch);
        if (companyId) {
          try {
            await restoreOrderStockEffects({
              slices: restoreSlices.slices,
              companyId,
              branchId: orderRow.stock_branch,
              orderId,
              userId: merchantId,
              unit: restoreSlices.unit,
            });
          } catch {
            // Stock qty already restored; movement audit failure is non-fatal for cancel.
          }

          try {
            const orderDebitSum = await sumOrderLedgerOrderDebits(orderId);
            /**
             * Reversal must match **remaining obligation**, not always full `type: order` rows.
             *
             * Split-payment allocation often lowers `orders.outstanding_amount` via triggers while the ledger
             * still has one full `+total_amount` line on this order and **no** per-order payment rows.
             * Reversing the full debit double-counts against cash booked only on another order → bogus credit.
             *
             * When ledger splits unpaid (`partial balance`), debits ≈ outstanding — same number.
             */
            const outstandingAmt = Math.max(
              0,
              parseMoney(orderRow.outstanding_amount),
            );
            const debitMag = Math.abs(orderDebitSum);
            let reversalMag = 0;
            if (debitMag > 0) {
              reversalMag =
                outstandingAmt > 0
                  ? Math.min(debitMag, outstandingAmt)
                  : debitMag;
            } else if (outstandingAmt > 0) {
              reversalMag = outstandingAmt;
            }
            if (reversalMag !== 0 && Number.isFinite(reversalMag)) {
              const debitSign =
                orderDebitSum !== 0 && Number.isFinite(orderDebitSum)
                  ? Math.sign(orderDebitSum)
                  : 1;
              await insertCustomerTransaction({
                company: companyId,
                customer: orderRow.customer_id,
                amount: -debitSign * reversalMag,
                type: "adjustment",
                reference: orderId,
                reference_type: "order",
                note: "Order cancelled — ledger reversal",
                created_by: merchantId,
              });
            }

            /**
             * Partial pay from prepaid posts `type: payment` with positive amounts (credit consumed).
             * Reversing only `type: order` leaves those rows — ledger wrongly shows debt matching that slice.
             * Undo balance-application lines first; cash refund then offsets that undo for a net-zero position.
             */
            if (statusNorm === "partially_paid") {
              const balanceAppliedSum =
                await sumOrderLedgerCustomerBalancePayments(orderId);
              if (
                balanceAppliedSum !== 0 &&
                Number.isFinite(balanceAppliedSum)
              ) {
                await insertCustomerTransaction({
                  company: companyId,
                  customer: orderRow.customer_id,
                  amount: -balanceAppliedSum,
                  type: "adjustment",
                  reference: orderId,
                  reference_type: "order",
                  note: "Order cancelled — reverse prepaid applied to order",
                  created_by: merchantId,
                });

                if (partialCancelRefund === "cash") {
                  await insertCustomerTransaction({
                    company: companyId,
                    customer: orderRow.customer_id,
                    amount: balanceAppliedSum,
                    type: "refund",
                    reference: orderId,
                    reference_type: "order",
                    note: "Order cancelled — cash refund recorded",
                    created_by: merchantId,
                  });
                }
              }

              /**
               * Manual cash/bank on this order (`payment` with negative amount) does not hit the prepaid undo above.
               * “Refund to customer balance” must convert that slice back into prepaid (negative running balance).
               */
              if (partialCancelRefund === "balance") {
                const manualCashSum =
                  await sumOrderLedgerManualCashPayments(orderId);
                const manualCashPaidMag = Math.max(0, -manualCashSum);
                if (
                  manualCashPaidMag > 0 &&
                  Number.isFinite(manualCashPaidMag)
                ) {
                  await insertCustomerTransaction({
                    company: companyId,
                    customer: orderRow.customer_id,
                    amount: -manualCashPaidMag,
                    type: "adjustment",
                    reference: orderId,
                    reference_type: "order",
                    note: "Order cancelled — cash payment released to customer balance",
                    created_by: merchantId,
                  });
                }
              }
            }
          } catch (ledgerErr) {
            return {
              success: false,
              message: `Order cancelled but ledger reversal failed: ${ledgerErr instanceof Error ? ledgerErr.message : "Unknown error"}`,
              orderId: result.id,
            };
          }
        }
      }

      return {
        success: true,
        message: "Order cancelled successfully",
        orderId: result.id,
      };
    } catch (error) {
      try {
        if (restoreSlices.slices.length > 0) {
          await decrementStockSlices(restoreSlices.slices);
        }
      } catch {
        // Rollback failed; stock may be overstated until corrected manually.
      }
      return {
        success: false,
        message: `Failed to cancel order: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};
