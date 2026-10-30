import type { PageServerLoad, Actions } from "./$types";
import { getMerchantIdFromRequest } from "$lib/auth";
import { fetchMerchantBranchId } from "$lib/merchantBranch.server";
import {
  fetchBranchCompanyId,
  fetchInvestorsForCompany,
} from "$lib/companyInvestors.server";
import { config, getGraphQLHeaders } from "$lib/config";
import { soldUnitPriceForReportOrder } from "$lib/reportSoldPrice";
import { buildStockLabel } from "$lib/stockLabel";
import { subscriptionWriteActionBlockedForRequest } from "$lib/subscription/server";
import { PDF_MERCHANT_FIELDS } from "$lib/pdf/kit";

const FETCH_REPORTS_QUERY = `
  query GetReports($filter: reports_bool_exp, $order: [reports_order_by!], $limit: Int, $offset: Int) {
    reports(where: $filter, limit: $limit, offset: $offset, order_by: $order) {
      id
      investor_phone
      sms_status
      message
      updated_at
    }
    total_reports: reports_aggregate(where: $filter) {
      aggregate {
        count
      }
    }
  }
`;

// GraphQL query to generate investor report
const GENERATE_INVESTOR_REPORT_QUERY = `
  query GenerateInvestorReport($merchant_id: uuid!, $investor_phone: String!, $investor_id: uuid!) {
    stocks: stock(where: {_and: [{created_by: {_eq: $merchant_id}}, {investors: {_contains: [$investor_id]}}, {is_deleted: {_eq: false}}]}) {
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

/** Archived (soft-deleted) orders, and payments belonging to archived orders. */
const FETCH_ARCHIVED_FOR_REPORT_QUERY = `
  query ReportArchivedFlags($orderIds: [uuid!]!, $paymentIds: [uuid!]!) {
    orders(where: { id: { _in: $orderIds }, is_deleted: { _eq: true } }) {
      id
    }
    payment(
      where: {
        _and: [
          { id: { _in: $paymentIds } }
          { order: { is_deleted: { _eq: true } } }
        ]
      }
    ) {
      id
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

const UPLOAD_FILE_MUTATION = `
  mutation uploadFile($files: [UploadInput!]!) {
    upload_files(args: $files) {
      secure_url
    }
  }
`;

const FETCH_REPORT_FOR_PDF_QUERY = `
  query ReportForPdf($id: uuid!, $merchantId: uuid!) {
    reports(where: { id: { _eq: $id }, merchant_id: { _eq: $merchantId } }, limit: 1) {
      id
      investor_id
      investor_phone
      sms_status
      message
      meta
      created_at
      merchant {
        ${PDF_MERCHANT_FIELDS}
      }
    }
  }
`;

/** Previous report for the same investor marks where this report's period starts. */
const FETCH_REPORT_PDF_CONTEXT_QUERY = `
  query ReportPdfContext($merchantId: uuid!, $investorPhone: String!, $before: timestamptz!, $investorId: uuid!, $hasInvestor: Boolean!) {
    previous: reports(
      where: {
        merchant_id: { _eq: $merchantId }
        investor_phone: { _eq: $investorPhone }
        created_at: { _lt: $before }
      }
      order_by: { created_at: desc }
      limit: 1
    ) {
      created_at
    }
    investor_by_pk(id: $investorId) @include(if: $hasInvestor) {
      first_name
      last_name
      phone_number
    }
  }
`;

async function fetchReportForPdf(reportId: string, merchantId: string) {
  const post = async (query: string, variables: Record<string, unknown>) => {
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
    return result.data;
  };

  const data = await post(FETCH_REPORT_FOR_PDF_QUERY, { id: reportId, merchantId });
  const report = data.reports?.[0];
  if (!report) return null;

  const investorId = typeof report.investor_id === "string" ? report.investor_id : null;
  const context = await post(FETCH_REPORT_PDF_CONTEXT_QUERY, {
    merchantId,
    investorPhone: report.investor_phone ?? "",
    before: report.created_at,
    // Placeholder keeps the variable non-null when the directive skips the field.
    investorId: investorId ?? "00000000-0000-0000-0000-000000000000",
    hasInvestor: investorId !== null,
  });

  const meta =
    typeof report.meta === "string" ? JSON.parse(report.meta) : (report.meta ?? null);

  return {
    id: report.id as string,
    createdAt: report.created_at as string,
    previousReportAt: (context.previous?.[0]?.created_at as string | undefined) ?? null,
    investorPhone: (report.investor_phone as string | null) ?? "",
    investor: context.investor_by_pk ?? null,
    smsStatus: (report.sms_status as string | null) ?? null,
    message: (report.message as string | null) ?? null,
    meta,
    merchant: report.merchant ?? null,
  };
}

async function fetchReports(
  merchantId: string,
  search: string,
  page: number,
  pageSize: number,
) {
  const offset = (page - 1) * pageSize;

  const conditions: Record<string, unknown>[] = [
    { merchant_id: { _eq: merchantId } },
  ];

  if (search) {
    conditions.push({
      _or: [
        { investor_phone: { _ilike: `%${search}%` } },
        { message: { _ilike: `%${search}%` } },
        { sms_status: { _ilike: `%${search}%` } },
      ],
    });
  }

  const filter: Record<string, unknown> = { _and: conditions };
  const order = [{ updated_at: "desc" }];

  try {
    const response = await fetch(config.graphql.endpoint, {
      method: "POST",
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_REPORTS_QUERY,
        variables: { filter, order, limit: pageSize, offset },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return {
      reports: result.data.reports || [],
      totalCount: result.data.total_reports?.aggregate?.count ?? 0,
    };
  } catch (e) {
    console.log("Error fetching reports:", e);
    return { reports: [], totalCount: 0 };
  }
}

// Function to generate investor report
function toReportNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function generateInvestorReport(
  investorId: string,
  investorPhone: string,
  merchantId: string,
) {
  const variables = {
    merchant_id: merchantId, // Use the authenticated user ID
    investor_id: investorId,
    investor_phone: investorPhone,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: GENERATE_INVESTOR_REPORT_QUERY,
      variables,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP error! status: ${response.status}, body: ${errorText}`,
    );
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  const reportData = result.data as Record<string, unknown>;
  const ordersRaw = Array.isArray(reportData.orders)
    ? reportData.orders.filter((o): o is Record<string, unknown> =>
        Boolean(o && typeof o === "object"),
      )
    : [];
  const paymentsRaw = Array.isArray(reportData.payments)
    ? reportData.payments.filter((p): p is Record<string, unknown> =>
        Boolean(p && typeof p === "object"),
      )
    : [];

  // Archived (soft-deleted) orders must be excluded from the report, and so
  // must payments that belong to archived orders.
  const allOrderIds = [
    ...new Set(ordersRaw.map((o) => (typeof o.id === "string" ? o.id : "")).filter((id) => id.length > 0)),
  ];
  const allPaymentIds = [
    ...new Set(paymentsRaw.map((p) => (typeof p.id === "string" ? p.id : "")).filter((id) => id.length > 0)),
  ];

  let archivedOrderIds = new Set<string>();
  let archivedPaymentIds = new Set<string>();
  try {
    const flagsResp = await fetch(config.graphql.endpoint, {
      method: "POST",
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_ARCHIVED_FOR_REPORT_QUERY,
        variables: { orderIds: allOrderIds, paymentIds: allPaymentIds },
      }),
    });
    if (flagsResp.ok) {
      const flagsResult = await flagsResp.json();
      if (!flagsResult.errors) {
        archivedOrderIds = new Set(
          (Array.isArray(flagsResult.data?.orders)
            ? (flagsResult.data.orders as Array<{ id?: string }>)
            : []
          )
            .map((o) => o.id ?? "")
            .filter((id) => id.length > 0),
        );
        archivedPaymentIds = new Set(
          (Array.isArray(flagsResult.data?.payment)
            ? (flagsResult.data.payment as Array<{ id?: string }>)
            : []
          )
            .map((p) => p.id ?? "")
            .filter((id) => id.length > 0),
        );
      }
    }
  } catch {
    // Fall back to the unfiltered view rows when flag lookup fails.
  }

  const orders = ordersRaw.filter((o) => {
    const oid = typeof o.id === "string" ? o.id : "";
    return !archivedOrderIds.has(oid);
  });
  const payments = paymentsRaw.filter((p) => {
    const pid = typeof p.id === "string" ? p.id : "";
    return !archivedPaymentIds.has(pid);
  });

  const filteredReportData = {
    ...reportData,
    orders,
    payments,
    orders_aggregate: {
      aggregate: {
        sum: {
          total_amount: orders.reduce(
            (sum, o) => sum + toReportNumber(o.total_amount),
            0,
          ),
        },
      },
    },
    payments_aggregate: {
      aggregate: {
        sum: {
          amount: payments.reduce(
            (sum, p) => sum + toReportNumber(p.amount),
            0,
          ),
        },
      },
    },
  };
  if (orders.length === 0) {
    return { ...filteredReportData, investor_id: investorId };
  }

  const orderIds = orders.map((o) => (typeof o.id === "string" ? o.id : "")).filter((id) => id.length > 0);

  let itemsByOrderId = new Map<string, Array<Record<string, unknown>>>();
  try {
    const linesResp = await fetch(config.graphql.endpoint, {
      method: "POST",
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
          const oid = typeof line.order_id === "string" ? line.order_id : "";
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
      .map((s) =>
        s &&
        typeof s === "object" &&
        typeof (s as Record<string, unknown>).id === "string"
          ? ((s as Record<string, unknown>).id as string)
          : "",
      )
      .filter((id) => id.length > 0),
  );

  const expandedOrders: Record<string, unknown>[] = [];
  for (const order of orders) {
    const oid = typeof order.id === "string" ? order.id : "";
    const orderItems = (itemsByOrderId.get(oid) ?? []).filter((it) => {
      const sid = typeof it.stock_id === "string" ? it.stock_id : "";
      return (
        sid.length > 0 &&
        (investorStockIds.size === 0 || investorStockIds.has(sid))
      );
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

  return {
    ...filteredReportData,
    investor_id: investorId,
    orders: expandedOrders,
  };
}

function withComputedSoldPrice(
  reportData: Record<string, unknown>,
): Record<string, unknown> {
  const stocksRaw = Array.isArray(reportData.stocks) ? reportData.stocks : [];
  const stocks = stocksRaw.filter(
    (s): s is Record<string, unknown> => s != null && typeof s === "object",
  );
  const stockLabelById = new Map<string, string>();
  for (const s of stocks) {
    const sid = typeof s.id === "string" ? s.id : "";
    if (!sid) continue;
    stockLabelById.set(sid, buildStockLabel(s));
  }

  const ordersRaw = Array.isArray(reportData.orders) ? reportData.orders : [];
  const orders = ordersRaw.map((row) => {
    if (!row || typeof row !== "object") return row;
    const rec = row as Record<string, unknown>;
    const sid = typeof rec.stock_id === "string" ? rec.stock_id : "";
    const directUnitPrice =
      rec.unit_price == null
        ? null
        : Number(String(rec.unit_price).replace(/[^0-9.-]/g, ""));
    return {
      ...rec,
      // String for downstream SMS formatter that calls `.replace(...)`.
      selling_price:
        directUnitPrice != null && Number.isFinite(directUnitPrice)
          ? directUnitPrice.toFixed(2)
          : soldUnitPriceForReportOrder(rec, stocks),
      stock_name:
        stockLabelById.get(sid) ?? (sid ? sid.slice(0, 8) + "…" : "—"),
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
    method: "POST",
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: SEND_REPORT_MUTATION,
      variables,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP error! status: ${response.status}, body: ${errorText}`,
    );
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data.send_sms;
}

async function uploadReportPdf(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const base64String = btoa(binary);
  const headers = getGraphQLHeaders();
  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: UPLOAD_FILE_MUTATION,
      variables: {
        files: [
          {
            base64String,
            folder: "investor-reports",
            type: file.type || "application/pdf",
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `File upload failed with status ${response.status}: ${errorText}`,
    );
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  const secureUrl = result.data?.upload_files?.[0]?.secure_url;
  if (typeof secureUrl !== "string" || !secureUrl) {
    throw new Error("File upload did not return a secure URL");
  }
  return secureUrl;
}

export const load: PageServerLoad = async ({ request, parent, url }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getMerchantIdFromRequest(request) ?? null;
  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (merchantId ? await fetchMerchantBranchId(merchantId) : null);
  let companyId = merchantContext?.companyId ?? null;
  if (!companyId && merchantBranchId) {
    companyId = await fetchBranchCompanyId(merchantBranchId);
  }

  const search = url.searchParams.get("search") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 10);

  const [result, investors] = await Promise.all([
    merchantId
      ? fetchReports(merchantId, search, page, pageSize)
      : Promise.resolve({ reports: [], totalCount: 0 }),
    fetchInvestorsForCompany(companyId),
  ]);

  return {
    reports: result.reports,
    totalCount: result.totalCount,
    investors,
  };
};

export const actions: Actions = {
  generateReport: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();

    // Get authenticated user ID
    const userId = getMerchantIdFromRequest(request);
    if (!userId) {
      return {
        success: false,
        message: "Authentication required",
      };
    }

    // Extract form data
    const investorId = formData.get("investor_id") as string;
    const investorPhone = formData.get("investor_phone") as string;

    try {
      const rawReportData = await generateInvestorReport(
        investorId,
        investorPhone,
        userId,
      );
      const reportData = withComputedSoldPrice(rawReportData);

      return {
        success: true,
        message: "Report generated successfully",
        reportData,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to generate report: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
  sendReport: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();

    // Extract form data
    const reportDataString = formData.get("report_data") as string;

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
        message: `Failed to send report: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
  reportPdfData: async ({ request }) => {
    const merchantId = getMerchantIdFromRequest(request);
    if (!merchantId) {
      return { success: false, message: "Authentication required" };
    }

    const formData = await request.formData();
    const reportId = formData.get("report_id");
    if (typeof reportId !== "string" || !reportId) {
      return { success: false, message: "Report ID is required" };
    }

    try {
      const report = await fetchReportForPdf(reportId, merchantId);
      if (!report) {
        return { success: false, message: "Report not found" };
      }
      return { success: true, report };
    } catch (error) {
      return {
        success: false,
        message: `Failed to load report: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
  shareReport: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    if (!getMerchantIdFromRequest(request)) {
      return { success: false, message: "Authentication required" };
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, message: "A report PDF is required" };
    }

    try {
      const secureUrl = await uploadReportPdf(file);
      return { success: true, secureUrl };
    } catch (error) {
      return {
        success: false,
        message: `Failed to upload report: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
  resendReport: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const formData = await request.formData();
    const reportId = formData.get("report_id") as string;

    if (!reportId) {
      return {
        success: false,
        message: "Report ID is required",
      };
    }

    const userId = getMerchantIdFromRequest(request);
    if (!userId) {
      return {
        success: false,
        message: "Authentication required",
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
        message: `Failed to resend report: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};
