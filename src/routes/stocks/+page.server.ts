import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';

// GraphQL query to fetch stocks
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

// Function to fetch stocks from GraphQL
async function fetchStocks() {
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

    return result.data.stock;
  } catch (error) {
    console.error('Error fetching stocks:', error);
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

    return result.data.investor;
  } catch (error) {
    console.error('Error fetching investors:', error);
    // Return empty array if API fails
    return [];
  }
}

export const load: PageServerLoad = async () => {
  const [stocks, investors] = await Promise.all([
    fetchStocks(),
    fetchInvestors(),
  ]);

  return {
    stocks,
    investors,
  };
};

// GraphQL mutation to create a stock
const CREATE_STOCK_MUTATION = `
  mutation CreateStock($color: String, $created_by: uuid, $figure: String, $investors: [uuid!], $purchased_price: money, $quantity: numeric, $selling_price: money, $thickness: numeric, $factor: numeric) {
    insert_stock(objects: {color: $color, created_by: $created_by, figure: $figure, investors: $investors, purchased_price: $purchased_price, quantity: $quantity, selling_price: $selling_price, thickness: $thickness, factor: $factor}) {
      returning {
        id
      }
    }
  }
`;

// GraphQL mutation to delete a stock
const DELETE_STOCK_MUTATION = `
  mutation DeleteStockById($id: uuid!) {
    delete_stock_by_pk(id: $id) {
      id
    }
  }
`;

// Function to create a stock via GraphQL mutation
async function createStock(stockData: {
  color: string;
  figure: string;
  investors: string[];
  purchased_price: number;
  quantity: number;
  selling_price: number;
  thickness: number;
  factor: number;
  userId: string;
}) {
  try {
    const variables = {
      color: stockData.color,
      created_by: stockData.userId, // Use the authenticated user ID
      figure: stockData.figure,
      investors: stockData.investors,
      purchased_price: stockData.purchased_price,
      quantity: stockData.quantity,
      selling_price: stockData.selling_price,
      thickness: stockData.thickness,
      factor: stockData.factor,
    };

    console.log('Sending GraphQL mutation with variables:', variables);
    console.log('GraphQL endpoint:', config.graphql.endpoint);
    console.log('Headers:', getGraphQLHeaders());

    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: CREATE_STOCK_MUTATION,
        variables,
      }),
    });

    console.log('GraphQL response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('GraphQL response:', result);
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.insert_stock.returning[0];
  } catch (error) {
    console.error('Error creating stock:', error);
    throw error;
  }
}

// Function to delete a stock via GraphQL mutation
async function deleteStock(stockId: string) {
  try {
    const variables = {
      id: stockId,
    };

    console.log('Deleting stock with ID:', stockId);

    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: DELETE_STOCK_MUTATION,
        variables,
      }),
    });

    console.log('Delete stock response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('Delete stock response:', result);
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.delete_stock_by_pk;
  } catch (error) {
    console.error('Error deleting stock:', error);
    throw error;
  }
}

export const actions: Actions = {
  createStock: async ({ request }) => {
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

    console.log(formData);
    
    // Extract form data
    const purchased_price = Number(formData.get('purchased_price'));
    const selling_price = Number(formData.get('selling_price'));
    const quantity = Number(formData.get('quantity'));
    const thickness = Number(formData.get('thickness'));
    const color = formData.get('color') as string;
    const figure = formData.get('figure') as string;
    const investors = JSON.parse(formData.get('investors') as string);
    const factor = Number(formData.get('factor'));
    console.log('Form data received:', {
      purchased_price,
      selling_price,
      quantity,
      thickness,
      color,
      figure,
      investors,
      factor,
    });

    try {
      const result = await createStock({
        color,
        figure,
        investors,
        purchased_price,
        quantity,
        selling_price,
        thickness,
        factor,
        userId, // Pass the authenticated user ID
      });

      console.log('Stock created successfully:', result);

      return {
        success: true,
        message: 'Stock created successfully',
        stockId: result.id,
      };
    } catch (error) {
      console.error('Failed to create stock:', error);
      return {
        success: false,
        message: `Failed to create stock: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
  deleteStock: async ({ request }) => {
    const formData = await request.formData();
    const stockId = formData.get('stockId') as string;

    if (!stockId) {
      return {
        success: false,
        message: 'Stock ID is required',
      };
    }

    try {
      const result = await deleteStock(stockId);

      console.log('Stock deleted successfully:', result);

      return {
        success: true,
        message: 'Stock deleted successfully',
        deletedId: result.id,
      };
    } catch (error) {
      console.error('Failed to delete stock:', error);
      return {
        success: false,
        message: `Failed to delete stock: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
