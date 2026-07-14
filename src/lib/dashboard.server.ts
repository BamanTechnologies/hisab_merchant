import { config, getGraphQLHeaders } from "$lib/config";

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

function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function buildDateConditions(
  from: string,
  to: string,
): Record<string, unknown>[] {
  const conds: Record<string, unknown>[] = [];
  if (from) conds.push({ created_at: { _gte: from } });
  if (to) {
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
    conds.push({ created_at: { _lte: endDate.toISOString() } });
  }
  return conds;
}

function buildSalesFilter(
  merchantId: string,
  from: string,
  to: string,
): Record<string, unknown> {
  const conds: Record<string, unknown>[] = [
    { created_by: { _eq: merchantId } },
    { status: { _neq: "cancelled" } },
    ...buildDateConditions(from, to),
  ];
  return { _and: conds };
}

function buildOrdersFilter(
  merchantId: string,
  from: string,
  to: string,
): Record<string, unknown> {
  const conds: Record<string, unknown>[] = [
    { created_by: { _eq: merchantId } },
    ...buildDateConditions(from, to),
  ];
  return { _and: conds };
}

const STATS_QUERY = `
  query DashboardStats($salesFilter: orders_bool_exp!, $ordersFilter: orders_bool_exp!, $outstandingFilter: orders_bool_exp!) {
    total_sales: orders_aggregate(where: $salesFilter) {
      aggregate { sum { total_amount } }
    }
    total_orders: orders_aggregate(where: $ordersFilter) {
      aggregate { count }
    }
    pending_payments: orders_aggregate(where: $outstandingFilter) {
      aggregate { sum { outstanding_amount } }
    }
  }
`;

const OUTSTANDING_CREDIT_QUERY = `
  query OutstandingCredit($filter: orders_bool_exp!) {
    outstanding_credit: orders_aggregate(where: $filter) {
      aggregate { sum { outstanding_amount } }
    }
  }
`;

const RECENT_PAYMENTS_QUERY = `
  query RecentPayments($filter: payment_bool_exp!) {
    payment(where: $filter, order_by: [{ created_at: desc }], limit: 10) {
      id amount created_by created_at order_id payment_method
      order { customer_name }
    }
    total_payments: payment_aggregate(where: $filter) {
      aggregate { count }
    }
  }
`;

const TOP_PRODUCTS_QUERY = `
  query TopSellingProducts($filter: orders_bool_exp!) {
    orders(where: $filter) {
      order_items {
        product_id quantity line_total unit
        product { id name default_unit }
      }
    }
  }
`;

const RECENT_STOCKS_QUERY = `
  query RecentStocks($filter: stock_bool_exp!) {
    stock(where: $filter, order_by: [{ created_at: desc }], limit: 5) {
      id quantity unit created_at
      product { id name default_unit }
    }
  }
`;

const WEEKLY_SALES_TREND_QUERY = `
  query WeeklySalesTrend($startDate: date!, $endDate: date!, $merchantId: uuid!) {
    sales_trend_for_merchant(
      args: { start_date: $startDate, end_date: $endDate, merchant_id: $merchantId }
      where: { total_sales: { _neq: 0 } }
    ) {
      sales_date
      total_sales
    }
  }
`;

export type SalesTrend = {
  sales_date: string;
  total_sales: number;
};

export async function fetchWeeklySalesTrend(
  merchantId: string,
  startDate: string,
  endDate: string,
): Promise<SalesTrend[]> {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const sd = startDate || yearStart.toISOString().slice(0, 10);
  const ed = endDate || now.toISOString().slice(0, 10);
  try {
    const data = await gql<{
      sales_trend_for_merchant: SalesTrend[];
    }>(WEEKLY_SALES_TREND_QUERY, { startDate: sd, endDate: ed, merchantId });

    return (data.sales_trend_for_merchant ?? []).map((s) => ({
      sales_date: s.sales_date,
      total_sales: parseMoney(s.total_sales),
    }));
  } catch (error) {
    console.error("Error fetching weekly sales trend:", error);
    return [];
  }
}

