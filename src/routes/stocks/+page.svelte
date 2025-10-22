<script lang="ts">
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  type Investor = {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  };
  type Stock = {
    id: string;
    color: string;
    created_by: string;
    figure: string;
    investors: string[];
    merchant: {
      id: string;
    };
    quantity: number;
    selling_price: number;
    thickness: string;
  };

  let { data, form }: { data: PageData; form?: any } = $props();
  let showCreateModal = $state(false);
  let showDeleteModal = $state(false);
  let stockToDelete = $state<Stock | null>(null);
  let stocks = $state(data.stocks);
  let errorMessage = $state("");
  let successMessage = $state("");

  const investors = data.investors;

  // Create form state
  let purchasedPrice = $state<number | undefined>(undefined);
  let sellingPrice = $state<number | undefined>(undefined);
  let quantity = $state<number | undefined>(undefined);
  let thickness = $state<number | undefined>(undefined);
  let factor = $state<number | undefined>(undefined);
  let color = $state("");
  let figure = $state("");
  let selectedInvestorIds = $state<string[]>([]);
  let investorDropdownOpen = $state(false);

  function resetForm() {
    purchasedPrice = undefined;
    sellingPrice = undefined;
    quantity = undefined;
    thickness = undefined;
    factor = undefined;
    color = "";
    figure = "";
    selectedInvestorIds = [];
    investorDropdownOpen = false;
  }

  // Handle form response
  $effect(() => {
    if (form) {
      if (form.success) {
        successMessage = form.message;
        errorMessage = "";
        showCreateModal = false;
        resetForm();
        // Refresh the page to show new stock
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        errorMessage = form.message;
        successMessage = "";
      }
    }
  });

  function onSubmitCreate(e: Event) {
    // Clear previous messages
    errorMessage = "";
    successMessage = "";
    // The form will be submitted to the server action naturally
  }

  function toggleInvestor(id: string) {
    if (selectedInvestorIds.includes(id)) {
      selectedInvestorIds = selectedInvestorIds.filter((x) => x !== id);
    } else {
      selectedInvestorIds = [...selectedInvestorIds, id];
    }
  }
  function investorLabel(ids: string[]) {
    if (ids.length === 0) return "Select investors";
    const names = investors
      .filter((i: Investor) => ids.includes(i.id))
      .map((i: Investor) => `${i.first_name} ${i.last_name}`);
    return names.join(", ");
  }

  function openDeleteModal(stock: Stock, event: Event) {
    event.stopPropagation();
    stockToDelete = stock;
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    showDeleteModal = false;
    stockToDelete = null;
  }

  async function confirmDelete() {
    if (!stockToDelete) return;

    try {
      const formData = new FormData();
      formData.append("stockId", stockToDelete.id);

      const response = await fetch("?/deleteStock", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.type === "success") {
        // Remove the stock from the local state
        stocks = stocks.filter((s: Stock) => s.id !== stockToDelete!.id);
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
      errorMessage = "Failed to delete stock. Please try again.";
      successMessage = "";
    }
  }
</script>

<section class="header">
  <div>
    <h1>Stocks</h1>
    <p class="muted">Inventory overview. Click a row to view details.</p>
  </div>
  <button class="primary" onclick={() => (showCreateModal = true)}
    >New Stock</button
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

{#if showCreateModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => (showCreateModal = false)}
    onkeydown={(e) =>
      (e.key === "Enter" || e.key === " ") && (showCreateModal = false)}
  ></div>
  <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>Create New Stock</h2>
      <button
        class="icon"
        aria-label="Close"
        onclick={() => (showCreateModal = false)}>✕</button
      >
    </header>
    <form
      class="form"
      method="POST"
      action="?/createStock"
      onsubmit={onSubmitCreate}
    >
      <div class="grid">
        <label>
          <span>Purchased price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            name="purchased_price"
            bind:value={purchasedPrice}
            required
          />
        </label>
        <label>
          <span>Selling price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            name="selling_price"
            bind:value={sellingPrice}
            required
          />
        </label>
        <label>
          <span>Quantity</span>
          <input
            type="number"
            min="0"
            step="1"
            name="quantity"
            bind:value={quantity}
            required
          />
        </label>
        <label>
          <span>Thickness</span>
          <input
            type="number"
            min="0"
            step="0.01"
            name="thickness"
            bind:value={thickness}
            required
          />
        </label>
        <label>
          <span>Factor</span>
          <input
            type="number"
            min="1"
            step="0.00001"
            name="factor"
            bind:value={factor}
            required
          />
        </label>
        <label>
          <span>Color</span>
          <input type="text" name="color" bind:value={color} required />
        </label>
        <label>
          <span>Figure</span>
          <input type="text" name="figure" bind:value={figure} required />
        </label>

        <div class="field">
          <span>Investors</span>
          <input
            type="hidden"
            name="investors"
            value={JSON.stringify(selectedInvestorIds)}
          />
          <div class="multiselect">
            <button
              type="button"
              class="select-trigger"
              onclick={() => (investorDropdownOpen = !investorDropdownOpen)}
            >
              {investorLabel(selectedInvestorIds)}
            </button>
            {#if investorDropdownOpen}
              <div class="select-menu">
                {#each investors as inv}
                  <label class="option">
                    <input
                      type="checkbox"
                      checked={selectedInvestorIds.includes(inv.id)}
                      onchange={() => toggleInvestor(inv.id)}
                    />
                    <span>{inv.first_name} {inv.last_name}</span>
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
      <footer>
        <button
          type="button"
          class="ghost"
          onclick={() => (showCreateModal = false)}>Cancel</button
        >
        <button type="submit" class="primary">Create</button>
      </footer>
    </form>
  </dialog>
{/if}

{#if showDeleteModal && stockToDelete}
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
      <h2 style="color: white;">Delete Stock</h2>
      <button class="icon" aria-label="Close" onclick={closeDeleteModal}
        >✕</button
      >
    </header>
    <div class="modal-content">
      <p>Are you sure you want to delete this stock?</p>
      <div class="stock-details">
        <p><strong>Thickness:</strong> {stockToDelete.thickness}</p>
        <p><strong>Color:</strong> {stockToDelete.color}</p>
        <p><strong>Figure:</strong> {stockToDelete.figure}</p>
        <p><strong>Quantity:</strong> {stockToDelete.quantity}</p>
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
        <th>Thickness</th>
        <th>Color</th>
        <th>Figure</th>
        <th class="right">Quantity</th>
        <th class="center">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each stocks as s}
        <tr
          class="row"
          onclick={() => goto(`/stocks/${s.id}`)}
          tabindex="0"
          role="button"
        >
          <td>{s.thickness}</td>
          <td>{s.color}</td>
          <td>{s.figure}</td>
          <td class="right">{s.quantity}</td>
          <td class="center">
            <button
              class="delete-btn"
              onclick={(e) => openDeleteModal(s, e)}
              aria-label="Delete stock"
              title="Delete stock"
            >
              🗑️
            </button>
          </td>
        </tr>
      {/each}
      {#if stocks.length === 0}
        <tr>
          <td colspan="5" class="empty-state">
            <p class="muted">
              No stocks found. Create your first stock to get started.
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
    gap: 1rem;
    margin-bottom: 1rem;
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
  .ghost {
    appearance: none;
    background: transparent;
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
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
  td {
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
  }
  .right {
    text-align: right;
  }
  .center {
    text-align: center;
  }
  .row {
    cursor: pointer;
  }
  .empty-state {
    text-align: center;
    padding: 2rem;
  }
  .empty-state p {
    margin: 0;
    font-style: italic;
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
  .form {
    padding: 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  label span {
    color: #94a3b8;
    font-weight: 600;
  }
  input,
  .select-trigger {
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.6rem;
    padding: 0.55rem 0.7rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .multiselect {
    position: relative;
  }
  .select-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: color-mix(in oklab, var(--surface-2), white 2%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.6rem;
    padding: 0.4rem;
    display: grid;
    gap: 0.35rem;
    z-index: 50;
  }
  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.45rem 0.6rem;
    border-radius: 0.5rem;
    width: 100%;
  }
  .option:hover {
    background: color-mix(in oklab, var(--surface-2), white 6%);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 1rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
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

  .modal-content {
    padding: 1rem;
    color: white;
  }

  .stock-details {
    background: color-mix(in oklab, var(--surface-2), white 2%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.5rem;
    padding: 0.75rem;
    margin: 0.75rem 0;
  }

  .stock-details p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }

  .warning {
    color: #ef4444;
    font-weight: 600;
    font-size: 0.9rem;
    margin: 0.75rem 0 0;
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
