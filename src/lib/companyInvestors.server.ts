import { config, getGraphQLHeaders } from '$lib/config';

const FETCH_BRANCH_COMPANY_QUERY = `
  query BranchCompanyForInvestors($id: uuid!) {
    branches_by_pk(id: $id) {
      company
    }
  }
`;

const FETCH_COMPANY_INVESTOR_LINKS_QUERY = `
  query CompanyInvestorLinks($companyId: uuid!) {
    company_investor(where: { company: { _eq: $companyId } }) {
      investor
    }
  }
`;

const FETCH_INVESTORS_BY_IDS_QUERY = `
  query InvestorsByIds($ids: [uuid!]!) {
    investor(where: { id: { _in: $ids } }) {
      id
      first_name
      last_name
      phone_number
    }
  }
`;

export type CompanyInvestor = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
};

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

/** Resolve company UUID from a branch id (e.g. when layout context has no company yet). */
export async function fetchBranchCompanyId(branchId: string): Promise<string | null> {
  try {
    const data = await gql<{ branches_by_pk: { company: string } | null }>(
      FETCH_BRANCH_COMPANY_QUERY,
      { id: branchId },
    );
    return data.branches_by_pk?.company ?? null;
  } catch {
    return null;
  }
}

/**
 * Investors linked to the company via `company_investor` (company + investor columns).
 * Returns [] when company is unknown or there are no links.
 */
export async function fetchInvestorsForCompany(
  companyId: string | null | undefined,
): Promise<CompanyInvestor[]> {
  const cid = companyId?.trim();
  if (!cid) return [];

  try {
    const linkData = await gql<{
      company_investor: Array<{ investor?: string | null } | null>;
    }>(FETCH_COMPANY_INVESTOR_LINKS_QUERY, { companyId: cid });

    const ids = [
      ...new Set(
        (linkData.company_investor ?? [])
          .map((r) => r?.investor)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    if (ids.length === 0) return [];

    const invData = await gql<{ investor: CompanyInvestor[] }>(FETCH_INVESTORS_BY_IDS_QUERY, {
      ids,
    });

    const list = invData.investor ?? [];
    return [...list].sort((a, b) => {
      const an = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim().toLowerCase();
      const bn = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim().toLowerCase();
      return an.localeCompare(bn);
    });
  } catch {
    return [];
  }
}
