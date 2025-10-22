import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';

// GraphQL query to fetch all stocks (we'll filter by ID)
const FETCH_STOCKS_QUERY = `
  query GetStocks {
    stock {
      id
      color
      created_by
      figure
      investors
      merchant {
        id
      }
      quantity
      selling_price
      thickness
      factor
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

// Function to fetch a single stock from GraphQL
async function fetchStock(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_STOCKS_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    // Filter the stocks array to find the one with matching ID
    const stocks = result.data.stock || [];
    console.log(stocks, "stocks");
    return stocks.find((stock: any) => stock.id === id) || null;
  } catch (error) {
    console.error('Error fetching stock:', error);
    // Return null if API fails
    return null;
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

    return result.data.investor;
  } catch (error) {
    console.error('Error fetching investors:', error);
    // Return empty array if API fails
    return [];
  }
}

export const load: PageServerLoad = async ({ params, request }) => {
  const [stock, investors] = await Promise.all([
    fetchStock(params.id),
    fetchInvestors(),
  ]);

  if (!stock) {
    throw new Error('Stock not found');
  }

  // Get the authenticated user ID (merchant ID)
  const merchantId = getUserIdFromRequest(request);

  return {
    stock,
    investors,
    merchantId,
  };
};

// GraphQL mutation to create an order
const CREATE_ORDER_MUTATION = `
  mutation CreateOrder($created_by: uuid, $customer_address: String, $customer_name: String, $customer_phone: numeric, $outstanding_amount: money, $order_quantity: numeric, $status: String, $stock_id: uuid, $total_amount: money) {
    insert_orders(objects: {created_by: $created_by, customer_address: $customer_address, customer_name: $customer_name, customer_phone: $customer_phone, outstanding_amount: $outstanding_amount, order_quantity: $order_quantity, status: $status, stock_id: $stock_id, total_amount: $total_amount}) {
      returning {
        id
      }
    }
  }
`;

// Function to create an order via GraphQL mutation
async function createOrder(orderData: {
  customer_name: string;
  customer_address: string;
  customer_phone: number;
  order_quantity: number;
  stock_id: string;
  total_amount: number;
  outstanding_amount: number;
  status: string;
  created_by: string;
}) {
  try {
    const variables = {
      created_by: orderData.created_by,
      customer_address: orderData.customer_address,
      customer_name: orderData.customer_name,
      customer_phone: orderData.customer_phone,
      outstanding_amount: orderData.outstanding_amount,
      order_quantity: orderData.order_quantity,
      status: orderData.status,
      stock_id: orderData.stock_id,
      total_amount: orderData.total_amount,
    };

    console.log('Sending GraphQL order mutation with variables:', variables);

    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: CREATE_ORDER_MUTATION,
        variables,
      }),
    });

    console.log('GraphQL order response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('GraphQL order response:', result);
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.insert_orders.returning[0];
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}

export const actions: Actions = {
  createOrder: async ({ request, params }) => {
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
    const customer_name = formData.get('customer_name') as string;
    const customer_address = formData.get('customer_address') as string;
    const customer_phone = Number(formData.get('customer_phone'));
    const order_quantity = Number(formData.get('order_quantity'));
    const total_amount = Number(formData.get('total_amount'));
    const outstanding_amount = Number(formData.get('outstanding_amount'));
    const status = formData.get('status') as string;
    const stock_id = formData.get('stock_id') as string;

    console.log('Form data received for order:', {
      customer_name,
      customer_address,
      customer_phone,
      order_quantity,
      total_amount,
      outstanding_amount,
      status,
      stock_id,
    });

    try {
      const result = await createOrder({
        customer_name,
        customer_address,
        customer_phone,
        order_quantity,
        stock_id,
        total_amount,
        outstanding_amount,
        status,
        created_by: userId, // Use the authenticated user ID
      });

      console.log('Order created successfully:', result);

      return {
        success: true,
        message: 'Order created successfully',
        orderId: result.id,
      };
    } catch (error) {
      console.error('Failed to create order:', error);
      return {
        success: false,
        message: `Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
