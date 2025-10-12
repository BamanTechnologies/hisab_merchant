<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  let { children } = $props();
  let isAuthenticated = $state(false);

  onMount(() => {
    // Check if user is authenticated
    const token = localStorage.getItem("authToken");
    isAuthenticated = !!token;

    // Set up authentication headers for all requests
    if (token) {
      setupAuthHeaders(token);
    }

    // If not authenticated and not on sign-in page, redirect to sign-in
    if (!token && $page.url.pathname !== "/sign-in") {
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
    // Clear authentication cookie
    document.cookie =
      "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    isAuthenticated = false;

    // Redirect to sign-in page
    goto("/sign-in");
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if isAuthenticated}
  <nav class="topbar">
    <div class="brand">Hisab</div>
    <button
      class="logout-btn"
      type="button"
      onclick={handleLogout}
      aria-label="Log out">Logout</button
    >
  </nav>

  <div class="shell">
    <aside class="sidebar">
      <a href="/stocks" class:active={$page.url.pathname.startsWith("/stocks")}
        >Stocks</a
      >
      <a href="/orders" class:active={$page.url.pathname.startsWith("/orders")}
        >Orders</a
      >
      <a
        href="/payments"
        class:active={$page.url.pathname.startsWith("/payments")}>Payments</a
      >
      <a
        href="/reports"
        class:active={$page.url.pathname.startsWith("/reports")}>Reports</a
      >
    </aside>
    <main class="content">
      {@render children?.()}
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
    font-weight: 800;
    font-size: 1.25rem;
    letter-spacing: 0.02em;
    color: #f8fafc;
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
    padding: 1.25rem 1.25rem 4rem;
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
