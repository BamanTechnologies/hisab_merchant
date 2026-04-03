<script lang="ts">
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";
  import type { CustomerListRow } from "./+page.server";

  let { data }: { data: PageData } = $props();

  let customers = $state(data.customers as CustomerListRow[]);

  $effect(() => {
    customers = data.customers as CustomerListRow[];
  });

  function fullName(c: CustomerListRow) {
    return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "—";
  }

  function formatRegistered(iso: string | null | undefined) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function dash(v: string | null | undefined) {
    if (v == null || String(v).trim() === "") return "—";
    return String(v);
  }
</script>

<section class="header">
  <div>
    <h1>Customers</h1>
    <p class="muted">Company customers. Select a row for orders and payments.</p>
  </div>
</section>

{#if !data.companyId}
  <p class="warn">
    Your branch has no company linked, so customers cannot be loaded.
  </p>
{:else if customers.length === 0}
  <p class="muted">No customers registered for this company yet.</p>
{/if}

<section class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Address</th>
        <th>Registered</th>
        <th>Phone</th>
      </tr>
    </thead>
    <tbody>
      {#each customers as c}
        <tr
          class="row"
          onclick={() => goto(`/customers/${c.id}`)}
          tabindex="0"
          role="button"
        >
          <td>{fullName(c)}</td>
          <td>{dash(c.address)}</td>
          <td class="nowrap">{formatRegistered(c.created_at)}</td>
          <td>{dash(c.phone_number)}</td>
        </tr>
      {/each}
      {#if customers.length === 0 && data.companyId}
        <tr>
          <td colspan="4" class="empty-state">
            <p class="muted">No customers to display.</p>
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</section>

<style>
  h1 {
    margin: 0 0 0.25rem;
  }
  .muted {
    color: #94a3b8;
    margin: 0;
  }
  .warn {
    color: #fca5a5;
    margin: 0 0 1rem;
  }
  .header {
    margin-bottom: 1rem;
  }
  .table-wrap {
    overflow: auto;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead tr {
    background: color-mix(in oklab, var(--surface-2), white 4%);
  }
  th,
  td {
    padding: 0.75rem 0.75rem;
  }
  th {
    text-align: left;
    color: #94a3b8;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .nowrap {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  td {
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
  }
  .row {
    cursor: pointer;
  }
  .row:hover {
    background: color-mix(in oklab, var(--surface-2), white 6%);
  }
  .row:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--ring);
  }
  .empty-state {
    text-align: center;
    padding: 2rem;
  }
  .empty-state p {
    margin: 0;
    font-style: italic;
  }
</style>
