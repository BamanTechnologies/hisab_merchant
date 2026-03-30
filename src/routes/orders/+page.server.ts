import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';

// GraphQL query to fetch orders for the logged-in merchant
const FETCH_ORDERS_QUERY = `
  query GetOrders($merchantId: uuid!) {
    orders(
      where: { created_by: { _eq: $merchantId } }
      order_by: { created_at: desc }
    ) {
      created_at
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

const FETCH_ORDER_FOR_MERCHANT_QUERY = `
  query OrderForMerchant($id: uuid!, $merchantId: uuid!) {
    orders(
      where: { _and: [{ id: { _eq: $id } }, { created_by: { _eq: $merchantId } }] }
      limit: 1
    ) {
      id
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

async function fetchOrders(merchantId: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_ORDERS_QUERY,
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

    return result.data.orders ?? [];
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

async function orderBelongsToMerchant(orderId: string, merchantId: string): Promise<boolean> {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_ORDER_FOR_MERCHANT_QUERY,
        variables: { id: orderId, merchantId },
      }),
    });

    if (!response.ok) return false;

    const result = await response.json();
    if (result.errors) return false;

    const rows = result.data?.orders ?? [];
    return rows.length > 0;
  } catch {
    return false;
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

export const load: PageServerLoad = async ({ request }) => {
  const merchantId = getUserIdFromRequest(request);
  const orders = merchantId ? await fetchOrders(merchantId) : [];

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

    const merchantId = getUserIdFromRequest(request);
    if (!merchantId) {
      return { success: false, message: 'Authentication required' };
    }

    const allowed = await orderBelongsToMerchant(orderId, merchantId);
    if (!allowed) {
      return { success: false, message: 'Order not found' };
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
