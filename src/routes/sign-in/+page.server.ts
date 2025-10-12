import type { Actions } from './$types';
import { env } from '$env/dynamic/private';

// GraphQL endpoint configuration
const GRAPHQL_ENDPOINT = env.GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql';
const HASURA_ADMIN_SECRET = env.HASURA_ADMIN_SECRET || 'amanz55';

// GraphQL headers
const getGraphQLHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (HASURA_ADMIN_SECRET) {
    headers['x-hasura-admin-secret'] = HASURA_ADMIN_SECRET;
  }
  
  return headers;
};

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
  try {
    const variables = {
      phone,
      password,
    };

    console.log('Attempting login with variables:', variables);

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: getGraphQLHeaders(),
      body: JSON.stringify({
        query: LOGIN_MUTATION,
        variables,
      }),
    });

    console.log('Login response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('Login response:', result);
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data.login;
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  }
}

export const actions: Actions = {
  login: async ({ request }) => {
    const formData = await request.formData();
    
    // Extract form data
    const phone = formData.get('phone') as string;
    const password = formData.get('password') as string;

    console.log('Form data received for login:', {
      phone,
      password,
    });

    try {
      const loginResult = await loginUser(phone, password);

      console.log('Login successful:', loginResult);

      return {
        token: loginResult.token,
      };
    } catch (error) {
      console.error('Failed to login:', error);
      return {
        token: null,
      };
    }
  },
};