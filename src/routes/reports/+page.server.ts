import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';

// GraphQL query to fetch reports
const FETCH_REPORTS_QUERY = `
  query GetReports {
    reports {
      id
      investor_phone
      sms_status
      message
      created_at
    }
  }
`;

// GraphQL query to fetch investors
const FETCH_INVESTORS_QUERY = `
  query GetInvestors {
    investor {
      id
      first_name
      last_name
      phone_number
    }
  }
`;

// GraphQL query to generate investor report
const GENERATE_INVESTOR_REPORT_QUERY = `
  query GenerateInvestorReport($merchant_id: uuid!, $investor_phone: String!, $investor_id: uuid!) {
    stocks: stock(where: {_and: {created_by: {_eq: $merchant_id}, investors: {_contains: [$investor_id]}}}) {
      id
      thickness
      color
      figure
      quantity
      selling_price
      factor
    }
    orders: orders_since_last_report(where: {_and: {merchant_id: {_eq: $merchant_id}, investor_phone: {_eq: $investor_phone}}}) {
      id
      stock_id
      order_quantity
      total_amount
      created_at
      customer_name
      selling_price
    }
    orders_aggregate: orders_since_last_report_aggregate(where: {_and: {merchant_id: {_eq: $merchant_id}, investor_phone: {_eq: $investor_phone}}}) {
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

// Function to fetch reports from GraphQL
async function fetchReports() {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_REPORTS_QUERY,
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
  } catch (error) {
    console.error('Error fetching reports:', error);
    // Return empty array if API fails
    return [];
  }
}

// Function to fetch investors from GraphQL
async function fetchInvestors() {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_INVESTORS_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.investor || [];
  } catch (error) {
    console.error('Error fetching investors:', error);
    // Return empty array if API fails
    return [];
  }
}

// Function to generate investor report
async function generateInvestorReport(investorId: string, investorPhone: string, merchantId: string) {
  try {
    const variables = {
      merchant_id: merchantId, // Use the authenticated user ID
      investor_id: investorId,
      investor_phone: investorPhone,
    };

    console.log('Generating investor report with variables:', variables);

    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: GENERATE_INVESTOR_REPORT_QUERY,
        variables,
      }),
    });

    console.log('Report generation response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('Report generation response:', result);
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  } catch (error) {
    console.error('Error generating investor report:', error);
    throw error;
  }
}

// Function to send report via SMS
async function sendReport(reportData: any) {
  try {
    const variables = {
      data: JSON.stringify(reportData),
    };

    console.log('Sending report with data:', variables);

    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: SEND_REPORT_MUTATION,
        variables,
      }),
    });

    console.log('Send report response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('Send report response:', result);
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.send_sms;
  } catch (error) {
    console.error('Error sending report:', error);
    throw error;
  }
}

export const load: PageServerLoad = async () => {
  const reports = await fetchReports();
  const investors = await fetchInvestors();

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
    
    console.log('Authenticated user ID:', userId);
    
    // Extract form data
    const investorId = formData.get('investor_id') as string;
    const investorPhone = formData.get('investor_phone') as string;

    console.log('Form data received for report generation:', {
      investorId,
      investorPhone,
    });

    try {
      const reportData = await generateInvestorReport(investorId, investorPhone, userId);

      console.log('Report generated successfully:', reportData, typeof reportData);

      return {
        success: true,
        message: 'Report generated successfully',
        reportData,
      };
    } catch (error) {
      console.error('Failed to generate report:', error);
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

    console.log('Form data received for sending report:', {
      reportDataString,
    });

    try {
      const reportData = JSON.parse(reportDataString);
      const smsResult = await sendReport(reportData);

      console.log('Report sent successfully:', smsResult);

      return {
        success: true,
        message: `Report sent successfully! Success: ${smsResult.success_count}, Failures: ${smsResult.failure_count}`,
        smsResult,
      };
    } catch (error) {
      console.error('Failed to send report:', error);
      return {
        success: false,
        message: `Failed to send report: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};