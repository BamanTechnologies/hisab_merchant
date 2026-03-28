import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { config, getGraphQLHeaders } from '$lib/config';

const FETCH_STOCK_BY_PK_QUERY = `
  query GetStockByPk($id: uuid!) {
    stock_by_pk(id: $id) {
      id
      model_number
      country
      branch
      type
      color
      created_by
      figure
      investors
      merchant {
        id
      }
      purchased_price
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

async function fetchStockByPk(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_STOCK_BY_PK_QUERY,
        variables: { id },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.stock_by_pk ?? null;
  } catch (e) {
    console.error('Error fetching stock:', e);
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

const FETCH_BRANCH_BY_PK_QUERY = `
  query BranchByPk($id: uuid!) {
    branches_by_pk(id: $id) {
      id
      company
      name
    }
  }
`;

const FETCH_BRANCHES_SAME_COMPANY_QUERY = `
  query BranchesSameCompany($companyId: uuid!, $excludeBranchId: uuid!) {
    branches(
      where: {
        _and: [
          { company: { _eq: $companyId } }
          { id: { _neq: $excludeBranchId } }
        ]
      }
    ) {
      id
      name
    }
  }
`;

async function fetchBranchByPk(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_BRANCH_BY_PK_QUERY,
        variables: { id },
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (result.errors) return null;

    return result.data.branches_by_pk ?? null;
  } catch {
    return null;
  }
}

async function fetchTransferTargetBranches(companyId: string, excludeBranchId: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_BRANCHES_SAME_COMPANY_QUERY,
        variables: { companyId, excludeBranchId },
      }),
    });

    if (!response.ok) return [];

    const result = await response.json();
    if (result.errors) return [];

    return result.data.branches ?? [];
  } catch {
    return [];
  }
}

const MERCHANTS_IN_BRANCHES_QUERY = `
  query MerchantsInBranches($branchIds: [uuid!]!) {
    merchant(where: { branch: { _in: $branchIds } }) {
      id
      first_name
      last_name
      branch
    }
  }
`;

const MERCHANT_BY_PK_QUERY = `
  query MerchantByPkForTransfer($id: uuid!) {
    merchant_by_pk(id: $id) {
      id
      branch
    }
  }
`;

async function fetchMerchantsInBranches(branchIds: string[]) {
  if (branchIds.length === 0) return [];
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: MERCHANTS_IN_BRANCHES_QUERY,
        variables: { branchIds },
      }),
    });

    if (!response.ok) return [];

    const result = await response.json();
    if (result.errors) return [];

    return result.data.merchant ?? [];
  } catch {
    return [];
  }
}

async function fetchMerchantByPkForTransfer(id: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: MERCHANT_BY_PK_QUERY,
        variables: { id },
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (result.errors) return null;

    return result.data.merchant_by_pk ?? null;
  } catch {
    return null;
  }
}

export const load: PageServerLoad = async ({ params, request }) => {
  const merchantId = getUserIdFromRequest(request);
  const merchantBranchId = merchantId ? await fetchMerchantBranchId(merchantId) : null;

  const [stock, investors] = await Promise.all([
    fetchStockByPk(params.id),
    fetchInvestors(),
  ]);

  if (!stock) {
    error(404, 'Stock not found');
  }

  if (merchantBranchId != null && stock.branch !== merchantBranchId) {
    error(404, 'Stock not found');
  }

  let transferTargetBranches: { id: string; name?: string | null }[] = [];
  if (stock.branch) {
    const sourceBranch = await fetchBranchByPk(stock.branch);
    const companyId = sourceBranch?.company;
    if (companyId) {
      transferTargetBranches = await fetchTransferTargetBranches(companyId, stock.branch);
    }
  }

  const transferBranchIds = transferTargetBranches.map((b) => b.id);
  const merchantsInTransferBranches = await fetchMerchantsInBranches(transferBranchIds);

  return {
    stock,
    investors,
    merchantId,
    transferTargetBranches,
    merchantsInTransferBranches,
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

const TRANSFER_STOCK_MUTATION = `
  mutation TransferStock(
    $stockId: uuid!
    $toBranch: uuid!
    $fromBranch: uuid!
    $createdBy: uuid!
    $newStockCreatedBy: uuid!
  ) {
    update_stock_by_pk(
      pk_columns: { id: $stockId }
      _set: { branch: $toBranch, created_by: $newStockCreatedBy }
    ) {
      id
    }
    insert_transfers(
      objects: [
        {
          stock: $stockId
          from: $fromBranch
          to: $toBranch
          created_by: $createdBy
        }
      ]
    ) {
      returning {
        id
      }
    }
  }
