<script lang="ts">
  import type { PageData } from "./$types";

  type Order = {
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
    unit?: string | null;
    stock?: { unit?: string | null } | null;
  };

  function orderQuantityLabel(o: Order) {
    const u = (o.unit ?? o.stock?.unit ?? "").trim();
    return u ? `${o.order_quantity} ${u}` : String(o.order_quantity);
  }

  let { data, form }: { data: PageData; form?: any } = $props();
  const order = data.order;

  function statusClass(status: string) {
    if (status === "paid") return "ok";
    if (status === "partially_paid") return "warn";
    return "bad";
  }

  // Define bank list once as the single source of truth
  const banks = [
    "Commercial Bank of Ethiopia (CBE)",
    "Awash International Bank",
    "Dashen Bank",
    "Bank of Abyssinia",
    "Wegagen Bank",
    "Nib International Bank",
    "Cooperative Bank of Oromia",
    "Zemen Bank",
    "Bunna International Bank",
    "Berhan International Bank",
    "Enat Bank",
    "Oromia International Bank",
    "Hibret Bank",
    "Abay Bank",
    "Addis International Bank",
    "Amhara Bank",
    "Rammis Bank",
    "Siinqee Bank",
    "Shabelle Bank",
    "ZamZam Bank",
    "Hijra Bank",
  ] as const;

  let showPay = $state(false);
  let payAmount = $state<number | undefined>(undefined);
  let payMethod = $state<(typeof banks)[number] | "">("");
  let errorMessage = $state("");
  let successMessage = $state("");

  function submitPayment(e: Event) {
    // Allow form to submit naturally to server action
    // No preventDefault needed
  }

  // Handle form responses
  $effect(() => {
    if (form) {
      if (form.success) {
        successMessage = form.message;
        errorMessage = "";
        showPay = false;
        payAmount = undefined;
        payMethod = "";
        // Reload the page to show updated order data
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        errorMessage = form.message;
        successMessage = "";
      }
    }
  });
</script>

<section>
  <h1>Order Details</h1>

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

  {#if order}
    <div class="header-actions">
      <button
        class="primary"
        disabled={order.status === "paid"}
        onclick={() => (showPay = true)}>Pay</button
      >
    </div>
    <div class="detail">
      <div><span class="sect">Order Information</span></div>
      <div class="grid">
        <div>
          <span class="label">Customer:</span><span>{order.customer_name}</span>
        </div>
        <div>
          <span class="label">Phone:</span><span
            >{order.customer_phone || "-"}</span
          >
        </div>
        <div>
          <span class="label">Address:</span><span
            >{order.customer_address || "-"}</span
          >
        </div>
        <div>
          <span class="label">Quantity:</span><span
            >{orderQuantityLabel(order)}</span
          >
        </div>
        <div>
          <span class="label">Stock ID:</span><span>{order.stock_id}</span>
        </div>
        <div>
          <span class="label">Status:</span><span
            class="chip {statusClass(order.status)}">{order.status}</span
          >
        </div>
        <div>
          <span class="label">Total amount:</span><span
            >Birr {order.total_amount.toLocaleString()}</span
          >
        </div>
        <div>
          <span class="label">Outstanding:</span><span
            >Birr {order.outstanding_amount.toLocaleString()}</span
          >
        </div>
      </div>
    </div>
  {:else}
    <p class="muted">Order not found.</p>
  {/if}

  {#if showPay}
    <div
      class="modal-overlay"
      role="button"
      tabindex="0"
      onclick={() => (showPay = false)}
      onkeydown={(e) =>
        (e.key === "Enter" || e.key === " ") && (showPay = false)}
    ></div>
    <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
      <header>
        <h2>Create Payment</h2>
        <button
          class="icon"
          aria-label="Close"
          onclick={() => (showPay = false)}>✕</button
        >
      </header>
      <form
        class="form"
        method="POST"
        action="?/createPayment"
        onsubmit={submitPayment}
      >
        <div class="grid">
          <label>
            <span class="label_text">Amount</span>
            <input
              type="number"
              name="amount"
              min="1"
              max={order?.outstanding_amount ?? undefined}
              bind:value={payAmount}
              required
            />
          </label>
          <label>
            <span class="label_text">Payment method</span>
            <select
              class="label_text"
              name="payment_method"
              bind:value={payMethod}
              required
            >
              <option value="">Select a bank</option>
              {#each banks as bank}
                <option value={bank}>{bank}</option>
              {/each}
            </select>
          </label>
        </div>
        <footer>
          <button type="button" class="ghost" onclick={() => (showPay = false)}
            >Cancel</button
          >
          <button
            type="submit"
            class="primary"
            disabled={!payAmount || !payMethod}>Create</button
          >
        </footer>
      </form>
    </dialog>
  {/if}
</section>

<style>
  h1 {
    margin: 0 0 0.5rem;
  }
  .muted {
    color: #94a3b8;
  }
  .header-actions {
    margin: 0 0 0.75rem;
  }
  .detail {
    display: grid;
    gap: 0.75rem;
  }
  .sect {
    color: #e5e7eb;
    font-weight: 800;
  }
  .grid {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 0.6rem 1rem;
    background: color-mix(in oklab, var(--surface-2), white 4%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.75rem;
    padding: 1rem;
  }
  .label {
    color: #94a3b8;
    font-weight: 700;
  }
  .chip {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
  }
  .chip.unpaid {
    background: rgba(239, 68, 68, 0.2);
  }
  .chip.partially\ paid {
    background: rgba(234, 179, 8, 0.2);
  }
  .chip.fully\ paid {
    background: rgba(34, 197, 94, 0.2);
  }

  .primary {
    appearance: none;
    border: 1px solid color-mix(in oklab, var(--brand), black 35%);
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--brand), white 10%),
      var(--brand)
    );
    color: #0b1220;
    font-weight: 700;
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.2) inset,
      0 8px 20px rgba(59, 130, 246, 0.2);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: color-mix(in oklab, var(--surface-2), black 20%);
    border-color: color-mix(in oklab, var(--surface-2), black 30%);
    color: color-mix(in oklab, var(--text), black 40%);
    box-shadow: none;
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
  .form {
    padding: 1rem;
  }
  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.6rem;
    background: var(--surface-1);
    color: var(--text-1);
    font-size: 1rem;
    cursor: pointer;
  }

  select:focus {
    outline: none;
    border-color: var(--brand);
  }

  select option {
    background: var(--surface-1);
    color: var(--text-1);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 1rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }

  .alert {
    padding: 0.75rem 1rem;
    border-radius: 0.6rem;
    margin-bottom: 1rem;
  }
  .alert.error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }
  .alert.success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #86efac;
  }

  .label_text {
    color: #e5e7eb;
    font-weight: 700;
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
