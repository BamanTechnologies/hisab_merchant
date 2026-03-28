import type { PageServerLoad, Actions } from './$types';
import { error } from '@sveltejs/kit';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';

const FETCH_ORDER_FOR_MERCHANT_QUERY = `
  query GetOrderForMerchant($id: uuid!, $merchantId: uuid!) {
    orders(
      where: { _and: [{ id: { _eq: $id } }, { created_by: { _eq: $merchantId } }] }
      limit: 1
    ) {
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
    }
  }
`;

// GraphQL mutation to create a payment for a specific order
const CREATE_PAYMENT_MUTATION = `
  mutation CreatePayment($amount: money, $created_by: uuid, $order_id: uuid, $payment_method: String) {
    insert_payment(objects: {amount: $amount, created_by: $created_by, order_id: $order_id, payment_method: $payment_method}) {
      returning {
        id
      }
    }
  }
`;

async function fetchOrderForMerchant(id: string, merchantId: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_ORDER_FOR_MERCHANT_QUERY,
        variables: { id, merchantId },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    const orders = result.data.orders || [];
    return orders[0] ?? null;
  } catch (e) {
    console.error('Error fetching order:', e);
    return null;
  }
}

// Function to create a payment
async function createPayment(paymentData: {
  amount: number;
  order_id: string;
  payment_method: string;
  created_by: string;
}) {
  try {
    const variables = {
      amount: paymentData.amount,
      created_by: paymentData.created_by, // Use the authenticated user ID
      order_id: paymentData.order_id,
      payment_method: paymentData.payment_method,
    };

    console.log('Sending GraphQL payment mutation with variables:', variables);
    console.log('GraphQL endpoint:', config.graphql.endpoint);
    console.log('Headers:', getGraphQLHeaders());

    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: CREATE_PAYMENT_MUTATION,
        variables,
      }),
    });

    console.log('GraphQL payment response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('GraphQL payment response:', result);
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.insert_payment.returning[0];
  } catch (error) {
    console.error('Error creating payment:', error);
    throw error;
  }
}

export const load: PageServerLoad = async ({ params, request }) => {
  const merchantId = getUserIdFromRequest(request);
  if (!merchantId) {
    error(404, 'Order not found');
  }

  const order = await fetchOrderForMerchant(params.id, merchantId);

  if (!order) {
    error(404, 'Order not found');
  }

  return {
    order,
  };
};

export const actions: Actions = {
  createPayment: async ({ request, params }) => {
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
    const orderId = params.id;
    const amount = Number(formData.get('amount'));
    const paymentMethod = formData.get('payment_method') as string;

    console.log('Form data received for payment:', {
      orderId,
      amount,
      paymentMethod,
    });

    const order = await fetchOrderForMerchant(orderId, userId);
    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    try {
      const result = await createPayment({
        amount,
        order_id: orderId,
        payment_method: paymentMethod,
        created_by: userId, // Use the authenticated user ID
      });

      console.log('Payment created successfully:', result);

      return {
        success: true,
        message: 'Payment created successfully',
        paymentId: result.id,
      };
    } catch (error) {
      console.error('Failed to create payment:', error);
      return {
        success: false,
        message: `Failed to create payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
