import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import {
  fetchBranchCompanyId,
  fetchInvestorsForCompany,
} from '$lib/companyInvestors.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { soldUnitPriceForReportOrder } from '$lib/reportSoldPrice';

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

  return result.data;
}

function withComputedSoldPrice(reportData: Record<string, unknown>): Record<string, unknown> {
  const stocksRaw = Array.isArray(reportData.stocks) ? reportData.stocks : [];
  const stocks = stocksRaw.filter((s): s is Record<string, unknown> => s != null && typeof s === 'object');

  const ordersRaw = Array.isArray(reportData.orders) ? reportData.orders : [];
  const orders = ordersRaw.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const rec = row as Record<string, unknown>;
    return {
      ...rec,
      // String for downstream SMS formatter that calls `.replace(...)`.
      selling_price: soldUnitPriceForReportOrder(rec, stocks),
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