<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";

  type OrderStock = {
    id: string;
    product_type?: string | null;
    attributes?: Record<string, unknown> | null;
    model_number?: string | null;
    country?: string | null;
    branch?: string | null;
    type?: string | null;
    color?: string | null;
    created_by: string;
    figure?: string | null;
    investors?: string[] | null;
    merchant?: { id: string } | null;
    quantity: number;
    selling_price: number | string;
    thickness?: number | string | null;
    factor?: number | null;
    unit?: string | null;
  };

  type InvestorRow = {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  };

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
    stock?: OrderStock | null;
  };

  function orderQuantityLabel(o: Order) {
    const u = (o.unit ?? o.stock?.unit ?? "").trim();
    return u ? `${o.order_quantity} ${u}` : String(o.order_quantity);
  }

  function reportStockTypeLabel(t: string | null | undefined) {
    if (t === "glass") return "Glass";
    if (t === "brake_lining" || t === "brake_pad" || t === "break_pad")
      return "Brake lining";
    return t && String(t).trim() !== "" ? String(t) : "—";
  }
  const PRODUCT_TYPE_FIELDS: Record<string, string[]> = {
    glass: ["thickness", "color", "figure", "factor"],
    brake_lining: ["model_number", "country"],
  };
  function stockTypeKey(s: OrderStock): string {
    return String(s.type ?? s.product_type ?? "").trim().toLowerCase();
  }
  function stockAttr(s: OrderStock, key: string): string {
    const attrs = s.attributes ?? {};
    const fallback: Record<string, unknown> = {
      model_number: s.model_number,
      country: s.country,
      color: s.color,
      figure: s.figure,
      thickness: s.thickness,
      factor: s.factor,
    };
    return reportDash(attrs[key] ?? fallback[key]);
  }
  function attrLabel(key: string): string {
    if (key === "model_number") return "Model No";
    return key
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }
  const singleType = $derived.by(() => {
    const keys = new Set(orderStocks.map((s) => stockTypeKey(s)));
    return keys.size === 1 ? [...keys][0] : "";
  });
  const dynamicFields = $derived(
    singleType ? (PRODUCT_TYPE_FIELDS[singleType] ?? []) : [],
  );

  function reportDash(v: unknown) {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }
  function formatMoney(v: number | string | null | undefined): string {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^0-9.-]/g, ""))
        : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString()}`;
  }

  let { data, form }: { data: PageData; form?: any } = $props();
  const order = data.order as Order | undefined;
  const investors = (data.investors ?? []) as InvestorRow[];
  const merchantId = data.merchantId as string | undefined;

  /** One row per linked stock today; same shape if orders gain multiple lines later. */
  const orderStocks = $derived(
    order?.stock ? [order.stock as OrderStock] : ([] as OrderStock[]),
  );

  function stockInvestorLabels(stock: OrderStock): string {
    const ids = stock.investors ?? [];
    if (ids.length === 0) return "—";
    return ids
      .map((investorId) => {
        if (investorId === merchantId) return "Myself";
        const inv = investors.find((i) => i.id === investorId);
        return inv
          ? `${inv.first_name} ${inv.last_name}`.trim()
          : "Unknown";
      })
      .join(", ");
  }

  function statusClass(status: string) {
    if (status === "cancelled") return "muted";
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
  let paymentFormPending = $state(false);
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
        disabled={order.status === "paid" || order.status === "cancelled"}
        onclick={() => (showPay = true)}>Pay</button
      >
    </div>
    <div class="detail meta-block">
      <div><span class="sect">Order information</span></div>
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
          <span class="label">Status:</span><span
            class="chip {statusClass(order.status)}">{order.status}</span
          >
        </div>
        <div>
          <span class="label">Total amount:</span><span
            >{formatMoney(order.total_amount)}</span
          >
        </div>
        <div>
          <span class="label">Outstanding:</span><span
            >{formatMoney(order.outstanding_amount)}</span
          >
        </div>
      </div>
    </div>

    <div class="detail stocks-section">
      <div><span class="sect">Stocks ({orderStocks.length})</span></div>
      {#if orderStocks.length > 0}
        <div class="data-table">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                {#if dynamicFields.length > 0}
                  {#each dynamicFields as f}
                    <th>{attrLabel(f)}</th>
                  {/each}
                {:else}
                  <th>Attributes</th>
                {/if}
                <th>Quantity</th>
                <th>Price</th>
                <th>Investors</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each orderStocks as s (s.id)}
                <tr>
                  <td>{reportStockTypeLabel(stockTypeKey(s))}</td>
                  {#if dynamicFields.length > 0}
                    {#each dynamicFields as f}
                      <td>{stockAttr(s, f)}</td>
                    {/each}
                  {:else}
                    <td>
                      {#if s.attributes && Object.keys(s.attributes).length > 0}
                        {Object.entries(s.attributes)
                          .map(([k, v]) => `${attrLabel(k)}: ${v}`)
                          .join(" · ")}
                      {:else}
                        —
                      {/if}
                    </td>
                  {/if}
                  <td>
                    {(s.unit ?? "").trim()
                      ? `${s.quantity} ${(s.unit ?? "").trim()}`
                      : String(s.quantity)}
                  </td>
                  <td>{formatMoney(s.selling_price)}</td>
                  <td class="investors-cell">{stockInvestorLabels(s)}</td>
                  <td class="actions-cell">
                    <a class="stock-link" href="/stocks/{s.id}">View stock</a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="no-data">No stock details loaded for this order.</p>
      {/if}
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
        use:enhance={() => {
          paymentFormPending = true;
          return async ({ update }) => {
            await update();
            paymentFormPending = false;
          };
        }}
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
          <button
            type="button"
            class="ghost"
            onclick={() => (showPay = false)}
            disabled={paymentFormPending}>Cancel</button
          >
          <button
            type="submit"
            class="primary"
            disabled={!payAmount || !payMethod || paymentFormPending}
            >{paymentFormPending ? "Processing…" : "Create"}</button
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
  .meta-block {
    margin-bottom: 0.25rem;
  }
  .stocks-section {
    margin-top: 1.25rem;
  }
  .data-table {
    background: var(--surface-2);
    border-radius: 0.5rem;
    overflow-x: auto;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }
  .data-table table {
    width: 100%;
    border-collapse: collapse;
  }
  .data-table th {
    background: var(--surface-1);
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #e2e8f0;
    font-size: 0.875rem;
  }
  .data-table td {
    padding: 0.5rem 0.75rem;
    color: #cbd5e1;
    font-size: 0.875rem;
    border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }
  .data-table .investors-cell {
    max-width: 12rem;
    white-space: normal;
    word-break: break-word;
  }
  .data-table .actions-cell {
    white-space: nowrap;
  }
  .stock-link {
    color: var(--brand);
    font-weight: 700;
    text-decoration: none;
  }
  .stock-link:hover {
    text-decoration: underline;
  }
  .no-data {
    color: #94a3b8;
    font-style: italic;
    padding: 1rem 0;
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
  .chip.ok {
    background: rgba(34, 197, 94, 0.2);
  }
  .chip.warn {
    background: rgba(234, 179, 8, 0.2);
  }
  .chip.bad {
    background: rgba(239, 68, 68, 0.2);
  }
  .chip.muted {
    background: color-mix(in oklab, #64748b, white 12%);
    color: #cbd5e1;
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
    .data-table table {
      min-width: 720px;
    }
  }
</style>
