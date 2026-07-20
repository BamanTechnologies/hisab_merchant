import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import { getUserIdFromRequest } from "$lib/auth";
import { fetchMerchantBranchId } from "$lib/merchantBranch.server";
import {
  fetchBranchCompanyId,
  fetchInvestorsForCompany,
} from "$lib/companyInvestors.server";
import { config, getGraphQLHeaders } from "$lib/config";
import { buildProductLabel } from "$lib/inventory/productLabel";
import {
  parseAttributes,
  parseInvestors,
  parseOptionalString,
  parsePositiveFactor,
  parsePositiveNumber,
  parseUnit,
  normalizeProductTypeName,
  PRODUCT_TYPE_FIELDS,
  resolveCatalogProductName,
} from "$lib/inventory/parseForm";
import { subscriptionWriteActionBlockedForRequest } from "$lib/subscription/server";

const FETCH_PRODUCTS_QUERY = `
  query CompanyProducts($filter: products_bool_exp, $order: [products_order_by!], $limit: Int, $offset: Int) {
    products(
      where: $filter
      order_by: $order
      limit: $limit
      offset: $offset
    ) {
      id
      name
      default_unit
      factor
      attributes
      investors
      is_active
      barcode
      qr_code
      treshold_quantity
      created_at
      product_type {
        id
        name
      }
      stocks_aggregate {
        aggregate {
          sum {
            quantity
          }
        }
      }
    }
    total_products: products_aggregate(where: $filter) {
      aggregate {
        count
      }
    }
  }
`;

const FETCH_PRODUCT_TYPES_QUERY = `
  query ProductTypesForCatalog($merchantId: uuid!) {
    product_types(
      where: { merchant_id: { _eq: $merchantId } }
      order_by: [{ name: asc }, { created_at: asc }]
    ) {
      id
      name
    }
  }
`;

const INSERT_PRODUCT_MUTATION = `
  mutation InsertProduct($object: products_insert_input!) {
    insert_products_one(object: $object) {
      id
    }
  }
`;

const UPDATE_PRODUCT_MUTATION = `
  mutation UpdateProduct($id: uuid!, $set: products_set_input!) {
    update_products_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
    }
  }
`;

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

async function fetchProducts(
  companyId: string | null,
  branchId: string | null,
  search: string,
  page: number,
  pageSize: number,
) {
  if (!companyId || !branchId) return { products: [], totalCount: 0 };

  const offset = (page - 1) * pageSize;

  const conditions: Record<string, unknown>[] = [
    { company_id: { _eq: companyId } },
    { branch_id: { _eq: branchId } },
  ];

  if (search) {
    conditions.push({
      _or: [
        { name: { _ilike: `%${search}%` } },
        { product_type: { name: { _ilike: `%${search}%` } } },
        { default_unit: { _ilike: `%${search}%` } },
      ],
    });
  }

  const filter: Record<string, unknown> = { _and: conditions };

  const order = [{ created_at: "desc" }, { name: "asc" }];

  try {
    const data = await gql<{
      products: Record<string, unknown>[];
      total_products: { aggregate: { count: number } };
    }>(FETCH_PRODUCTS_QUERY, {
      filter,
      order,
      limit: pageSize,
      offset,
    });
    const products = (data.products ?? []).map((p) => {
      const stocksAgg = (p.stocks_aggregate as Record<string, unknown> | undefined) ?? {};
      const agg = (stocksAgg.aggregate as Record<string, unknown> | undefined) ?? {};
      const sum = (agg.sum as Record<string, unknown> | undefined) ?? {};
      const totalStock = Number(sum.quantity ?? 0);
      return { ...p, total_stock: Number.isFinite(totalStock) ? totalStock : 0 };
    });
    return {
      products,
      totalCount: data.total_products?.aggregate?.count ?? 0,
    };
  } catch {
    return { products: [], totalCount: 0 };
  }
}

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

export const load: PageServerLoad = async ({ request, parent, url }) => {
  const { merchantContext } = await parent();
  if (merchantContext && !merchantContext.routeAccess.products) {
    throw redirect(302, "/stocks");
  }
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
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 10);

  const [{ products: productsRaw, totalCount }, investors, productTypes] =
    await Promise.all([
      fetchProducts(companyId, merchantBranchId, search, page, pageSize),
      fetchInvestorsForCompany(companyId),
      fetchProductTypes(merchantId),
    ]);

  const products = productsRaw.map((p) => ({
    ...p,
    displayName: buildProductLabel(
      p as unknown as Parameters<typeof buildProductLabel>[0],
    ),
  }));

  return {
    products,
    totalCount,
    investors,
    productTypes,
    companyId,
    merchantId,
    productTypeFields: PRODUCT_TYPE_FIELDS,
  };
};

