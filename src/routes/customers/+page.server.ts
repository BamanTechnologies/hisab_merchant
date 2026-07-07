import type { PageServerLoad } from "./$types";
import { getUserIdFromRequest } from "$lib/auth";
import { fetchMerchantBranchId } from "$lib/merchantBranch.server";
import { config, getGraphQLHeaders } from "$lib/config";

const FETCH_CUSTOMERS_QUERY = `
  query CustomersList($limit: Int, $offset: Int, $filter: customers_bool_exp, $order: [customers_order_by!]) {
    customers(where: $filter, limit: $limit, offset: $offset, order_by: $order) {
      id
      first_name
      last_name
      phone_number
      address
      created_at
    }
    total_customers: customers_aggregate(where: $filter) {
      aggregate {
        count
      }
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

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

export type CustomerListRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  address?: string | null;
  created_at?: string | null;
};

async function fetchCustomersList(
  companyId: string,
  branchId: string,
  search: string,
  page: number,
  pageSize: number,
): Promise<{ customers: CustomerListRow[]; totalCount: number }> {
  const offset = (page - 1) * pageSize;

  const companyFilter: Record<string, unknown> = {
    company_customers: {
      company: { _eq: companyId },
      branch: { _eq: branchId },
    },
  };

  const filter: Record<string, unknown> = search
    ? {
        _and: [
          companyFilter,
          {
            _or: [
              { first_name: { _ilike: `%${search}%` } },
              { last_name: { _ilike: `%${search}%` } },
              { phone_number: { _ilike: `%${search}%` } },
            ],
          },
        ],
      }
    : companyFilter;

  const order = [{ created_at: "desc" }];

  try {
    const data = await gql<{
      customers: CustomerListRow[];
      total_customers: { aggregate: { count: number } };
    }>(FETCH_CUSTOMERS_QUERY, {
      filter,
      order,
      limit: pageSize,
      offset,
    });
    return {
      customers: data.customers ?? [],
      totalCount: data.total_customers?.aggregate?.count ?? 0,
    };
  } catch {
    return { customers: [], totalCount: 0 };
  }
}

export const load: PageServerLoad = async ({ request, parent, url }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  const companyId = merchantContext?.companyId ?? null;
  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (merchantId ? await fetchMerchantBranchId(merchantId) : null);

  const search = url.searchParams.get("search") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize")) || 10);

  const { customers, totalCount } =
    companyId && merchantBranchId
      ? await fetchCustomersList(
          companyId,
          merchantBranchId,
          search,
          page,
          pageSize,
        )
      : { customers: [], totalCount: 0 };

  return {
    customers,
    totalCount,
    companyId,
    merchantId,
    merchantBranchId,
  };
};
