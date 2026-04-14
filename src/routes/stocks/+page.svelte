<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  type Investor = {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  };
  type Branch = { id: string; name?: string | null };
  type Stock = {
    id: string;
    model_number?: string | null;
    country?: string | null;
    branch?: string | null;
    /** Branch id this line was transferred from; null = created here. */
    origin?: string | null;
    type?: string | null;
    color?: string | null;
    created_by: string;
    factor?: number | null;
    figure?: string | null;
    investors: string[];
    merchant: {
      id: string;
    };
    purchased_price: number | string | null;
    quantity: number;
    selling_price: number | string | null;
    thickness?: number | null;
    unit?: string | null;
  };

  let { data, form }: { data: PageData; form?: any } = $props();
  let showCreateModal = $state(false);
  let editingStockId = $state<string | null>(null);
  let showDeleteModal = $state(false);
  let showInvestorConfirmModal = $state(false);
  let stockToDelete = $state<Stock | null>(null);
  let stocks = $state(data.stocks);
  let errorMessage = $state("");
  let successMessage = $state("");
  let stockFormPending = $state(false);
  let deleteSubmitting = $state(false);

  const investors = data.investors;
  const branches = data.branches as Branch[];
  const merchantBranchId = data.merchantBranchId as string | null;

  let typeFilter = $state<"all" | "glass" | "brake_lining">("all");

  type SortColumn = "none" | "type" | "country" | "color" | "figure";
  let sortColumn = $state<SortColumn>("none");
  let sortDirection = $state<"asc" | "desc">("asc");

  function sortKey(s: Stock, col: Exclude<SortColumn, "none">): string {
    switch (col) {
      case "type":
        return (s.type?.trim() ?? "").toLowerCase();
      case "country":
        return (s.country?.trim() ?? "").toLowerCase();
      case "color":
        return (s.color?.trim() ?? "").toLowerCase();
      case "figure":
        return (s.figure?.trim() ?? "").toLowerCase();
    }
  }

  function cycleSort(col: Exclude<SortColumn, "none">, e: Event) {
    e.stopPropagation();
    if (sortColumn !== col) {
      sortColumn = col;
      sortDirection = "asc";
      return;
    }
    if (sortDirection === "asc") sortDirection = "desc";
    else {
      sortColumn = "none";
      sortDirection = "asc";
    }
  }

  const filteredStocks = $derived.by(() => {
    let list = stocks;
    if (typeFilter !== "all") {
      list =
        typeFilter === "brake_lining"
          ? list.filter(
              (s: Stock) =>
                s.type === "brake_lining" ||
                s.type === "brake_pad" ||
                s.type === "break_pad",
            )
          : list.filter((s: Stock) => s.type === typeFilter);
    }
    if (sortColumn !== "none") {
      const col = sortColumn;
      list = [...list].sort((a, b) => {
        const cmp = sortKey(a, col).localeCompare(sortKey(b, col));
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }
    return list;
  });

  // Create form state
  let purchasedPrice = $state<number | undefined>(undefined);
  let sellingPrice = $state<number | undefined>(undefined);
  let quantity = $state<number | undefined>(undefined);
  let thickness = $state<number | undefined>(undefined);
  let factor = $state<number | undefined>(undefined);
  let color = $state("");
  let figure = $state("");
  let modelNumber = $state("");
  let country = $state("");
  let selectedBranchId = $state("");
  let stockType = $state<"glass" | "brake_lining">("glass");
  /** Unit of measure (e.g. Pieces, Set, kg) — free text, max 64 chars on server */
  let stockUnit = $state("");
  let selectedInvestorIds = $state<string[]>([]);
  let investorDropdownOpen = $state(false);
  let branchDropdownOpen = $state(false);

  function parseMoneyValue(
    value: number | string | null | undefined,
  ): number | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value === "number")
      return Number.isFinite(value) ? value : undefined;

    // Handles money strings like "$1,234.50" or "ETB 1,234.50"
    const normalized = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function resetForm() {
    purchasedPrice = undefined;
    sellingPrice = undefined;
    quantity = undefined;
    thickness = undefined;
    factor = undefined;
    color = "";
    figure = "";
    modelNumber = "";
    country = "";
    selectedBranchId = "";
    stockType = "glass";
    stockUnit = "Pieces";
    selectedInvestorIds = [];
    investorDropdownOpen = false;
    branchDropdownOpen = false;
    editingStockId = null;
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

  function openCreateModal() {
    resetForm();
    if (merchantBranchId) selectedBranchId = merchantBranchId;
    showCreateModal = true;
  }

  function openEditModal(stock: Stock, event: Event) {
    event.stopPropagation();
    editingStockId = stock.id;
    purchasedPrice = parseMoneyValue(stock.purchased_price);
    sellingPrice = parseMoneyValue(stock.selling_price);
    quantity = Number(stock.quantity);
    thickness =
      stock.thickness != null && String(stock.thickness).trim() !== ""
        ? Number(stock.thickness)
        : undefined;
    factor =
      stock.factor != null && String(stock.factor).trim() !== ""
        ? Number(stock.factor)
        : undefined;
    color = stock.color ?? "";
    figure = stock.figure ?? "";
    modelNumber = stock.model_number ?? "";
    country = stock.country ?? "";
    selectedBranchId = stock.branch ?? "";
    stockType =
      stock.type === "brake_lining" ||
      stock.type === "brake_pad" ||
      stock.type === "break_pad"
        ? "brake_lining"
        : stock.type === "glass"
          ? "glass"
          : "glass";
    stockUnit = (stock.unit ?? "").trim();
    selectedInvestorIds = [];
    investorDropdownOpen = false;
    branchDropdownOpen = false;
    showCreateModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
    resetForm();
  }

  function onSubmitStock(e: Event) {
    // Clear previous messages
    errorMessage = "";
    successMessage = "";

    if (!selectedBranchId) {
      e.preventDefault();
      errorMessage = "Please select a branch";
      return;
    }

    if (!stockUnit.trim()) {
      e.preventDefault();
      errorMessage = "Please enter a unit (e.g. Pieces, Set, Carton)";
      return;
    }

    // Check if no investors are selected
    if (!editingStockId && selectedInvestorIds.length === 0) {
      e.preventDefault(); // Prevent form submission
      showInvestorConfirmModal = true; // Show confirmation dialog
      return;
    }

    // The form will be submitted to the server action naturally
  }

  function confirmAsOwnInvestor() {
    // Set merchant as investor
    selectedInvestorIds = [(data as any).merchantId]; // Use merchant ID as investor
    showInvestorConfirmModal = false;

    // Update the hidden input with the new investor data
    const hiddenInput = document.querySelector(
      'input[name="investors"]',
    ) as HTMLInputElement;
    if (hiddenInput) {
      hiddenInput.value = JSON.stringify(selectedInvestorIds);
    }

    // Submit the form programmatically
    const form = document.querySelector("form.stock-form") as HTMLFormElement;
    if (form) {
      form.requestSubmit();
    }
  }

  function cancelInvestorConfirm() {
    showInvestorConfirmModal = false;
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

  function branchLabel(branchId: string | null | undefined) {
    if (!branchId) return "—";
    const b = branches.find((x) => x.id === branchId);
    if (b?.name) return b.name;
    return branchId.slice(0, 8) + "…";
  }

  function branchPickerLabel(id: string) {
    if (!id) return "Select branch";
    return branchLabel(id);
  }

  function selectBranch(id: string) {
    selectedBranchId = id;
    branchDropdownOpen = false;
  }

  function typeDisplay(t: string | null | undefined) {
    if (t === "glass") return "Glass";
    if (t === "brake_lining" || t === "brake_pad" || t === "break_pad")
      return "Brake lining";
    return t ?? "—";
  }

  function quantityWithUnit(s: Stock) {
    const u = (s.unit ?? "").trim();
    return u ? `${s.quantity} ${u}` : String(s.quantity);
  }

  function dash(v: unknown) {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
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
    if (!stockToDelete || deleteSubmitting) return;

    deleteSubmitting = true;
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
    } finally {
      deleteSubmitting = false;
    }
  }
</script>

<section class="header">
  <div>
    <h1>Stocks</h1>
    <p class="muted">Inventory overview. Click a row to view details.</p>
  </div>
  <div class="header-actions">
    <label class="filter-field">
      <span class="filter-label">Type</span>
      <select class="filter-select" bind:value={typeFilter}>
        <option value="all">All</option>
        <option value="glass">Glass</option>
        <option value="brake_lining">Brake lining</option>
      </select>
    </label>
    <button class="primary" onclick={openCreateModal}>New Stock</button>
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

{#if showCreateModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={closeCreateModal}
    onkeydown={(e) =>
      (e.key === "Enter" || e.key === " ") && closeCreateModal()}
  ></div>
  <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2 style="color: white;">
        {editingStockId ? "Edit Stock" : "Create New Stock"}
      </h2>
      <button class="icon" aria-label="Close" onclick={closeCreateModal}
        >✕</button
      >
    </header>
    <form
      class="form stock-form"
      method="POST"
      action={editingStockId ? "?/updateStock" : "?/createStock"}
      onsubmit={onSubmitStock}
      use:enhance={() => {
        stockFormPending = true;
        return async ({ update }) => {
          await update();
          stockFormPending = false;
        };
      }}
    >
      {#if editingStockId}
        <input type="hidden" name="id" value={editingStockId} />
      {/if}
      <div class="grid">
        <label>
          <span>Type</span>
          <select
            name="type"
            bind:value={stockType}
            required
            class="native-select"
          >
            <option value="glass">Glass</option>
            <option value="brake_lining">Brake lining</option>
          </select>
        </label>
        <label class="unit-field">
          <span>Unit of measure</span>
          <input
            type="text"
            name="unit"
            bind:value={stockUnit}
            required
            maxlength="64"
            autocomplete="off"
            placeholder="Pieces, Set, kg, Carton…"
          />
        </label>
        <div class="field">
          <span style="color: white;">Branch</span>
          <input type="hidden" name="branch" bind:value={selectedBranchId} />
          <div class="multiselect">
            <button
              type="button"
              class="select-trigger"
              onclick={() => (branchDropdownOpen = !branchDropdownOpen)}
            >
              {branchPickerLabel(selectedBranchId)}
            </button>
            {#if branchDropdownOpen}
              <div class="select-menu">
                {#each branches as br}
                  <button
                    type="button"
                    class="option option-btn"
                    style="color: white;"
                    class:option-active={selectedBranchId === br.id}
                    onclick={() => selectBranch(br.id)}
                  >
                    {br.name ?? br.id}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <label>
          <span>Model number</span>
          <input type="text" name="model_number" bind:value={modelNumber} />
        </label>
        <label>
          <span>Country</span>
          <input type="text" name="country" bind:value={country} />
        </label>
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
          />
        </label>
        <label>
          <span>Factor</span>
          <input
            type="number"
            min="0"
            step="0.00001"
            name="factor"
            bind:value={factor}
          />
        </label>
        <label>
          <span>Color</span>
          <input type="text" name="color" bind:value={color} />
        </label>
        <label>
          <span>Figure</span>
          <input type="text" name="figure" bind:value={figure} />
        </label>

        {#if !editingStockId}
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
        {/if}
      </div>
      <footer>
        <button
          type="button"
          class="ghost"
          onclick={closeCreateModal}
          disabled={stockFormPending}>Cancel</button
        >
        <button type="submit" class="primary" disabled={stockFormPending}>
          {stockFormPending
            ? editingStockId
              ? "Updating…"
              : "Creating…"
            : editingStockId
              ? "Update"
              : "Create"}
        </button>
      </footer>
    </form>
  </dialog>
{/if}

{#if showInvestorConfirmModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={cancelInvestorConfirm}
    onkeydown={(e) =>
      (e.key === "Enter" || e.key === " ") && cancelInvestorConfirm()}
  ></div>
  <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2 style="color: white;">Confirm Investor</h2>
      <button class="icon" aria-label="Close" onclick={cancelInvestorConfirm}
        >✕</button
      >
    </header>
    <div class="modal-content">
      <p>You haven't selected any investors. Are you your own investor?</p>
      <p class="info">
        This means you will be the sole investor for this stock item.
      </p>
    </div>
    <footer>
      <button type="button" class="ghost" onclick={cancelInvestorConfirm}
        >Cancel</button
      >
      <button type="button" class="primary" onclick={confirmAsOwnInvestor}
        >Yes, I'm my own investor</button
      >
    </footer>
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
        <p><strong>Type:</strong> {typeDisplay(stockToDelete.type)}</p>
        <p><strong>Branch:</strong> {branchLabel(stockToDelete.branch)}</p>
        <p><strong>Model:</strong> {dash(stockToDelete.model_number)}</p>
        <p><strong>Thickness:</strong> {dash(stockToDelete.thickness)}</p>
        <p><strong>Color:</strong> {dash(stockToDelete.color)}</p>
        <p><strong>Figure:</strong> {dash(stockToDelete.figure)}</p>
        <p><strong>Quantity:</strong> {quantityWithUnit(stockToDelete)}</p>
      </div>
      <p class="warning">This action cannot be undone.</p>
    </div>
    <footer>
      <button
        type="button"
        class="ghost"
        onclick={closeDeleteModal}
        disabled={deleteSubmitting}>Cancel</button
      >
      <button
        type="button"
        class="danger"
        onclick={confirmDelete}
        disabled={deleteSubmitting}
        >{deleteSubmitting ? "Deleting…" : "Delete"}</button
      >
    </footer>
  </dialog>
{/if}

<section class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th
          class="th-sort"
          aria-sort={sortColumn === "type"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <button
            type="button"
            class="sort-header-btn"
            onclick={(e) => cycleSort("type", e)}
            aria-label="Sort by type. Cycles default, A to Z, Z to A, then clear."
            title="Sort by type: default → A–Z → Z–A → default"
          >
            <span class="sort-header-label">Type</span>
            <span class="sort-arrows" aria-hidden="true">
              <span
                class="sort-arrow"
                class:sort-arrow-on={sortColumn === "type" &&
                  sortDirection === "asc"}>▲</span
              >
              <span
                class="sort-arrow"
                class:sort-arrow-on={sortColumn === "type" &&
                  sortDirection === "desc"}>▼</span
              >
            </span>
          </button>
        </th>
        <th>Branch</th>
        <th>Origin</th>
        <th>Model #</th>
        <th
          class="th-sort"
          aria-sort={sortColumn === "country"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <button
            type="button"
            class="sort-header-btn"
            onclick={(e) => cycleSort("country", e)}
            aria-label="Sort by country. Cycles default, A to Z, Z to A, then clear."
            title="Sort by country: default → A–Z → Z–A → default"
          >
            <span class="sort-header-label">Country</span>
            <span class="sort-arrows" aria-hidden="true">
              <span
                class="sort-arrow"
                class:sort-arrow-on={sortColumn === "country" &&
                  sortDirection === "asc"}>▲</span
              >
              <span
                class="sort-arrow"
                class:sort-arrow-on={sortColumn === "country" &&
                  sortDirection === "desc"}>▼</span
              >
            </span>
          </button>
        </th>
        <th>Thickness</th>
        <th
          class="th-sort"
          aria-sort={sortColumn === "color"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <button
            type="button"
            class="sort-header-btn"
            onclick={(e) => cycleSort("color", e)}
            aria-label="Sort by color. Cycles default, A to Z, Z to A, then clear."
            title="Sort by color: default → A–Z → Z–A → default"
          >
            <span class="sort-header-label">Color</span>
            <span class="sort-arrows" aria-hidden="true">
              <span
                class="sort-arrow"
                class:sort-arrow-on={sortColumn === "color" &&
                  sortDirection === "asc"}>▲</span
              >
              <span
                class="sort-arrow"
                class:sort-arrow-on={sortColumn === "color" &&
                  sortDirection === "desc"}>▼</span
              >
            </span>
          </button>
        </th>
        <th
          class="th-sort"
          aria-sort={sortColumn === "figure"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <button
            type="button"
            class="sort-header-btn"
            onclick={(e) => cycleSort("figure", e)}
            aria-label="Sort by figure. Cycles default, A to Z, Z to A, then clear."
            title="Sort by figure: default → A–Z → Z–A → default"
          >
            <span class="sort-header-label">Figure</span>
            <span class="sort-arrows" aria-hidden="true">
              <span
                class="sort-arrow"
                class:sort-arrow-on={sortColumn === "figure" &&
                  sortDirection === "asc"}>▲</span
              >
              <span
                class="sort-arrow"
                class:sort-arrow-on={sortColumn === "figure" &&
                  sortDirection === "desc"}>▼</span
              >
            </span>
          </button>
        </th>
        <th class="right">Quantity</th>
        <th class="center">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredStocks as s}
        <tr
          class="row"
          onclick={() => goto(`/stocks/${s.id}`)}
          tabindex="0"
          role="button"
        >
          <td>{typeDisplay(s.type)}</td>
          <td>{branchLabel(s.branch)}</td>
          <td>{s.origin ? branchLabel(s.origin) : "-"}</td>
          <td>{dash(s.model_number)}</td>
          <td>{dash(s.country)}</td>
          <td>{dash(s.thickness)}</td>
          <td>{dash(s.color)}</td>
          <td>{dash(s.figure)}</td>
          <td class="right">{quantityWithUnit(s)}</td>
          <td class="center">
            <button
              class="edit-btn"
              onclick={(e) => openEditModal(s, e)}
              aria-label="Edit stock"
              title="Edit stock"
            >
              ✏️
            </button>
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
      {#if filteredStocks.length === 0}
        <tr>
          <td colspan="10" class="empty-state">
            <p class="muted">
              {#if stocks.length === 0}
                No stocks found. Create your first stock to get started.
              {:else}
                No stocks match the selected type filter.
              {/if}
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
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .header-actions {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .filter-label {
    color: #94a3b8;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .filter-select {
    min-width: 10rem;
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.6rem;
    padding: 0.55rem 0.7rem;
    font-weight: 600;
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
  .th-sort {
    vertical-align: middle;
    padding: 0.35rem 0.5rem;
  }
  .sort-header-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    margin: 0;
    padding: 0.35rem 0.4rem;
    border: none;
    border-radius: 0.45rem;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
  }
  .sort-header-btn:hover {
    background: color-mix(in oklab, var(--surface-2), white 8%);
    color: #e5e7eb;
  }
  .sort-header-btn:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .sort-header-label {
    flex: 1;
    min-width: 0;
  }
  .sort-arrows {
    display: inline-flex;
    flex-direction: column;
    gap: 0;
    line-height: 0.85;
    font-size: 0.55rem;
    flex-shrink: 0;
  }
  .sort-arrow {
    color: color-mix(in oklab, var(--muted), transparent 55%);
    transition: color 120ms ease;
  }
  .sort-arrow.sort-arrow-on {
    color: var(--brand);
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
    max-height: min(92vh, 880px);
    display: flex;
    flex-direction: column;
    background: color-mix(in oklab, var(--surface), black 2%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.9rem;
    padding: 0;
    z-index: 40;
    overflow: hidden;
  }
  .modal .form {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .unit-field input {
    border-color: color-mix(in oklab, var(--brand), white 35%);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--brand), transparent 70%);
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
  .select-trigger,
  .native-select {
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.6rem;
    padding: 0.55rem 0.7rem;
  }
  .native-select {
    cursor: pointer;
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
  .option-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    width: 100%;
    display: block;
  }
  .option-active {
    background: color-mix(in oklab, var(--brand), black 70%);
    color: #0b1220;
    font-weight: 700;
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

  .edit-btn {
    background: transparent;
    border: none;
    color: #f59e0b;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: background-color 0.2s;
    margin-right: 0.4rem;
  }

  .edit-btn:hover {
    background: color-mix(in oklab, #f59e0b, white 90%);
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
  .info {
    color: #94a3b8;
    font-size: 0.9rem;
    margin: 0.5rem 0 0;
    font-style: italic;
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
