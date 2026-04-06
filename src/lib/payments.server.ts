import { config, getGraphQLHeaders } from '$lib/config';

const CREATE_PAYMENT_MUTATION = `
  mutation CreatePayment($amount: money, $created_by: uuid, $order_id: uuid, $payment_method: String) {
    insert_payment(
      objects: {
        amount: $amount
        created_by: $created_by
        order_id: $order_id
        payment_method: $payment_method
      }
    ) {
      returning {
        id
      }
    }
  }
`;

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  if (result.errors?.length) {
    const first = result.errors[0] as { message?: string };
    const detail = first?.message ?? JSON.stringify(result.errors);
    throw new Error(`GraphQL: ${detail}`);
  }

  return result.data as T;
}

export async function createPaymentRecord(input: {
  amount: number;
  order_id: string;
  payment_method: string;
  created_by: string;
}): Promise<{ id: string }> {
  const data = await gql<{
    insert_payment: { returning: Array<{ id: string } | null> };
  }>(CREATE_PAYMENT_MUTATION, {
    amount: input.amount,
    created_by: input.created_by,
    order_id: input.order_id,
    payment_method: input.payment_method,
  });

  const row = data.insert_payment?.returning?.[0];
  if (!row?.id) {
    throw new Error('Payment insert returned no row');
  }
  return row;
}