const FETCH_BRANCH_IDS_QUERY = `
  query MerchantBranchIds($merchantId: uuid!) {
    merchant_by_pk(id: $merchantId) {
      branch
    }
  }
`;

export async function fetchStats(
  merchantId: string,
  from: string,
  to: string,
): Promise<{
  totalSales: number;
  totalOrders: number;
  pendingPayments: number;
}> {
  const dateConds = buildDateConditions(from, to);

  const salesFilter = {
    _and: [
      { created_by: { _eq: merchantId } },
      { status: { _neq: "cancelled" } },
      ...dateConds,
    ],
  };

  const ordersFilter = {
    _and: [{ created_by: { _eq: merchantId } }, ...dateConds],
  };

  const outstandingFilter: { _and: Record<string, unknown>[] } = {
    _and: [
      { created_by: { _eq: merchantId } },
      { status: { _in: ["unpaid", "partially_paid"] } },
      ...dateConds,
    ],
  };

  try {
    const data = await gql<{
      total_sales: { aggregate: { sum: { total_amount: unknown } } };
      total_orders: { aggregate: { count: number } };
      pending_payments: { aggregate: { sum: { outstanding_amount: unknown } } };
    }>(STATS_QUERY, {
      salesFilter,
      ordersFilter,
      outstandingFilter,
    });

    return {
      totalSales: parseMoney(data.total_sales?.aggregate?.sum?.total_amount),
      totalOrders: data.total_orders?.aggregate?.count ?? 0,
      pendingPayments: parseMoney(
        data.pending_payments?.aggregate?.sum?.outstanding_amount,
      ),
    };
  } catch (error) {
    console.error("Error fetching stats:", error);
    return { totalSales: 0, totalOrders: 0, pendingPayments: 0 };
  }
}

export async function fetchOutstandingCredit(
  merchantId: string,
  from: string,
  to: string,
): Promise<number> {
  const filter = {
    _and: [
      { created_by: { _eq: merchantId } },
      { status: { _neq: "cancelled" } },
      { outstanding_amount: { _gt: 0 } },
      ...buildDateConditions(from, to),
    ],
  };

  try {
    const data = await gql<{
      outstanding_credit: {
        aggregate: { sum: { outstanding_amount: unknown } };
      };
    }>(OUTSTANDING_CREDIT_QUERY, { filter });
    return parseMoney(
      data.outstanding_credit?.aggregate?.sum?.outstanding_amount,
    );
  } catch (error) {
    console.error("Error fetching outstanding credit:", error);
    return 0;
  }
}

export type PaymentRecord = {
  id: string;
  amount: number;
  created_by: string;
  created_at?: string;
  order_id: string;
  payment_method: string;
  order?: { customer_name?: string | null } | null;
};

export async function fetchRecentPayments(
  merchantId: string,
  from: string,
  to: string,
): Promise<{ payments: PaymentRecord[]; totalCount: number }> {
  const filter = {
    _and: [
      { created_by: { _eq: merchantId } },
      ...buildDateConditions(from, to),
    ],
  };

  try {
    const data = await gql<{
      payment: PaymentRecord[];
      total_payments: { aggregate: { count: number } };
    }>(RECENT_PAYMENTS_QUERY, { filter });

    const payments = (data.payment ?? []).map((p) => ({
      ...p,
      amount: parseMoney(p.amount),
    }));

    return {
      payments,
      totalCount: data.total_payments?.aggregate?.count ?? 0,
    };
  } catch (error) {
    console.error("Error fetching recent payments:", error);
    return { payments: [], totalCount: 0 };
  }
}

export type TopProduct = {
  product_id: string;
  name: string;
  quantity: number;
  unit: string;
  revenue: number;
};

