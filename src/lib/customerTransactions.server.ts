import { config, getGraphQLHeaders } from '$lib/config';

const CUSTOMER_TRANSACTION_BALANCE_QUERY = `
  query CustomerTransactionBalance($companyId: uuid!, $customerId: uuid!) {
    customer_transactions_aggregate(
      where: {
        _and: [
          { company: { _eq: $companyId } }
          { customer: { _eq: $customerId } }
        ]
      }
    ) {
      aggregate {
        sum {
          amount
        }
      }
    }
  }
`;

/** Sum of `customer_transactions` rows for this order with `type: order` (debt lines we created for the order). */
const ORDER_DEBIT_SUM_QUERY = `
  query OrderLedgerOrderDebitSum($orderId: uuid!) {
    customer_transactions_aggregate(
      where: {
        _and: [
          { reference: { _eq: $orderId } }
          { reference_type: { _eq: "order" } }
          { type: { _eq: "order" } }
        ]
      }
    ) {
      aggregate {
        sum {
          amount
        }
      }
    }
  }
`;

const INSERT_CUSTOMER_TRANSACTION_MUTATION = `
  mutation InsertCustomerTransaction(
    $company: uuid!
    $customer: uuid!
    $amount: numeric!
    $type: String!
    $reference: uuid
    $reference_type: String
    $note: String
    $created_by: uuid!
  ) {
    insert_customer_transactions_one(
      object: {
        company: $company
        customer: $customer
        amount: $amount
        type: $type
        reference: $reference
        reference_type: $reference_type
        note: $note
        created_by: $created_by
      }
    ) {
      id
    }
  }
`;

function parseNumeric(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

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
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

/**
 * Sum of `amount` for the customer in the company (running ledger).
 * - **Positive** = net amount the customer owes (outstanding debt).
 * - **Negative** = net prepaid credit (we owe them).
 * Convention: `+order` and paying **from prepaid credit** (`type: payment`, positive) increase sum toward zero from negative.
 * Bank/cash payments (`type: payment`, negative) reduce positive debt.
 */
export async function fetchCustomerTransactionSum(
  companyId: string,
  customerId: string,
): Promise<number> {
  try {
    const data = await gql<{
      customer_transactions_aggregate: {
        aggregate: { sum: { amount: unknown } | null } | null;
      } | null;
    }>(CUSTOMER_TRANSACTION_BALANCE_QUERY, { companyId, customerId });

    return parseNumeric(data.customer_transactions_aggregate?.aggregate?.sum?.amount ?? 0);
  } catch {
    return 0;
  }
}

/** Net outstanding debt from the ledger sum (never negative). */
export function outstandingFromTransactionSum(sum: number): number {
  const n = Number.isFinite(sum) ? sum : 0;
  return Math.max(0, n);
}

/** Total positive `order`-type debt recorded for this order id (used on cancel to reverse). */
export async function sumOrderLedgerOrderDebits(orderId: string): Promise<number> {
  try {
    const data = await gql<{
      customer_transactions_aggregate: {
        aggregate: { sum: { amount: unknown } | null } | null;
      } | null;
    }>(ORDER_DEBIT_SUM_QUERY, { orderId: orderId.trim() });

    return parseNumeric(data.customer_transactions_aggregate?.aggregate?.sum?.amount ?? 0);
  } catch {
    return 0;
  }
}

export type CustomerTransactionInsert = {
  company: string;
  customer: string;
  amount: number;
  type: 'order' | 'payment' | 'refund' | 'adjustment';
  reference: string;
  reference_type: string;
  note: string;
  created_by: string;
};

export async function insertCustomerTransaction(
  input: CustomerTransactionInsert,
): Promise<{ id: string }> {
  const data = await gql<{
    insert_customer_transactions_one: { id: string } | null;
  }>(INSERT_CUSTOMER_TRANSACTION_MUTATION, {
    company: input.company,
    customer: input.customer,
    amount: input.amount,
    type: input.type,
    reference: input.reference,
    reference_type: input.reference_type,
    note: input.note,
    created_by: input.created_by,
  });

  const row = data.insert_customer_transactions_one;
  if (!row?.id) {
    throw new Error('Customer transaction insert returned no row');
  }
  return row;
}
