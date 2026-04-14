import type { PageServerLoad, Actions } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import {
  fetchBranchCompanyId,
  fetchInvestorsForCompany,
} from '$lib/companyInvestors.server';
import { config, getGraphQLHeaders } from '$lib/config';

const STOCK_FIELDS = `
      id
      model_number
      country
      branch
      origin
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
      unit
`;

// GraphQL query to fetch stocks (optionally scoped to a branch)
const FETCH_STOCKS_BY_BRANCH_QUERY = `
  query GetStocksByBranch($branchId: uuid!) {
    stock(where: { branch: { _eq: $branchId } }) {
${STOCK_FIELDS}
    }
  }
`;

const FETCH_STOCKS_ALL_QUERY = `
  query GetStocksAll {
    stock {
${STOCK_FIELDS}
    }
  }
`;

const FETCH_BRANCHES_QUERY = `
  query GetBranches {
    branches {
      id
      name
    }
  }
`;

async function fetchStocks(merchantBranchId: string | null) {
  try {
    const query = merchantBranchId ? FETCH_STOCKS_BY_BRANCH_QUERY : FETCH_STOCKS_ALL_QUERY;
    const body: Record<string, unknown> = { query };
    if (merchantBranchId) {
      body.variables = { branchId: merchantBranchId };
    }

    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.stock;
  } catch {
    return [];
  }
}

async function fetchBranches() {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_BRANCHES_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.branches ?? [];
  } catch {
    return [];
  }
}

export const load: PageServerLoad = async ({ request, parent }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (merchantId ? await fetchMerchantBranchId(merchantId) : null);

  let companyId = merchantContext?.companyId ?? null;
  if (!companyId && merchantBranchId) {
    companyId = await fetchBranchCompanyId(merchantBranchId);
  }

  const [stocks, investors, branches] = await Promise.all([
    fetchStocks(merchantBranchId),
    fetchInvestorsForCompany(companyId),
    fetchBranches(),
  ]);

  return {
    stocks,
    investors,
    branches,
    merchantId,
    merchantBranchId,
  };
};

const CREATE_STOCK_MUTATION = `
  mutation CreateStock(
    $branch: uuid
    $color: String
    $country: String
    $created_by: uuid
    $factor: numeric
    $figure: String
    $investors: [uuid!]
    $model_number: String
    $purchased_price: money
    $quantity: numeric
    $selling_price: money
    $thickness: numeric
    $type: String
    $unit: String
  ) {
    insert_stock(
      objects: {
        branch: $branch
        color: $color
        country: $country
        created_by: $created_by
        factor: $factor
        figure: $figure
        investors: $investors
        model_number: $model_number
        purchased_price: $purchased_price
        quantity: $quantity
        selling_price: $selling_price
        thickness: $thickness
        type: $type
        unit: $unit
      }
    ) {
      returning {
        id
      }
    }
  }
`;

const DELETE_STOCK_MUTATION = `
  mutation DeleteStockById($id: uuid!) {
    delete_stock_by_pk(id: $id) {
      id
    }
  }
`;

const UPDATE_STOCK_MUTATION = `
  mutation UpdateStock(
    $id: uuid!
    $branch: uuid
    $color: String
    $country: String
    $factor: numeric
    $figure: String
    $model_number: String
    $purchased_price: money
    $quantity: numeric
    $selling_price: money
    $thickness: numeric
    $type: String
    $unit: String
    $updated_at: timestamptz
    $updated_by: uuid
  ) {
    update_stock_by_pk(
      pk_columns: { id: $id }
      _set: {
        branch: $branch
        color: $color
        country: $country
        factor: $factor
        figure: $figure
        model_number: $model_number
        purchased_price: $purchased_price
        quantity: $quantity
        selling_price: $selling_price
        thickness: $thickness
        type: $type
        unit: $unit
        updated_at: $updated_at
        updated_by: $updated_by
      }
    ) {
      id
    }
  }
`;

function parseOptionalString(raw: FormDataEntryValue | null): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

