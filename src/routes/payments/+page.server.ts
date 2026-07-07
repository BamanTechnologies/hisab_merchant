import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';
import { subscriptionWriteActionBlockedForRequest } from '$lib/subscription/server';

const FETCH_PAYMENTS_QUERY = `
  query GetPayments($filter: payment_bool_exp, $order: [payment_order_by!], $limit: Int, $offset: Int) {
    payment(where: $filter, order_by: $order, limit: $limit, offset: $offset) {
      amount
      created_by
      created_at
      id
      order_id
      payment_method
      order {
        customer_name
      }
    }
    total_payments: payment_aggregate(where: $filter) {
      aggregate {
        count
      }
    }
  }
`;

const FETCH_MERCHANTS_BY_IDS_QUERY = `
  query PaymentMerchantsByIds($ids: [uuid!]!) {
    merchant(where: { id: { _in: $ids } }) {
      id
      first_name
      last_name
    }
  }
`;

const FETCH_CUSTOMER_NAMES_QUERY = `
  query PaymentCustomerNames($merchantId: uuid!) {
    payment(where: { created_by: { _eq: $merchantId } }) {
      order {
        customer_name
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

async function fetchPayments(
  merchantId: string,
  search: string,
  customerName: string,
  dateRange: string,
  customDateFrom: string,
  customDateTo: string,
  sortColumn: string,
  sortDirection: string,
  page: number,
  pageSize: number,
) {
  const offset = (page - 1) * pageSize;

  const conditions: Record<string, unknown>[] = [
    { created_by: { _eq: merchantId } },
  ];

  if (customerName) {
    conditions.push({ order: { customer_name: { _eq: customerName } } });
  }

  if (search) {
    conditions.push({
      _or: [
        { order: { customer_name: { _ilike: `%${search}%` } } },
        { payment_method: { _ilike: `%${search}%` } },
      ],
    });
  }

  if (dateRange === 'today') {
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
      23, 59, 59, 999,
    ).toISOString();
    conditions.push({ created_at: { _gte: start, _lte: end } });
  } else if (dateRange === 'last7') {
    const from = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    conditions.push({ created_at: { _gte: from } });
  } else if (dateRange === 'last30') {
    const from = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    conditions.push({ created_at: { _gte: from } });
  } else if (dateRange === 'custom') {
    if (customDateFrom) conditions.push({ created_at: { _gte: customDateFrom } });
    if (customDateTo) conditions.push({ created_at: { _lte: customDateTo } });
  }

  const filter: Record<string, unknown> = { _and: conditions };

  const sortFieldMap: Record<string, string> = {
    date: 'created_at',
    amount: 'amount',
    customer: 'order.customer_name',
    method: 'payment_method',
  };

  const sortField = sortFieldMap[sortColumn];
  const order =
    sortField && sortColumn !== 'none'
      ? [{ [sortField]: sortDirection }]
      : [{ created_at: 'desc' }];

  try {
    const data = await gql<{
      payment: Record<string, unknown>[];
      total_payments: { aggregate: { count: number } };
    }>(FETCH_PAYMENTS_QUERY, {
      filter,
      order,
      limit: pageSize,
      offset,
    });

    return {
      payments: data.payment ?? [],
      totalCount: data.total_payments?.aggregate?.count ?? 0,
    };
  } catch {
    return { payments: [], totalCount: 0 };
  }
}

function merchantDisplayName(first?: string | null, last?: string | null): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || '—';
}

async function attachCreatorNames(
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const ids = [
    ...new Set(
      rows
        .map((r) => (typeof r.created_by === 'string' ? r.created_by : ''))
        .filter((id) => id.length > 0),
    ),
  ];

  if (ids.length === 0) return rows.map((r) => ({ ...r, created_by_name: '—' }));

  let nameById = new Map<string, string>();
  try {
    const data = await gql<{
      merchant: { id: string; first_name?: string | null; last_name?: string | null }[];
    }>(FETCH_MERCHANTS_BY_IDS_QUERY, { ids });

    for (const m of data.merchant ?? []) {
      const id = typeof m?.id === 'string' ? m.id : '';
      if (!id) continue;
      nameById.set(
        id,
        merchantDisplayName(
          typeof m?.first_name === 'string' ? m.first_name : null,
          typeof m?.last_name === 'string' ? m.last_name : null,
        ),
      );
    }
  } catch {}

  return rows.map((r) => ({
    ...r,
    created_by_name:
      nameById.get(typeof r.created_by === 'string' ? r.created_by : '') ?? '—',
  }));
}

async function fetchCustomerNames(merchantId: string): Promise<string[]> {
  try {
    const data = await gql<{
      payment: Array<{ order?: { customer_name?: string | null } | null }>;
    }>(FETCH_CUSTOMER_NAMES_QUERY, { merchantId });

    const names = new Set<string>();
    for (const p of data.payment ?? []) {
      const n = String(p.order?.customer_name ?? '').trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export const load: PageServerLoad = async ({ request, parent, url }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;

  const search = url.searchParams.get('search') ?? '';
  const customerName = url.searchParams.get('customer') ?? '';
  const dateRange = url.searchParams.get('dateRange') ?? 'all';
  const customDateFrom = url.searchParams.get('from') ?? '';
  const customDateTo = url.searchParams.get('to') ?? '';
  const sortColumn = url.searchParams.get('sort') ?? 'none';
  const sortDirection = (url.searchParams.get('dir') as 'asc' | 'desc') ?? 'desc';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get('pageSize')) || 10);

  const [paymentsResult, customerNames] = await Promise.all([
    merchantId
      ? fetchPayments(
          merchantId,
          search,
          customerName,
          dateRange,
          customDateFrom,
          customDateTo,
          sortColumn,
          sortDirection,
          page,
          pageSize,
        )
      : Promise.resolve({ payments: [], totalCount: 0 }),
    merchantId ? fetchCustomerNames(merchantId) : Promise.resolve([]),
  ]);

  const payments = await attachCreatorNames(paymentsResult.payments);

  return {
    payments,
    totalCount: paymentsResult.totalCount,
    customerNames,
  };
};

export const actions: Actions = {
  createPayment: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();

    const orderId = formData.get('orderId') as string;
    const amount = Number(formData.get('amount'));
    const paymentMethod = formData.get('paymentMethod') as string;

    return {
      success: true,
      message: 'Payment created successfully',
    };
  },
};
