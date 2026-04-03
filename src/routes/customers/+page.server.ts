import type { PageServerLoad } from './$types';
import { getUserIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';

const FETCH_COMPANY_CUSTOMER_IDS_QUERY = `
  query CustomersCompanyCustomerIds($companyId: uuid!) {
    company_customer(where: { company: { _eq: $companyId } }) {
      id
      customer
    }
  }
`;

const FETCH_CUSTOMERS_BY_IDS_QUERY = `
  query CustomersListByIds($ids: [uuid!]!) {
    customers(where: { id: { _in: $ids } }) {
      id
      first_name
      last_name
      phone_number
      address
      created_at
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

export type CustomerListRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  address?: string | null;
  created_at?: string | null;
};

async function fetchCompanyCustomersList(companyId: string): Promise<CustomerListRow[]> {
  try {
    const junction = await gql<{
      company_customer: Array<{ customer: string } | null>;
    }>(FETCH_COMPANY_CUSTOMER_IDS_QUERY, { companyId });

    const ids = [
      ...new Set(
        (junction.company_customer ?? [])
          .map((r) => r?.customer)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    if (ids.length === 0) return [];

    const data = await gql<{ customers: CustomerListRow[] }>(FETCH_CUSTOMERS_BY_IDS_QUERY, {
      ids,
    });

    const list = data.customers ?? [];
    return [...list].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  } catch {
    return [];
  }
}

export const load: PageServerLoad = async ({ request, parent }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;
  const companyId = merchantContext?.companyId ?? null;

  const customers = companyId ? await fetchCompanyCustomersList(companyId) : [];

  return {
    customers,
    companyId,
    merchantId,
  };
};
