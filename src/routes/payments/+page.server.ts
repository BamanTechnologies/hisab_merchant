import type { PageServerLoad, Actions } from './$types';
import { config, getGraphQLHeaders } from '$lib/config';

// GraphQL query to fetch payments
const FETCH_PAYMENTS_QUERY = `
  query GetPayments {
    payment {
      amount
      created_by
      id
      order_id
      payment_method
    }
  }
`;

// Function to fetch payments from GraphQL
async function fetchPayments() {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_PAYMENTS_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.payment;
  } catch (error) {
    console.error('Error fetching payments:', error);
    // Return empty array if API fails
    return [];
  }
}

export const load: PageServerLoad = async () => {
  const payments = await fetchPayments();

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
