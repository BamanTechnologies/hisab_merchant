<script lang="ts">
  import { deserialize } from "$app/forms";
  import type { PageData } from "./$types";

  type ExpenseRow = PageData["expenses"][number];

  let { data }: { data: PageData } = $props();

  let expenses = $state(data.expenses as ExpenseRow[]);
  let totalExpenseAmount = $state(data.totalExpenseAmount);

  $effect(() => {
    expenses = data.expenses as ExpenseRow[];
    totalExpenseAmount = data.totalExpenseAmount;
  });

  let showModal = $state(false);
  let submitting = $state(false);
  let formError = $state("");
  let sentTo = $state("");
  let category = $state("");
  let paymentType = $state("");
  let amount = $state("");
  let note = $state("");
  let receipt = $state("");

  const paymentTypes = data.paymentTypes ?? [];
  const categories = data.categories ?? [];

  function paymentLabel(p: string) {
    if (p === "bank transfer") return "Bank transfer";
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  function categoryLabel(c: string) {
    return c.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function formatDate(iso: string) {
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

  function receiptPreview(text: string | null | undefined, max = 48) {
    if (text == null || String(text).trim() === "") return "—";
    const s = String(text).trim().replace(/\s+/g, " ");
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }

  function openModal() {
    formError = "";
    sentTo = "";
    category = categories[0] ?? "";
    paymentType = paymentTypes[0] ?? "";
    amount = "";
    note = "";
    receipt = "";
    showModal = true;
  }

  function closeModal() {
    showModal = false;
  }

  async function submitExpense(e: Event) {
    e.preventDefault();
    if (submitting) return;
    formError = "";
    if (!data.merchantBranchId) {
      formError = "No branch assigned; cannot save.";
      return;
    }
    submitting = true;
    try {
      const fd = new FormData();
      fd.append("sent_to", sentTo.trim());
      fd.append("category", category);
      fd.append("payment_type", paymentType);
      fd.append("amount", String(amount));
      fd.append("note", note.trim());
      fd.append("receipt", receipt.trim());

      const response = await fetch("?/createExpense", {
        method: "POST",
        body: fd,
      });

      const result = deserialize(await response.text());
      if (result.type !== "success" || !("data" in result) || !result.data) {
        formError = "Request failed";
        return;
      }
      const payload = result.data as { success?: boolean; message?: string };
      if (!payload.success) {
        formError = payload.message ?? "Could not save";
        return;
      }
      closeModal();
      window.location.reload();
    } catch {
      formError = "Request failed";
    } finally {
      submitting = false;
    }
  }
</script>

<section class="header">
  <div>
    <h1>Expenses</h1>
    <p class="muted">Branch expenses for your assigned location.</p>
  </div>
  <div class="header-right">
    <div class="total-pill" aria-live="polite">
      <span class="total-label">Total expense</span>
      <span class="total-value"
        >Birr {totalExpenseAmount.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}</span
      >
    </div>
    <button
      type="button"
      class="primary"
      onclick={openModal}
      disabled={!data.merchantBranchId}
      title={!data.merchantBranchId
        ? "Assign a branch to your account to record expenses"
        : ""}
    >
      Create expense
    </button>
  </div>
</section>

{#if !data.merchantBranchId}
  <p class="warn">
    Your account has no branch assigned, so expenses cannot be loaded or created.
  </p>
{/if}

{#if formError && !showModal}
  <div class="alert error">
    <p>{formError}</p>
  </div>
{/if}

<section class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Sent to</th>
        <th>Category</th>
        <th>Payment</th>
        <th class="right">Amount</th>
        <th>Note</th>
        <th>Receipt</th>
        <th>Recorded by</th>
      </tr>
    </thead>
    <tbody>
      {#each expenses as ex}
        <tr class="row">
          <td class="nowrap">{formatDate(ex.created_at)}</td>
          <td>{ex.sent_to}</td>
          <td>{categoryLabel(ex.category)}</td>
          <td>{paymentLabel(ex.payment_type)}</td>
          <td class="right amount"
            >Birr {ex.amount.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}</td
          >
          <td class="note-cell">{ex.note?.trim() ? ex.note : "—"}</td>
          <td class="receipt-cell" title={ex.receipt ?? ""}
            >{receiptPreview(ex.receipt)}</td
          >
          <td>{ex.created_by_name}</td>
        </tr>
      {/each}
      {#if expenses.length === 0 && data.merchantBranchId}
        <tr>
          <td colspan="8" class="empty-state">
            <p class="muted">No expenses yet. Create one to get started.</p>
          </td>
        </tr>
      {/if}
      {#if !data.merchantBranchId}
        <tr>
          <td colspan="8" class="empty-state">
            <p class="muted">Assign a branch to your account to see expenses.</p>
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</section>

{#if showModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={closeModal}
    onkeydown={(e) =>
      (e.key === "Enter" || e.key === " ") && closeModal()}
  ></div>
  <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
    <header class="modal-head">
      <h2>Create expense</h2>
      <button type="button" class="icon-close" onclick={closeModal} aria-label="Close"
        >✕</button
      >
    </header>
    <form class="modal-body" onsubmit={submitExpense}>
      {#if formError}
        <p class="inline-error">{formError}</p>
      {/if}

      <label class="field">
        <span>Sent to (name)</span>
        <input
          type="text"
          name="sent_to"
          bind:value={sentTo}
          required
          autocomplete="name"
          placeholder="Who received the payment"
        />
      </label>

      <label class="field">
        <span>Category</span>
        <select bind:value={category} required class="native-select">
          {#each categories as c}
            <option value={c}>{categoryLabel(c)}</option>
          {/each}
        </select>
      </label>

      <label class="field">
        <span>Payment type</span>
        <select bind:value={paymentType} required class="native-select">
          {#each paymentTypes as p}
            <option value={p}>{paymentLabel(p)}</option>
          {/each}
        </select>
      </label>

      <label class="field">
        <span>Amount (Birr)</span>
        <input
          type="number"
          name="amount"
          bind:value={amount}
          min="0.01"
          step="any"
          required
          placeholder="0"
        />
      </label>

      <label class="field">
        <span>Note</span>
        <textarea
          name="note"
          bind:value={note}
          rows="3"
          placeholder="Optional details"
        ></textarea>
      </label>

      <label class="field">
        <span>Receipt (optional)</span>
        <textarea
          name="receipt"
          bind:value={receipt}
          rows="2"
          placeholder="Reference, URL, or short description"
        ></textarea>
      </label>

      <footer class="modal-foot">
        <button
          type="button"
          class="ghost"
          onclick={closeModal}
          disabled={submitting}>Cancel</button
        >
        <button type="submit" class="primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save expense"}
        </button>
      </footer>
    </form>
  </dialog>
{/if}

<style>
  h1 {
    margin: 0 0 0.25rem;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
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
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .total-pill {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 0.5rem 0.85rem;
    border-radius: 0.65rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), white 4%);
  }
  .total-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
    font-weight: 700;
  }
  .total-value {
    font-size: 1.2rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #fecaca;
  }
  .primary {
    appearance: none;
    background: var(--brand, #3b82f6);
    color: #0b1220;
    border: none;
    font-weight: 700;
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
  }
  .primary:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .ghost {
    appearance: none;
    background: transparent;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 18%);
    color: #e2e8f0;
    padding: 0.45rem 0.85rem;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 600;
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
  .amount {
    font-weight: 600;
  }
  .note-cell,
  .receipt-cell {
    max-width: 12rem;
    font-size: 0.88rem;
    color: #cbd5e1;
  }
  td {
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
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
  .alert.error {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid #f87171;
    background: color-mix(in oklab, #ef4444, transparent 88%);
    color: #fecaca;
  }
  .alert p {
    margin: 0;
  }
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.55);
  }
  .modal {
    position: fixed;
    z-index: 50;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(26rem, calc(100vw - 2rem));
    max-height: min(90vh, 640px);
    overflow: auto;
    margin: 0;
    padding: 0;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.75rem;
    background: var(--surface-1, #0f172a);
    color: #e5e7eb;
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }
  .icon-close {
    appearance: none;
    border: none;
    background: transparent;
    color: #94a3b8;
    font-size: 1.25rem;
    cursor: pointer;
    line-height: 1;
  }
  .modal-body {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: #cbd5e1;
  }
  .field input,
  .field textarea {
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    font: inherit;
  }
  .native-select {
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    font: inherit;
    cursor: pointer;
  }
  .inline-error {
    color: #fca5a5;
    font-size: 0.9rem;
    margin: 0;
  }
  .modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
    padding-top: 0.75rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
  }
</style>
