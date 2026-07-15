import { config, getGraphQLHeaders } from "$lib/config";
import { fetchMerchantBranchId } from "$lib/merchantBranch.server";
import {
  resolveDefaultAppRoute,
  resolveMerchantRouteAccess,
  type MerchantRouteAccess,
} from "$lib/merchantAccess.server";

const BRANCH_ROW_FOR_CONTEXT_QUERY = `
  query MerchantContextBranch($id: uuid!) {
    branches_by_pk(id: $id) {
      id
      name
      company
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

export type { MerchantRouteAccess };

/** Resolved once in the root layout for authenticated users (see `+layout.server.ts`). */
export type MerchantAppContext = {
  merchantId: string;
  merchantBranchId: string | null;
  companyId: string | null;
  branch: { id: string; name: string | null } | null;
  routeAccess: MerchantRouteAccess;
  defaultAppRoute: "/dashboard" | "/stocks";
};

/**
 * Branch row + company id for the logged-in merchant. Uses two GraphQL round trips
 * (merchant → branch id, then branches_by_pk); callers should prefer layout `merchantContext`.
 */
export async function fetchMerchantAppContext(
  merchantId: string,
): Promise<MerchantAppContext> {
  const merchantBranchId = await fetchMerchantBranchId(merchantId);

  const finish = (
    partial: Omit<MerchantAppContext, "routeAccess" | "defaultAppRoute">,
  ): MerchantAppContext => {
    const routeAccess = resolveMerchantRouteAccess(partial);
    return {
      ...partial,
      routeAccess,
      defaultAppRoute: resolveDefaultAppRoute(routeAccess),
    };
  };

  if (!merchantBranchId) {
    return finish({
      merchantId,
      merchantBranchId: null,
      companyId: null,
      branch: null,
    });
  }

  try {
    const data = await gql<{
      branches_by_pk: {
        id: string;
        name?: string | null;
        company: string;
      } | null;
    }>(BRANCH_ROW_FOR_CONTEXT_QUERY, { id: merchantBranchId });

    const row = data.branches_by_pk;
    if (!row) {
      return finish({
        merchantId,
        merchantBranchId,
        companyId: null,
        branch: null,
      });
    }

    return finish({
      merchantId,
      merchantBranchId,
      companyId: row.company ?? null,
      branch: { id: row.id, name: row.name ?? null },
    });
  } catch {
    return finish({
      merchantId,
      merchantBranchId,
      companyId: null,
      branch: null,
    });
  }
}