`;

async function transferStockRecord(input: {
  stockId: string;
  fromBranch: string;
  toBranch: string;
  createdBy: string;
  newStockCreatedBy: string;
}) {
  const variables = {
    stockId: input.stockId,
    toBranch: input.toBranch,
    fromBranch: input.fromBranch,
    createdBy: input.createdBy,
    newStockCreatedBy: input.newStockCreatedBy,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: TRANSFER_STOCK_MUTATION,
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

  const updated = result.data?.update_stock_by_pk;
  const inserted = result.data?.insert_transfers?.returning?.[0];
  if (!updated?.id || !inserted?.id) {
    throw new Error('Transfer did not complete');
  }

  return inserted;
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

    const merchantBranchId = await fetchMerchantBranchId(userId);
    const stockRow = await fetchStockByPk(stock_id);
    if (!stockRow) {
      return { success: false, message: 'Stock not found' };
    }
    if (merchantBranchId != null && stockRow.branch !== merchantBranchId) {
      return { success: false, message: 'Stock not found' };
    }

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
        created_by: userId,
      });

      console.log('Order created successfully:', result);

      return {
        success: true,
        message: 'Order created successfully',
        orderId: result.id,
        intent: 'createOrder' as const,
      };
    } catch (err) {
      console.error('Failed to create order:', err);
      return {
        success: false,
        message: `Failed to create order: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  },

  transferStock: async ({ request, params }) => {
    const formData = await request.formData();

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return { success: false, message: 'Authentication required' };
    }

    const stock_id = params.id;
    const to_branch = formData.get('to_branch') as string;
    const new_stock_created_by = formData.get('stock_created_by') as string;
    const quantityRaw = formData.get('quantity');

    if (!to_branch) {
      return { success: false, message: 'Select a destination branch' };
    }

    if (!new_stock_created_by) {
      return { success: false, message: 'Select a merchant for the destination branch' };
    }

    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, message: 'Invalid quantity' };
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);
    const stockRow = await fetchStockByPk(stock_id);
    if (!stockRow) {
      return { success: false, message: 'Stock not found' };
    }
    if (merchantBranchId != null && stockRow.branch !== merchantBranchId) {
      return { success: false, message: 'Stock not found' };
    }

    const stockQty = Number(stockRow.quantity);
    if (quantity !== stockQty) {
      return {
        success: false,
        message: 'Transfer moves the full stock line; quantity must match the current stock quantity',
      };
    }

    const fromBranchId = stockRow.branch;
    if (!fromBranchId) {
      return { success: false, message: 'Stock has no branch assigned' };
    }

    if (to_branch === fromBranchId) {
      return { success: false, message: 'Choose a different branch than the current one' };
    }

    const fromRow = await fetchBranchByPk(fromBranchId);
    const toRow = await fetchBranchByPk(to_branch);
    if (!fromRow || !toRow) {
      return { success: false, message: 'Branch not found' };
    }

    if (!fromRow.company || fromRow.company !== toRow.company) {
      return {
        success: false,
        message: 'Destination branch must belong to the same company as this stock’s branch',
      };
    }

    const assignee = await fetchMerchantByPkForTransfer(new_stock_created_by);
    if (!assignee || assignee.branch !== to_branch) {
      return {
        success: false,
        message: 'Selected merchant must belong to the destination branch',
      };
    }

    try {
      await transferStockRecord({
        stockId: stock_id,
        fromBranch: fromBranchId,
        toBranch: to_branch,
        createdBy: userId,
        newStockCreatedBy: new_stock_created_by,
      });
    } catch (err) {
      return {
        success: false,
        message: `Failed to transfer: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    throw redirect(303, '/stocks');
  },
};
