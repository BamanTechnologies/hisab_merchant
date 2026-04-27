# Bamanstock Merchant - Environment Configuration

This application requires several environment variables to be configured for proper operation.

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# GraphQL Configuration (Required)
GRAPHQL_ENDPOINT=http://localhost:8080/v1/graphql
HASURA_ADMIN_SECRET=your_hasura_admin_secret_here
```

## Environment Variables Description

### Required Variables

- **`GRAPHQL_ENDPOINT`**: The URL of your GraphQL API endpoint

  - Example: `http://localhost:8080/v1/graphql`
  - For production: `https://your-domain.com/v1/graphql`

- **`HASURA_ADMIN_SECRET`**: The admin secret for your Hasura GraphQL instance
  - This is used to authenticate GraphQL requests
  - Keep this secret secure and never commit it to version control

## Production Deployment

For production deployment, set these environment variables in your hosting platform:

### Vercel

```bash
vercel env add GRAPHQL_ENDPOINT
vercel env add HASURA_ADMIN_SECRET
```

### Netlify

```bash
netlify env:set GRAPHQL_ENDPOINT "your_endpoint_here"
netlify env:set HASURA_ADMIN_SECRET "your_secret_here"
```

### Docker

```bash
docker run -e GRAPHQL_ENDPOINT="your_endpoint" -e HASURA_ADMIN_SECRET="your_secret" your-app
```

## Security Notes

- Never commit the `.env` file to version control
- Use strong, unique secrets for production
- Rotate secrets regularly
- Use environment-specific values for different deployments

## Development Setup

1. Copy `.env.example` to `.env`
2. Update the values with your local development settings
3. Run `npm run dev` to start the development server

## Troubleshooting

If you encounter errors about missing environment variables:

1. Check that your `.env` file exists in the root directory
2. Verify that all required variables are set
3. Restart your development server after making changes
4. Check the console for specific error messages about missing variables
