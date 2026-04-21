import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';

const FETCH_PAYMENTS_QUERY = `
  query GetPayments($merchantId: uuid!) {
    payment(where: { created_by: { _eq: $merchantId } }) {
      amount
      created_by
      id
      order_id
      payment_method
    }
  }
`;

const FETCH_MERCHANTS_BY_IDS_QUERY = `
  query PaymentMerchantsByIds($ids: [uuid!]!) {
    merchant(where: { id: { _in: $ids } }) {
      id
      first_name
      last_name
    }
  }
`;

async function fetchPayments(merchantId: string) {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_PAYMENTS_QUERY,
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

    return result.data.payment ?? [];
  } catch {
    return [];
  }
}

function merchantDisplayName(first?: string | null, last?: string | null): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || '—';
}

async function attachCreatorNames(
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const ids = [
    ...new Set(
      rows
        .map((r) => (typeof r.created_by === 'string' ? r.created_by : ''))
        .filter((id) => id.length > 0),
    ),
  ];

  if (ids.length === 0) return rows.map((r) => ({ ...r, created_by_name: '—' }));

  let nameById = new Map<string, string>();
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_MERCHANTS_BY_IDS_QUERY,
        variables: { ids },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (!result.errors) {
        for (const m of result.data?.merchant ?? []) {
          const id = typeof m?.id === 'string' ? m.id : '';
          if (!id) continue;
          nameById.set(
            id,
            merchantDisplayName(
              typeof m?.first_name === 'string' ? m.first_name : null,
              typeof m?.last_name === 'string' ? m.last_name : null,
            ),
          );
        }
      }
    }
  } catch {}

  return rows.map((r) => ({
    ...r,
    created_by_name:
      nameById.get(typeof r.created_by === 'string' ? r.created_by : '') ?? '—',
  }));
}

export const load: PageServerLoad = async ({ request, parent }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  const rawPayments = merchantId ? await fetchPayments(merchantId) : [];
  const payments = await attachCreatorNames(rawPayments as Array<Record<string, unknown>>);

  return {
    payments,
  };
};

export const actions: Actions = {
  createPayment: async ({ request }) => {
    const formData = await request.formData();
    
    // Extract form data
    const orderId = formData.get('orderId') as string;
    const amount = Number(formData.get('amount'));
    const paymentMethod = formData.get('paymentMethod') as string;

    // TODO: Implement GraphQL mutation to create payment

    // For now, just return success
    return {
      success: true,
      message: 'Payment created successfully',
    };
  },
};
