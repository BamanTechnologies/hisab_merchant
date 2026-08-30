import type { RequestHandler } from "./$types";
import { config } from "$lib/config";

const LIST_QUERY = `
  query getWaightLists(
    $filter: customer_waight_lists_bool_exp
    $limit: Int
    $offset: Int
    $order: [customer_waight_lists_order_by!]!
  ) {
    customer_waight_lists(
      where: $filter
      limit: $limit
      offset: $offset
      order_by: $order
    ) {
      id
      product_id
      customer_id
      quantity
      status
      is_reminder_sent
      allow_for_reminder
      created_at
      updated_at
      product {
        id
        name
        is_low_stock
        default_unit
        product_type {
          id
          name
        }
      }
      customer {
        id
        first_name
        last_name
        phone_number
        address
      }
    }
    total: customer_waight_lists_aggregate(where: $filter) {
      aggregate {
        count
      }
    }
  }
`;

const INSERT_MUTATION = `
  mutation insertWaightLists($object: customer_waight_lists_insert_input!) {
    insert_customer_waight_lists_one(object: $object) {
      id
    }
  }
`;

const UPDATE_MUTATION = `
  mutation updateWaightList(
    $id: uuid!
    $object: customer_waight_lists_set_input!
  ) {
    update_customer_waight_lists_by_pk(pk_columns: { id: $id }, _set: $object) {
      id
    }
  }
`;

const DELETE_MUTATION = `
  mutation deleteCustomerWaightList($id: uuid!) {
    delete_customer_waight_lists_by_pk(id: $id) {
      id
    }
  }
`;

const SEND_CUSTOMER_SMS_MUTATION = `
  mutation sendCustomerSms(
    $ids: [String!]!
    $message: String
    $isWaightListReminder: Boolean!
  ) {
    send_customer_sms(
      ids: $ids
      message: $message
      is_waightlist_reminder: $isWaightListReminder
    ) {
      error
      failure_count
      message
      status_code
      success_count
    }
  }
`;

const PRODUCT_STOCK_QUERY = `
  query WaightRestockProductStock($productIds: [uuid!]!, $branchId: uuid!) {
    products(
      where: { id: { _in: $productIds } }
    ) {
      id
      stock_movements_aggregate(where: { branch_id: { _eq: $branchId } }) {
        aggregate {
          sum {
            quantity_delta
          }
        }
      }
    }
  }
`;

const RESTOCK_LIST_QUERY = `
  query WaightRestockLists($productIds: [uuid!]!) {
    customer_waight_lists(
      where: { product_id: { _in: $productIds } }
      order_by: { created_at: desc }
    ) {
      id
      product_id
      customer_id
      quantity
      status
      is_reminder_sent
      allow_for_reminder
      created_at
      customer {
        id
        first_name
        last_name
        phone_number
        address
      }
      product {
        id
        name
        default_unit
        product_type {
          id
          name
        }
      }
    }
  }
`;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

async function gqlWithToken<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(config.graphql.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-hasura-role": "merchant",
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (!response.ok || result.errors) {
    throw new Error(JSON.stringify(result.errors ?? result));
  }
  return result.data as T;
}

export const POST: RequestHandler = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    switch (action) {
      case "list": {
        const customerId = typeof body.customerId === "string" ? body.customerId : null;
        const productId = typeof body.productId === "string" ? body.productId : null;
        const limit = typeof body.limit === "number" ? body.limit : 100;
        const offset = typeof body.offset === "number" ? body.offset : 0;

        const filter: Record<string, unknown> = {};
        if (customerId) filter.customer_id = { _eq: customerId };
        if (productId) filter.product_id = { _eq: productId };

        const data = await gqlWithToken<{
          customer_waight_lists: unknown[];
          total: { aggregate: { count: number } | null } | null;
        }>(token, LIST_QUERY, {
          filter,
          limit,
          offset,
          order: [{ created_at: "desc" }],
        });

        return json({
          rows: data.customer_waight_lists ?? [],
          total: data.total?.aggregate?.count ?? 0,
        });
      }

      case "insert": {
        const object = body.object;
        if (!object || typeof object !== "object") {
          return json({ error: "Invalid object" }, 400);
        }
        const data = await gqlWithToken<{ insert_customer_waight_lists_one: { id: string } | null }>(
          token,
          INSERT_MUTATION,
          { object },
        );
        return json({ id: data.insert_customer_waight_lists_one?.id ?? null });
      }

      case "update": {
        const id = typeof body.id === "string" ? body.id : "";
        const object = body.object;
        if (!id) return json({ error: "Invalid id" }, 400);
        if (!object || typeof object !== "object") {
          return json({ error: "Invalid object" }, 400);
        }
        const data = await gqlWithToken<{ update_customer_waight_lists_by_pk: { id: string } | null }>(
          token,
          UPDATE_MUTATION,
          { id, object },
        );
        return json({ id: data.update_customer_waight_lists_by_pk?.id ?? null });
      }

      case "delete": {
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return json({ error: "Invalid id" }, 400);
        const data = await gqlWithToken<{ delete_customer_waight_lists_by_pk: { id: string } | null }>(
          token,
          DELETE_MUTATION,
          { id },
        );
        return json({ id: data.delete_customer_waight_lists_by_pk?.id ?? null });
      }

      case "restockLists": {
        const productIds = Array.isArray(body.productIds)
          ? body.productIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
          : [];
        const branchId = typeof body.branchId === "string" ? body.branchId : "";
        if (productIds.length === 0) return json({ rows: [], total: 0 });
        if (!branchId) return json({ error: "Branch is required" }, 400);

        const [stockData, listData] = await Promise.all([
          gqlWithToken<{
            products: Array<{
              id: string;
              stock_movements_aggregate: {
                aggregate: { sum: { quantity_delta: number | null } | null } | null;
              } | null;
            }>;
          }>(token, PRODUCT_STOCK_QUERY, { productIds, branchId }),
          gqlWithToken<{
            customer_waight_lists: Array<{
              id: string;
              quantity?: number | string | null;
              [key: string]: unknown;
            }>;
          }>(token, RESTOCK_LIST_QUERY, { productIds }),
        ]);

        const availableById = new Map<string, number>();
        for (const p of stockData.products ?? []) {
          const qty = Number(
            p.stock_movements_aggregate?.aggregate?.sum?.quantity_delta ?? 0,
          );
          availableById.set(p.id, Number.isFinite(qty) ? qty : 0);
        }

        const rows = (listData.customer_waight_lists ?? []).filter((wl) => {
          const available = availableById.get(String(wl.product_id)) ?? 0;
          const wlQty = Number(wl.quantity ?? 0);
          return Number.isFinite(wlQty) && wlQty <= available;
        });

        return json({ rows, total: rows.length });
      }

      case "sendReminder": {
        const ids = Array.isArray(body.ids)
          ? body.ids.filter((id): id is string => typeof id === "string" && id.trim() !== "")
          : [];
        if (ids.length === 0) {
          return json({ error: "No items selected" }, 400);
        }
        const data = await gqlWithToken<{
          send_customer_sms: {
            error: string | null;
            failure_count: number;
            message: string | null;
            status_code: number;
            success_count: number;
          } | null;
        }>(token, SEND_CUSTOMER_SMS_MUTATION, {
          ids,
          message: null,
          isWaightListReminder: true,
        });
        return json(data.send_customer_sms ?? null);
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("[waight-lists]", action, err);
    const message =
      err instanceof Error && err.message
        ? err.message
        : "Request failed";
    return json({ error: message }, 502);
  }
};
