import type { RequestHandler } from "./$types";
import { config } from "$lib/config";
import type { SendSmsActionResult } from "$lib/sms";

const SEND_CUSTOMERS_MESSAGE_MUTATION = `
  mutation sendCustomersMessage($ids: [String!]!, $message: String ,$isWaightlistReminder:Boolean!) {
    send_customer_sms(ids: $ids, message: $message, is_waightlist_reminder: $isWaightlistReminder) {
      error
      failure_count
      message
      status_code
      success_count
    }
  }
`;

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

  let body: { customerIds?: unknown; message?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const customerIds = Array.isArray(body.customerIds)
    ? body.customerIds.filter(
        (id): id is string => typeof id === "string" && id.trim() !== "",
      )
    : [];
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (customerIds.length === 0) {
    return json({ error: "No customers selected" }, 400);
  }
  if (!message) {
    return json({ error: "Message is required" }, 400);
  }

  try {
    const response = await fetch(config.graphql.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-hasura-role": "merchant",
      },
      body: JSON.stringify({
        query: SEND_CUSTOMERS_MESSAGE_MUTATION,
        variables: { ids: customerIds, message, isWaightlistReminder: false },
      }),
    });

    const result = await response.json();

    if (!response.ok || result.errors) {
      console.error("[customers send-sms]", result.errors ?? result);
      return json(
        { error: `Request failed: ${JSON.stringify(result.errors ?? result)}` },
        502,
      );
    }

    return json(result.data?.send_customer_sms as SendSmsActionResult);
  } catch (err) {
    console.error("[customers send-sms]", err);
    return json({ error: "Request failed" }, 500);
  }
};
