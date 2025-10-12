import type { PageServerLoad, Actions } from './$types';
import { env } from '$env/dynamic/private';
import { getUserIdFromRequest } from '$lib/auth';

// GraphQL endpoint configuration
const GRAPHQL_ENDPOINT = env.GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql';
const HASURA_ADMIN_SECRET = env.HASURA_ADMIN_SECRET || 'amanz55';

// GraphQL headers
const getGraphQLHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (HASURA_ADMIN_SECRET) {
    headers['x-hasura-admin-secret'] = HASURA_ADMIN_SECRET;
  }
  
  return headers;
};

// GraphQL query to fetch all orders (we'll filter by ID)
const FETCH_ORDERS_QUERY = `
  query GetOrders {
    orders {
      created_by
      customer_address
      customer_name
      customer_phone
      id
      order_quantity
      stock_id
      total_amount
      outstanding_amount
    }
  }
`;

// GraphQL mutation to create a payment
const CREATE_PAYMENT_MUTATION = `
  mutation CreatePayment($amount: money, $created_by: uuid, $order_id: uuid, $payment_method: String) {
    insert_payment(objects: {amount: $amount, created_by: $created_by, order_id: $order_id, payment_method: $payment_method}) {
      returning {
        id
      }
    }
  }
`;

// Function to fetch a single order from GraphQL
async function fetchOrder(id: string) {
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_ORDERS_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    // Filter the orders array to find the one with matching ID
    const orders = result.data.orders || [];
    return orders.find((order: any) => order.id === id) || null;
  } catch (error) {
    console.error('Error fetching order:', error);
    // Return null if API fails
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
    console.log('GraphQL endpoint:', GRAPHQL_ENDPOINT);
    console.log('Headers:', getGraphQLHeaders());

    const response = await fetch(GRAPHQL_ENDPOINT, {
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

export const load: PageServerLoad = async ({ params }) => {
  const order = await fetchOrder(params.id);

  if (!order) {
    throw new Error('Order not found');
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
