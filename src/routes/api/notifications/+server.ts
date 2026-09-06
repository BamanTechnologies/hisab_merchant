import type { RequestHandler } from "./$types";
import { config } from "$lib/config";

const LIST_QUERY = `
  query getNotifications(
    $limit: Int
    $offset: Int
    $filter: dispatch_user_notifications_bool_exp
  ) {
    notifications: dispatch_user_notifications(
      where: $filter
      limit: $limit
      offset: $offset
      order_by: [{ created_at: desc_nulls_last }]
    ) {
      id
      type
      message
      payload
      is_seen
      is_grouped
      group_id
      created_at
      updated_at
    }
    total: dispatch_user_notifications_aggregate(where: $filter) {
      aggregate {
        count
      }
    }
  }
`;

const UNSEEN_COUNT_QUERY = `
  query unseenNotifications {
    count: dispatch_user_notifications_aggregate(
      where: { is_seen: { _eq: false } }
    ) {
      aggregate {
        count
      }
    }
  }
`;

const SEEN_MUTATION = `
  mutation SeenNotifications($ids: [uuid!]) {
    update_dispatch_user_notifications(
      where: { id: { _in: $ids } }
      _set: { is_seen: true }
    ) {
      affected_rows
    }
  }
`;

const SEEN_ALL_MUTATION = `
  mutation seenAll {
    seen_all: update_dispatch_user_notifications(
      where: { is_seen: { _eq: false } }
      _set: { is_seen: true }
    ) {
      affected_rows
    }
  }
`;

const UNSEEN_MUTATION = `
  mutation UnseenNotifications($ids: [uuid!]) {
    update_dispatch_user_notifications(
      where: { id: { _in: $ids } }
      _set: { is_seen: false }
    ) {
      affected_rows
    }
  }
`;

const UPSERT_DEVICE_TOKEN_MUTATION = `
  mutation UpsertDeviceToken($object: dispatch_device_tokens_insert_input!) {
    insert_dispatch_device_tokens_one(
      object: $object
      on_conflict: {
        constraint: device_tokens_user_id_device_token_key
        update_columns: [device_token]
      }
    ) {
      id
      source
      device_token
    }
  }
`;

type Action =
  | "list"
  | "unseen-count"
  | "mark-seen"
  | "mark-all-seen"
  | "mark-unseen"
  | "upsert-device-token";

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

  let body: {
    action?: Action;
    limit?: number;
    offset?: number;
    filter?: { is_seen?: { _eq?: boolean } };
    ids?: string[];
    deviceToken?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action: Action = body.action ?? "list";

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

    switch (action) {
      case "unseen-count":
        data = await graphqlFetch(UNSEEN_COUNT_QUERY);
        break;
      case "mark-seen":
        data = await graphqlFetch(SEEN_MUTATION, { ids: body.ids ?? [] });
        break;
      case "mark-all-seen":
        data = await graphqlFetch(SEEN_ALL_MUTATION);
        break;
      case "mark-unseen":
        data = await graphqlFetch(UNSEEN_MUTATION, { ids: body.ids ?? [] });
        break;
      case "upsert-device-token":
        if (!body.deviceToken) {
          return json({ error: "Missing device token" }, 400);
        }
        data = await graphqlFetch(UPSERT_DEVICE_TOKEN_MUTATION, {
          object: { device_token: body.deviceToken },
        });
        break;
      case "list":
      default: {
        const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
        const offset = Math.max(Number(body.offset) || 0, 0);
        const filter = body.filter?.is_seen
          ? { is_seen: body.filter.is_seen }
          : {};
        data = await graphqlFetch(LIST_QUERY, { limit, offset, filter });
        break;
      }
    }

    return json(data);
  } catch (err) {
    console.error("[notifications]", err);
    return json({ error: "Request failed" }, 500);
  }
};