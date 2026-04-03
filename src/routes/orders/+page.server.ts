import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { config, getGraphQLHeaders } from '$lib/config';

const FETCH_BRANCH_BY_PK_QUERY = `
  query OrdersBranchByPk($id: uuid!) {
    branches_by_pk(id: $id) {
      id
      company
    }
  }
`;

/** `customer` on `company_customer` is a UUID column here — load rows then `customers` in a second query. */
const FETCH_COMPANY_CUSTOMER_IDS_QUERY = `
  query CompanyCustomerIds($companyId: uuid!) {
    company_customer(where: { company: { _eq: $companyId } }) {
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
  query VerifyCompanyCustomerJunction($companyId: uuid!, $customerId: uuid!) {
    company_customer(
      where: {
        _and: [
          { company: { _eq: $companyId } }
          { customer: { _eq: $customerId } }
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

const FETCH_STOCKS_BY_BRANCH_QUERY = `
  query OrdersStocksByBranch($branchId: uuid!) {
    stock(where: { branch: { _eq: $branchId } }) {
      id
      branch
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
    }
  }
`;

const DELETE_ORDER_MUTATION = `
  mutation DeleteOrderById($id: uuid!) {
    delete_orders_by_pk(id: $id) {
      id
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
  mutation LinkCompanyCustomer($company: uuid!, $customer: uuid!) {
    insert_company_customer(objects: { company: $company, customer: $customer }) {
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
  if (!knownCompanyId && !merchantBranchId) {
    return { companyId: null, customers: [] };
  }

  try {
    const companyId =
      knownCompanyId ??
      (merchantBranchId != null ? await fetchBranchCompany(merchantBranchId) : null);
    if (!companyId) {
      return { companyId: null, customers: [] };
    }

    const junction = await gql<{
      company_customer: Array<{ id: string; customer: string } | null>;
    }>(FETCH_COMPANY_CUSTOMER_IDS_QUERY, { companyId });

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
): Promise<CustomerRecord | null> {
  try {
    const junction = await gql<{
      company_customer: Array<{ id: string } | null>;
    }>(VERIFY_COMPANY_CUSTOMER_JUNCTION_QUERY, { companyId, customerId });

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

async function fetchOrders(merchantId: string) {
  try {
    const data = await gql<{ orders: unknown[] }>(FETCH_ORDERS_QUERY, { merchantId });
    return data.orders ?? [];
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

async function deleteOrder(orderId: string) {
  const data = await gql<{ delete_orders_by_pk: { id: string } | null }>(
    DELETE_ORDER_MUTATION,
    { id: orderId },
  );
  return data.delete_orders_by_pk;
}

function phoneToNumeric(phone: string | number | null | undefined): number {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
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
  quantity: unknown;
  selling_price: unknown;
  factor?: unknown;
  unit?: string | null;
};

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

type OrderLineInput = { stock_id: string; quantity: number; unit?: string };

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

  const [orders, stocks] = await Promise.all([
    merchantId ? fetchOrders(merchantId) : Promise.resolve([]),
    merchantBranchId ? fetchStocksForBranch(merchantBranchId) : Promise.resolve([]),
  ]);

  return {
    orders,
    customers: customerCtx.customers,
    stocks,
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
      if (!line.stock_id) {
        return { success: false, message: 'Each line needs a stock item and quantity' };
      }
      if (!Number.isFinite(q) || q < 1) {
        return { success: false, message: 'Quantity must be at least 1' };
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

    const customer = await verifyCustomerInCompany(companyId, customerId);
    if (!customer) {
      return { success: false, message: 'Customer is not valid for your company' };
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
      if (!Number.isFinite(available) || q > available) {
        return {
          success: false,
          message: `Quantity exceeds available stock for one or more lines`,
        };
      }

      const selling = parseMoney(stockRow.selling_price);
      const factorRaw = stockRow.factor;
      const factor =
        factorRaw != null && String(factorRaw).trim() !== ''
          ? Number(factorRaw)
          : 1;
      const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
      const total_amount = q * selling * f;
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

    try {
      await insertOrdersBulk(orderObjects);
    } catch (err) {
      return {
        success: false,
        message: `Failed to create orders: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
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

  deleteOrder: async ({ request }) => {
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

    const allowed = await orderBelongsToMerchant(orderId, merchantId);
    if (!allowed) {
      return { success: false, message: 'Order not found' };
    }

    try {
      const result = await deleteOrder(orderId);

      return {
        success: true,
        message: 'Order deleted successfully',
        deletedId: result?.id,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete order: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
