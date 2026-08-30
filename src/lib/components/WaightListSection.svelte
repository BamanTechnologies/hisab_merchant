<script lang="ts">
  import { browser } from "$app/environment";
  import { mc } from "$lib/merchant-styles.js";
  import { showToast } from "$lib/toast";
  import SearchSelect from "$lib/components/ui/search-select/search-select.svelte";
  import { buildProductLabel } from "$lib/inventory/productLabel";

  type WaightListItem = {
    id: string;
    product_id: string;
    customer_id: string;
    quantity?: number | string | null;
    status?: string | null;
    is_reminder_sent?: boolean | null;
    allow_for_reminder?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
    product?: {
      id: string;
      name?: string | null;
      is_low_stock?: boolean | null;
      default_unit?: string | null;
      product_type?: { id: string; name?: string | null } | null;
    } | null;
    customer?: {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      phone_number?: string | null;
      address?: string | null;
    } | null;
  };

  type Props = {
    customerId?: string;
    productId?: string;
    companyId: string;
    merchantBranchId: string;
    title?: string;
  };

  let {
    customerId = "",
    productId = "",
    companyId,
    merchantBranchId,
    title = "Waight List",
  }: Props = $props();

  let rows = $state<WaightListItem[]>([]);
  let loading = $state(true);
  let error = $state("");
  let selectedIds = $state<string[]>([]);

  let showFormModal = $state(false);
  let editing: WaightListItem | null = $state(null);
  let formSubmitting = $state(false);
  let formError = $state("");

  let formProductId = $state("");
  let formCustomerId = $state("");
  let formQuantity = $state<string>("");
  let formStatus = $state("on_waight");
  let formAllowForReminder = $state(true);
  let formIsReminderSent = $state(false);

  let showDeleteModal = $state(false);
  let deleting: WaightListItem | null = $state(null);
  let deleteSubmitting = $state(false);

  let sendingReminder = $state(false);
  let showReminderModal = $state(false);

  const isCustomerDetail = $derived(Boolean(customerId));
  const isProductDetail = $derived(Boolean(productId));

  function getToken(): string | null {
    return browser ? localStorage.getItem("authToken") : null;
  }

  async function api(
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string; data?: any }> {
    const token = getToken();
    if (!token) return { ok: false, error: "No auth token found." };
    try {
      const res = await fetch("/api/waight-lists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        return { ok: false, error: result?.error ?? "Request failed" };
      }
      return { ok: true, data: result };
    } catch {
      return { ok: false, error: "Request failed" };
    }
  }

  async function load() {
    loading = true;
    error = "";
    const res = await api({
      action: "list",
      customerId: customerId || undefined,
      productId: productId || undefined,
      limit: 200,
      offset: 0,
    });
    if (!res.ok) {
      error = res.error ?? "Failed to load waight list.";
      rows = [];
    } else {
      rows = res.data?.rows ?? [];
    }
    selectedIds = [];
    loading = false;
  }

  $effect(() => {
    loading = true;
    void load();
  });

  function fullName(c: WaightListItem["customer"]) {
    const parts = [c?.first_name, c?.last_name].filter(Boolean);
    return parts.join(" ").trim() || "—";
  }

  function productLabel(p: WaightListItem["product"]): string {
    if (!p) return "—";
    if (p.name && String(p.name).trim() !== "") {
      return String(p.name).trim();
    }
    return buildProductLabel(p as any);
  }

  function productUnit(p: WaightListItem["product"]): string {
    return String(p?.default_unit ?? "").trim();
  }

  function statusLabel(status?: string | null): string {
    const s = String(status ?? "").trim().toLowerCase();
    if (s === "on_waight") return "On Waight";
    if (s === "addressed") return "Addressed";
    if (s === "rejected") return "Rejected";
    return s || "—";
  }

  function formatDate(iso?: string | null): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString(undefined, {
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

  const selectableRows = $derived(rows.filter((r) => r.allow_for_reminder === true));
  const allSelectableChecked = $derived(
    selectableRows.length > 0 &&
      selectableRows.every((r) => selectedIds.includes(r.id)),
  );

  function toggleSelect(id: string) {
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((x) => x !== id);
    } else {
      selectedIds = [...selectedIds, id];
    }
  }

  function toggleSelectAll() {
    if (allSelectableChecked) {
      selectedIds = [];
    } else {
      selectedIds = selectableRows.map((r) => r.id);
    }
  }

  // ---------- Add / Edit ----------
  function openAdd() {
    editing = null;
    formProductId = "";
    formCustomerId = "";
    formQuantity = "";
    formStatus = "on_waight";
    formAllowForReminder = true;
    formIsReminderSent = false;
    formError = "";
    showFormModal = true;
  }

  function openEdit(row: WaightListItem) {
    editing = row;
    formProductId = row.product_id;
    formCustomerId = row.customer_id;
    formQuantity = row.quantity != null ? String(row.quantity) : "";
    formStatus = String(row.status ?? "on_waight");
    formAllowForReminder = row.allow_for_reminder !== false;
    formIsReminderSent = row.is_reminder_sent === true;
    formError = "";
    showFormModal = true;
  }

  function closeForm() {
    if (formSubmitting) return;
    showFormModal = false;
    editing = null;
  }

  async function submitForm() {
    if (formSubmitting) return;
    const productIdVal = productId || formProductId;
    const customerIdVal = customerId || formCustomerId;
    if (!productIdVal || !customerIdVal) {
      formError = isCustomerDetail
        ? "Please select a product."
        : "Please select a customer.";
      return;
    }
    const quantityNum = Number(formQuantity);
    if (
      formQuantity === "" ||
      formQuantity == null ||
      !Number.isFinite(quantityNum) ||
      quantityNum <= 0
    ) {
      formError = "Quantity must be a positive number.";
      return;
    }

    formSubmitting = true;
    formError = "";

    const object: Record<string, unknown> = {
      customer_id: customerIdVal,
      product_id: productIdVal,
      quantity: quantityNum,
      status: formStatus,
      allow_for_reminder: formAllowForReminder,
      is_reminder_sent: formIsReminderSent,
    };

    try {
      if (editing) {
        const res = await api({ action: "update", id: editing.id, object });
        if (!res.ok) throw new Error(res.error ?? "Update failed");
      } else {
        const res = await api({ action: "insert", object });
        if (!res.ok) throw new Error(res.error ?? "Insert failed");
      }
      showToast(editing ? "Waight list updated" : "Waight list added", "success");
      showFormModal = false;
      editing = null;
      void load();
    } catch (err) {
      formError = err instanceof Error ? err.message : String(err);
    } finally {
      formSubmitting = false;
    }
  }

  // ---------- Delete ----------
  function requestDelete(row: WaightListItem) {
    deleting = row;
    showDeleteModal = true;
  }

  function closeDelete() {
    if (deleteSubmitting) return;
    showDeleteModal = false;
    deleting = null;
  }

  async function confirmDelete() {
    if (!deleting || deleteSubmitting) return;
    deleteSubmitting = true;
    try {
      const res = await api({ action: "delete", id: deleting.id });
      if (!res.ok) throw new Error(res.error ?? "Delete failed");
      showToast("Waight list deleted", "success");
      showDeleteModal = false;
      deleting = null;
      void load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      deleteSubmitting = false;
    }
  }

  // ---------- Send reminder ----------
  function requestReminder() {
    if (selectedIds.length === 0) return;
    showReminderModal = true;
  }

  function closeReminder() {
    if (sendingReminder) return;
    showReminderModal = false;
  }

  async function confirmReminder() {
    if (sendingReminder || selectedIds.length === 0) return;
    sendingReminder = true;
    try {
      const res = await api({ action: "sendReminder", ids: selectedIds });
      if (!res.ok) throw new Error(res.error ?? "Failed to send reminder");
      showReminderModal = false;
      showToast("Reminder sent", "success");
      void load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send reminder", "error");
    } finally {
      sendingReminder = false;
    }
  }
</script>

<section class="{mc.tableSection} mt-6">
  <div class={mc.tableToolbar}>
    <div>
      <h2 class="text-sm font-semibold text-[#1a1a1a] dark:text-gray-100">
        {title}
      </h2>
      <span class="text-sm text-gray-500 dark:text-gray-400">
        {rows.length} record{rows.length === 1 ? "" : "s"}
      </span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if selectedIds.length > 0}
        <button
          type="button"
          class={mc.primaryBtn}
          onclick={requestReminder}
          disabled={sendingReminder}
        >
          Send reminder sms ({selectedIds.length})
        </button>
      {/if}
      <button type="button" class={mc.primaryBtn} onclick={openAdd}>
        Add waight list
      </button>
    </div>
  </div>

  {#if error}
    <p class="px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
  {/if}

  <div class="overflow-x-auto">
    <table class={mc.table}>
      <thead>
        <tr>
          <th class={mc.colNumHead}>
            {#if selectableRows.length > 0}
              <input
                type="checkbox"
                class="size-4 accent-[#4DA0E6]"
                checked={allSelectableChecked}
                onchange={toggleSelectAll}
                aria-label="Select all"
              />
            {/if}
          </th>
          {#if isCustomerDetail}
            <th class={mc.th}>Product</th>
          {:else}
            <th class={mc.th}>Customer</th>
          {/if}
          <th class={mc.thCenter}>Quantity</th>
          <th class={mc.thCenter}>Status</th>
          <th class={mc.thCenter}>Allow reminder</th>
          <th class={mc.thCenter}>Reminder sent</th>
          <th class={mc.th}>Created</th>
          <th class={mc.thCenter}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r, i}
          <tr class="hover:bg-gray-50 dark:hover:bg-white/5">
            <td class={mc.colNum}>
              {#if r.allow_for_reminder === true}
                <input
                  type="checkbox"
                  class="size-4 accent-[#4DA0E6]"
                  checked={selectedIds.includes(r.id)}
                  onchange={() => toggleSelect(r.id)}
                  aria-label="Select for reminder"
                />
              {/if}
            </td>
            {#if isCustomerDetail}
              <td class={mc.td}>
                <span class="font-medium">{productLabel(r.product)}</span>
                {#if productUnit(r.product)}
                  <span class="text-gray-500 dark:text-gray-400"> · {productUnit(r.product)}</span>
                {/if}
              </td>
            {:else}
              <td class={mc.td}>
                <span class="font-medium">{fullName(r.customer)}</span>
                {#if r.customer?.phone_number}
                  <span
                    class="text-gray-500 dark:text-gray-400"> · {r.customer.phone_number}</span
                  >
                {/if}
              </td>
            {/if}
            <td class="{mc.tdCenter} whitespace-nowrap">{r.quantity ?? "—"}</td>
            <td class={mc.tdCenter}>
              <span class="capitalize">{statusLabel(r.status)}</span>
            </td>
            <td class={mc.tdCenter}>{r.allow_for_reminder ? "Yes" : "No"}</td>
            <td class={mc.tdCenter}>{r.is_reminder_sent ? "Yes" : "No"}</td>
            <td class="{mc.td} whitespace-nowrap">{formatDate(r.created_at)}</td>
            <td class={mc.tdCenter}>
              <div class="flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  class={mc.actionBtn}
                  title="Edit"
                  onclick={() => openEdit(r)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  class={mc.actionBtnDanger}
                  title="Delete"
                  onclick={() => requestDelete(r)}
                >
                  🗑
                </button>
              </div>
            </td>
          </tr>
        {/each}
        {#if !loading && rows.length === 0}
          <tr>
            <td colspan="8" class={mc.emptyCell}>
              No waight list records yet.
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</section>

{#if showFormModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={closeForm}
    onkeydown={(e) => (e.key === "Enter" || e.key === " ") && closeForm()}
  ></div>
  <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>{editing ? "Edit Waight List" : "Add Waight List"}</h2>
      <button
        class="icon"
        aria-label="Close"
        disabled={formSubmitting}
        onclick={closeForm}>✕</button
      >
    </header>
    <div class="modal-body">
      {#if formError}
        <p class="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {formError}
        </p>
      {/if}

      {#if isCustomerDetail}
        <input type="hidden" name="customer_id" value={customerId} />
        <label class="block-label">
          <span>Product</span>
          <div class="contents" data-search-container>
            <SearchSelect
              bind:value={formProductId}
              selected={editing?.product ?? undefined}
              {companyId}
              branchId={merchantBranchId}
              endpoint="/api/products/search"
              placeholder="Search products..."
              required
              disabled={formSubmitting}
              itemLabel={(p: any) => {
                const label = buildProductLabel(p);
                const unit = (p as any).default_unit?.trim();
                return unit ? `${label} · ${unit}` : label;
              }}
            />
          </div>
        </label>
      {:else}
        <input type="hidden" name="product_id" value={productId} />
        <label class="block-label">
          <span>Customer</span>
          <div class="contents" data-search-container>
            <SearchSelect
              bind:value={formCustomerId}
              selected={editing?.customer ?? undefined}
              {companyId}
              branchId={merchantBranchId}
              endpoint="/api/customers/search"
              placeholder="Choose a customer"
              required
              disabled={formSubmitting}
              itemLabel={(c: any) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
                const phone = (c.phone ?? c.phone_number)?.trim() ?? "";
                return phone ? `${name} - ${phone}` : name || c.id;
              }}
            />
          </div>
        </label>
      {/if}

      <label class="block-label">
        <span>Quantity</span>
        <input
          class="form-input"
          type="number"
          min="0.0001"
          step="any"
          bind:value={formQuantity}
          placeholder="0"
          required
          disabled={formSubmitting}
        />
      </label>

      <label class="block-label">
        <span>Status</span>
        <select class="form-select" bind:value={formStatus} disabled={formSubmitting}>
          <option value="on_waight">On Waight</option>
          <option value="addressed">Addressed</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>

      <div class="toggle-row">
        <span class="toggle-label">Allow for reminder</span>
        <button
          type="button"
          role="switch"
          aria-label="Allow for reminder"
          aria-checked={formAllowForReminder}
          class="toggle {formAllowForReminder ? 'toggle-on' : ''}"
          disabled={formSubmitting}
          onclick={() => (formAllowForReminder = !formAllowForReminder)}
        >
          <span class="toggle-knob"></span>
        </button>
      </div>

      <div class="toggle-row">
        <span class="toggle-label">Reminder sent</span>
        <button
          type="button"
          role="switch"
          aria-label="Reminder sent"
          aria-checked={formIsReminderSent}
          class="toggle {formIsReminderSent ? 'toggle-on' : ''}"
          disabled={formSubmitting}
          onclick={() => (formIsReminderSent = !formIsReminderSent)}
        >
          <span class="toggle-knob"></span>
        </button>
      </div>
    </div>
    <footer>
      <button
        type="button"
        class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        onclick={closeForm}
        disabled={formSubmitting}
      >
        Cancel
      </button>
      <button
        type="button"
        class={mc.primaryBtn}
        onclick={submitForm}
        disabled={formSubmitting}
      >
        {formSubmitting ? "Saving…" : editing ? "Save" : "Add"}
      </button>
    </footer>
  </dialog>
{/if}

{#if showDeleteModal && deleting}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={closeDelete}
    onkeydown={(e) => (e.key === "Enter" || e.key === " ") && closeDelete()}
  ></div>
  <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>Delete Waight List</h2>
      <button class="icon" aria-label="Close" disabled={deleteSubmitting} onclick={closeDelete}>
        ✕
      </button>
    </header>
    <div class="modal-body">
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Are you sure you want to delete this waight list record? This action cannot be undone.
      </p>
    </div>
    <footer>
      <button
        type="button"
        class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        onclick={closeDelete}
        disabled={deleteSubmitting}
      >
        Cancel
      </button>
      <button
        type="button"
        class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#d15b5b] bg-[#D15B5B] px-4 text-sm font-semibold leading-none text-white transition hover:bg-[#b84b4b] disabled:opacity-50"
        onclick={confirmDelete}
        disabled={deleteSubmitting}
      >
        {deleteSubmitting ? "Deleting…" : "Delete"}
      </button>
    </footer>
  </dialog>
{/if}

{#if showReminderModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={closeReminder}
    onkeydown={(e) => (e.key === "Enter" || e.key === " ") && closeReminder()}
  ></div>
  <dialog open class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>Send Reminder SMS</h2>
      <button class="icon" aria-label="Close" disabled={sendingReminder} onclick={closeReminder}>
        ✕
      </button>
    </header>
    <div class="modal-body">
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Send an SMS reminder to the selected customer{selectedIds.length > 1 ? "s" : ""} about
        their waight list ({selectedIds.length}) record{selectedIds.length === 1 ? "" : "s"}?
      </p>
    </div>
    <footer>
      <button
        type="button"
        class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        onclick={closeReminder}
        disabled={sendingReminder}
      >
        Cancel
      </button>
      <button
        type="button"
        class={mc.primaryBtn}
        onclick={confirmReminder}
        disabled={sendingReminder}
      >
        {sendingReminder ? "Sending…" : "Confirm"}
      </button>
    </footer>
  </dialog>
{/if}

<style>
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
    max-width: 440px;
    width: calc(100% - 2rem);
    max-height: min(90vh, 720px);
    background: color-mix(in oklab, var(--surface), black 2%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.9rem;
    padding: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
  }
  .modal header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    flex-shrink: 0;
  }
  .modal h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: #f8fafc;
  }
  .modal .icon {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .modal .icon:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .modal-body {
    padding: 1rem;
    overflow: auto;
    color: #e5e7eb;
  }
  .modal footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    flex-shrink: 0;
  }
  .block-label {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: #cbd5e1;
  }
  .form-input,
  .form-select {
    width: 100%;
    box-sizing: border-box;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    padding: 0.6rem 0.75rem;
    font-size: 0.95rem;
    margin-bottom: 0.9rem;
  }
  .form-input:focus,
  .form-select:focus {
    outline: none;
    border-color: #4da0e6;
    box-shadow: 0 0 0 2px rgb(77 160 230 / 0.2);
  }
  .form-input:disabled,
  .form-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.9rem;
  }
  .toggle-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #cbd5e1;
  }
  .toggle {
    position: relative;
    width: 42px;
    height: 24px;
    border-radius: 9999px;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), black 20%);
    cursor: pointer;
    transition: background 0.2s ease;
    padding: 0;
    flex-shrink: 0;
  }
  .toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 9999px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s ease;
  }
  .toggle-on {
    background: #4da0e6;
  }
  .toggle-on .toggle-knob {
    transform: translateX(18px);
  }
</style>
