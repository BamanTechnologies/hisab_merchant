<script lang="ts">
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  type OrderSummary = {
    id: string;
    created_by: string;
    customer_address: string;
    customer_name: string;
    customer_phone: string;
    order_quantity: number;
    status: string;
    stock_id: string;
    total_amount: number;
    outstanding_amount: number;
  };

  let { data }: { data: PageData } = $props();
  const orders = data.orders;

  function statusClass(status: string) {
    if (status === "paid") return "ok";
    if (status === "partially_paid") return "warn";
    return "bad";
  }
</script>

<section class="header">
  <div>
    <h1>Orders</h1>
    <p class="muted">Click a row to view full order details.</p>
  </div>
</section>

<section class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Customer</th>
        <th class="right">Quantity</th>
        <th>Status</th>
        <th class="right">Total amount</th>
      </tr>
    </thead>
    <tbody>
      {#each orders as o}
        <tr
          class="row"
          onclick={() => goto(`/orders/${o.id}`)}
          tabindex="0"
          role="button"
        >
          <td>{o.customer_name}</td>
          <td class="right">{o.order_quantity}</td>
          <td><span class="chip {statusClass(o.status)}">{o.status}</span></td>
          <td class="right">Birr {o.total_amount.toLocaleString()}</td>
        </tr>
      {/each}
      {#if orders.length === 0}
        <tr>
          <td colspan="4" class="empty-state">
            <p class="muted">
              No orders found. Create your first order to get started.
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
  .right {
    text-align: right;
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
  .empty-state {
    text-align: center;
    padding: 2rem;
  }
  .empty-state p {
    margin: 0;
    font-style: italic;
  }
  .chip {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--surface-2), white 6%);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .chip.ok {
    background: color-mix(in oklab, #10b981, white 20%);
    color: #064e3b;
  }
  .chip.warn {
    background: color-mix(in oklab, #f59e0b, white 20%);
    color: #92400e;
  }
  .chip.bad {
    background: color-mix(in oklab, #ef4444, white 20%);
    color: #991b1b;
  }
  .row:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--ring);
  }
</style>
