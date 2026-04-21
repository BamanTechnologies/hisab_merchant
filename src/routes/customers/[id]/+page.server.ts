import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { fetchBranchCompanyId } from '$lib/companyInvestors.server';
import { fetchCustomerLatestBalance } from '$lib/customerTransactions.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { buildStockLabel } from '$lib/stockLabel';

const VERIFY_COMPANY_CUSTOMER_JUNCTION_QUERY = `
  query CustomerDetailVerifyJunction($companyId: uuid!, $customerId: uuid!, $branchId: uuid!) {
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
  query CustomerDetailByPk($id: uuid!) {
    customers_by_pk(id: $id) {
      id
      first_name
      last_name
      phone_number
      address
      created_at
    }
  }
`;

const FETCH_BRANCH_IDS_FOR_COMPANY_QUERY = `
  query CustomerDetailBranchIds($companyId: uuid!) {
    branches(where: { company: { _eq: $companyId } }) {
      id
    }
  }
`;

/** One round trip: orders + aggregates + payments filtered via `order` (avoids second request after order ids). */
const FETCH_CUSTOMER_ACTIVITY_QUERY = `
  query CustomerDetailActivity(
    $customerId: uuid!
    $branchIds: [uuid!]!
  ) {
    orders(
      where: {
        _and: [
          { customer_id: { _eq: $customerId } }
          { stock: { branch: { _in: $branchIds } } }
        ]
      }
      order_by: { created_at: desc }
    ) {
      id
      created_at
      created_by
      customer_name
      customer_phone
      customer_address
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
    orders_aggregate(
      where: {
        _and: [
          { customer_id: { _eq: $customerId } }
          { stock: { branch: { _in: $branchIds } } }
          { status: { _in: ["unpaid", "paid", "partially_paid"] } }
        ]
      }
    ) {
      aggregate {
        sum {
          total_amount
        }
      }
    }
    payments_for_list: payment(
      where: {
        order: {
          _and: [
            { customer_id: { _eq: $customerId } }
            { stock: { branch: { _in: $branchIds } } }
          ]
        }
      }
      order_by: { id: desc }
    ) {
      id
      amount
      created_by
      order_id
      payment_method
    }
    payments_received_aggregate: payment_aggregate(
      where: {
        _and: [
          { payment_method: { _neq: "Customer balance" } }
          {
            order: {
              _and: [
                { customer_id: { _eq: $customerId } }
                { stock: { branch: { _in: $branchIds } } }
              ]
            }
          }
        ]
      }
    ) {
      aggregate {
        sum {
          amount
        }
      }
    }
  }
`;

/** Fallback if Hasura has no `order` object relationship on `payment`. */
const FETCH_PAYMENTS_FOR_ORDERS_QUERY = `
  query CustomerDetailPayments($orderIds: [uuid!]!) {
    payment(
      where: { order_id: { _in: $orderIds } }
      order_by: { id: desc }
    ) {
      id
      amount
      created_by
      order_id
      payment_method
    }
    payments_received_aggregate: payment_aggregate(
      where: {
        _and: [
          { order_id: { _in: $orderIds } }
          { payment_method: { _neq: "Customer balance" } }
        ]
      }
    ) {
      aggregate {
        sum {
          amount
        }
      }
    }
  }
`;

const FETCH_MERCHANTS_BY_IDS_QUERY = `
  query CustomerDetailPaymentMerchantsByIds($ids: [uuid!]!) {
    merchant(where: { id: { _in: $ids } }) {
      id
      first_name
      last_name
    }
  }
`;