export async function fetchTopSellingProducts(
  merchantId: string,
  from: string,
  to: string,
): Promise<TopProduct[]> {
  const filter = {
    _and: [
      { created_by: { _eq: merchantId } },
      { status: { _neq: "cancelled" } },
      ...buildDateConditions(from, to),
    ],
  };

  try {
    const data = await gql<{
      orders: Array<{
        order_items: Array<{
          product_id: string;
          quantity: unknown;
          line_total: unknown;
          unit: string | null;
          product: {
            id: string;
            name: string;
            default_unit: string | null;
          } | null;
        }>;
      }>;
    }>(TOP_PRODUCTS_QUERY, { filter });

    const productMap = new Map<string, TopProduct>();

    for (const order of data.orders ?? []) {
      for (const item of order.order_items ?? []) {
        const pid = item.product_id;
        const qty = parseMoney(item.quantity);
        const rev = parseMoney(item.line_total);
        const unit = item.unit ?? item.product?.default_unit ?? "pcs";
        const name = item.product?.name ?? "Unknown";

        if (!pid) continue;

        const existing = productMap.get(pid);
        if (existing) {
          existing.quantity += qty;
          existing.revenue += rev;
        } else {
          productMap.set(pid, {
            product_id: pid,
            name,
            quantity: qty,
            unit,
            revenue: rev,
          });
        }
      }
    }

    return [...productMap.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  } catch (error) {
    console.error("Error fetching top selling products:", error);
    return [];
  }
}

export type StockRecord = {
  stock_id: string;
  name: string;
  quantity: number;
  unit: string;
  date: string;
};

export async function fetchRecentStocks(
  branchIds: string[],
): Promise<StockRecord[]> {
  if (branchIds.length === 0) return [];

  const filter = { branch: { _in: branchIds } };

  try {
    const data = await gql<{
      stock: Array<{
        id: string;
        quantity: unknown;
        unit: string | null;
        created_at: string;
        product: {
          id: string;
          name: string;
          default_unit: string | null;
        } | null;
      }>;
    }>(RECENT_STOCKS_QUERY, { filter });

    return (data.stock ?? []).map((s) => ({
      stock_id: s.id,
      name: s.product?.name ?? "Unknown",
      quantity: parseMoney(s.quantity),
      unit: s.unit ?? s.product?.default_unit ?? "pcs",
      date: s.created_at ?? "",
    }));
  } catch {
    return [];
  }
}

export async function fetchMerchantBranchId(
  merchantId: string,
): Promise<string | null> {
  try {
    const data = await gql<{
      merchant_by_pk: { branch: string | null } | null;
    }>(FETCH_BRANCH_IDS_QUERY, { merchantId });
    return data.merchant_by_pk?.branch ?? null;
  } catch (error) {
    console.error("Error fetching merchant branch ID:", error);
    return null;
  }
}

const LOW_STOCK_QUERY = `
  query LowStockProducts($companyId: uuid!) {
    products(
      where: {
        company_id: { _eq: $companyId }
        treshold_quantity: { _gt: 0 }
      }
      order_by: [{ name: asc }]
    ) {
      id
      name
      default_unit
      treshold_quantity
      stocks_aggregate {
        aggregate {
          sum {
            quantity
          }
        }
      }
    }
  }
`;

export type LowStockProduct = {
  product_id: string;
  name: string;
  total_stock: number;
  threshold: number;
  unit: string;
};

export async function fetchLowStockProducts(
  companyId: string,
): Promise<LowStockProduct[]> {
  try {
    const data = await gql<{
      products: Array<{
        id: string;
        name: string;
        default_unit: string | null;
        treshold_quantity: unknown;
        stocks_aggregate: { aggregate: { sum: { quantity: unknown } } };
      }>;
    }>(LOW_STOCK_QUERY, { companyId });

    return (data.products ?? [])
      .map((p) => {
        const totalStock = parseMoney(
          p.stocks_aggregate?.aggregate?.sum?.quantity,
        );
        const threshold = parseMoney(p.treshold_quantity);
        return {
          product_id: p.id,
          name: p.name,
          total_stock: totalStock,
          threshold,
          unit: p.default_unit ?? "pcs",
        };
      })
      .filter((p) => p.threshold > 0 && p.total_stock < p.threshold)
      .slice(0, 10);
  } catch (error) {
    console.error("Error fetching low stock products:", error);
    return [];
  }
}

const TOP_CUSTOMERS_QUERY = `
  query TopCustomers($filter: orders_bool_exp!) {
    orders(
      where: $filter
      order_by: [{ created_at: desc }]
    ) {
      customer_id
      customer_name
      total_amount
    }
  }
`;

export type TopCustomerRecord = {
  id: string;
  customer_name: string;
  order_count: number;
  total_spent: number;
};

export async function fetchTopCustomers(
  merchantId: string,
  from: string,
  to: string,
): Promise<TopCustomerRecord[]> {
  const filter = {
    _and: [
      { created_by: { _eq: merchantId } },
      { status: { _neq: "cancelled" } },
      { customer_name: { _neq: "" } },
      { customer_name: { _is_null: false } },
      ...buildDateConditions(from, to),
    ],
  };

  try {
    const data = await gql<{
      orders: Array<{
        customer_id: string;
        customer_name: string | null;
        total_amount: unknown;
      }>;
    }>(TOP_CUSTOMERS_QUERY, { filter });

    const customerMap = new Map<string, { name: string; count: number; total: number }>();

    for (const order of data.orders ?? []) {
      const customerId = order.customer_id;
      if (!customerId) continue;
      const name = (order.customer_name ?? "").trim();
      if (!name) continue;
      const existing = customerMap.get(customerId);
      const amount = parseMoney(order.total_amount);
      if (existing) {
        existing.count += 1;
        existing.total += amount;
      } else {
        customerMap.set(customerId, { name, count: 1, total: amount });
      }
    }

    return [...customerMap.entries()]
      .map(([id, agg]) => ({
        id,
        customer_name: agg.name,
        order_count: agg.count,
        total_spent: agg.total,
      }))
      .sort((a, b) => {
        if (b.total_spent !== a.total_spent) {
          return b.total_spent - a.total_spent;
        }
        return b.order_count - a.order_count;
      })
      .slice(0, 10);
  } catch (error) {
    console.error("Error fetching top customers:", error);
    return [];
  }
}

const UNPAID_ORDERS_QUERY = `
  query UnpaidOrders($filter: orders_bool_exp!) {
    orders(
      where: $filter
      order_by: [{ created_at: asc }]
      limit: 10
    ) {
      id
      customer_name
      total_amount
      outstanding_amount
      created_at
      status
    }
  }
`;

export type UnpaidOrderRecord = {
  id: string;
  customer_name: string;
  total_amount: number;
  outstanding_amount: number;
  created_at: string;
  status: string;
};

export async function fetchUnpaidOrders(
  merchantId: string,
  from: string,
  to: string,
): Promise<UnpaidOrderRecord[]> {
  const filter = {
    _and: [
      { created_by: { _eq: merchantId } },
      { status: { _in: ["unpaid", "partially_paid"] } },
      ...buildDateConditions(from, to),
    ],
  };

  try {
    const data = await gql<{
      orders: Array<{
        id: string;
        customer_name: string | null;
        total_amount: unknown;
        outstanding_amount: unknown;
        created_at: string;
        status: string;
      }>;
    }>(UNPAID_ORDERS_QUERY, { filter });

    return (data.orders ?? []).map((o) => ({
      id: o.id,
      customer_name: o.customer_name?.trim() || "Unknown",
      total_amount: parseMoney(o.total_amount),
      outstanding_amount: parseMoney(o.outstanding_amount),
      created_at: o.created_at,
      status: o.status,
    }));
  } catch (error) {
    console.error("Error fetching unpaid orders:", error);
    return [];
  }
}

const FETCH_BRANCH_IDS_FOR_COMPANY_QUERY = `
  query BranchIdsForCompany($companyId: uuid!) {
    branches(where: { company: { _eq: $companyId } }) {
      id
    }
  }
`;

export async function fetchCompanyBranchIds(
  companyId: string,
): Promise<string[]> {
  try {
    const data = await gql<{
      branches: Array<{ id: string }>;
    }>(FETCH_BRANCH_IDS_FOR_COMPANY_QUERY, { companyId });
    return (data.branches ?? []).map((b) => b.id);
  } catch (error) {
    console.error("Error fetching company branch IDs:", error);
    return [];
  }
}
