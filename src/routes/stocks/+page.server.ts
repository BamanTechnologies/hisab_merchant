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
      branch
      origin
      type
      product_type
      attributes
      created_by
      investors
      merchant {
        id
      }
      purchased_price
      quantity
      selling_price
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

const FETCH_BRANCHES_FOR_COMPANY_QUERY = `
  query StocksBranchesForCompany($companyId: uuid!) {
    branches(where: { company: { _eq: $companyId } }, order_by: [{ name: asc }]) {
      id
      name
    }
  }
`;

const FETCH_PRODUCT_TYPES_QUERY = `
  query GetProductTypes($merchantId: uuid!) {
    product_types(
      where: { merchant_id: { _eq: $merchantId } }
      order_by: [{ name: asc }, { created_at: asc }]
    ) {
      id
      name
      merchant_id
      created_at
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

async function fetchBranchesForCompany(companyId: string | null) {
  if (!companyId) return [];
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_BRANCHES_FOR_COMPANY_QUERY,
        variables: { companyId },
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

async function fetchProductTypes(merchantId: string | null) {
  if (!merchantId) return [];
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_PRODUCT_TYPES_QUERY,
        variables: { merchantId },
      }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    if (result.errors) return [];
    return result.data.product_types ?? [];
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

  const [stocksRaw, investors, branches, productTypes] = await Promise.all([
    fetchStocks(merchantBranchId),
    fetchInvestorsForCompany(companyId),
    fetchBranchesForCompany(companyId),
    fetchProductTypes(merchantId),
  ]);

  const typeById = new Map<string, { id: string; name?: string | null }>();
  for (const raw of productTypes as Array<Record<string, unknown>>) {
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!id) continue;
    const name = raw.name == null ? null : String(raw.name);
    typeById.set(id, { id, name });
  }
  const stocks = (stocksRaw ?? []).map((s: Record<string, unknown>) => {
    const productTypeRef = s.product_type;
    if (productTypeRef && typeof productTypeRef === 'object') return s;
    const ptId = typeof productTypeRef === 'string' ? productTypeRef : '';
    const pt = ptId ? typeById.get(ptId) : undefined;
    return {
      ...s,
      product_type: pt ? { id: pt.id, name: pt.name ?? null } : null,
    };
  });

  return {
    stocks,
    investors,
    branches,
    productTypes,
    merchantId,
    merchantBranchId,
  };
};

const CREATE_STOCK_MUTATION = `
  mutation CreateStock(
    $branch: uuid
    $created_by: uuid
    $investors: [uuid!]
    $purchased_price: money
    $quantity: numeric
    $selling_price: money
    $product_type: uuid
    $attributes: jsonb
    $type: String
    $unit: String
  ) {
    insert_stock(
      objects: {
        branch: $branch
        created_by: $created_by
        investors: $investors
        purchased_price: $purchased_price
        quantity: $quantity
        selling_price: $selling_price
        product_type: $product_type
        attributes: $attributes
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
    $purchased_price: money
    $quantity: numeric
    $selling_price: money
    $product_type: uuid
    $attributes: jsonb
    $type: String
    $unit: String
    $updated_at: timestamptz
    $updated_by: uuid
  ) {
    update_stock_by_pk(
      pk_columns: { id: $id }
      _set: {
        branch: $branch
        purchased_price: $purchased_price
        quantity: $quantity
        selling_price: $selling_price
        product_type: $product_type
        attributes: $attributes
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

async function createStock(stockData: {
  branch: string | null;
  investors: string[];
  purchased_price: number;
  quantity: number;
  selling_price: number;
  product_type: string;
  attributes: Record<string, unknown>;
  type: string;
  unit: string;
  userId: string;
}) {
  const variables = {
    branch: stockData.branch,
    created_by: stockData.userId,
    investors: stockData.investors,
    purchased_price: stockData.purchased_price,
    quantity: stockData.quantity,
    selling_price: stockData.selling_price,
    product_type: stockData.product_type,
    attributes: stockData.attributes,
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
  purchased_price: number;
  quantity: number;
  selling_price: number;
  product_type: string;
  attributes: Record<string, unknown>;
  type: string;
  unit: string;
  updated_by: string;
}) {
  const variables = {
    id: stockData.id,
    branch: stockData.branch,
    purchased_price: stockData.purchased_price,
    quantity: stockData.quantity,
    selling_price: stockData.selling_price,
    product_type: stockData.product_type,
    attributes: stockData.attributes,
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

function parseAttributes(raw: FormDataEntryValue | null): Record<string, unknown> {
  if (raw == null) return {};
  const s = String(raw).trim();
  if (!s) return {};
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!k.trim()) continue;
      if (v == null) continue;
      if (typeof v === 'string') {
        const t = v.trim();
        if (!t) continue;
        out[k] = t;
      } else {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
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
    const branchRaw = parseOptionalString(formData.get('branch'));
    const productTypeId = parseOptionalString(formData.get('product_type'));
    const productTypeName = normalizeStockType(String(formData.get('product_type_name') ?? ''));
    const attributes = parseAttributes(formData.get('attributes'));
    const unit = parseUnit(formData.get('unit'));

    let investors: string[] = [];
    try {
      const parsed = JSON.parse(formData.get('investors') as string) as unknown;
      investors = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
        : [];
    } catch {
      investors = [];
    }

    if (investors.length === 0) {
      return {
        success: false,
        message: 'Please select at least one investor — this field is required.',
      };
    }

    if (!productTypeId) {
      return { success: false, message: 'Product type is required' };
    }

    if (!productTypeName) {
      return { success: false, message: 'Product type name is required' };
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
        investors,
        purchased_price,
        quantity,
        selling_price,
        product_type: productTypeId,
        attributes,
        type: productTypeName,
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
    const branchRaw = parseOptionalString(formData.get('branch'));
    const productTypeId = parseOptionalString(formData.get('product_type'));
    const productTypeName = normalizeStockType(String(formData.get('product_type_name') ?? ''));
    const attributes = parseAttributes(formData.get('attributes'));
    const unit = parseUnit(formData.get('unit'));

    if (!id) {
      return {
        success: false,
        message: 'Stock ID is required',
      };
    }

    if (!productTypeId) {
      return { success: false, message: 'Product type is required' };
    }

    if (!productTypeName) {
      return { success: false, message: 'Product type name is required' };
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
        purchased_price,
        quantity,
        selling_price,
        product_type: productTypeId,
        attributes,
        type: productTypeName,
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
