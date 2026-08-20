<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";
  import {
    Building2,
    MapPin,
    RefreshCw,
    Send,
    Unplug,
  } from "@lucide/svelte";
  import { showToast } from "$lib/toast";

  type Profile = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    profile_picture?: string | null;
    telegram_chat_id?: string | null;
    telegram_user_name?: string | null;
    connect_telegram_url?: string | null;
    merchants?: Array<{
      id: string;
      address?: string | null;
      branch?: {
        id: string;
        name?: string | null;
        address?: string | null;
        company?: { id: string; name?: string | null } | null;
      } | null;
    }> | null;
  };

  let profile = $state<Profile | null>(null);
  let loading = $state(true);
  let profileError = $state(false);

  let connectModalOpen = $state(false);
  let connecting = $state(false);
  let connectLink = $state<string | null>(null);
  let connectError = $state<string | null>(null);
  let disconnectModalOpen = $state(false);
  let disconnecting = $state(false);

  function authToken(): string | null {
    if (!browser) return null;
    return localStorage.getItem("authToken");
  }

  async function apiFetch(
    action: "profile" | "connect-telegram" | "disconnect-telegram",
  ): Promise<Record<string, unknown>> {
    const token = authToken();
    if (!token) throw new Error(get(_)("settingsNotAuthenticated"));
    const res = await fetch("/api/merchant/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(
        (result as { error?: string }).error ?? get(_)("settingsProfileError"),
      );
    }
    return result as Record<string, unknown>;
  }

  async function fetchProfile() {
    loading = true;
    profileError = false;
    try {
      const data = await apiFetch("profile");
      profile =
        (data as { profile?: Profile | null }).profile ?? null;
    } catch {
      profileError = true;
    } finally {
      loading = false;
    }
  }

  onMount(fetchProfile);

  const connected = $derived(!!profile?.telegram_chat_id);
  const hasConnectUrl = $derived(!!profile?.connect_telegram_url);
  const merchant = $derived(profile?.merchants?.[0] ?? null);
  const fullName = $derived(
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim(),
  );

  function openConnectModal() {
    connectLink = null;
    connectError = null;
    connectModalOpen = true;
  }

  function closeConnectModal() {
    connectModalOpen = false;
    void fetchProfile();
  }

  async function startConnect() {
    connecting = true;
    connectError = null;
    try {
      const data = await apiFetch("connect-telegram");
      const init = (data as {
        connect_initialization?: {
          connect_link?: string | null;
          message?: string | null;
        } | null;
      }).connect_initialization;
      connectLink = init?.connect_link ?? null;
      if (!connectLink) {
        connectError =
          init?.message ?? get(_)("settingsConnectFailed");
      }
    } catch (err) {
      connectError =
        err instanceof Error ? err.message : get(_)("settingsConnectFailed");
    } finally {
      connecting = false;
    }
  }

  function openDisconnectModal() {
    disconnectModalOpen = true;
  }

  function closeDisconnectModal() {
    disconnectModalOpen = false;
  }

  async function disconnectTelegram() {
    disconnecting = true;
    try {
      await apiFetch("disconnect-telegram");
      disconnectModalOpen = false;
      showToast(get(_)("settingsDisconnected"), "success");
      await fetchProfile();
    } catch {
      showToast(get(_)("settingsProfileError"), "error");
    } finally {
      disconnecting = false;
    }
  }
</script>

