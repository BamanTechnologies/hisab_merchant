<script lang="ts">
  import { browser } from "$app/environment";
  import { get } from "svelte/store";
  import { _ } from "svelte-i18n";
  import { Bell, Clock, Eye, EyeOff } from "@lucide/svelte";
  import { showToast } from "$lib/toast";

  type Tab = "all" | "unseen" | "seen";

  type NotificationItem = {
    id: string;
    type: string;
    message: string;
    payload: unknown;
    is_seen: boolean;
    is_grouped: boolean;
    group_id?: string;
    created_at: string;
    updated_at: string;
  };

  const PAGE_SIZE = 20;
  const POLL_INTERVAL = 30_000;

  let open = $state(false);
  let tab = $state<Tab>("all");
  let notifications = $state<NotificationItem[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let unseenCount = $state(0);
  let rootRef = $state<HTMLDivElement | undefined>(undefined);

  let requestSeq = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function authToken(): string | null {
    if (!browser) return null;
    return localStorage.getItem("authToken");
  }

  async function apiFetch(
    action: string,
    extra?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const token = authToken();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error((result as { error?: string }).error ?? "Request failed");
    }
    return result as Record<string, unknown>;
  }

  const tabs = $derived([
    { id: "all" as Tab, label: get(_)("notificationsAll") },
    { id: "unseen" as Tab, label: get(_)("notificationsUnseen") },
    { id: "seen" as Tab, label: get(_)("notificationsSeen") },
  ]);

  const filter = $derived.by(() => {
    if (tab === "unseen") return { is_seen: { _eq: false } };
    if (tab === "seen") return { is_seen: { _eq: true } };
    return {};
  });

  const hasMore = $derived(notifications.length < total);

  async function fetchUnseenCount() {
    try {
      const result = await apiFetch("unseen-count");
      unseenCount =
        ((result as { count?: { aggregate?: { count?: number } } }).count
          ?.aggregate?.count) ?? 0;
    } catch (err) {
      console.error("[Notifications] failed to fetch unseen count", err);
    }
  }

  async function fetchPage(offset: number, append: boolean) {
    const seq = ++requestSeq;
    if (append) {
      loadingMore = true;
    } else {
      loading = true;
      error = null;
    }

    try {
      const result = await apiFetch("list", {
        limit: PAGE_SIZE,
        offset,
        filter,
      });
      if (seq !== requestSeq) return;
      const data = result as {
        notifications?: NotificationItem[];
        total?: { aggregate?: { count?: number } };
      };
      const list = data.notifications ?? [];
      total = data.total?.aggregate?.count ?? 0;
      notifications = append ? [...notifications, ...list] : list;
    } catch (err) {
      if (seq !== requestSeq) return;
      error = (err as Error).message;
    } finally {
      if (seq === requestSeq) {
        loading = false;
        loadingMore = false;
      }
    }
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    tab = next;
    notifications = [];
    total = 0;
    error = null;
    fetchPage(0, false);
  }

  function toggleOpen() {
    open = !open;
    if (open) {
      fetchPage(0, false);
      fetchUnseenCount();
    }
  }

  async function markSeen(item: NotificationItem) {
    try {
      await apiFetch("mark-seen", { ids: [item.id] });
      unseenCount = Math.max(0, unseenCount - 1);
      if (tab === "unseen") {
        notifications = notifications.filter((n) => n.id !== item.id);
        total = Math.max(0, total - 1);
      } else {
        notifications = notifications.map((n) =>
          n.id === item.id ? { ...n, is_seen: true } : n,
        );
      }
      refetchCurrent();
    } catch (err) {
      console.error("[Notifications] failed to mark as seen", err);
      showToast(get(_)("notificationsUpdateFailed"), "error");
    }
  }

  async function markUnseen(item: NotificationItem) {
    try {
      await apiFetch("mark-unseen", { ids: [item.id] });
      unseenCount += 1;
      if (tab === "seen") {
        notifications = notifications.filter((n) => n.id !== item.id);
        total = Math.max(0, total - 1);
      } else {
        notifications = notifications.map((n) =>
          n.id === item.id ? { ...n, is_seen: false } : n,
        );
      }
      refetchCurrent();
    } catch (err) {
      console.error("[Notifications] failed to mark as unseen", err);
      showToast(get(_)("notificationsUpdateFailed"), "error");
    }
  }

  async function markAllSeen() {
    if (unseenCount === 0) return;
    try {
      await apiFetch("mark-all-seen");
      notifications = notifications.map((n) => ({ ...n, is_seen: true }));
      unseenCount = 0;
      refetchCurrent();
    } catch (err) {
      console.error("[Notifications] failed to mark all as seen", err);
      showToast(get(_)("notificationsUpdateFailed"), "error");
    }
  }

  function refetchCurrent() {
    fetchPage(0, false);
    fetchUnseenCount();
  }

  function relativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const diffMin = Math.round((date.getTime() - Date.now()) / 60000);
    const formatter = new Intl.RelativeTimeFormat(undefined, {
      numeric: "auto",
    });
    if (Math.abs(diffMin) < 60) return formatter.format(diffMin, "minute");
    const diffHr = Math.round(diffMin / 60);
    if (Math.abs(diffHr) < 24) return formatter.format(diffHr, "hour");
    const diffDay = Math.round(diffHr / 24);
    if (Math.abs(diffDay) < 7) return formatter.format(diffDay, "day");
    return date.toLocaleDateString();
  }

  function handleCardClick(item: NotificationItem) {
    if (tab === "unseen") markSeen(item);
    else if (tab === "seen") markUnseen(item);
  }

  $effect(() => {
    if (!browser || !authToken()) return;
    fetchUnseenCount();
    pollTimer = setInterval(fetchUnseenCount, POLL_INTERVAL);
    return () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };
  });

  // Refetch the unseen count immediately when a push notification arrives
  // (dispatched by the push notification client after the toast + sound).
  $effect(() => {
    if (!browser) return;
    const handler = () => fetchUnseenCount();
    window.addEventListener("notification-received", handler);
    return () => window.removeEventListener("notification-received", handler);
  });

  $effect(() => {
    if (!open || !browser) return;
    const handler = (event: MouseEvent) => {
      if (rootRef && !rootRef.contains(event.target as Node)) {
        open = false;
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  });
</script>

<div class="relative" bind:this={rootRef}>
  <button
    type="button"
    onclick={toggleOpen}
    aria-label={get(_)("notificationsLabel")}
    class="relative flex size-10 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
  >
    <Bell size={20} strokeWidth={2} />
    {#if unseenCount > 0}
      <span
        class="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white dark:border-[#0f172a]"
      >
        {unseenCount > 99 ? "99+" : unseenCount}
      </span>
    {/if}
  </button>

  {#if open}
    <div
      class="absolute right-0 top-full z-50 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#0f172a]"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {get(_)("notificationsTitle")}
        </p>
        <button
          type="button"
          onclick={markAllSeen}
          disabled={unseenCount === 0}
          class="text-xs font-medium text-[#4DA0E6] hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          {get(_)("notificationsSeenAll")}
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1 px-3 pt-3">
        {#each tabs as t}
          <button
            type="button"
            onclick={() => switchTab(t.id)}
            class={[
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-[#4DA0E6]/10 text-[#4DA0E6]"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
            ].join(" ")}
          >
            {t.label}
          </button>
        {/each}
      </div>

      <!-- List -->
      <div class="max-h-[24rem] overflow-y-auto p-2">
        {#if loading}
          <div class="flex flex-col gap-3 px-3 py-2">
            {#each [0, 1, 2, 3, 4] as i}
              <div class="flex items-start gap-3">
                <div class="flex-1">
                  <div class="h-3.5 w-3/4 rounded-md bg-gray-100 dark:bg-white/10"></div>
                  <div class="mt-2 h-3 w-1/3 rounded-md bg-gray-100 dark:bg-white/10"></div>
                </div>
                <div class="size-7 flex-none rounded-full bg-gray-100 dark:bg-white/10"></div>
              </div>
            {/each}
          </div>
        {:else if error}
          <div class="py-10 text-center">
            <p class="text-sm text-red-500 dark:text-red-400">{error}</p>
          </div>
        {:else if notifications.length === 0}
          <div class="flex flex-col items-center gap-2 py-8 text-center">
            <Bell size={32} class="text-gray-300 dark:text-gray-600" />
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {tab === "unseen"
                ? get(_)("notificationsEmptyUnseen")
                : tab === "seen"
                  ? get(_)("notificationsEmptySeen")
                  : get(_)("noNotificationsMsg")}
            </p>
          </div>
        {:else}
          <div class="flex flex-col gap-1">
            {#each notifications as item}
              <button
                type="button"
                onclick={() => handleCardClick(item)}
                class={[
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  tab === "all"
                    ? "cursor-default"
                    : "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5",
                ].join(" ")}
              >
                <div class="min-w-0 flex-1">
                  <p class="break-words text-sm leading-snug text-gray-900 dark:text-gray-100">
                    {item.message}
                  </p>
                  <p class="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock size={12} />
                    {relativeTime(item.created_at)}
                  </p>
                </div>

                {#if tab === "unseen"}
                  <span
                    class="mt-1 flex size-7 flex-none items-center justify-center rounded-full bg-[#4DA0E6]/10 text-[#4DA0E6]"
                    title={get(_)("notificationsMarkSeen")}
                  >
                    <Eye size={14} />
                  </span>
                {:else if tab === "seen"}
                  <span
                    class="mt-1 flex size-7 flex-none items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                    title={get(_)("notificationsMarkUnseen")}
                  >
                    <EyeOff size={14} />
                  </span>
                {:else}
                  {#if !item.is_seen}
                    <span class="mt-1.5 size-2 flex-none rounded-full bg-[#4DA0E6]"></span>
                  {/if}
                {/if}
              </button>
            {/each}

            {#if hasMore}
              <button
                type="button"
                onclick={() => fetchPage(notifications.length, true)}
                disabled={loadingMore}
                class="mt-2 w-full rounded-lg py-2.5 text-sm font-medium text-[#4DA0E6] transition-colors hover:bg-[#4DA0E6]/5 disabled:opacity-50"
              >
                {loadingMore
                  ? get(_)("notificationsLoading")
                  : get(_)("notificationsLoadMore")}
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>