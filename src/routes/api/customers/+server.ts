import type { RequestHandler } from './$types';
import { getMerchantIdFromRequest } from '$lib/auth';
import { config, getGraphQLHeaders } from '$lib/config';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { fetchBranchCompanyId } from '$lib/companyInvestors.server';
import { subscriptionWriteActionBlockedForRequest } from '$lib/subscription/server';
import type { CustomerSearchResult } from '$lib/customers.server';

const INSERT_CUSTOMER_MUTATION = `
  mutation InsertCustomer(
    $first_name: String!
    $last_name: String!
    $phone_number: String!
    $address: String!
  ) {
    insert_customers_one(
      object: {
        first_name: $first_name
        last_name: $last_name
        phone_number: $phone_number
        address: $address
      }
    ) {
      id
      first_name
      last_name
      phone_number
      address
    }
  }
`;

const INSERT_COMPANY_CUSTOMER_MUTATION = `
  mutation LinkCompanyCustomer($company: uuid!, $customer: uuid!, $branch: uuid!) {
    insert_company_customer(
      objects: { company: $company, customer: $customer, branch: $branch }
    ) {
      returning {
        id
      }
    }
  }
`;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
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

export const POST: RequestHandler = async ({ request }) => {
  const blocked = await subscriptionWriteActionBlockedForRequest(request);
  if (blocked) return json(blocked, 403);

  const merchantId = getMerchantIdFromRequest(request);
  if (!merchantId) {
    return json({ error: 'Authentication required' }, 401);
  }

  let body: {
    first_name?: unknown;
    last_name?: unknown;
    address?: unknown;
    phone_number?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : '';
  const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const phone = typeof body.phone_number === 'string' ? body.phone_number.trim() : '';

  if (!firstName || !lastName) {
    return json({ error: 'First and last name are required' }, 400);
  }
  if (!phone) {
    return json({ error: 'Phone is required' }, 400);
  }

  const merchantBranchId = await fetchMerchantBranchId(merchantId);
  if (!merchantBranchId) {
    return json(
      { error: 'You must be assigned to a branch to add customers' },
      400
    );
  }

  const companyId = await fetchBranchCompanyId(merchantBranchId);
  if (!companyId) {
    return json(
      { error: 'Company could not be resolved for your branch' },
      400
    );
  }

  try {
    const ins = await gql<{
      insert_customers_one: CustomerSearchResult | null;
    }>(INSERT_CUSTOMER_MUTATION, {
      first_name: firstName,
      last_name: lastName,
      phone_number: phone,
      address,
    });

    const created = ins.insert_customers_one;
    if (!created?.id) {
      return json({ error: 'Customer was not created' }, 502);
    }

    await gql(INSERT_COMPANY_CUSTOMER_MUTATION, {
      company: companyId,
      customer: created.id,
      branch: merchantBranchId,
    });

    return json({
      success: true,
      message: 'Customer added',
      customer: created,
    });
  } catch (err) {
    console.error('[create customer]', err);
    const message =
      err instanceof Error ? err.message : 'Failed to add customer';
    return json({ error: `Failed to add customer: ${message}` }, 502);
  }
};
