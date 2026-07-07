import type { PageServerLoad, Actions } from "./$types";
import { getUserIdFromRequest } from "$lib/auth";
import { fetchMerchantBranchId } from "$lib/merchantBranch.server";
import {
  fetchBranchCompanyId,
  fetchInvestorsForCompany,
} from "$lib/companyInvestors.server";
import { config, getGraphQLHeaders } from "$lib/config";
import { insertStockMovements } from "$lib/inventory/movements.server";
import {
  parseOptionalString,
  parseReceiveLines,
  parseUnit,
} from "$lib/inventory/parseForm";
import { subscriptionWriteActionBlockedForRequest } from "$lib/subscription/server";
import { resolveUniqueBatchNumber } from "$lib/inventory/batchNumber";
import { resolveReceiveExpiryDate } from "$lib/inventory/companyStockFields";
import { normalizeProductTypeName } from "$lib/inventory/parseForm";

const FETCH_COMPANY_NAME_QUERY = `
  query CompanyNameForStocks($id: uuid!) {
    companies_by_pk(id: $id) {
      name
    }
  }
`;

const FETCH_COMPANY_BATCH_NUMBERS_QUERY = `
  query CompanyBatchNumbers($branchIds: [uuid!]!) {
    stock(
      where: {
        _and: [
          { branch: { _in: $branchIds } }
          { batch_number: { _is_null: false } }
        ]
      }
    ) {
      batch_number
    }
  }
`;

const STOCK_FIELDS = `
      id
      branch
      origin
      product_id
      batch_number
      expiry_date
      purchased_price
      quantity
      selling_price
      created_at
      type
      product_type
      attributes
      unit
      factor
      model_number
      country
      color
      figure
      thickness
      product {
        id
        name
        default_unit
        factor
        attributes
        investors
        is_active
        product_type {
          id
          name
        }
      }
`;

const FETCH_BRANCH_IDS_FOR_COMPANY_QUERY = `
  query BranchIdsForCompanyStocks($companyId: uuid!) {
    branches(where: { company: { _eq: $companyId } }) {
      id
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

const FETCH_STOCKS_QUERY = `
  query StocksList($filter: stock_bool_exp, $order: [stock_order_by!], $limit: Int, $offset: Int) {
    stock(where: $filter, limit: $limit, offset: $offset, order_by: $order) {
${STOCK_FIELDS}
    }
    total_stocks: stock_aggregate(where: $filter) {
      aggregate {
        count
      }
    }
  }
`;

const FETCH_PRODUCTS_FOR_RECEIVE_QUERY = `
  query ProductsForReceive($companyId: uuid!) {
    products(
      where: { _and: [{ company_id: { _eq: $companyId } }, { is_active: { _eq: true } }] }
      order_by: [{ name: asc }]
    ) {
      id
      name
      default_unit
      factor
      attributes
      product_type {
        id
        name
      }
    }
  }
`;

const INSERT_PRODUCT_MUTATION = `
  mutation InsertProductForReceive($object: products_insert_input!) {
    insert_products_one(object: $object) {
      id
      default_unit
      investors
    }
  }
`;

const INSERT_STOCK_MUTATION = `
  mutation InsertStockBatch($object: stock_insert_input!) {
    insert_stock_one(object: $object) {
      id
      product_id
    }
  }
`;

const UPDATE_STOCK_BATCH_MUTATION = `
  mutation UpdateStockBatch($id: uuid!, $set: stock_set_input!) {
    update_stock_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
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

async function fetchBranchesForCompany(companyId: string | null) {
  if (!companyId) return [];
  try {
    const data = await gql<{
      branches: { id: string; name?: string | null }[];
    }>(FETCH_BRANCHES_FOR_COMPANY_QUERY, { companyId });
    return data.branches ?? [];
  } catch {
    return [];
  }
}

async function fetchCompanyBatchNumbers(
  companyId: string | null,
): Promise<string[]> {
  if (!companyId) return [];
  try {
    const branchData = await gql<{ branches: { id: string }[] }>(
      FETCH_BRANCH_IDS_FOR_COMPANY_QUERY,
      { companyId },
    );
    const branchIds = (branchData.branches ?? [])
      .map((b) => b.id)
      .filter(Boolean);
    if (branchIds.length === 0) return [];

    const data = await gql<{ stock: { batch_number?: string | null }[] }>(
      FETCH_COMPANY_BATCH_NUMBERS_QUERY,
      { branchIds },
    );
    const numbers = new Set<string>();
    for (const row of data.stock ?? []) {
      const n = row.batch_number?.trim();
      if (n) numbers.add(n);
    }
    return [...numbers];
  } catch {
    return [];
  }
}

async function fetchCompanyName(
  companyId: string | null,
): Promise<string | null> {
  if (!companyId) return null;
  try {
    const data = await gql<{
      companies_by_pk: { name?: string | null } | null;
    }>(FETCH_COMPANY_NAME_QUERY, { id: companyId });
    const name = data.companies_by_pk?.name?.trim();
    return name || null;
  } catch {
    return null;
  }
}

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
    headers: getGraphQLHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const result = await response.json();
  if (result.errors)
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  return result.data as T;
}

