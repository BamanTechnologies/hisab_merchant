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

export function showToast(
  message: string,
  variant: ToastVariant = "success",
  durationMs = TOAST_MS,
) {
  const id = `toast-${++toastSeq}`;
  const text =
    message.trim() ||
    (variant === "error" ? "Something went wrong" : "Done");
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
      message:
        typeof result.error === "object" && result.error && "message" in result.error
          ? String((result.error as { message?: string }).message)
          : "Request failed",
      variant: "error",
    };
  }
  if (result.type === "failure") {
    const d = result.data;
    if (d && typeof d === "object" && "message" in d) {
      return { message: String((d as { message?: string }).message), variant: "error" };
    }
    return { message: "Request failed", variant: "error" };
  }
  if (result.type === "success") {
    const data = result.data as { success?: boolean; message?: string } | undefined;
    if (data && typeof data === "object" && "success" in data) {
      const ok = data.success === true;
      return {
        message: data.message ?? (ok ? "Success" : "Request failed"),
        variant: ok ? "success" : "error",
      };
    }
    return { message: "Success", variant: "success" };
  }
  return null;
}
