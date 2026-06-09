import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import {
  fetchBranchCompanyId,
  fetchInvestorsForCompany,
} from '$lib/companyInvestors.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { soldUnitPriceForReportOrder } from '$lib/reportSoldPrice';
import { buildStockLabel } from '$lib/stockLabel';
import { subscriptionWriteActionBlockedForRequest } from '$lib/subscription/server';

const FETCH_REPORTS_QUERY = `
  query GetReports($merchantId: uuid!) {
    reports(
      where: { merchant_id: { _eq: $merchantId } }
      order_by: { updated_at: desc }
    ) {
      id
      investor_phone
      sms_status
      message
      updated_at
    }
  }
`;

// GraphQL query to generate investor report
const GENERATE_INVESTOR_REPORT_QUERY = `
  query GenerateInvestorReport($merchant_id: uuid!, $investor_phone: String!, $investor_id: uuid!) {
    stocks: stock(where: {_and: {created_by: {_eq: $merchant_id}, investors: {_contains: [$investor_id]}}}) {
      id
      product_type
      attributes
      type
      model_number
      country
      thickness
      color
      figure
      quantity
      selling_price
      factor
    }
    orders: orders_since_last_report(
      where: {
        _and: [
          { merchant_id: { _eq: $merchant_id } }
          { investor_phone: { _eq: $investor_phone } }
          { status: { _neq: "cancelled" } }
        ]
      }
    ) {
      id
      stock_id
      order_quantity
      total_amount
      created_at
      customer_name
      status
    }
    orders_aggregate: orders_since_last_report_aggregate(
      where: {
        _and: [
          { merchant_id: { _eq: $merchant_id } }
          { investor_phone: { _eq: $investor_phone } }
          { status: { _neq: "cancelled" } }
        ]
      }
    ) {
      aggregate {
        sum {
          total_amount
        }
      }
    }
    payments: payments_since_last_report(where: {_and: {merchant_id: {_eq: $merchant_id}, investor_phone: {_eq: $investor_phone}}}) {
      id
      amount
      payment_method
      created_at
      customer_name
      selling_price
    }
    payments_aggregate: payments_since_last_report_aggregate(where: {_and: {merchant_id: {_eq: $merchant_id}, investor_phone: {_eq: $investor_phone}}}) {
      aggregate {
        sum {
          amount
        }
      }
    }
    investor_by_pk(id: $investor_id) {
      id
      first_name
      phone_number
    }
    merchant_by_pk(id: $merchant_id) {
      id
      first_name
      last_name
    }
  }
`;

const FETCH_ORDER_ITEMS_BY_ORDER_IDS_QUERY = `
  query ReportOrderItemsByOrderIds($orderIds: [uuid!]!) {
    order_items(where: { order_id: { _in: $orderIds } }) {
      id
      order_id
      stock_id
      quantity
      line_total
      unit_price
    }
  }
`;

// GraphQL mutation to send report via SMS
const SEND_REPORT_MUTATION = `
  mutation SendReport($data: String!) {
    send_sms(data: $data) {
      success_count
      status_code
      message
      failure_count
      error
    }
  }
`;

async function fetchReports(merchantId: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_REPORTS_QUERY,
        variables: { merchantId },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.reports || [];
  } catch {
    return [];
  }
}

// Function to generate investor report
async function generateInvestorReport(investorId: string, investorPhone: string, merchantId: string) {
  const variables = {
    merchant_id: merchantId, // Use the authenticated user ID
    investor_id: investorId,
    investor_phone: investorPhone,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: GENERATE_INVESTOR_REPORT_QUERY,
      variables,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  const reportData = result.data as Record<string, unknown>;
  const ordersRaw = Array.isArray(reportData.orders)
    ? reportData.orders.filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
    : [];
  const orderIds = [
    ...new Set(
      ordersRaw
        .map((o) => (typeof o.id === 'string' ? o.id : ''))
        .filter((id) => id.length > 0),
    ),
  ];
  if (orderIds.length === 0) return reportData;

  let itemsByOrderId = new Map<string, Array<Record<string, unknown>>>();
  try {
    const linesResp = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_ORDER_ITEMS_BY_ORDER_IDS_QUERY,
        variables: { orderIds },
      }),
    });
    if (linesResp.ok) {
      const linesResult = await linesResp.json();
      if (!linesResult.errors) {
        const lines = Array.isArray(linesResult.data?.order_items)
          ? (linesResult.data.order_items as Array<Record<string, unknown>>)
          : [];
        for (const line of lines) {
          const oid = typeof line.order_id === 'string' ? line.order_id : '';
          if (!oid) continue;
          const list = itemsByOrderId.get(oid) ?? [];
          list.push(line);
          itemsByOrderId.set(oid, list);
        }
      }
    }
  } catch {
    // Fallback to header-only report rows when lines cannot be fetched.
  }

  const investorStockIds = new Set(
    (Array.isArray(reportData.stocks) ? reportData.stocks : [])
      .map((s) => (s && typeof s === 'object' && typeof (s as Record<string, unknown>).id === 'string'
        ? ((s as Record<string, unknown>).id as string)
        : ''))
      .filter((id) => id.length > 0),
  );

  const expandedOrders: Record<string, unknown>[] = [];
  for (const order of ordersRaw) {
    const oid = typeof order.id === 'string' ? order.id : '';
    const orderItems = (itemsByOrderId.get(oid) ?? []).filter((it) => {
      const sid = typeof it.stock_id === 'string' ? it.stock_id : '';
      return sid.length > 0 && (investorStockIds.size === 0 || investorStockIds.has(sid));
    });
    if (orderItems.length === 0) {
      expandedOrders.push(order);
      continue;
    }
    for (const item of orderItems) {
      expandedOrders.push({
        ...order,
        stock_id: item.stock_id,
        order_quantity: item.quantity,
        total_amount: item.line_total,
        unit_price: item.unit_price,
      });
    }
  }

  return { ...reportData, orders: expandedOrders };
}