export const actions: Actions = {
  createProduct: async ({ request }) => {
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
    const explicitName = String(formData.get("name") ?? "").trim();
    const productTypeId = parseOptionalString(formData.get("product_type"));
    const productTypeName = normalizeProductTypeName(
      String(formData.get("product_type_name") ?? ""),
    );
    const default_unit = parseUnit(formData.get("default_unit"));
    const attributes = parseAttributes(formData.get("attributes"));
    const investors = parseInvestors(formData.get("investors"));
    const barcode = parseOptionalString(formData.get("barcode"));
    const qr_code = parseOptionalString(formData.get("qr_code"));
    const factor = parsePositiveFactor(attributes, formData.get("factor"));
    const treshold_quantity = parsePositiveNumber(formData.get("treshold_quantity"));

    const resolved = resolveCatalogProductName({
      productTypeName,
      attributes,
      explicitName,
    });
    if (resolved.error || !resolved.name) {
      return {
        success: false,
        message: resolved.error ?? "Product name is required",
      };
    }
    const name = resolved.name;
    if (!productTypeId)
      return { success: false, message: "Product type is required" };
    if (!default_unit) return { success: false, message: "Unit is required" };
    if (investors.length === 0) {
      return { success: false, message: "Select at least one investor" };
    }

    try {
      const row = await gql<{ insert_products_one: { id: string } | null }>(
        INSERT_PRODUCT_MUTATION,
        {
          object: {
            company_id: companyId,
            branch_id: merchantBranchId,
            product_type_id: productTypeId,
            name,
            default_unit,
            attributes,
            investors,
            factor,
            treshold_quantity,
            barcode,
            qr_code,
            is_active: true,
            created_by: userId,
          },
        },
      );
      if (!row.insert_products_one?.id) {
        return { success: false, message: "Product was not created" };
      }
      return { success: true, message: "Product created successfully" };
    } catch (err) {
      return {
        success: false,
        message: `Failed to create product: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  },

  updateProduct: async ({ request }) => {
    const blocked = await subscriptionWriteActionBlockedForRequest(request);
    if (blocked) return blocked;

    const userId = getUserIdFromRequest(request);
    if (!userId) return { success: false, message: "Authentication required" };

    const formData = await request.formData();
    const id = String(formData.get("id") ?? "").trim();
    const explicitName = String(formData.get("name") ?? "").trim();
    const productTypeId = parseOptionalString(formData.get("product_type"));
    const productTypeName = normalizeProductTypeName(
      String(formData.get("product_type_name") ?? ""),
    );
    const attributes = parseAttributes(formData.get("attributes"));
    const investors = parseInvestors(formData.get("investors"));
    const default_unit = parseUnit(formData.get("default_unit"));
    const barcode = parseOptionalString(formData.get("barcode"));
    const qr_code = parseOptionalString(formData.get("qr_code"));
    const isActiveRaw = String(formData.get("is_active") ?? "true").trim();
    const is_active = isActiveRaw !== "false";
    const factor = parsePositiveFactor(attributes, formData.get("factor"));
    const treshold_quantity = parsePositiveNumber(formData.get("treshold_quantity"));

    if (!id) return { success: false, message: "Product ID is required" };
    const resolved = resolveCatalogProductName({
      productTypeName,
      attributes,
      explicitName,
    });
    if (resolved.error || !resolved.name) {
      return {
        success: false,
        message: resolved.error ?? "Product name is required",
      };
    }
    const name = resolved.name;
    if (!productTypeId)
      return { success: false, message: "Product type is required" };
    if (!default_unit) return { success: false, message: "Unit is required" };
    if (investors.length === 0) {
      return { success: false, message: "Select at least one investor" };
    }

    try {
      const row = await gql<{ update_products_by_pk: { id: string } | null }>(
        UPDATE_PRODUCT_MUTATION,
        {
          id,
          set: {
            name,
            product_type_id: productTypeId,
            default_unit,
            attributes,
            investors,
            factor,
            treshold_quantity,
            barcode,
            qr_code,
            is_active,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          },
        },
      );
      if (!row.update_products_by_pk?.id) {
        return { success: false, message: "Product was not updated" };
      }
      return { success: true, message: "Product updated successfully" };
    } catch (err) {
      return {
        success: false,
        message: `Failed to update product: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  },
};
