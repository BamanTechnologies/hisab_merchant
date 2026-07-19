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

export type CustomerSearchResult = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  address?: string | null;
};

const FETCH_COMPANY_CUSTOMER_IDS_QUERY = `
  query CompanyCustomerIds($companyId: uuid!) {
    company_customer(
      where: { company: { _eq: $companyId } }
    ) {
      customer
    }
  }
`;

const SEARCH_CUSTOMERS_BY_IDS_QUERY = `
  query SearchCustomersByIds($ids: [uuid!]!, $search: String!, $limit: Int!) {
    customers(
      where: {
        _and: [
          { id: { _in: $ids } }
          {
            _or: [
              { first_name: { _ilike: $search } }
              { last_name: { _ilike: $search } }
              { phone_number: { _ilike: $search } }
            ]
          }
        ]
      }
      limit: $limit
      order_by: [{ first_name: asc }]
    ) {
      id
      first_name
      last_name
      phone_number
      address
    }
  }
`;

export async function searchCustomers(
  companyId: string,
  search: string,
  options?: { limit?: number },
): Promise<CustomerSearchResult[]> {
  try {
    const limit = options?.limit ?? 50;
    const searchPattern = `%${search}%`;

    const junction = await gql<{
      company_customer: Array<{ customer: string } | null>;
    }>(FETCH_COMPANY_CUSTOMER_IDS_QUERY, { companyId });

    const ids = [
      ...new Set(
        (junction.company_customer ?? [])
          .map((r) => r?.customer)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];

    if (ids.length === 0) return [];

    const data = await gql<{ customers: CustomerSearchResult[] }>(
      SEARCH_CUSTOMERS_BY_IDS_QUERY,
      { ids, search: searchPattern, limit },
    );

    return data.customers ?? [];
  } catch (error) {
    console.error("Error searching customers:", error);
    return [];
  }
}
