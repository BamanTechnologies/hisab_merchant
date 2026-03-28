import { config, getGraphQLHeaders } from '$lib/config';

const MERCHANT_BRANCH_QUERY = `
  query GetMerchantBranch($id: uuid!) {
    merchant_by_pk(id: $id) {
      branch
    }
  }
`;

/** Resolves the branch UUID assigned to the merchant, or null if unset. */
export async function fetchMerchantBranchId(merchantId: string): Promise<string | null> {
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: MERCHANT_BRANCH_QUERY,
        variables: { id: merchantId },
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (result.errors) return null;

    const branch = result.data?.merchant_by_pk?.branch;
    return branch ?? null;
  } catch {
    return null;
  }
}