<div class="mx-auto max-w-3xl space-y-6">
  <div>
    <h1 class="font-[Sora] text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
      {$_('settingsTitle')}
    </h1>
    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{$_('settingsSubtitle')}</p>
  </div>

  <!-- Profile card -->
  <section class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
    <h3 class="text-base font-bold text-gray-900 dark:text-gray-100">{$_('settingsProfile')}</h3>
    <p class="text-sm text-gray-500 dark:text-gray-400">{$_('settingsProfileInfo')}</p>

    {#if loading}
      <div class="mt-4 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <RefreshCw size={16} class="animate-spin" />
        {$_('settingsLoadingProfile')}
      </div>
    {:else if profileError}
      <div class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
        {$_('settingsProfileError')}
        <button type="button" class="ml-2 font-semibold underline" onclick={fetchProfile}>
          {$_('settingsRefresh')}
        </button>
      </div>
    {:else if profile}
      <div class="mt-5 flex flex-col gap-5 sm:flex-row">
        <div class="flex shrink-0 items-start">
          {#if profile.profile_picture}
            <img
              src={profile.profile_picture}
              alt={fullName}
              class="size-20 rounded-full object-cover ring-2 ring-gray-100 dark:ring-white/10"
            />
          {:else}
            <div class="flex size-20 items-center justify-center rounded-full bg-[#4DA0E6]/10 text-2xl font-bold text-[#4DA0E6]">
              {(fullName || profile.email || "?").charAt(0).toUpperCase()}
            </div>
          {/if}
        </div>
        <dl class="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {$_('settingsFirstName')}
            </dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              {profile.first_name || "—"}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {$_('settingsLastName')}
            </dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              {profile.last_name || "—"}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {$_('settingsEmail')}
            </dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              {profile.email || "—"}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {$_('settingsPhone')}
            </dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              {profile.phone || "—"}
            </dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <MapPin size={12} />
              {$_('settingsMerchantAddress')}
            </dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              {merchant?.address || "—"}
            </dd>
          </div>
          <div>
            <dt class="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <Building2 size={12} />
              {$_('settingsBranch')}
            </dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              {merchant?.branch?.name || "—"}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {$_('settingsBranchAddress')}
            </dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              {merchant?.branch?.address || "—"}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {$_('settingsCompany')}
            </dt>
            <dd class="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">
              {merchant?.branch?.company?.name || "—"}
            </dd>
          </div>
        </dl>
      </div>
    {/if}
  </section>

  <!-- Telegram connection card -->
  <section class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-[#0f172a] dark:ring-white/10">
    <h3 class="text-base font-bold text-gray-900 dark:text-gray-100">{$_('settingsTelegram')}</h3>
    <p class="text-sm text-gray-500 dark:text-gray-400">{$_('settingsTelegramInfo')}</p>

    {#if loading}
      <div class="mt-4 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <RefreshCw size={16} class="animate-spin" />
        {$_('settingsLoadingProfile')}
      </div>
    {:else if profileError}
      <div class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
        {$_('settingsProfileError')}
      </div>
    {:else if connected}
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-50 px-4 py-3 dark:bg-green-500/10">
        <div class="flex items-center gap-3">
          <div class="flex size-10 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
            <Send size={18} />
          </div>
          <div>
            <p class="text-sm font-semibold text-green-700 dark:text-green-400">
              {$_('settingsConnectedToTelegram')}
              {#if profile?.telegram_user_name}
                (<span>@{profile.telegram_user_name}</span>)
              {/if}
            </p>
            <p class="text-xs text-green-600/70 dark:text-green-500/70">
              {$_('settingsTelegramConnectedHint')}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
          onclick={openDisconnectModal}
          disabled={disconnecting}
        >
          <Unplug size={16} />
          {disconnecting ? $_('settingsDisconnecting') : $_('settingsDisconnect')}
        </button>
      </div>
    {:else if hasConnectUrl}
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <p class="w-full text-sm text-gray-600 dark:text-gray-300">
          {$_('settingsTelegramPendingHint')}
        </p>
        <a
          href={profile!.connect_telegram_url!}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 rounded-lg bg-[#4DA0E6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4DA0E6]/90"
        >
          <Send size={16} />
          {$_('settingsConnectTelegram')}
        </a>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
          onclick={openConnectModal}
        >
          <RefreshCw size={16} />
          {$_('settingsRegenerate')}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
          onclick={fetchProfile}
        >
          <RefreshCw size={16} />
          {$_('settingsRefresh')}
        </button>
      </div>
    {:else}
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg bg-[#4DA0E6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4DA0E6]/90"
          onclick={openConnectModal}
        >
          <Send size={16} />
          {$_('settingsConnectTelegram')}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
          onclick={fetchProfile}
        >
          <RefreshCw size={16} />
          {$_('settingsRefresh')}
        </button>
      </div>
    {/if}
  </section>
</div>

{#if connectModalOpen}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !connecting && closeConnectModal()}
    onkeydown={(e) =>
      !connecting && (e.key === "Enter" || e.key === " ") && closeConnectModal()}
  ></div>
  <dialog
    open
    class="modal modal-compact"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => connecting && e.preventDefault()}
    onkeydown={(e) => {
      if (e.key === "Escape" && connecting) {
        e.preventDefault();
      }
    }}
  >
    <header class="modal-head">
      <h2>{$_('settingsConnectConfirmTitle')}</h2>
      <button
        type="button"
        class="icon-close"
        disabled={connecting}
        onclick={closeConnectModal}
        aria-label="Close">✕</button
      >
    </header>
    <div class="modal-body">
      {#if connectLink}
        <p class="text-sm">{$_('settingsConnectLinkReady')}</p>
      {:else}
        <p class="text-sm">{$_('settingsConnectConfirmBody')}</p>
        {#if connectError}
          <p class="mt-2 text-sm text-red-600 dark:text-red-400">{connectError}</p>
        {/if}
      {/if}
    </div>
    <footer class="modal-foot">
      {#if connectLink}
        <button type="button" class="ghost" onclick={closeConnectModal}>
          {$_('close')}
        </button>
        <a
          href={connectLink}
          target="_blank"
          rel="noopener noreferrer"
          class="primary"
        >
          <Send size={16} />
          {$_('settingsOpenTelegram')}
        </a>
      {:else}
        <button type="button" class="ghost" disabled={connecting} onclick={closeConnectModal}>
          {$_('cancel')}
        </button>
        <button type="button" class="primary" disabled={connecting} onclick={startConnect}>
          {connecting ? $_('settingsConnecting') : $_('settingsConnectTelegram')}
        </button>
      {/if}
    </footer>
  </dialog>
{/if}

{#if disconnectModalOpen}
  <div
    class="modal-overlay overlay-nested"
    role="button"
    tabindex="0"
    onclick={() => !disconnecting && closeDisconnectModal()}
    onkeydown={(e) =>
      !disconnecting && (e.key === "Enter" || e.key === " ") && closeDisconnectModal()}
  ></div>
  <dialog
    open
    class="modal modal-compact modal-nested"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => disconnecting && e.preventDefault()}
    onkeydown={(e) => {
      if (e.key === "Escape" && disconnecting) {
        e.preventDefault();
      }
    }}
  >
    <header class="modal-head">
      <h2>{$_('settingsDisconnectConfirmTitle')}</h2>
      <button
        type="button"
        class="icon-close"
        disabled={disconnecting}
        onclick={closeDisconnectModal}
        aria-label="Close">✕</button
      >
    </header>
    <div class="modal-body">
      <p class="text-sm">{$_('settingsDisconnectConfirmBody')}</p>
    </div>
    <footer class="modal-foot">
      <button type="button" class="ghost" disabled={disconnecting} onclick={closeDisconnectModal}>
        {$_('cancel')}
      </button>
      <button type="button" class="danger" disabled={disconnecting} onclick={disconnectTelegram}>
        {disconnecting ? $_('settingsDisconnecting') : $_('settingsDisconnect')}
      </button>
    </footer>
  </dialog>
{/if}