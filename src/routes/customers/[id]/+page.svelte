<script lang="ts">
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";
  import type { CustomerDetailOrder } from "./+page.server";

  let { data }: { data: PageData } = $props();

  /** From latest `customer_transactions.balance`: negative = credit (show as Overpaid); positive = outstanding. */
  const balanceSummary = $derived.by(() => {
    const raw = Number(data.outstandingAmount);
    const n = Number.isFinite(raw) ? raw : 0;
    const overpaid = n < 0;
    return {
      isOverpaid: overpaid,
      displayAmount: overpaid ? Math.abs(n) : n,
    };
  });

  type Tab = "orders" | "payments";
  let tab = $state<Tab>("orders");
  let orders = $state([] as CustomerDetailOrder[]);
  let errorMessage = $state("");
  let successMessage = $state("");

  $effect(() => {
    orders = data.orders;
  });

  function fullName() {
    const parts = [data.customer.first_name, data.customer.last_name].filter(
      Boolean,
    );
    return parts.join(" ").trim() || "Customer";
  }

  function formatOrderDate(iso: string) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
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

  function orderQtyCell(o: CustomerDetailOrder) {
    const u = (o.unit ?? o.stock?.unit ?? "").trim();
    const q = o.order_quantity;
    return u ? `${q} ${u}` : String(q);
  }

  function statusClass(status: string) {
    if (status === "cancelled") return "muted";
    if (status === "paid") return "ok";
    if (status === "partially_paid") return "warn";
    return "bad";
  }
</script>

<section class="back-row">
  <button type="button" class="linkish" onclick={() => goto("/customers")}
    >← Customers</button
  >
</section>

{#if errorMessage}
  <div class="alert error">
    <p>{errorMessage}</p>
  </div>
{/if}

{#if successMessage}
  <div class="alert success">
    <p>{successMessage}</p>
  </div>
{/if}

<header class="hero">
  <h1>{fullName()}</h1>
  {#if data.customer.phone_number}
    <p class="sub">{data.customer.phone_number}</p>
  {/if}
  {#if data.customer.address}
    <p class="sub muted">{data.customer.address}</p>
  {/if}
</header>

<section class="summary">
  <div class="metric">
    <span class="label">Total orders</span>
    <span class="value">Birr {data.totalOrderAmount.toLocaleString()}</span>
  </div>
  <div class="metric">
    <span class="label">Cash &amp; bank paid in</span>
    <span class="value pay"
      >Birr {data.totalPaymentAmount.toLocaleString()}</span
    >
  </div>
  <div
    class="metric highlight"
    class:metric-overpaid={balanceSummary.isOverpaid}
  >
    <span class="label"
      >{balanceSummary.isOverpaid ? "Overpaid" : "Outstanding"}</span
    >
    <span
      class="value"
      class:out={!balanceSummary.isOverpaid}
      class:overpaid={balanceSummary.isOverpaid}
      >Birr {balanceSummary.displayAmount.toLocaleString()}</span
    >
  </div>
</section>

<div class="tabs" role="tablist" aria-label="Customer activity">
  <button
    type="button"
    role="tab"
    class:active={tab === "orders"}
    aria-selected={tab === "orders"}
    onclick={() => (tab = "orders")}>Total orders</button
  >
  <button
    type="button"
    role="tab"
    class:active={tab === "payments"}
    aria-selected={tab === "payments"}
    onclick={() => (tab = "payments")}>Total payments</button
  >
</div>

{#if tab === "orders"}
  <section class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
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
            <td class="nowrap">{formatOrderDate(o.created_at)}</td>
            <td>{o.customer_name}</td>
            <td class="right">{orderQtyCell(o)}</td>
            <td><span class="chip {statusClass(o.status)}">{o.status}</span></td
            >
            <td class="right">Birr {o.total_amount.toLocaleString()}</td>
          </tr>
        {/each}
        {#if orders.length === 0}
          <tr>
            <td colspan="5" class="empty-state">
              <p class="muted">No orders for this customer in your company.</p>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </section>
{:else}
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
        {#each data.payments as p}
          <tr class="row">
            <td class="amount">Birr {p.amount.toLocaleString()}</td>
            <td class="method">{p.payment_method}</td>
            <td class="date">{p.created_by}</td>
            <td class="order-id">{p.order_id}</td>
          </tr>
        {/each}
        {#if data.payments.length === 0}
          <tr>
            <td colspan="4" class="empty-state">
              <p class="muted">No payments linked to this customer’s orders.</p>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .back-row {
    margin-bottom: 0.75rem;
  }
  .linkish {
    appearance: none;
    background: none;
    border: none;
    color: #60a5fa;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .linkish:hover {
    text-decoration: underline;
  }
  .hero h1 {
    margin: 0 0 0.35rem;
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .sub {
    margin: 0.15rem 0 0;
  }
  .muted {
    color: #94a3b8;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
    margin: 1.25rem 0 1rem;
  }
  .metric {
    padding: 0.85rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    background: color-mix(in oklab, var(--surface-2), white 3%);
  }
  .metric.highlight {
    border-color: color-mix(in oklab, #f59e0b, transparent 60%);
    background: color-mix(in oklab, #f59e0b, transparent 88%);
  }
  .metric.highlight.metric-overpaid {
    border-color: color-mix(in oklab, #38bdf8, transparent 55%);
    background: color-mix(in oklab, #38bdf8, transparent 90%);
  }
  .label {
    display: block;
    font-size: 0.8rem;
    color: #94a3b8;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.35rem;
  }
  .value {
    font-size: 1.15rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .value.pay {
    color: #4ade80;
  }
  .value.out {
    color: #fbbf24;
  }
  .value.overpaid {
    color: #7dd3fc;
  }
  .tabs {
    display: flex;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  .tabs button {
    appearance: none;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), white 4%);
    color: #cbd5e1;
    padding: 0.45rem 0.9rem;
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
  }
  .tabs button:hover {
    background: color-mix(in oklab, var(--surface-2), white 8%);
  }
  .tabs button.active {
    background: var(--brand, #3b82f6);
    color: #0b1220;
    border-color: transparent;
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
  th.right,
  td.right {
    text-align: right;
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
  .chip {
    display: inline-block;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    background: color-mix(in oklab, var(--surface-2), white 10%);
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
  .chip.muted {
    background: color-mix(in oklab, #64748b, white 12%);
    color: #cbd5e1;
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
  .empty-state {
    text-align: center;
    padding: 2rem;
  }
  .empty-state p {
    margin: 0;
    font-style: italic;
  }

  .alert {
    margin: 0 0 1rem;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid;
  }
  .alert.error {
    border-color: #f87171;
    background: color-mix(in oklab, #ef4444, transparent 88%);
    color: #fecaca;
  }
  .alert.success {
    border-color: #4ade80;
    background: color-mix(in oklab, #22c55e, transparent 88%);
    color: #bbf7d0;
  }
  .alert p {
    margin: 0;
  }
</style>
