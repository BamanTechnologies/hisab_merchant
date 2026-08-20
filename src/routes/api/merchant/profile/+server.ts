import type { RequestHandler } from "./$types";
import { config } from "$lib/config";
import { getMerchantIdFromToken, getUserIdFromToken } from "$lib/auth";

const PROFILE_QUERY = `
  query getProfile($id: uuid!, $merchantId: uuid!) {
    profile: account_users_by_pk(id: $id) {
      id
      first_name
      last_name
      email
      phone
      profile_picture
      telegram_chat_id
      telegram_user_name
      connect_telegram_url
      merchants(where: {id: {_eq: $merchantId}}) {
        id
        address
        branch: branchByBranch {
          id
          name
          address
          company: companyByCompany {
            id
            name
          }
        }
      }
    }
  }
`;

const CONNECT_TELEGRAM_MUTATION = `
  mutation startConnectToTelegram {
    connect_initialization(media: "telegram") {
      connect_link
      message
      status_code
    }
  }
`;

const UPDATE_PROFILE_MUTATION = `
  mutation updateProfile($id: uuid!, $object: account_users_set_input!) {
    update_profile: update_account_users_by_pk(
      pk_columns: { id: $id }
      _set: $object
    ) {
      id
    }
  }
`;

type Action = "profile" | "connect-telegram" | "disconnect-telegram";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: RequestHandler = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { action?: Action } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action: Action = body.action ?? "profile";
  const userId = getUserIdFromToken(token);
  const merchantId = getMerchantIdFromToken(token);

  const graphqlFetch = (query: string, variables?: Record<string, unknown>) =>
    fetch(config.graphql.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-hasura-role": "user",
      },
      body: JSON.stringify({ query, variables }),
    }).then(async (res) => {
      const result = await res.json();
      if (!res.ok || result.errors) {
        throw new Error(JSON.stringify(result.errors ?? result));
      }
      return result.data;
    });

  try {
    let data: unknown;

    if (action === "connect-telegram") {
      if (!userId) return json({ error: "Unauthorized" }, 401);
      data = await graphqlFetch(CONNECT_TELEGRAM_MUTATION);
    } else if (action === "disconnect-telegram") {
      if (!userId) return json({ error: "Unauthorized" }, 401);
      data = await graphqlFetch(UPDATE_PROFILE_MUTATION, {
        id: userId,
        object: { telegram_chat_id: null, telegram_user_name: null },
      });
    } else {
      if (!userId || !merchantId) return json({ error: "Unauthorized" }, 401);
      data = await graphqlFetch(PROFILE_QUERY, { id: userId, merchantId });
    }

    return json(data);
  } catch (err) {
    console.error("[merchant profile]", err);
    return json({ error: "Request failed" }, 500);
  }
};