import { config, getGraphQLHeaders } from '$lib/config';

/** Latest row per customer+company; `balance` is maintained by DB triggers (running ledger). */
const CUSTOMER_LATEST_BALANCE_QUERY = `
  query CustomerLatestBalance($companyId: uuid!, $customerId: uuid!) {
    customer_transactions(
      where: {
        _and: [
          { company: { _eq: $companyId } }
          { customer: { _eq: $customerId } }
        ]
      }
      order_by: [{ created_at: desc }, { id: desc }]
      limit: 1
    ) {
      balance
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

/** Sum of ledger rows for this order with `type: payment` (cash/bank are negative; balance consumption can be positive). */
const ORDER_PAYMENT_SUM_QUERY = `
  query OrderLedgerPaymentSum($orderId: uuid!) {
    customer_transactions_aggregate(
      where: {
        _and: [
          { reference: { _eq: $orderId } }
          { reference_type: { _eq: "order" } }
          { type: { _eq: "payment" } }
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

/** Payments drawn from prepaid balance toward this order (see `postOrderLedgerAndAutoPay` notes). */
const ORDER_PAYMENT_CUSTOMER_BALANCE_SUM_QUERY = `
  query OrderLedgerCustomerBalancePaymentSum($orderId: uuid!) {
    customer_transactions_aggregate(
      where: {
        _and: [
          { reference: { _eq: $orderId } }
          { reference_type: { _eq: "order" } }
          { type: { _eq: "payment" } }
          { note: { _ilike: "%customer balance%" } }
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

/** Cash/bank paid in on this order (`createPayment` uses negative amounts — see orders/[id] manual payment). */
const ORDER_PAYMENT_MANUAL_CASH_SUM_QUERY = `
  query OrderLedgerManualCashPaymentSum($orderId: uuid!) {
    customer_transactions_aggregate(
      where: {
        _and: [
          { reference: { _eq: $orderId } }
          { reference_type: { _eq: "order" } }
          { type: { _eq: "payment" } }
          { amount: { _lt: 0 } }
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
 * Running ledger balance for the customer in the company (from latest `customer_transactions.balance`).
 * - **Positive** = net amount the customer owes (outstanding debt).
 * - **Negative** = net prepaid credit (we owe them).
 * Same sign convention as the former aggregate sum of `amount`.
 */
export async function fetchCustomerLatestBalance(
  companyId: string,
  customerId: string,
): Promise<number> {
  try {
    const data = await gql<{
      customer_transactions: { balance: unknown }[];
    }>(CUSTOMER_LATEST_BALANCE_QUERY, { companyId, customerId });

    const row = data.customer_transactions?.[0];
    return parseNumeric(row?.balance ?? 0);
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

/** Net sum of all `payment`-type ledger lines for this order (cash/bank negative + balance-flow positive). */
export async function sumOrderLedgerPayments(orderId: string): Promise<number> {
  try {
    const data = await gql<{
      customer_transactions_aggregate: {
        aggregate: { sum: { amount: unknown } | null } | null;
      } | null;
    }>(ORDER_PAYMENT_SUM_QUERY, { orderId: orderId.trim() });

    return parseNumeric(data.customer_transactions_aggregate?.aggregate?.sum?.amount ?? 0);
  } catch {
    return 0;
  }
}

/** Sum of prepaid balance consumed toward this order (matches auto-pay line notes). */
export async function sumOrderLedgerCustomerBalancePayments(orderId: string): Promise<number> {
  try {
    const data = await gql<{
      customer_transactions_aggregate: {
        aggregate: { sum: { amount: unknown } | null } | null;
      } | null;
    }>(ORDER_PAYMENT_CUSTOMER_BALANCE_SUM_QUERY, { orderId: orderId.trim() });

    return parseNumeric(data.customer_transactions_aggregate?.aggregate?.sum?.amount ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Sum of negative `payment` rows on this order (cash/bank in). Typically ≤ 0.
 * Used when cancelling with “refund to customer balance” so manual payments become prepaid credit again.
 */
export async function sumOrderLedgerManualCashPayments(orderId: string): Promise<number> {
  try {
    const data = await gql<{
      customer_transactions_aggregate: {
        aggregate: { sum: { amount: unknown } | null } | null;
      } | null;
    }>(ORDER_PAYMENT_MANUAL_CASH_SUM_QUERY, { orderId: orderId.trim() });

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