async function fetchProductsForReceive(companyId: string | null) {
  if (!companyId) return [];
  try {
    const data = await gql<{ products: Record<string, unknown>[] }>(
      FETCH_PRODUCTS_FOR_RECEIVE_QUERY,
      { companyId },
    );
    return data.products ?? [];
  } catch {
    return [];
  }
}

const FETCH_PRODUCT_TYPES_QUERY = `
  query StockProductTypes($merchantId: uuid!) {
    product_types(
      where: { merchant_id: { _eq: $merchantId } }
      order_by: [{ name: asc }]
    ) {
      id
      name
    }
  }
`;

async function fetchProductTypes(merchantId: string | null) {
  if (!merchantId) return [];
  try {
    const data = await gql<{ product_types: Record<string, unknown>[] }>(
      FETCH_PRODUCT_TYPES_QUERY,
      { merchantId },
    );
    return data.product_types ?? [];
  } catch {
    return [];
  }
}

async function fetchStocksList(
  merchantBranchId: string | null,
  companyId: string | null,
  search: string,
  typeFilter: string,
  sortColumn: string,
  sortDirection: string,
  page: number,
  pageSize: number,
): Promise<{ rows: Record<string, unknown>[]; totalCount: number; error: string | null }> {
  const conditions: Record<string, unknown>[] = [];
  const offset = (page - 1) * pageSize;

  if (merchantBranchId) {
    conditions.push({ branch: { _eq: merchantBranchId } });
  } else if (companyId) {
    try {
      const branchData = await gql<{ branches: { id: string }[] }>(
        FETCH_BRANCH_IDS_FOR_COMPANY_QUERY,
        { companyId },
      );
      const branchIds = (branchData.branches ?? []).map((b) => b.id).filter(Boolean);
      if (branchIds.length > 0) {
        conditions.push({ branch: { _in: branchIds } });
      }
    } catch {
      // No branch filter if query fails
    }
  }

  if (typeFilter !== "all") {
    conditions.push({
      _or: [
        { product: { product_type: { name: { _ilike: typeFilter } } } },
        { type: { _ilike: typeFilter } },
      ],
    });
  }

  if (search) {
    conditions.push({
      _or: [
        { batch_number: { _ilike: `%${search}%` } },
        { type: { _ilike: `%${search}%` } },
        { product: { name: { _ilike: `%${search}%` } } },
        { product: { product_type: { name: { _ilike: `%${search}%` } } } },
      ],
    });
  }

  const filter: Record<string, unknown> =
    conditions.length > 0 ? { _and: conditions } : {};

  const sortFieldMap: Record<string, string> = {
    batch: "batch_number",
    quantity: "quantity",
    received: "created_at",
  };
  const sortField = sortFieldMap[sortColumn];
  const order =
    sortField && sortColumn !== "none"
      ? [{ [sortField]: sortDirection === "desc" ? "desc" : "asc" }]
      : [{ created_at: "desc" }];

  try {
    const data = await gql<{
      stock: Record<string, unknown>[];
      total_stocks: { aggregate: { count: number } };
    }>(FETCH_STOCKS_QUERY, {
      filter,
      order,
      limit: pageSize,
      offset,
    });
    return {
      rows: data.stock ?? [],
      totalCount: data.total_stocks?.aggregate?.count ?? 0,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stock";
    console.error("[stocks load]", message);
    return { rows: [], totalCount: 0, error: message };
  }
}

function assertBranchAllowed(
  branchId: string | null,
  merchantBranchId: string | null,
) {
  if (merchantBranchId && branchId && branchId !== merchantBranchId) {
    throw new Error("You can only manage stock for your assigned branch");
  }
}

export const load: PageServerLoad = async ({ request, parent, url }) => {
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

  const search = url.searchParams.get("search") ?? "";
  const typeFilter = url.searchParams.get("type") ?? "all";
  const sortColumn = url.searchParams.get("sort") ?? "none";
  const sortDirection = (url.searchParams.get("dir") as "asc" | "desc") ?? "desc";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 10);

  const [
    stocksResult,
    products,
    investors,
    productTypes,
    branches,
    companyName,
    existingBatchNumbers,
  ] = await Promise.all([
    fetchStocksList(
      merchantBranchId,
      companyId,
      search,
      typeFilter,
      sortColumn,
      sortDirection,
      page,
      pageSize,
    ),
    fetchProductsForReceive(companyId),
    fetchInvestorsForCompany(companyId),
    fetchProductTypes(merchantId),
    fetchBranchesForCompany(companyId),
    fetchCompanyName(companyId),
    fetchCompanyBatchNumbers(companyId),
  ]);

  const typeById = new Map<string, { id: string; name?: string | null }>();
  for (const raw of productTypes as Array<Record<string, unknown>>) {
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) continue;
    typeById.set(id, { id, name: raw.name == null ? null : String(raw.name) });
  }

  const stocks = (stocksResult.rows ?? []).map((s: Record<string, unknown>) => {
    const productTypeRef = s.product_type;
    if (productTypeRef && typeof productTypeRef === "object") return s;
    const ptId = typeof productTypeRef === "string" ? productTypeRef : "";
    const pt = ptId ? typeById.get(ptId) : undefined;
    return {
      ...s,
      product_type: pt ? { id: pt.id, name: pt.name ?? null } : null,
    };
  });

  return {
    stocks,
    totalCount: stocksResult.totalCount,
    stocksLoadError: stocksResult.error,
    products,
    investors,
    productTypes,
    branches,
    merchantId,
    merchantBranchId,
    companyId,
    companyName,
    existingBatchNumbers,
  };
};

