import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';

const FETCH_PAYMENTS_QUERY = `
  query GetPayments($merchantId: uuid!) {
    payment(where: { created_by: { _eq: $merchantId } }) {
      amount
      created_by
      id
      order_id
      payment_method
    }
  }
`;

async function fetchPayments(merchantId: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_PAYMENTS_QUERY,
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

    return result.data.payment ?? [];
  } catch (error) {
    console.error('Error fetching payments:', error);
    return [];
  }
}

export const load: PageServerLoad = async ({ request }) => {
  const merchantId = getUserIdFromRequest(request);
  const payments = merchantId ? await fetchPayments(merchantId) : [];

  return {
    payments,
  };
};

export const actions: Actions = {
  createPayment: async ({ request }) => {
    const formData = await request.formData();
    
    // Extract form data
    const orderId = formData.get('orderId') as string;
    const amount = Number(formData.get('amount'));
    const paymentMethod = formData.get('paymentMethod') as string;

    // TODO: Implement GraphQL mutation to create payment
    console.log('Creating payment with data:', {
      orderId,
      amount,
      paymentMethod,
    });

    // For now, just return success
    return {
      success: true,
      message: 'Payment created successfully',
    };
  },
};
