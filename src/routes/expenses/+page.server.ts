import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { config, getGraphQLHeaders } from '$lib/config';
import { subscriptionWriteActionBlockedForRequest } from '$lib/subscription/server';

const FETCH_EXPENSES_BY_BRANCH_QUERY = `
  query ExpensesByBranch($branchId: uuid!) {
    expenses(
      where: { branch_id: { _eq: $branchId } }
      order_by: { created_at: desc }
    ) {
      id
      created_at
      updated_at
      created_by
      sent_to
      category
      branch_id
      note
      payment_type
      expense_type
      from_person
      from_account
      to_account
      amount
      receipt
    }
    operation_expenses_aggregate: expenses_aggregate(
      where: {
        _and: [
          { branch_id: { _eq: $branchId } }
          { expense_type: { _eq: "operation" } }
        ]
      }
    ) {
      aggregate {
        sum {
          amount
        }
      }
    }
    major_expenses_aggregate: expenses_aggregate(
      where: {
        _and: [
          { branch_id: { _eq: $branchId } }
          { expense_type: { _eq: "major" } }
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

const INSERT_EXPENSE_MUTATION = `
  mutation InsertExpense($object: expenses_insert_input!) {
    insert_expenses_one(object: $object) {
      id
    }
  }
`;

const FETCH_MERCHANTS_BY_IDS_QUERY = `
  query ExpenseMerchantsByIds($ids: [uuid!]!) {
    merchant(where: { id: { _in: $ids } }) {
      id
      first_name
      last_name
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
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

type ExpenseRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  created_by: string;
  /** Display name from merchant table */
  created_by_name: string;
  sent_to: string;
  category: string;
  branch_id: string;
  note: string;
  payment_type: string;
  expense_type: string;
  from_person: string;
  from_account: string;
  to_account: string;
  amount: number;
  receipt?: string | null;
};

function normalizeExpense(raw: Record<string, unknown>): Omit<ExpenseRow, 'created_by_name'> {
  return {
    id: String(raw.id),
    created_at: String(raw.created_at ?? ''),
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    created_by: String(raw.created_by ?? ''),
    sent_to: String(raw.sent_to ?? ''),
    category: String(raw.category ?? ''),
    branch_id: String(raw.branch_id ?? ''),
    note: String(raw.note ?? ''),
    payment_type: String(raw.payment_type ?? ''),
    expense_type: String(raw.expense_type ?? 'operation').trim().toLowerCase() || 'operation',
    from_person: String(raw.from_person ?? ''),
    from_account: String(raw.from_account ?? ''),
    to_account: String(raw.to_account ?? ''),
    amount: parseMoney(raw.amount),
    receipt: raw.receipt != null ? String(raw.receipt) : null,
  };
}

function merchantDisplayName(
  first?: string | null,
  last?: string | null,
): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || '—';
}

async function attachCreatorNames(rows: Omit<ExpenseRow, 'created_by_name'>[]): Promise<ExpenseRow[]> {
  const ids = [
    ...new Set(rows.map((r) => r.created_by).filter((id) => typeof id === 'string' && id.length > 0)),
  ];
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, created_by_name: '—' }));
  }

  let nameById = new Map<string, string>();
  try {
    const data = await gql<{ merchant: { id: string; first_name?: string | null; last_name?: string | null }[] }>(
      FETCH_MERCHANTS_BY_IDS_QUERY,
      { ids },
    );
    for (const m of data.merchant ?? []) {
      nameById.set(m.id, merchantDisplayName(m.first_name, m.last_name));
    }
  } catch {}

  return rows.map((r) => ({
    ...r,
    created_by_name: nameById.get(r.created_by) ?? '—',
  }));
}

const PAYMENT_TYPE_VALUES = ['cash', 'telebirr', 'bank transfer'] as const;
const EXPENSE_TYPE_VALUES = ['operation', 'major'] as const;
const CATEGORY_VALUES = [
  'transportation',
  'delivery cost',
  'rent',
  'utility',
  'office supply',
  'repair and maintenance',
  'salary',
  'staff and payroll',
  'marketing and sales',
  'lc',
  'collector',
  'other',
] as const;

