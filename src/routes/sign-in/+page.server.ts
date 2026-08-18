import type { Actions } from "./$types";
import { env } from "$env/dynamic/private";
import { getMerchantIdFromToken } from "$lib/auth";
import { fetchMerchantBranchId } from "$lib/merchantBranch.server";
import { fetchMerchantAppContext } from "$lib/merchantContext.server";
import { config, getGraphQLHeaders } from "$lib/config";

// Message returned by the backend when the credentials belong to an investor account
const NOT_MERCHANT_MESSAGE =
  "This user is not a merchant. Please login with the investor platform.";

// GraphQL mutation to login
const LOGIN_MUTATION = `
  mutation Login($password: String!, $phone: String!) {
    login(password: $password, phone: $phone) {
      token
      message
      status_code
    }
  }
`;

type LoginResult = {
  token: string | null;
  message: string | null;
  status_code: number;
};

// Function to login user
async function loginUser(phone: string, password: string): Promise<LoginResult | null> {
  const variables = {
    phone,
    password,
  };

  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: LOGIN_MUTATION,
      variables,
    }),
  });

  const body = await response.text();
  let result: { data?: { login?: LoginResult | null }; errors?: unknown } | null = null;
  try {
    result = JSON.parse(body);
  } catch {
    // Non-JSON response (e.g. plain-text error) — keep `result` null
  }

  const rawResponse = JSON.stringify(result ?? body);
  if (rawResponse.includes(NOT_MERCHANT_MESSAGE)) {
    return {
      token: null,
      message: NOT_MERCHANT_MESSAGE,
      status_code: 403,
    };
  }

  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status}, body: ${body}`,
    );
  }

  if (result?.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result?.data?.login ?? null;
}

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Extract form data
    const phone = formData.get("phone") as string;
    const password = formData.get("password") as string;

    try {
      const loginResult = await loginUser(phone, password);

      if (loginResult?.status_code === 403 && loginResult.token == null) {
        cookies.delete("authToken", { path: "/" });
        cookies.delete("merchantBranchId", { path: "/" });
        const baseUrl = (env.INVESTOR_PORTAL_URL ?? "").replace(/\/+$/, "");
        return {
          token: null,
          merchantBranchId: null,
          investorRedirect: true,
          investorSigninUrl: baseUrl ? `${baseUrl}/onboarding/signin` : "",
        };
      }

      if (!loginResult?.token) {
        throw new Error("Login failed: no result returned");
      }

      const userId = loginResult.token
        ? getMerchantIdFromToken(loginResult.token)
        : null;
      const merchantBranchId = userId
        ? await fetchMerchantBranchId(userId)
        : null;
      const defaultAppRoute = userId
        ? (await fetchMerchantAppContext(userId)).defaultAppRoute
        : "/dashboard";

      if (loginResult.token) {
        cookies.set("authToken", loginResult.token, {
          path: "/",
          sameSite: "strict",
          httpOnly: false,
        });
      }

      if (merchantBranchId) {
        cookies.set("merchantBranchId", merchantBranchId, {
          path: "/",
          sameSite: "strict",
          httpOnly: false,
        });
      } else {
        cookies.delete("merchantBranchId", { path: "/" });
      }

      return {
        token: loginResult.token,
        merchantBranchId,
        defaultAppRoute,
      };
    } catch (error) {
      cookies.delete("authToken", { path: "/" });
      cookies.delete("merchantBranchId", { path: "/" });

      return {
        token: null,
        merchantBranchId: null,
      };
    }
  },
};