const FETCH_CUSTOMER_ORDERS_ONLY_QUERY = `
  query CustomerDetailOrdersOnly(
    $customerId: uuid!
    $branchIds: [uuid!]!
  ) {
    orders(
      where: {
        _and: [
          { customer_id: { _eq: $customerId } }
          { stock: { branch: { _in: $branchIds } } }
        ]
      }
      order_by: { created_at: desc }
    ) {
      id
      created_at
      created_by
      customer_name
      customer_phone
      customer_address
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
    orders_aggregate(
      where: {
        _and: [
          { customer_id: { _eq: $customerId } }
          { stock: { branch: { _in: $branchIds } } }
          { status: { _in: ["unpaid", "paid", "partially_paid"] } }
        ]
      }
    ) {
      aggregate {
        sum {
          total_amount
        }
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

function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function verifyCustomerInCompany(
  companyId: string,
  customerId: string,
  branchId: string | null,
): Promise<boolean> {
  if (!branchId) {
    return false;
  }

  try {
    const junction = await gql<{
      company_customer: Array<{ id: string } | null>;
    }>(VERIFY_COMPANY_CUSTOMER_JUNCTION_QUERY, {
      companyId,
      customerId,
      branchId,
    });
    return Boolean(junction.company_customer?.[0]?.id);
  } catch {
    return false;
  }
}

export type CustomerDetailOrder = {
  id: string;
  created_at: string;
  created_by: string;
  customer_name: string;
  customer_phone: string | number;
  customer_address: string;
  order_quantity: number;
  status: string;
  stock_id: string;
  total_amount: number;
  outstanding_amount: number;
  stock_name?: string;
  unit?: string | null;
  stock?: {
    unit?: string | null;
    type?: string | null;
    product_type?: string | null;
    attributes?: Record<string, unknown> | null;
    model_number?: string | null;
    country?: string | null;
    color?: string | null;
    figure?: string | null;
    thickness?: number | string | null;
  } | null;
};

export type CustomerDetailPayment = {
  id: string;
  amount: number;
  created_by: string;
  created_by_name?: string;
  order_id: string;
  payment_method: string;
};

function normalizeOrderRow(raw: Record<string, unknown>): CustomerDetailOrder {
  const stock =
    raw.stock && typeof raw.stock === 'object'
      ? (raw.stock as Record<string, unknown>)
      : null;
  const stockId = String(raw.stock_id ?? '');
  return {
    id: String(raw.id),
    created_at: String(raw.created_at ?? ''),
    created_by: String(raw.created_by ?? ''),
    customer_name: String(raw.customer_name ?? ''),
    customer_phone: raw.customer_phone as string | number,
    customer_address: String(raw.customer_address ?? ''),
    order_quantity: Number(raw.order_quantity) || 0,
    status: String(raw.status ?? ''),
    stock_id: stockId,
    total_amount: parseMoney(raw.total_amount),
    outstanding_amount: parseMoney(raw.outstanding_amount),
    stock_name: stock ? buildStockLabel(stock) : stockId.slice(0, 8) + '…',
    unit: raw.unit as string | null | undefined,
    stock: raw.stock as CustomerDetailOrder['stock'],
  };
}

function normalizePaymentRow(raw: Record<string, unknown>): CustomerDetailPayment {
  return {
    id: String(raw.id),
    amount: parseMoney(raw.amount),
    created_by: String(raw.created_by ?? ''),
    order_id: String(raw.order_id ?? ''),
    payment_method: String(raw.payment_method ?? ''),
  };
}

function merchantDisplayName(first?: string | null, last?: string | null): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || '—';
}

async function attachPaymentCreatorNames(
  rows: CustomerDetailPayment[],
): Promise<CustomerDetailPayment[]> {
  const ids = [
    ...new Set(rows.map((r) => r.created_by).filter((id) => typeof id === 'string' && id.length > 0)),
  ];
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, created_by_name: '—' }));
  }

  let nameById = new Map<string, string>();
  try {
    const data = await gql<{
      merchant: { id: string; first_name?: string | null; last_name?: string | null }[];
    }>(FETCH_MERCHANTS_BY_IDS_QUERY, { ids });
    for (const m of data.merchant ?? []) {
      nameById.set(m.id, merchantDisplayName(m.first_name, m.last_name));
    }
  } catch {}

  return rows.map((r) => ({
    ...r,
    created_by_name: nameById.get(r.created_by) ?? '—',
  }));
}

export const load: PageServerLoad = async ({ params, request, parent }) => {
  const customerId = params.id;
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;

  if (!merchantId) {
    throw error(401, 'Unauthorized');
  }

  let companyId = merchantContext?.companyId ?? null;
  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (merchantId ? await fetchMerchantBranchId(merchantId) : null);
  if (!companyId && merchantBranchId) {
    companyId = await fetchBranchCompanyId(merchantBranchId);
  }

  if (!companyId) {
    throw error(404, 'Company not found for this merchant');
  }

  let customerRow: { customers_by_pk: Record<string, unknown> | null };
  try {
    customerRow = await gql<{ customers_by_pk: Record<string, unknown> | null }>(
      FETCH_CUSTOMER_BY_PK_QUERY,
      { id: customerId },
    );
  } catch {
    throw error(404, 'Customer not found');
  }

  if (!customerRow.customers_by_pk?.id) {
    throw error(404, 'Customer not found');
  }

  let allowed: boolean;
  let branchIds: string[] = [];

  try {
    const [junctionOk, br] = await Promise.all([
      verifyCustomerInCompany(companyId, customerId, merchantBranchId),
      gql<{ branches: { id: string }[] }>(FETCH_BRANCH_IDS_FOR_COMPANY_QUERY, {
        companyId,
      }),
    ]);
    allowed = junctionOk;
    branchIds = (br.branches ?? []).map((b) => b.id).filter(Boolean);
  } catch {
    allowed = await verifyCustomerInCompany(companyId, customerId, merchantBranchId);
    branchIds = [];
  }

  if (!allowed) {
    throw error(404, 'Customer not found');
  }

  const c = customerRow.customers_by_pk;

  /** Orders/payments for this customer only in the merchant’s branch (or all company branches if no branch on user). */
  const activityBranchIds =
    merchantBranchId != null ? [merchantBranchId] : branchIds;

  let orders: CustomerDetailOrder[] = [];
  let totalOrderAmount = 0;
  let payments: CustomerDetailPayment[] = [];
  let totalPaymentAmount = 0;

  if (activityBranchIds.length > 0) {
    type ActivityBlock = {
      orders: Record<string, unknown>[];
      orders_aggregate: {
        aggregate: { sum: { total_amount: unknown } | null } | null;
      } | null;
      payments_for_list?: Record<string, unknown>[];
      payments_received_aggregate?: {
        aggregate: { sum: { amount: unknown } | null } | null;
      } | null;
    };

    try {
      const block = await gql<ActivityBlock>(FETCH_CUSTOMER_ACTIVITY_QUERY, {
        customerId,
        branchIds: activityBranchIds,
      });

      orders = (block.orders ?? []).map((o) => normalizeOrderRow(o));
      totalOrderAmount = parseMoney(
        block.orders_aggregate?.aggregate?.sum?.total_amount ?? 0,
      );
      payments = (block.payments_for_list ?? []).map((p) => normalizePaymentRow(p));
      totalPaymentAmount = parseMoney(
        block.payments_received_aggregate?.aggregate?.sum?.amount ?? 0,
      );
    } catch {
      try {
        const block = await gql<ActivityBlock>(FETCH_CUSTOMER_ORDERS_ONLY_QUERY, {
          customerId,
          branchIds: activityBranchIds,
        });
        orders = (block.orders ?? []).map((o) => normalizeOrderRow(o));
        totalOrderAmount = parseMoney(
          block.orders_aggregate?.aggregate?.sum?.total_amount ?? 0,
        );

        const orderIds = orders.map((o) => o.id);
        if (orderIds.length > 0) {
          const payBlock = await gql<{
            payment: Record<string, unknown>[];
            payments_received_aggregate: {
              aggregate: { sum: { amount: unknown } | null } | null;
            } | null;
          }>(FETCH_PAYMENTS_FOR_ORDERS_QUERY, { orderIds });

          payments = (payBlock.payment ?? []).map((p) => normalizePaymentRow(p));
          totalPaymentAmount = parseMoney(
            payBlock.payments_received_aggregate?.aggregate?.sum?.amount ?? 0,
          );
        }
      } catch {
        throw error(500, 'Failed to load customer activity');
      }
    }
  }
  payments = await attachPaymentCreatorNames(payments);

  /** Latest `customer_transactions.balance` for this customer + company (positive = owes, negative = credit / overpaid). */
  const outstandingAmount = await fetchCustomerLatestBalance(companyId, customerId);

  return {
    customer: {
      id: String(c.id),
      first_name: c.first_name != null ? String(c.first_name) : null,
      last_name: c.last_name != null ? String(c.last_name) : null,
      phone_number: c.phone_number != null ? String(c.phone_number) : null,
      address: c.address != null ? String(c.address) : null,
      created_at: c.created_at != null ? String(c.created_at) : null,
    },
    orders,
    payments,
    totalOrderAmount,
    totalPaymentAmount,
    outstandingAmount,
    merchantId,
  };
};