const paymentTypeSet = new Set<string>(PAYMENT_TYPE_VALUES);
const expenseTypeSet = new Set<string>(EXPENSE_TYPE_VALUES);
const categorySet = new Set<string>(CATEGORY_VALUES);

export const load: PageServerLoad = async ({ request, parent }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (merchantId ? await fetchMerchantBranchId(merchantId) : null);

  let expenses: ExpenseRow[] = [];
  let totalOperationalExpenseAmount = 0;
  let totalMajorExpenseAmount = 0;

  if (merchantBranchId) {
    try {
      const data = await gql<{
        expenses: Record<string, unknown>[];
        operation_expenses_aggregate: {
          aggregate: { sum: { amount: unknown } | null } | null;
        } | null;
        major_expenses_aggregate: {
          aggregate: { sum: { amount: unknown } | null } | null;
        } | null;
      }>(FETCH_EXPENSES_BY_BRANCH_QUERY, { branchId: merchantBranchId });

      const rawRows = (data.expenses ?? []).map((r) => normalizeExpense(r));
      expenses = await attachCreatorNames(rawRows);
      totalOperationalExpenseAmount = parseMoney(
        data.operation_expenses_aggregate?.aggregate?.sum?.amount ?? 0,
      );
      totalMajorExpenseAmount = parseMoney(
        data.major_expenses_aggregate?.aggregate?.sum?.amount ?? 0,
      );
    } catch {}
  }

  return {
    expenses,
    totalOperationalExpenseAmount,
    totalMajorExpenseAmount,
    merchantId,
    merchantBranchId,
    expenseTypes: [...EXPENSE_TYPE_VALUES],
    paymentTypes: [...PAYMENT_TYPE_VALUES],
    categories: [...CATEGORY_VALUES],
  };
};

export const actions: Actions = {
  createExpense: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return { success: false, message: 'Authentication required' };
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);

    if (!merchantBranchId) {
      return {
        success: false,
        message: 'No branch assigned to your account. Cannot record expenses.',
      };
    }

    const formData = await request.formData();
    const sent_to = String(formData.get('sent_to') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();
    const note = String(formData.get('note') ?? '').trim();
    const payment_type = String(formData.get('payment_type') ?? '').trim();
    const expense_type = String(formData.get('expense_type') ?? 'operation')
      .trim()
      .toLowerCase();
    const from_person = String(formData.get('from_person') ?? '').trim();
    const from_account = String(formData.get('from_account') ?? '').trim();
    const to_account = String(formData.get('to_account') ?? '').trim();
    const amountRaw = formData.get('amount');
    const receipt = String(formData.get('receipt') ?? '').trim();

    if (!expenseTypeSet.has(expense_type)) {
      return { success: false, message: 'Select a valid expense type' };
    }
    if (!from_person) {
      return { success: false, message: 'Paid by is required' };
    }
    if (expense_type === 'major') {
      if (!from_account) return { success: false, message: 'From account is required for major expenses' };
      if (!to_account) return { success: false, message: 'To account is required for major expenses' };
    }

    const effectiveSentTo = sent_to;
    if (!effectiveSentTo) {
      return { success: false, message: 'Sent to (name) is required' };
    }
    if (!categorySet.has(category)) {
      return { success: false, message: 'Select a valid category' };
    }
    if (!paymentTypeSet.has(payment_type)) {
      return { success: false, message: 'Select a valid payment type' };
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, message: 'Enter a valid amount greater than zero' };
    }

    const object: Record<string, unknown> = {
      created_by: userId,
      branch_id: merchantBranchId,
      sent_to: effectiveSentTo,
      category,
      note: note || null,
      payment_type,
      expense_type,
      from_person,
      from_account: from_account || null,
      to_account: to_account || null,
      amount,
    };
    if (receipt) {
      object.receipt = receipt;
    }

    try {
      await gql<{ insert_expenses_one: { id: string } | null }>(INSERT_EXPENSE_MUTATION, {
        object,
      });
    } catch (err) {
      return {
        success: false,
        message: `Failed to save expense: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    return { success: true, message: 'Expense recorded' };
  },
};