function withComputedSoldPrice(reportData: Record<string, unknown>): Record<string, unknown> {
  const stocksRaw = Array.isArray(reportData.stocks) ? reportData.stocks : [];
  const stocks = stocksRaw.filter((s): s is Record<string, unknown> => s != null && typeof s === 'object');
  const stockLabelById = new Map<string, string>();
  for (const s of stocks) {
    const sid = typeof s.id === 'string' ? s.id : '';
    if (!sid) continue;
    stockLabelById.set(sid, buildStockLabel(s));
  }

  const ordersRaw = Array.isArray(reportData.orders) ? reportData.orders : [];
  const orders = ordersRaw.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const rec = row as Record<string, unknown>;
    const sid = typeof rec.stock_id === 'string' ? rec.stock_id : '';
    const directUnitPrice =
      rec.unit_price == null ? null : Number(String(rec.unit_price).replace(/[^0-9.-]/g, ''));
    return {
      ...rec,
      // String for downstream SMS formatter that calls `.replace(...)`.
      selling_price:
        directUnitPrice != null && Number.isFinite(directUnitPrice)
          ? directUnitPrice.toFixed(2)
          : soldUnitPriceForReportOrder(rec, stocks),
      stock_name: stockLabelById.get(sid) ?? (sid ? sid.slice(0, 8) + '…' : '—'),
    };
  });
  return { ...reportData, orders };
}

// Function to send report via SMS
async function sendReport(reportData: any) {
  const variables = {
    data: JSON.stringify(reportData),
  };

  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: SEND_REPORT_MUTATION,
      variables,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data.send_sms;
}

export const load: PageServerLoad = async ({ request, parent }) => {
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
  const [reports, investors] = await Promise.all([
    merchantId ? fetchReports(merchantId) : Promise.resolve([]),
    fetchInvestorsForCompany(companyId),
  ]);

  return {
    reports,
    investors,
  };
};

export const actions: Actions = {
  generateReport: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();

    // Get authenticated user ID
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return {
        success: false,
        message: 'Authentication required',
      };
    }

    // Extract form data
    const investorId = formData.get('investor_id') as string;
    const investorPhone = formData.get('investor_phone') as string;

    try {
      const rawReportData = await generateInvestorReport(
        investorId,
        investorPhone,
        userId,
      );
      const reportData = withComputedSoldPrice(rawReportData);

      return {
        success: true,
        message: 'Report generated successfully',
        reportData,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
  sendReport: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();
    
    // Extract form data
    const reportDataString = formData.get('report_data') as string;

    try {
      const reportData = JSON.parse(reportDataString);
      const normalizedReportData = withComputedSoldPrice(reportData);
      const smsResult = await sendReport(normalizedReportData);

      return {
        success: true,
        message: `Report sent successfully! Success: ${smsResult.success_count}, Failures: ${smsResult.failure_count}`,
        smsResult,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send report: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
  resendReport: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();
    const reportId = formData.get('report_id') as string;

    if (!reportId) {
      return {
        success: false,
        message: 'Report ID is required',
      };
    }

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return {
        success: false,
        message: 'Authentication required',
      };
    }

    try {
      const smsResult = await sendReport({
        report_id: reportId,
        resend: true,
      });

      return {
        success: true,
        message: `Report resent. Success: ${smsResult.success_count}, Failures: ${smsResult.failure_count}`,
        smsResult,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to resend report: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};