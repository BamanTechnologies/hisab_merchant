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

// GraphQL mutation to delete an order
const DELETE_ORDER_MUTATION = `
  mutation DeleteOrderById($id: uuid!) {
    delete_orders_by_pk(id: $id) {
      id
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

// Function to delete an order via GraphQL mutation
async function deleteOrder(orderId: string) {
  try {
    const variables = {
      id: orderId,
    };

    console.log('Deleting order with ID:', orderId);

    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: DELETE_ORDER_MUTATION,
        variables,
      }),
    });

    console.log('Delete order response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('Delete order response:', result);
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.delete_orders_by_pk;
  } catch (error) {
    console.error('Error deleting order:', error);
    throw error;
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
  deleteOrder: async ({ request }) => {
    const formData = await request.formData();
    const orderId = formData.get('orderId') as string;

    if (!orderId) {
      return {
        success: false,
        message: 'Order ID is required',
      };
    }

    try {
      const result = await deleteOrder(orderId);

      console.log('Order deleted successfully:', result);

      return {
        success: true,
        message: 'Order deleted successfully',
        deletedId: result.id,
      };
    } catch (error) {
      console.error('Failed to delete order:', error);
      return {
        success: false,
        message: `Failed to delete order: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
