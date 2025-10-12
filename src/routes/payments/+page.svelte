<script lang="ts">
  import type { PageData } from "./$types";

  type Payment = {
    id: string;
    amount: number;
    created_by: string;
    order_id: string;
    payment_method: string;
  };

  let { data }: { data: PageData } = $props();
  const payments = data.payments;

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
        <th>Amount</th>
        <th>Method</th>
        <th>Created By</th>
        <th>Order ID</th>
      </tr>
    </thead>
    <tbody>
      {#each payments as p}
        <tr class="row">
          <td class="amount">Birr {p.amount.toLocaleString()}</td>
          <td class="method">{p.payment_method}</td>
          <td class="date">{p.created_by}</td>
          <td class="order-id">{p.order_id}</td>
        </tr>
      {/each}
      {#if payments.length === 0}
        <tr>
          <td colspan="4" class="empty-state">
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
    text-align: right;
    font-weight: 600;
  }
  .method {
    font-weight: 500;
  }
  .date {
    color: #94a3b8;
  }
  .order-id {
    font-family: monospace;
    color: #60a5fa;
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