function parseOptionalNumber(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function createStock(stockData: {
  branch: string | null;
  color: string | null;
  country: string | null;
  factor: number | null;
  figure: string | null;
  investors: string[];
  model_number: string | null;
  purchased_price: number;
  quantity: number;
  selling_price: number;
  thickness: number | null;
  type: string;
  unit: string;
  userId: string;
}) {
  const variables = {
    branch: stockData.branch,
    color: stockData.color,
    country: stockData.country,
    created_by: stockData.userId,
    factor: stockData.factor,
    figure: stockData.figure,
    investors: stockData.investors,
    model_number: stockData.model_number,
    purchased_price: stockData.purchased_price,
    quantity: stockData.quantity,
    selling_price: stockData.selling_price,
    thickness: stockData.thickness,
    type: stockData.type,
    unit: stockData.unit,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: CREATE_STOCK_MUTATION,
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

  return result.data.insert_stock.returning[0];
}

async function deleteStock(stockId: string) {
  const variables = {
    id: stockId,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: DELETE_STOCK_MUTATION,
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

  return result.data.delete_stock_by_pk;
}

async function updateStock(stockData: {
  id: string;
  branch: string | null;
  color: string | null;
  country: string | null;
  factor: number | null;
  figure: string | null;
  model_number: string | null;
  purchased_price: number;
  quantity: number;
  selling_price: number;
  thickness: number | null;
  type: string;
  unit: string;
  updated_by: string;
}) {
  const variables = {
    id: stockData.id,
    branch: stockData.branch,
    color: stockData.color,
    country: stockData.country,
    factor: stockData.factor,
    figure: stockData.figure,
    model_number: stockData.model_number,
    purchased_price: stockData.purchased_price,
    quantity: stockData.quantity,
    selling_price: stockData.selling_price,
    thickness: stockData.thickness,
    type: stockData.type,
    unit: stockData.unit,
    updated_at: new Date().toISOString(),
    updated_by: stockData.updated_by,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: UPDATE_STOCK_MUTATION,
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

  return result.data.update_stock_by_pk;
}

const VALID_TYPES = new Set(['glass', 'brake_lining']);
const MAX_UNIT_LENGTH = 64;

function parseUnit(raw: FormDataEntryValue | null): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.length > MAX_UNIT_LENGTH) return null;
  return s;
}

function normalizeStockType(raw: string): string {
  const t = raw.trim();
  if (t === 'brake_pad' || t === 'break_pad') return 'brake_lining';
  return t;
}

function assertBranchAllowed(branchId: string | null, merchantBranchId: string | null) {
  if (merchantBranchId && branchId && branchId !== merchantBranchId) {
    throw new Error('You can only manage stock for your assigned branch');
  }
}

export const actions: Actions = {
  createStock: async ({ request }) => {
    const formData = await request.formData();

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return {
        success: false,
        message: 'Authentication required',
      };
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);

    const purchased_price = Number(formData.get('purchased_price'));
    const selling_price = Number(formData.get('selling_price'));
    const quantity = Number(formData.get('quantity'));
    const thickness = parseOptionalNumber(formData.get('thickness'));
    const factor = parseOptionalNumber(formData.get('factor'));
    const color = parseOptionalString(formData.get('color'));
    const figure = parseOptionalString(formData.get('figure'));
    const model_number = parseOptionalString(formData.get('model_number'));
    const country = parseOptionalString(formData.get('country'));
    const branchRaw = parseOptionalString(formData.get('branch'));
    const type = normalizeStockType(String(formData.get('type') ?? ''));
    const unit = parseUnit(formData.get('unit'));

    let investors: string[] = [];
    try {
      investors = JSON.parse(formData.get('investors') as string) as string[];
      if (!Array.isArray(investors)) investors = [];
    } catch {
      investors = [];
    }

    if (!VALID_TYPES.has(type)) {
      return { success: false, message: 'Invalid stock type' };
    }

    if (!unit) {
      return {
        success: false,
        message: `Unit is required (max ${MAX_UNIT_LENGTH} characters)`,
      };
    }

    if (!branchRaw) {
      return { success: false, message: 'Branch is required' };
    }

    try {
      assertBranchAllowed(branchRaw, merchantBranchId);
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : 'Branch not allowed',
      };
    }

    if (!Number.isFinite(purchased_price) || !Number.isFinite(selling_price) || !Number.isFinite(quantity)) {
      return { success: false, message: 'Purchased price, selling price, and quantity are required' };
    }

    try {
      const result = await createStock({
        branch: branchRaw,
        color,
        country,
        factor,
        figure,
        investors,
        model_number,
        purchased_price,
        quantity,
        selling_price,
        thickness,
        type,
        unit,
        userId,
      });

      return {
        success: true,
        message: 'Stock created successfully',
        stockId: result.id,
      };
    } catch (error) {
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

      return {
        success: true,
        message: 'Stock deleted successfully',
        deletedId: result.id,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete stock: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
  updateStock: async ({ request }) => {
    const formData = await request.formData();

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return {
        success: false,
        message: 'Authentication required',
      };
    }

    const merchantBranchId = await fetchMerchantBranchId(userId);

    const id = formData.get('id') as string;
    const purchased_price = Number(formData.get('purchased_price'));
    const selling_price = Number(formData.get('selling_price'));
    const quantity = Number(formData.get('quantity'));
    const thickness = parseOptionalNumber(formData.get('thickness'));
    const factor = parseOptionalNumber(formData.get('factor'));
    const color = parseOptionalString(formData.get('color'));
    const figure = parseOptionalString(formData.get('figure'));
    const model_number = parseOptionalString(formData.get('model_number'));
    const country = parseOptionalString(formData.get('country'));
    const branchRaw = parseOptionalString(formData.get('branch'));
    const type = normalizeStockType(String(formData.get('type') ?? ''));
    const unit = parseUnit(formData.get('unit'));

    if (!id) {
      return {
        success: false,
        message: 'Stock ID is required',
      };
    }

    if (!VALID_TYPES.has(type)) {
      return { success: false, message: 'Invalid stock type' };
    }

    if (!unit) {
      return {
        success: false,
        message: `Unit is required (max ${MAX_UNIT_LENGTH} characters)`,
      };
    }

    if (!branchRaw) {
      return { success: false, message: 'Branch is required' };
    }

    try {
      assertBranchAllowed(branchRaw, merchantBranchId);
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : 'Branch not allowed',
      };
    }

    if (!Number.isFinite(purchased_price) || !Number.isFinite(selling_price) || !Number.isFinite(quantity)) {
      return { success: false, message: 'Purchased price, selling price, and quantity are required' };
    }

    try {
      const result = await updateStock({
        id,
        branch: branchRaw,
        color,
        country,
        factor,
        figure,
        model_number,
        purchased_price,
        quantity,
        selling_price,
        thickness,
        type,
        unit,
        updated_by: userId,
      });

      return {
        success: true,
        message: 'Stock updated successfully',
        stockId: result.id,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update stock: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
