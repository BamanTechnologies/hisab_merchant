import { config, getGraphQLHeaders } from "$lib/config";

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

export type ProductSearchResult = {
  id: string;
  name: string;
  default_unit: string;
  factor?: unknown;
  attributes?: Record<string, unknown> | null;
  product_type?: { id: string; name?: string | null } | null;
  stocks?: Array<{
    id: string;
    quantity: number | string;
    selling_price: unknown;
    created_at?: string | null;
    batch_number?: string | null;
  }>;
};

const SEARCH_PRODUCTS_QUERY = `
  query SearchProducts($companyId: uuid!, $branchId: uuid!, $search: String!, $limit: Int!) {
    products(
      where: {
        _and: [
          { company_id: { _eq: $companyId } }
          { branch_id: { _eq: $branchId } }
          { is_active: { _eq: true } }
          { name: { _ilike: $search } }
        ]
      }
      limit: $limit
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

const SEARCH_PRODUCTS_WITH_STOCKS_QUERY = `
  query SearchProductsWithStocks($companyId: uuid!, $branchId: uuid!, $search: String!, $limit: Int!) {
    products(
      where: {
        _and: [
          { company_id: { _eq: $companyId } }
          { branch_id: { _eq: $branchId } }
          { is_active: { _eq: true } }
          { name: { _ilike: $search } }
        ]
      }
      limit: $limit
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
      stocks(
        where: { _and: [{ branch: { _eq: $branchId } }, { quantity: { _gt: 0 } }] }
        order_by: [{ created_at: asc }, { id: asc }]
      ) {
        id
        quantity
        selling_price
        created_at
        batch_number
      }
    }
  }
`;

export async function searchProducts(
  companyId: string,
  search: string,
  options: { limit?: number; branchId: string; includeStocks?: boolean },
): Promise<ProductSearchResult[]> {
  try {
    const limit = options.limit ?? 50;
    const searchPattern = `%${search}%`;
    const branchId = options.branchId;
    if (!branchId) return [];

    if (options.includeStocks) {
      const data = await gql<{ products: ProductSearchResult[] }>(
        SEARCH_PRODUCTS_WITH_STOCKS_QUERY,
        { companyId, branchId, search: searchPattern, limit },
      );
      return data.products ?? [];
    }

    const data = await gql<{ products: ProductSearchResult[] }>(
      SEARCH_PRODUCTS_QUERY,
      { companyId, branchId, search: searchPattern, limit },
    );
    return data.products ?? [];
  } catch (error) {
    console.error("Error searching products:", error);
    return [];
  }
}
