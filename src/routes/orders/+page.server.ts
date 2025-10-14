import type { PageServerLoad, Actions } from './$types';
import { config, getGraphQLHeaders } from '$lib/config';

// GraphQL query to fetch orders
const FETCH_ORDERS_QUERY = `
  query GetOrders {
    orders {
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

// Function to fetch orders from GraphQL
async function fetchOrders() {
  try {
    const response = await fetch(config.graphql.endpoint, {
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

    return result.data.orders;
  } catch (error) {
    console.error('Error fetching orders:', error);
    // Return empty array if API fails
    return [];
  }
}

export const load: PageServerLoad = async () => {
  const orders = await fetchOrders();

  return {
    orders,
  };
};

export const actions: Actions = {
  createOrder: async ({ request }) => {
    const formData = await request.formData();
    
    // Extract form data
    const stockId = formData.get('stockId') as string;
    const customerName = formData.get('customerName') as string;
    const customerAddress = formData.get('customerAddress') as string;
    const customerPhone = formData.get('customerPhone') as string;
    const quantity = Number(formData.get('quantity'));

    // TODO: Implement GraphQL mutation to create order
    console.log('Creating order with data:', {
      stockId,
      customerName,
      customerAddress,
      customerPhone,
      quantity,
    });

    // For now, just return success
    return {
      success: true,
      message: 'Order created successfully',
    };
  },
};
