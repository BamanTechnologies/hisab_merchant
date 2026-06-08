import type { PageServerLoad, Actions } from './$types';
import { error } from '@sveltejs/kit';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import {
  fetchBranchCompanyId,
  fetchInvestorsForCompany,
} from '$lib/companyInvestors.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { createPaymentRecord } from '$lib/payments.server';
import { insertCustomerTransaction } from '$lib/customerTransactions.server';
import { subscriptionWriteActionBlockedForRequest } from '$lib/subscription/server';

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
      customer_id
      id
      order_quantity
      status
      stock_id
      total_amount
      outstanding_amount
      unit
      order_items(order_by: [{ created_at: asc }, { id: asc }]) {
        stock_id
        quantity
        unit
        unit_price
        line_total
        factor_snapshot
        stock {
          id
          branch
          product_type
          attributes
          type
          model_number
          country
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
          unit
        }
      }
      stock {
        id
        branch
        product_type
        attributes
        type
        model_number
        country
        branch
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
        unit
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

export const load: PageServerLoad = async ({ params, request, parent }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  if (!merchantId) {
    error(404, 'Order not found');
  }

  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (merchantId ? await fetchMerchantBranchId(merchantId) : null);

  let companyId = merchantContext?.companyId ?? null;
  if (!companyId && merchantBranchId) {
    companyId = await fetchBranchCompanyId(merchantBranchId);
  }

  const [order, investors] = await Promise.all([
    fetchOrderForMerchant(params.id, merchantId),
    fetchInvestorsForCompany(companyId),
  ]);

  if (!order) {
    error(404, 'Order not found');
  }

  return {
    order,
    investors,
    merchantId,
  };
};

export const actions: Actions = {
  createPayment: async ({ request, params }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

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

    const customerId = String((order as { customer_id?: string }).customer_id ?? '').trim();
    const stockBranch =
      (order as {
        order_items?: Array<{ stock?: { branch?: string | null } | null }> | null;
        stock?: { branch?: string | null } | null;
      }).order_items?.find((x) => x?.stock?.branch)?.stock?.branch ??
      (order as { stock?: { branch?: string | null } | null }).stock?.branch;
    const companyId = stockBranch ? await fetchBranchCompanyId(stockBranch) : null;

    if (!customerId || !companyId) {
      return {
        success: false,
        message:
          'Order is missing customer or company (stock branch) — cannot record payment in the ledger',
      };
    }

    try {
      const result = await createPaymentRecord({
        amount,
        order_id: orderId,
        payment_method: paymentMethod,
        created_by: userId,
      });

      await insertCustomerTransaction({
        company: companyId,
        customer: customerId,
        amount: -Math.abs(amount),
        type: 'payment',
        reference: orderId,
        reference_type: 'order',
        note: 'Manual payment',
        created_by: userId,
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
