import { writable } from "svelte/store";
import type { ActionResult } from "@sveltejs/kit";

export type ToastVariant = "success" | "error";

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

export const toastItems = writable<ToastItem[]>([]);

let toastSeq = 0;

/** Default visibility before follow-up actions (reload, invalidate). */
export const TOAST_MS = 2600;

const USER_FACING_ERROR_MESSAGES: Array<[RegExp, string]> = [
  [
    /unique constraint|duplicate key|already exists|uniqueness violation/i,
    "A record with these details already exists.",
  ],
  [
    /foreign key constraint|violates foreign key|not present in table/i,
    "This cannot be saved because it refers to data that no longer exists.",
  ],
  [
    /not-null constraint|null value in column|cannot be null/i,
    "A required field is missing.",
  ],
  [
    /check constraint|violates check constraint|invalid input syntax/i,
    "Some of the values are not valid.",
  ],
  [
    /permission denied|not authorized|access denied|insufficient permissions/i,
    "You do not have permission to complete this action.",
  ],
];

function parseGraphqlErrorMessage(value: string): string | null {
  const jsonStart = value.indexOf("[");
  if (jsonStart < 0) return null;

  try {
    const parsed: unknown = JSON.parse(value.slice(jsonStart));
    if (!Array.isArray(parsed)) return null;

    const message = parsed.find(
      (item): item is { message: string } =>
        typeof item === "object" &&
        item !== null &&
        "message" in item &&
        typeof item.message === "string",
    )?.message;
    return message?.trim() || null;
  } catch {
    return null;
  }
}

function extractErrorMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const graphqlMessage = parseGraphqlErrorMessage(trimmed);
    if (graphqlMessage) return graphqlMessage;

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed !== value) {
        const parsedMessage = extractErrorMessage(parsed);
        if (parsedMessage) return parsedMessage;
      }
    } catch {
      // The value is a regular message rather than a JSON error payload.
    }

    return trimmed;
  }

  if (typeof value === "object" && value !== null) {
    if ("message" in value) {
      return extractErrorMessage((value as { message?: unknown }).message);
    }
    if ("errors" in value) {
      return extractErrorMessage((value as { errors?: unknown }).errors);
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractErrorMessage(item);
      if (message) return message;
    }
  }

  return null;
}

/**
 * Convert action and GraphQL failures into concise messages suitable for staff.
 * Database/GraphQL payloads must not be rendered directly in a toast.
 */
export function userFacingErrorMessage(value: unknown, fallback = "Request failed"): string {
  const message = extractErrorMessage(value);
  if (!message) return fallback;

  const mappedMessage = USER_FACING_ERROR_MESSAGES.find(([pattern]) =>
    pattern.test(message),
  )?.[1];
  if (mappedMessage) return mappedMessage;

  if (/graphql errors?:\s*\[/i.test(message) || /^\s*[[{]/.test(message)) {
    return fallback;
  }

  return message;
}

export function showToast(
  message: unknown,
  variant: ToastVariant = "success",
  durationMs = TOAST_MS,
) {
  const id = `toast-${++toastSeq}`;
  const text = userFacingErrorMessage(
    message,
    variant === "error" ? "Something went wrong" : "Done",
  );
  toastItems.update((items) => [...items, { id, message: text, variant }]);
  if (durationMs > 0) {
    setTimeout(() => {
      toastItems.update((items) => items.filter((t) => t.id !== id));
    }, durationMs);
  }
}

/** Run `fn` after the toast has been visible for `delayMs`. */
export function afterToast(delayMs: number, fn: () => void | Promise<void>) {
  setTimeout(() => {
    void Promise.resolve(fn());
  }, delayMs);
}

/**
 * Derive a user-facing message + variant from a SvelteKit `use:enhance` result.
 * Handles `{ success, message }` action payloads and failure/error shapes.
 */
export function toastFromActionResult(result: ActionResult): {
  message: string;
  variant: ToastVariant;
} | null {
  if (result.type === "redirect") {
    return { message: "Done", variant: "success" };
  }
  if (result.type === "error") {
    return {
      message: userFacingErrorMessage(result.error),
      variant: "error",
    };
  }
  if (result.type === "failure") {
    const d = result.data;
    if (d && typeof d === "object" && "message" in d) {
      return {
        message: userFacingErrorMessage(
          (d as { message?: unknown }).message,
        ),
        variant: "error",
      };
    }
    return { message: "Request failed", variant: "error" };
  }
  if (result.type === "success") {
    const data = result.data as { success?: boolean; message?: string } | undefined;
    if (data && typeof data === "object" && "success" in data) {
      const ok = data.success === true;
      return {
        message: ok
          ? data.message ?? "Success"
          : userFacingErrorMessage(data.message, "Request failed"),
        variant: ok ? "success" : "error",
      };
    }
    return { message: "Success", variant: "success" };
  }
  return null;
}
