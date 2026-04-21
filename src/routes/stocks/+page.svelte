<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { formatCoffeeCapacityWithUnit } from "$lib/stockLabel";
  import type { PageData } from "./$types";

  type Investor = {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  };
  type Branch = { id: string; name?: string | null };
  type ProductType = { id: string; name?: string | null };
  type Stock = {
    id: string;
    product_type?: ProductType | null;
    attributes?: Record<string, unknown> | null;
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
  const productTypes = (data.productTypes ?? []) as ProductType[];
  const merchantBranchId = data.merchantBranchId as string | null;

  const PRODUCT_TYPE_FIELDS: Record<string, string[]> = {
    glass: ["thickness", "color", "figure", "factor"],
    brake_lining: ["model_number", "country"],
    coffee_tools: ["name", "capacity", "capacity_unit"],
  };

  let typeFilter = $state<string>("all");

  type SortColumn = "none" | "type";
  let sortColumn = $state<SortColumn>("none");
  let sortDirection = $state<"asc" | "desc">("asc");
  let listStateReady = $state(false);

  const STOCK_LIST_STATE_KEY = "stocks:list-state:v1";
  const SORT_COLUMNS: SortColumn[] = ["none", "type"];

  function isSortColumn(v: string | null): v is SortColumn {
    return v != null && (SORT_COLUMNS as string[]).includes(v);
  }

  function isSortDirection(v: string | null): v is "asc" | "desc" {
    return v === "asc" || v === "desc";
  }

  function typeFromStock(s: Stock): string {
    return String(s.product_type?.name ?? s.type ?? "")
      .trim()
      .toLowerCase();
  }

  function isTypeFilter(v: string | null): v is string {
    if (v == null) return false;
    if (v === "all") return true;
    const names = new Set(
      productTypes.map((p) =>
        String(p.name ?? "")
          .trim()
          .toLowerCase(),
      ),
    );
    for (const n of Object.keys(PRODUCT_TYPE_FIELDS)) names.add(n);
    return names.has(v);
  }

  function applyListStateFromParams(params: URLSearchParams) {
    const nextType = params.get("type");
    const nextSort = params.get("sort");
    const nextDir = params.get("dir");

    typeFilter = isTypeFilter(nextType) ? nextType : "all";
    sortColumn = isSortColumn(nextSort) ? nextSort : "none";
    sortDirection = isSortDirection(nextDir) ? nextDir : "asc";
  }

  function currentListStateParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (sortColumn !== "none") {
      params.set("sort", sortColumn);
      params.set("dir", sortDirection);
    }
    return params;
  }

  function currentListQueryString(): string {
    const q = currentListStateParams().toString();
    return q ? `?${q}` : "";
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const hasListStateInUrl =
      params.has("type") || params.has("sort") || params.has("dir");

    if (hasListStateInUrl) {
      applyListStateFromParams(params);
    } else {
      try {
        const raw = window.sessionStorage.getItem(STOCK_LIST_STATE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            type?: string;
            sort?: string;
            dir?: string;
          };
          const fallbackParams = new URLSearchParams();
          if (typeof parsed.type === "string")
            fallbackParams.set("type", parsed.type);
          if (typeof parsed.sort === "string")
            fallbackParams.set("sort", parsed.sort);
          if (typeof parsed.dir === "string")
            fallbackParams.set("dir", parsed.dir);
          applyListStateFromParams(fallbackParams);
        }
      } catch {
        // Ignore bad persisted state and use defaults.
      }
    }

    listStateReady = true;
  });

  $effect(() => {
    if (!listStateReady) return;

    const params = currentListStateParams();
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);

    window.sessionStorage.setItem(
      STOCK_LIST_STATE_KEY,
      JSON.stringify({
        type: typeFilter,
        sort: sortColumn,
        dir: sortDirection,
      }),
    );
  });

  function sortKey(s: Stock, col: Exclude<SortColumn, "none">): string {
    switch (col) {
      case "type":
        return typeFromStock(s);
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
      list = list.filter((s: Stock) => typeFromStock(s) === typeFilter);
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
  let selectedProductTypeId = $state("");
  let selectedProductTypeName = $state("");
  let attributes = $state<Record<string, string>>({});
  let selectedBranchId = $state("");
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

  function formatMoneyValue(value: number | string | null | undefined): string {
    const parsed = parseMoneyValue(value) ?? 0;
    const amount = parsed.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return `ETB ${amount}`;
  }

  function resetForm() {
    purchasedPrice = undefined;
    sellingPrice = undefined;
    quantity = undefined;
    selectedProductTypeId = "";
    selectedProductTypeName = "";
    attributes = {};
    selectedBranchId = "";
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
    const pTypeName = typeFromStock(stock);
    const pTypeId =
      stock.product_type?.id ??
      productTypes.find(
        (p) =>
          String(p.name ?? "")
            .trim()
            .toLowerCase() === pTypeName,
      )?.id ??
      "";
    selectedProductTypeId = pTypeId;
    selectedProductTypeName = pTypeName;
    attributes = buildAttributesForEdit(stock, pTypeName);
    selectedBranchId = stock.branch ?? "";
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
    if (!selectedProductTypeId || !selectedProductTypeName) {
      e.preventDefault();
      errorMessage = "Please select a product type";
      return;
    }

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
    const x = String(t ?? "").trim();
    if (!x) return "—";
    if (x === "brake_lining" || x === "brake_pad" || x === "break_pad")
      return "Brake lining";
    return x.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }
  function attributeLabel(key: string): string {
    if (key === "model_number") return "Model No";
    if (key === "capacity_unit") return "Capacity unit";
    return key.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function currentTypeFields(): string[] {
    return PRODUCT_TYPE_FIELDS[selectedProductTypeName] ?? [];
  }

  function productTypeLabel(s: Stock): string {
    return typeDisplay(typeFromStock(s));
  }

  function attrValue(s: Stock, key: string): string {
    if (typeFromStock(s) === "coffee_tools" && key === "capacity") {
      const merged = formatCoffeeCapacityWithUnit(s.attributes);
      if (merged) return merged;
    }
    const attrs = s.attributes ?? {};
    const fallback: Record<string, unknown> = {
      thickness: s.thickness,
      factor: s.factor,
      color: s.color,
      figure: s.figure,
      model_number: s.model_number,
      country: s.country,
    };
    const v = attrs?.[key] ?? fallback[key];
    return dash(v as unknown);
  }

  /** Mixed-type attributes column: show capacity + unit as one value for coffee_tools. */
  function attributeEntriesForList(s: Stock): [string, unknown][] {
    const attrs = s.attributes ?? {};
    if (typeFromStock(s) !== "coffee_tools") {
      return Object.entries(attrs);
    }
    const merged = formatCoffeeCapacityWithUnit(attrs);
    const out: [string, unknown][] = [];
    let mergedShown = false;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "capacity" || k === "capacity_unit") {
        if (!mergedShown && merged) {
          out.push(["capacity", merged]);
          mergedShown = true;
        }
        continue;
      }
      out.push([k, v]);
    }
    if (!mergedShown && merged) {
      out.push(["capacity", merged]);
    }
    return out;
  }

  /** Single attribute value for forms: JSONB first, then legacy column. */
  function attrFieldString(stock: Stock, key: string): string {
    const attrs = stock.attributes ?? {};
    const fallback: Record<string, unknown> = {
      thickness: stock.thickness,
      factor: stock.factor,
      color: stock.color,
      figure: stock.figure,
      model_number: stock.model_number,
      country: stock.country,
    };
    const v = attrs[key] ?? fallback[key];
    if (v == null || v === "") return "";
    return String(v).trim();
  }

  /**
   * Edit modal: preserve every key already in `attributes`, then ensure configured
   * fields for this type are filled from attributes or legacy columns.
   */
  function buildAttributesForEdit(
    stock: Stock,
    typeKey: string,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    const attrs = stock.attributes ?? {};
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs)) {
        if (!k.trim()) continue;
        if (v == null || v === "") continue;
        out[k] = String(v).trim();
      }
    }
    const fieldNames = PRODUCT_TYPE_FIELDS[typeKey] ?? [];
    for (const key of fieldNames) {
      out[key] = attrFieldString(stock, key);
    }
    return out;
  }

  const isSingleTypeFilter = $derived(typeFilter !== "all");
  const activeFields = $derived.by(() => {
    if (!isSingleTypeFilter) return [];
    const fields = PRODUCT_TYPE_FIELDS[typeFilter] ?? [];
    if (typeFilter === "coffee_tools") {
      return fields.filter((k) => k !== "capacity_unit");
    }
    return fields;
  });

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
        {#each productTypes as pt}
          {#if pt.name}
            <option value={String(pt.name).trim().toLowerCase()}>
              {typeDisplay(pt.name)}
            </option>
          {/if}
        {/each}
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
      <input
        type="hidden"
        name="product_type_name"
        value={selectedProductTypeName}
      />
      <input
        type="hidden"
        name="attributes"
        value={JSON.stringify(attributes)}
      />
      <div class="grid">
        <label>
          <span>Product type</span>
          <select
            name="product_type"
            bind:value={selectedProductTypeId}
            required
            class="native-select"
            onchange={() => {
              const found = productTypes.find(
                (p) => p.id === selectedProductTypeId,
              );
              selectedProductTypeName = String(found?.name ?? "")
                .trim()
                .toLowerCase();
              if (!editingStockId) {
                attributes = {};
              } else {
                const keys = PRODUCT_TYPE_FIELDS[selectedProductTypeName] ?? [];
                const next: Record<string, string> = {};
                for (const k of keys) {
                  next[k] = attributes[k] ?? "";
                }
                attributes = next;
              }
            }}
          >
            <option value="">Select product type</option>
            {#each productTypes as pt}
              <option value={pt.id}>{typeDisplay(pt.name ?? "")}</option>
            {/each}
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
        {#each currentTypeFields() as fieldName}
          <label>
            <span>{attributeLabel(fieldName)}</span>
            <input type="text" bind:value={attributes[fieldName]} />
          </label>
        {/each}
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
        <p><strong>Type:</strong> {productTypeLabel(stockToDelete)}</p>
        <p><strong>Branch:</strong> {branchLabel(stockToDelete.branch)}</p>
        <p>
          <strong>Attributes:</strong>
          {#if stockToDelete.attributes && Object.keys(stockToDelete.attributes).length > 0}
            <span class="attr-stack">
              {#each attributeEntriesForList(stockToDelete) as [k, v]}
                <span>{attributeLabel(k)}: {v}</span>
              {/each}
            </span>
          {:else}
            —
          {/if}
        </p>
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
        {#if isSingleTypeFilter}
          {#each activeFields as field}
            <th>{attributeLabel(field)}</th>
          {/each}
        {:else}
          <th>Attributes</th>
        {/if}
        <th>Price</th>
        <th class="right">Quantity</th>
        <th class="center">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredStocks as s}
        <tr
          class="row"
          onclick={() => goto(`/stocks/${s.id}${currentListQueryString()}`)}
          tabindex="0"
          role="button"
        >
          <td>{productTypeLabel(s)}</td>
          <td>{branchLabel(s.branch)}</td>
          <td>{s.origin ? branchLabel(s.origin) : "-"}</td>
          {#if isSingleTypeFilter}
            {#each activeFields as field}
              <td>{attrValue(s, field)}</td>
            {/each}
          {:else}
            <td>
              {#if s.attributes && Object.keys(s.attributes).length > 0}
                <div class="attr-stack">
                  {#each attributeEntriesForList(s) as [k, v]}
                    <div class="attr-row">
                      <span class="attr-key">{attributeLabel(k)}</span>
                      <span class="attr-sep">:</span>
                      <span class="attr-val">{v}</span>
                    </div>
                  {/each}
                </div>
              {:else}
                —
              {/if}
            </td>
          {/if}
          <td>{formatMoneyValue(s.selling_price)}</td>
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
          <td
            colspan={isSingleTypeFilter ? 7 + activeFields.length : 9}
            class="empty-state"
          >
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
  .attr-stack {
    display: inline-flex;
    flex-direction: column;
    gap: 0.38rem;
    margin-left: 0.25rem;
  }
  .attr-row {
    display: inline-flex;
    align-items: baseline;
    column-gap: 0.35rem;
  }
  .attr-key {
    font-weight: 600;
    font-size: 0.88em;
  }
  .attr-sep {
    opacity: 0.75;
    margin: 0 0.15rem;
  }
  .attr-val {
    font-size: 0.88em;
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
