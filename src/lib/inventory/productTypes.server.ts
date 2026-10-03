import { config, getGraphQLHeaders } from "$lib/config";

const FETCH_PRODUCT_TYPES_QUERY = `
  query ProductTypes($merchantId: uuid!) {
    product_types(
      where: { merchant_id: { _eq: $merchantId } }
      order_by: [{ name: asc }]
    ) {
      id
      name
    }
  }
`;

export type ProductTypeRow = {
  id: string;
  name?: string | null;
};

/**
 * Product types configured for a merchant, ordered by name. Shared so every
 * page offering a type filter stays in sync with the backend catalogue.
 */
export async function fetchProductTypes(
  merchantId: string | null,
): Promise<ProductTypeRow[]> {
  if (!merchantId) return [];
  try {
    const response = await fetch(config.graphql.endpoint, {
      method: "POST",
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: FETCH_PRODUCT_TYPES_QUERY,
        variables: { merchantId },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.product_types ?? [];
  } catch {
    return [];
  }
}
