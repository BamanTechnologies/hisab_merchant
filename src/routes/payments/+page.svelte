<script lang="ts">
  import type { PageData } from "./$types";

  type Payment = {
    id: string;
    amount: number;
    created_by: string;
    created_by_name?: string;
    created_at?: string;
    order?: { customer_name?: string | null } | null;
    order_id: string;
    payment_method: string;
  };

  let { data }: { data: PageData } = $props();
  const payments = (data.payments ?? []) as Payment[];

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  function formatMoney(v: number | string | null | undefined): string {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^0-9.-]/g, ""))
        : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString()}`;
  }
</script>

<section class="header">
  <div>
    <h1>Payments</h1>
    <p class="muted">Payment history and transaction records.</p>
  </div>
</section>

<section class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Amount</th>
        <th>Customer</th>
        <th>Method</th>
        <th>Created By</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each payments as p}
        <tr class="row">
          <td class="date">{p.created_at ? formatDate(p.created_at) : "—"}</td>
          <td class="amount">{formatMoney(p.amount)}</td>
          <td>{p.order?.customer_name?.trim() || "—"}</td>
          <td class="method">{p.payment_method}</td>
          <td class="date">{p.created_by_name || "—"}</td>
          <td>
            <a class="action-link" href={`/orders/${p.order_id}`}>View order</a>
          </td>
        </tr>
      {/each}
      {#if payments.length === 0}
        <tr>
          <td colspan="6" class="empty-state">
            <p class="muted">
              No payments found. Payments will appear here once orders are paid.
            </p>
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
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
  .amount {
    font-weight: 600;
  }
  .method {
    font-weight: 500;
  }
  .date {
    color: #94a3b8;
  }
  .action-link {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.65rem;
    border-radius: 0.45rem;
    border: 1px solid color-mix(in oklab, #60a5fa, white 35%);
    color: #60a5fa;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.86rem;
    transition: background-color 120ms ease;
  }
  .action-link:hover {
    background: color-mix(in oklab, #60a5fa, transparent 88%);
  }
  td {
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
  }
  .row {
    cursor: default;
  }
  .row:hover {
    background: color-mix(in oklab, var(--surface-2), white 6%);
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