export const actions: Actions = {
  receiveStock: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const userId = getUserIdFromRequest(request);
    if (!userId) return { success: false, message: "Authentication required" };

    const merchantBranchId = await fetchMerchantBranchId(userId);
    let companyId = merchantBranchId
      ? await fetchBranchCompanyId(merchantBranchId)
      : null;
    if (!companyId)
      return { success: false, message: "Company could not be resolved" };

    const formData = await request.formData();
    const branchRaw = parseOptionalString(formData.get("branch"));
    const batchNumberRaw = parseOptionalString(formData.get("batch_number"));
    const companyLabel = (await fetchCompanyName(companyId)) ?? "Company";
    const takenBatchNumbers = await fetchCompanyBatchNumbers(companyId);
    const batchNumber = resolveUniqueBatchNumber(
      companyLabel,
      takenBatchNumbers,
      batchNumberRaw,
    );

    if (!branchRaw) return { success: false, message: "Branch is required" };

    try {
      assertBranchAllowed(branchRaw, merchantBranchId);
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : "Branch not allowed",
      };
    }

    let lines;
    try {
      lines = parseReceiveLines(String(formData.get("lines") ?? ""));
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : "Invalid receive lines",
      };
    }

    const receiveTypeKeys: string[] = [];
    for (const line of lines) {
      if (line.mode === "new") {
        receiveTypeKeys.push(line.product_type_name);
        continue;
      }
      const prod = await gql<{
        products_by_pk: {
          product_type: { name?: string | null } | null;
        } | null;
      }>(
        `query ($id: uuid!) { products_by_pk(id: $id) { product_type { name } } }`,
        { id: line.product_id },
      );
      const typeName = prod.products_by_pk?.product_type?.name;
      if (typeName)
        receiveTypeKeys.push(normalizeProductTypeName(String(typeName)));
    }

    const expiryRaw = resolveReceiveExpiryDate(
      receiveTypeKeys,
      parseOptionalString(formData.get("expiry_date")),
    );

    const createdStockIds: string[] = [];

    try {
      for (const line of lines) {
        let productId: string;
        let unit: string;
        let investors: string[] = [];

        if (line.mode === "new") {
          const ins = await gql<{
            insert_products_one: {
              id: string;
              default_unit: string;
              investors: string[];
            } | null;
          }>(INSERT_PRODUCT_MUTATION, {
            object: {
              company_id: companyId,
              product_type_id: line.product_type_id,
              name: line.name,
              default_unit: line.default_unit,
              attributes: line.attributes,
              investors: line.investors,
              factor: line.factor,
              barcode: line.barcode,
              qr_code: line.qr_code,
              is_active: true,
              created_by: userId,
            },
          });
          if (!ins.insert_products_one?.id)
            throw new Error("Product was not created");
          productId = ins.insert_products_one.id;
          unit = line.default_unit;
          investors = line.investors;
        } else {
          productId = line.product_id;
          const prod = await gql<{
            products_by_pk: {
              id: string;
              default_unit: string;
              investors: string[];
            } | null;
          }>(
            `query ($id: uuid!) { products_by_pk(id: $id) { id default_unit investors } }`,
            { id: productId },
          );
          if (!prod.products_by_pk?.id) throw new Error("Product not found");
          unit = prod.products_by_pk.default_unit;
          investors = prod.products_by_pk.investors ?? [];
        }

        const stockIns = await gql<{
          insert_stock_one: { id: string; product_id: string | null } | null;
        }>(INSERT_STOCK_MUTATION, {
          object: {
            branch: branchRaw,
            product_id: productId,
            batch_number: batchNumber,
            expiry_date: expiryRaw,
            purchased_price: line.purchased_price,
            selling_price: line.selling_price,
            quantity: line.quantity,
            unit,
            investors,
            created_by: userId,
            updated_by: userId,
          },
        });

        const stockRow = stockIns.insert_stock_one;
        if (!stockRow?.id) throw new Error("Batch was not created");
        createdStockIds.push(stockRow.id);

        await insertStockMovements([
          {
            company_id: companyId,
            branch_id: branchRaw,
            stock_id: stockRow.id,
            product_id: productId,
            movement_type: "PURCHASE",
            quantity_delta: line.quantity,
            unit,
            unit_cost: line.purchased_price,
            unit_price: line.selling_price,
            reference_type: "receive",
            note: batchNumber
              ? `Receive batch ${batchNumber}`
              : "Stock received",
            created_by: userId,
          },
        ]);
      }

      return {
        success: true,
        message:
          lines.length === 1
            ? "Batch received successfully"
            : `${lines.length} batches received successfully`,
      };
    } catch (err) {
      for (const id of createdStockIds) {
        await gql(DELETE_STOCK_MUTATION, { id }).catch(() => {});
      }
      return {
        success: false,
        message: `Failed to receive stock: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  },

  updateBatch: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const userId = getUserIdFromRequest(request);
    if (!userId) return { success: false, message: "Authentication required" };

    const merchantBranchId = await fetchMerchantBranchId(userId);
    const formData = await request.formData();
    const id = String(formData.get("id") ?? "").trim();
    const quantity = Number(formData.get("quantity"));
    const batch_number = parseOptionalString(formData.get("batch_number"));

    if (!id) return { success: false, message: "Batch ID is required" };
    if (!Number.isFinite(quantity) || quantity < 0) {
      return { success: false, message: "Valid quantity is required" };
    }

    const existing = await gql<{
      stock_by_pk: {
        branch?: string | null;
        purchased_price?: number | null;
        selling_price?: number | null;
        expiry_date?: string | null;
      } | null;
    }>(
      `query ($id: uuid!) { stock_by_pk(id: $id) { branch purchased_price selling_price expiry_date } }`,
      { id },
    );
    if (!existing.stock_by_pk)
      return { success: false, message: "Batch not found" };

    try {
      assertBranchAllowed(
        existing.stock_by_pk.branch ?? null,
        merchantBranchId,
      );
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : "Branch not allowed",
      };
    }

    try {
      const row = await gql<{ update_stock_by_pk: { id: string } | null }>(
        UPDATE_STOCK_BATCH_MUTATION,
        {
          id,
          set: {
            purchased_price: existing.stock_by_pk.purchased_price,
            selling_price: existing.stock_by_pk.selling_price,
            expiry_date: existing.stock_by_pk.expiry_date ?? null,
            quantity,
            batch_number,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          },
        },
      );
      if (!row.update_stock_by_pk?.id) {
        return { success: false, message: "Batch was not updated" };
      }
      return { success: true, message: "Batch updated successfully" };
    } catch (err) {
      return {
        success: false,
        message: `Failed to update batch: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  },

  deleteStock: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const stockId = String(
      (await request.formData()).get("stockId") ?? "",
    ).trim();
    if (!stockId) return { success: false, message: "Batch ID is required" };

    const row = await gql<{ stock_by_pk: { quantity: unknown } | null }>(
      `query ($id: uuid!) { stock_by_pk(id: $id) { quantity } }`,
      { id: stockId },
    );
    const qty = Number(row.stock_by_pk?.quantity ?? 0);
    if (!Number.isFinite(qty) || qty !== 0) {
      return {
        success: false,
        message: "Only zero-quantity batches can be deleted",
      };
    }

    try {
      await gql(DELETE_STOCK_MUTATION, { id: stockId });
      return { success: true, message: "Batch deleted successfully" };
    } catch (err) {
      return {
        success: false,
        message: `Failed to delete batch: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  },
};
