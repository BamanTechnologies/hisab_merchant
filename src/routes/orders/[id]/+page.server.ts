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
      unit
      stock {
        unit
      }
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
  } catch {
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
  const variables = {
    amount: paymentData.amount,
    created_by: paymentData.created_by, // Use the authenticated user ID
    order_id: paymentData.order_id,
    payment_method: paymentData.payment_method,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: CREATE_PAYMENT_MUTATION,
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

  return result.data.insert_payment.returning[0];
}

export const load: PageServerLoad = async ({ params, request, parent }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
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
    
    // Extract form data
    const orderId = params.id;
    const amount = Number(formData.get('amount'));
    const paymentMethod = formData.get('payment_method') as string;

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

      return {
        success: true,
        message: 'Payment created successfully',
        paymentId: result.id,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
