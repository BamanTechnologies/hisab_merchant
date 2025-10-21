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
  let showDeleteModal = $state(false);
  let orderToDelete = $state<OrderSummary | null>(null);
  let orders = $state(data.orders);
  let errorMessage = $state("");
  let successMessage = $state("");

  function statusClass(status: string) {
    if (status === "paid") return "ok";
    if (status === "partially_paid") return "warn";
    return "bad";
  }

  function openDeleteModal(order: OrderSummary, event: Event) {
    event.stopPropagation();
    orderToDelete = order;
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    showDeleteModal = false;
    orderToDelete = null;
  }

  async function confirmDelete() {
    if (!orderToDelete) return;

    try {
      const formData = new FormData();
      formData.append("orderId", orderToDelete.id);

      const response = await fetch("?/deleteOrder", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.type === "success") {
        // Remove the order from the local state
        orders = orders.filter((o: OrderSummary) => o.id !== orderToDelete!.id);
        successMessage = result.message;
        errorMessage = "";
        closeDeleteModal();

        // Clear success message after 3 seconds
        setTimeout(() => {
          successMessage = "";
        }, 3000);
      } else {
        errorMessage = result.message;
        successMessage = "";
      }
    } catch (error) {
      errorMessage = "Failed to delete order. Please try again.";
      successMessage = "";
    }
  }
</script>

<section class="header">
  <div>
    <h1>Orders</h1>
    <p class="muted">Click a row to view full order details.</p>
  </div>
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

{#if showDeleteModal && orderToDelete}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={closeDeleteModal}
    onkeydown={(e) =>
      (e.key === "Enter" || e.key === " ") && closeDeleteModal()}
  ></div>
  <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2 style="color: white;">Delete Order</h2>
      <button class="icon" aria-label="Close" onclick={closeDeleteModal}
        >✕</button
      >
    </header>
    <div class="modal-content">
      <p>Are you sure you want to delete this order?</p>
      <div class="order-details">
        <p><strong>Customer:</strong> {orderToDelete.customer_name}</p>
        <p><strong>Phone:</strong> {orderToDelete.customer_phone}</p>
        <p><strong>Quantity:</strong> {orderToDelete.order_quantity}</p>
        <p>
          <strong>Total Amount:</strong> Birr {orderToDelete.total_amount.toLocaleString()}
        </p>
        <p><strong>Status:</strong> {orderToDelete.status}</p>
      </div>
      <p class="warning">This action cannot be undone.</p>
    </div>
    <footer>
      <button type="button" class="ghost" onclick={closeDeleteModal}
        >Cancel</button
      >
      <button type="button" class="danger" onclick={confirmDelete}
        >Delete</button
      >
    </footer>
  </dialog>
{/if}

<section class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Customer</th>
        <th class="right">Quantity</th>
        <th>Status</th>
        <th class="right">Total amount</th>
        <th class="center">Actions</th>
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
          <td class="center">
            <button
              class="delete-btn"
              onclick={(e) => openDeleteModal(o, e)}
              aria-label="Delete order"
              title="Delete order"
            >
              🗑️
            </button>
          </td>
        </tr>
      {/each}
      {#if orders.length === 0}
        <tr>
          <td colspan="5" class="empty-state">
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
  .center {
    text-align: center;
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

  .alert {
    margin: 1rem 0;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid;
  }
  .alert.error {
    background: color-mix(in oklab, #ef4444, white 90%);
    border-color: #ef4444;
    color: #991b1b;
  }
  .alert.success {
    background: color-mix(in oklab, #10b981, white 90%);
    border-color: #10b981;
    color: #064e3b;
  }
  .alert p {
    margin: 0;
    font-weight: 500;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.6);
    backdrop-filter: blur(2px);
    z-index: 30;
  }
  .modal {
    position: fixed;
    inset: 0;
    margin: auto;
    max-width: 720px;
    width: calc(100% - 2rem);
    background: color-mix(in oklab, var(--surface), black 2%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.9rem;
    padding: 0;
    z-index: 40;
  }
  .modal header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem;
    border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }
  .modal h2 {
    margin: 0;
  }
  .modal .icon {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .modal-content {
    padding: 1rem;
    color: white;
  }
  .order-details {
    background: color-mix(in oklab, var(--surface-2), white 2%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.5rem;
    padding: 0.75rem;
    margin: 0.75rem 0;
  }
  .order-details p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }
  .warning {
    color: #ef4444;
    font-weight: 600;
    font-size: 0.9rem;
    margin: 0.75rem 0 0;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 1rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }
  .ghost {
    appearance: none;
    background: transparent;
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
  }
  .danger {
    appearance: none;
    background: #ef4444;
    color: white;
    border: 1px solid #dc2626;
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
    font-weight: 600;
  }
  .danger:hover {
    background: #dc2626;
  }
  .delete-btn {
    background: transparent;
    border: none;
    color: #ef4444;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: background-color 0.2s;
  }
  .delete-btn:hover {
    background: color-mix(in oklab, #ef4444, white 90%);
  }
</style>
