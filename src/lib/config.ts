import { env } from '$env/dynamic/private';

// Validate required environment variables
const requiredEnvVars = {
  GRAPHQL_ENDPOINT: env.GRAPHQL_ENDPOINT,
  HASURA_ADMIN_SECRET: env.HASURA_ADMIN_SECRET,
};

// Check for missing required environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(', ')}\n` +
    'Please set these variables in your .env file or deployment environment.'
  );
}

// Export configuration
export const config = {
  graphql: {
    endpoint: requiredEnvVars.GRAPHQL_ENDPOINT!,
    adminSecret: requiredEnvVars.HASURA_ADMIN_SECRET!,
  },
} as const;

// GraphQL headers helper
export const getGraphQLHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (config.graphql.adminSecret) {
    headers['x-hasura-admin-secret'] = config.graphql.adminSecret;
  }
  
  return headers;
};
