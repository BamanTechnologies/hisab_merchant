<script lang="ts">
  import "../app.css";
  import favicon from "$lib/assets/favicon.svg";
  import ToastHost from "$lib/ToastHost.svelte";
  import { browser } from "$app/environment";
  import { navigating, page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: import("svelte").Snippet } =
    $props();

  /** Server session (auth cookie) or client token — avoids waiting for onMount to show the shell. */
  function shellVisible(): boolean {
    const serverOk = data.merchantContext != null;
    if (!browser) return serverOk;
    return serverOk || !!localStorage.getItem("authToken");
  }

  let isAuthenticated = $state(shellVisible());
  const APP_PREFIXES = [
    "/stocks",
    "/transfers",
    "/orders",
    "/customers",
    "/payments",
    "/expenses",
    "/reports",
  ] as const;

  const isAppShellRoute = $derived.by(() => {
    const path = $page.url.pathname;
    return APP_PREFIXES.some((prefix) => path.startsWith(prefix));
  });

  $effect(() => {
    const serverOk = data.merchantContext != null;
    if (!browser) {
      isAuthenticated = serverOk;
      return;
    }
    isAuthenticated = serverOk || !!localStorage.getItem("authToken");
  });

  onMount(() => {
    const token = localStorage.getItem("authToken");
    if (token) {
      setupAuthHeaders(token);
      const branchId = localStorage.getItem("merchantBranchId");
      if (branchId) {
        document.cookie = `merchantBranchId=${branchId}; path=/; secure; samesite=strict`;
      }
    }

    const path = $page.url.pathname;
    const needsAuth = APP_PREFIXES.some((prefix) => path.startsWith(prefix));
    if (!token && data.merchantContext == null && needsAuth) {
      goto("/sign-in");
    }
  });

  // Function to set up authentication headers
  function setupAuthHeaders(token: string) {
    // Set cookie for server-side requests
    document.cookie = `authToken=${token}; path=/; secure; samesite=strict`;
  }

  function handleLogout() {
    // Clear token from localStorage
    localStorage.removeItem("authToken");
    localStorage.removeItem("merchantBranchId");
    // Clear authentication cookie
    document.cookie =
      "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie =
      "merchantBranchId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    isAuthenticated = false;
    goto("/sign-in");
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Raleway:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<ToastHost />

{#if isAppShellRoute}
  <nav class="topbar">
    <a class="brand" href="/" aria-label="Go to landing page">
      <img src="/bamanstock-logo.png" alt="Bamanstock" class="brand-logo" />
    </a>
    <div class="topbar-actions">
      <button
        class="logout-btn"
        type="button"
        onclick={handleLogout}
        aria-label="Log out">Logout</button
      >
    </div>
  </nav>

  <div class="shell">
    <aside class="sidebar">
      <a href="/stocks" class:active={$page.url.pathname.startsWith("/stocks")}
        >Stocks</a
      >
      <a href="/transfers" class:active={$page.url.pathname.startsWith("/transfers")}
        >Transfers</a
      >
      <a href="/orders" class:active={$page.url.pathname.startsWith("/orders")}
        >Orders</a
      >
      <a
        href="/customers"
        class:active={$page.url.pathname.startsWith("/customers")}>Customers</a
      >
      <a
        href="/payments"
        class:active={$page.url.pathname.startsWith("/payments")}>Payments</a
      >
      <a
        href="/expenses"
        class:active={$page.url.pathname.startsWith("/expenses")}>Expenses</a
      >
      <a
        href="/reports"
        class:active={$page.url.pathname.startsWith("/reports")}>Reports</a
      >
    </aside>
    <main class="content">
      {@render children?.()}
      {#if $navigating}
        <div
          class="nav-loading-overlay"
          aria-busy="true"
          aria-live="polite"
          role="status"
        >
          <div class="nav-loading-spinner" aria-hidden="true"></div>
          <span class="sr-only">Loading page</span>
        </div>
      {/if}
    </main>
  </div>
{:else}
  {@render children?.()}
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      Segoe UI,
      Roboto,
      Helvetica,
      Arial,
      "Apple Color Emoji",
      "Segoe UI Emoji";
    background: linear-gradient(180deg, #0f172a 0%, #0b1220 100%);
    color: #e5e7eb;
  }

  /*
    Native <dialog> is not transparent to body color — UA styles often force
    dark text. Keep modal copy and headings readable on our dark surfaces.
  */
  :global(dialog) {
    color: #e5e7eb;
  }
  :global(dialog :is(h1, h2, h3, h4)) {
    color: #f8fafc;
  }

  :root {
    --surface: #0b1220;
    --surface-2: #0f172a;
    --muted: #94a3b8;
    --brand: #60a5fa;
    --brand-strong: #3b82f6;
    --ring: rgba(96, 165, 250, 0.35);
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: color-mix(in oklab, var(--surface-2), black 8%);
    border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
    backdrop-filter: saturate(160%) blur(8px);
  }

  .brand {
    line-height: 1;
    display: flex;
    align-items: center;
    text-decoration: none;
  }

  .brand-logo {
    display: block;
    height: 35px;
    width: 180px;
    max-width: 42vw;
    object-fit: cover;
    object-position: left center;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .logout-btn {
    appearance: none;
    border: 1px solid color-mix(in oklab, var(--brand), black 35%);
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--brand), white 10%),
      var(--brand)
    );
    color: #0b1220;
    font-weight: 600;
    padding: 0.4rem 0.8rem;
    border-radius: 0.5rem;
    cursor: pointer;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.2) inset,
      0 8px 20px rgba(59, 130, 246, 0.2);
  }

  .logout-btn:hover {
    filter: brightness(1.05);
  }

  .logout-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--ring);
  }

  .shell {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: calc(100vh - 56px);
  }

  .sidebar {
    position: sticky;
    top: 56px;
    height: calc(100vh - 56px);
    padding: 1rem 0.75rem;
    background: color-mix(in oklab, var(--surface), black 4%);
    border-right: 1px solid color-mix(in oklab, var(--surface), white 8%);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .sidebar a {
    text-decoration: none;
    color: var(--muted);
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    font-weight: 600;
    transition:
      color 120ms ease,
      background-color 120ms ease,
      transform 120ms ease;
  }

  .sidebar a:hover {
    color: #e5e7eb;
    background: color-mix(in oklab, var(--surface-2), white 8%);
  }

  .sidebar a.active {
    color: #0b1220;
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--brand), white 10%),
      var(--brand)
    );
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.2) inset,
      0 8px 20px rgba(59, 130, 246, 0.2);
  }

  .content {
    position: relative;
    padding: 1.25rem 1.25rem 4rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .nav-loading-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, #0b1220, transparent 35%);
    backdrop-filter: blur(4px);
    pointer-events: auto;
  }

  .nav-loading-spinner {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 3px solid color-mix(in oklab, var(--brand), transparent 75%);
    border-top-color: var(--brand);
    animation: nav-spin 0.7s linear infinite;
  }

  @keyframes nav-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 900px) {
    .shell {
      grid-template-columns: 1fr;
    }
    .sidebar {
      position: static;
      height: auto;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 0.5rem;
      border-right: none;
      border-bottom: 1px solid color-mix(in oklab, var(--surface), white 8%);
      padding: 0.75rem;
    }
  }
</style>
