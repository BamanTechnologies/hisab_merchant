import type { RequestHandler } from './$types';
import { searchCustomers } from '$lib/customers.server';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') ?? '';
  const companyId = url.searchParams.get('companyId') ?? '';

  if (!companyId) {
    return new Response(JSON.stringify([]), {
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const customers = await searchCustomers(companyId, q, { limit: 50 });
    return new Response(JSON.stringify(customers), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[search customers]', err);
    return new Response(JSON.stringify({ error: 'Failed to search customers' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
