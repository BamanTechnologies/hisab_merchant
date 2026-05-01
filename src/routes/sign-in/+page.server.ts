import type { Actions } from './$types';
import { getUserIdFromToken } from '$lib/auth';
import { fetchMerchantBranchId } from '$lib/merchantBranch.server';
import { config, getGraphQLHeaders } from '$lib/config';

// GraphQL mutation to login
const LOGIN_MUTATION = `
  mutation Login($password: String!, $phone: String!) {
    login(password: $password, phone: $phone) {
      token
    }
  }
`;

// Function to login user
async function loginUser(phone: string, password: string) {
  const variables = {
    phone,
    password,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: LOGIN_MUTATION,
      variables,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data.login;
}

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const formData = await request.formData();
    
    // Extract form data
    const phone = formData.get('phone') as string;
    const password = formData.get('password') as string;

    try {
      const loginResult = await loginUser(phone, password);

      const userId = loginResult.token ? getUserIdFromToken(loginResult.token) : null;
      const merchantBranchId = userId ? await fetchMerchantBranchId(userId) : null;

      if (loginResult.token) {
        cookies.set('authToken', loginResult.token, {
          path: '/',
          sameSite: 'strict',
          httpOnly: false,
        });
      }

      if (merchantBranchId) {
        cookies.set('merchantBranchId', merchantBranchId, {
          path: '/',
          sameSite: 'strict',
          httpOnly: false,
        });
      } else {
        cookies.delete('merchantBranchId', { path: '/' });
      }

      return {
        token: loginResult.token,
        merchantBranchId,
      };
    } catch {
      cookies.delete('authToken', { path: '/' });
      cookies.delete('merchantBranchId', { path: '/' });
      return {
        token: null,
        merchantBranchId: null,
      };
    }
  },
};