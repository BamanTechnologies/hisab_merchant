<script lang="ts">
  import { deserialize, enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import {
    afterToast,
    showToast,
    toastFromActionResult,
    TOAST_MS,
  } from "$lib/toast";
  import { onMount, tick } from "svelte";
  import { Pencil, Trash2 } from "@lucide/svelte";
  import { _ } from "svelte-i18n";
  import TablePagination from "$lib/components/TablePagination.svelte";
  import TableSearchInput from "$lib/components/TableSearchInput.svelte";
  import TableSortHeader from "$lib/components/TableSortHeader.svelte";
  import { mc } from "$lib/merchant-styles.js";
  import { paginateSlice } from "$lib/pagination.js";
  import { buildStockLabel, formatCoffeeCapacityWithUnit } from "$lib/stockLabel";
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

  let { data }: { data: PageData } = $props();
  let showCreateModal = $state(false);
  let editingStockId = $state<string | null>(null);
  let showDeleteModal = $state(false);
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
  let searchQuery = $state("");
  let tablePage = $state(1);
  let tablePageSize = $state(10);

  let sortColumn = $state<string>("none");
  let sortDirection = $state<"asc" | "desc">("asc");
  let listStateReady = $state(false);

  const STOCK_LIST_STATE_KEY = "stocks:list-state:v1";
  function isSortColumn(v: string | null): v is string {
    return v != null && v.trim() !== "";
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

  /** Model number from JSONB attributes or legacy column — for default sort only. */
  function modelNumberSortKey(s: Stock): string {
    const attrs = s.attributes ?? {};
    const v = attrs.model_number ?? s.model_number;
    if (v == null || v === "") return "";
    return String(v).trim();
  }

  function stockSortValue(s: Stock, col: string): string | number {
    const attrs = s.attributes ?? {};
    switch (col) {
      case "type":
        return typeFromStock(s);
      case "branch":
        return branchLabel(s.branch);
      case "origin":
        return s.origin ? branchLabel(s.origin) : "";
      case "price":
        return parseMoneyValue(s.selling_price) ?? 0;
      case "quantity":
        return Number(s.quantity ?? 0);
      default: {
        const fallback: Record<string, unknown> = {
          thickness: s.thickness,
          factor: s.factor,
          color: s.color,
          figure: s.figure,
          model_number: s.model_number,
          country: s.country,
        };
        const v = attrs[col] ?? fallback[col];
        if (v == null) return "";
        const raw = String(v).trim();
        const normalized = raw.replace(/[^0-9.-]/g, "");
        const n = Number(normalized);
        const looksNumeric = normalized !== "" && /[0-9]/.test(normalized);
        if (looksNumeric && Number.isFinite(n)) return n;
        return String(v).trim().toLowerCase();
      }
    }
  }

  function cycleSort(col: string, e?: Event) {
    e?.stopPropagation();
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

  function stockSearchText(s: Stock): string {
    const parts = [
      buildStockLabel(s),
      productTypeLabel(s),
      branchLabel(s.branch),
      s.origin ? branchLabel(s.origin) : "",
    ];
    for (const [, v] of attributeEntriesForList(s)) {
      parts.push(String(v ?? ""));
    }
    return parts.join(" ").toLowerCase();
  }

  const filteredStocks = $derived.by(() => {
    let list = stocks;
    if (typeFilter !== "all") {
      list = list.filter((s: Stock) => typeFromStock(s) === typeFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((s: Stock) => stockSearchText(s).includes(q));
    }
    if (sortColumn !== "none") {
      const col = sortColumn;
      list = [...list].sort((a, b) => {
        const av = stockSortValue(a, col);
        const bv = stockSortValue(b, col);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sortDirection === "asc" ? cmp : -cmp;
      });
    } else {
      list = [...list].sort((a, b) => {
        const ta = typeFromStock(a);
        const tb = typeFromStock(b);
        const byType = ta.localeCompare(tb);
        if (byType !== 0) return byType;
        const ma = modelNumberSortKey(a);
        const mb = modelNumberSortKey(b);
        return ma.localeCompare(mb, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
    }
    return list;
  });

  const stocksPaginationResetKey = $derived(
    `${typeFilter}|${searchQuery}|${sortColumn}|${sortDirection}`,
  );
  const pagedStocks = $derived(
    paginateSlice<Stock>(filteredStocks, tablePage, tablePageSize),
  );

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
  /** Anchor for investor menu position (portal renders outside scroll clipping). */
  let investorMultiselectEl = $state<HTMLDivElement | null>(null);
  let investorMenuPortalEl = $state<HTMLDivElement | null>(null);
  let investorMenuPosStyle = $state("");
  let branchDropdownOpen = $state(false);
  let branchMultiselectEl = $state<HTMLDivElement | null>(null);
  /** Not submitted — participates in HTML constraint validation (hidden inputs do not). */
  let investorsValidityProxyEl = $state<HTMLInputElement | null>(null);

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
    investorMenuPosStyle = "";
    branchDropdownOpen = false;
    editingStockId = null;
  }

  function openCreateModal() {
    errorMessage = "";
    successMessage = "";
    resetForm();
    if (merchantBranchId) selectedBranchId = merchantBranchId;
    showCreateModal = true;
  }

  function openEditModal(stock: Stock, event: Event) {
    event.stopPropagation();
    errorMessage = "";
    successMessage = "";
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
    if (stockFormPending) return;
    showCreateModal = false;
    resetForm();
  }

  function toggleInvestor(id: string) {
    if (selectedInvestorIds.includes(id)) {
      selectedInvestorIds = selectedInvestorIds.filter((x) => x !== id);
    } else {
      selectedInvestorIds = [...selectedInvestorIds, id];
    }
    investorDropdownOpen = false;
  }

  $effect(() => {
    if (!showCreateModal || editingStockId || !investorsValidityProxyEl) return;
    const el = investorsValidityProxyEl;
    const n = selectedInvestorIds.length;
    if (investors.length === 0) {
      el.setCustomValidity($_('noInvestorsMsg'));
    } else if (n === 0) {
      el.setCustomValidity($_('selectInvestorRequired'));
    } else {
      el.setCustomValidity("");
    }
  });
  function investorLabel(ids: string[], fallback: string = "Select investors") {
    if (ids.length === 0) return fallback;
    const names = investors
      .filter((i: Investor) => ids.includes(i.id))
      .map((i: Investor) => `${i.first_name} ${i.last_name}`);
    return names.join(", ");
  }

  $effect(() => {
    if (!investorDropdownOpen) investorMenuPosStyle = "";
  });

  function updateInvestorMenuPosition() {
    const el = investorMultiselectEl;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const pad = 10;
    const width = rect.width;
    let left = Math.max(
      pad,
      Math.min(rect.left, window.innerWidth - width - pad),
    );
    const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
    const spaceAbove = rect.top - gap - pad;
    let top = rect.bottom + gap;
    let maxHeight = Math.min(280, Math.max(100, spaceBelow));
    if (spaceBelow < 120 && spaceAbove > spaceBelow) {
      maxHeight = Math.min(280, Math.max(100, spaceAbove));
      top = rect.top - gap - maxHeight;
      top = Math.max(pad, top);
    }
    investorMenuPosStyle = `top:${top}px;left:${left}px;width:${width}px;max-height:${maxHeight}px`;
  }

  $effect(() => {
    if (!investorDropdownOpen || editingStockId || !showCreateModal) return;

    let raf = 0;
    const schedulePosition = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => updateInvestorMenuPosition());
    };

    void tick().then(schedulePosition);

    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    };
  });

  /** Close branch / investor menus on outside tap (capture phase so it runs before dialog buttons). */
  $effect(() => {
    const investorOpen = investorDropdownOpen && !editingStockId;
    if (
      !showCreateModal ||
      stockFormPending ||
      (!branchDropdownOpen && !investorOpen)
    ) {
      return;
    }

    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node;
      if (branchDropdownOpen && !branchMultiselectEl?.contains(node)) {
        branchDropdownOpen = false;
      }
      if (
        investorOpen &&
        !investorMultiselectEl?.contains(node) &&
        !investorMenuPortalEl?.contains(node)
      ) {
        investorDropdownOpen = false;
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  });

  function branchLabel(branchId: string | null | undefined) {
    if (!branchId) return "—";
    const b = branches.find((x) => x.id === branchId);
    if (b?.name) return b.name;
    return branchId.slice(0, 8) + "…";
  }

  function branchPickerLabel(id: string, fallback: string = "Select branch") {
    if (!id) return fallback;
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
  function isSortActive(col: string, dir: "asc" | "desc"): boolean {
    return sortColumn === col && sortDirection === dir;
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

  function closeDeleteModal(force?: boolean) {
    if (force !== true && deleteSubmitting) return;
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

      const result = deserialize(await response.text());
      const t = toastFromActionResult(result);
      if (t) showToast(t.message, t.variant);

      const payload =
        result.type === "success" && "data" in result
          ? (result.data as { success?: boolean; message?: string } | undefined)
          : undefined;

      if (result.type === "success" && payload?.success) {
        stocks = stocks.filter((s: Stock) => s.id !== stockToDelete!.id);
        errorMessage = "";
        successMessage = "";
        closeDeleteModal(true);
      } else if (result.type === "success" && payload && !payload.success) {
        errorMessage = "";
        successMessage = "";
      }
    } catch (error) {
      showToast("Failed to delete stock. Please try again.", "error");
      errorMessage = "";
      successMessage = "";
    } finally {
      deleteSubmitting = false;
    }
  }
</script>

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>{$_('pageStocksTitle')}</h1>
    <p class={mc.pageSubtitle}>{$_('pageStocksSubtitle')}</p>
  </div>
  <button type="button" class={mc.primaryBtn} onclick={openCreateModal}>{$_('newStock')}</button>
</section>

{#if errorMessage && !showCreateModal}
  <div class={mc.alertError}>
    <p>{errorMessage}</p>
  </div>
{/if}

{#if successMessage}
  <div class={mc.alertSuccess}>
    <p>{successMessage}</p>
  </div>
{/if}

{#if showCreateModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !stockFormPending && closeCreateModal()}
    onkeydown={(e) =>
      !stockFormPending &&
      (e.key === "Enter" || e.key === " ") &&
      closeCreateModal()}
  ></div>
  <dialog
    open
    class="modal"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => stockFormPending && e.preventDefault()}
  >
    <header>
      <h2>
        {editingStockId ? $_('editStock') : $_('createNewStock')}
      </h2>
      <button
        class="icon"
        aria-label={$_('close')}
        disabled={stockFormPending}
        onclick={closeCreateModal}>✕</button
      >
    </header>
    <form
      class="form stock-form"
      method="POST"
      action={editingStockId ? "?/updateStock" : "?/createStock"}
      use:enhance={({ formElement, cancel }) => {
        if (!formElement.reportValidity()) {
          cancel();
          return;
        }
        stockFormPending = true;
        return async ({ update, result }) => {
          try {
            await update();
          } finally {
            stockFormPending = false;
          }
          const t = toastFromActionResult(result);
          if (t) showToast(t.message, t.variant);
          const ok =
            result.type === "success" &&
            result.data &&
            typeof result.data === "object" &&
            "success" in result.data &&
            (result.data as { success?: boolean }).success === true;
          if (ok) {
            errorMessage = "";
            successMessage = "";
            showCreateModal = false;
            resetForm();
            afterToast(TOAST_MS, () => window.location.reload());
          } else if (t?.variant === "error") {
            errorMessage = t.message;
          }
        };
      }}
    >
      {#if errorMessage}
        <div class="modal-form-alert error" role="alert">
          <p>{errorMessage}</p>
        </div>
      {/if}
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
      <fieldset class="stock-form-fields" disabled={stockFormPending}>
        <div class="grid">
          <label>
            <span>{$_('productType')}</span>
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
                  const keys =
                    PRODUCT_TYPE_FIELDS[selectedProductTypeName] ?? [];
                  const next: Record<string, string> = {};
                  for (const k of keys) {
                    next[k] = attributes[k] ?? "";
                  }
                  attributes = next;
                }
              }}
            >
              <option value="">{$_('selectProductType')}</option>
              {#each productTypes as pt}
                <option value={pt.id}>{typeDisplay(pt.name ?? "")}</option>
              {/each}
            </select>
          </label>
          <label class="unit-field">
            <span>{$_('unitOfMeasure')}</span>
            <input
              type="text"
              name="unit"
              bind:value={stockUnit}
              required
              maxlength="64"
              autocomplete="off"
              placeholder={$_('unitPlaceholder')}
            />
          </label>
          <div class="field">
            <span>{$_('branch')}</span>
            <input type="hidden" name="branch" bind:value={selectedBranchId} />
            <div class="multiselect" bind:this={branchMultiselectEl}>
              <button
                type="button"
                class="select-trigger"
                onclick={() => (branchDropdownOpen = !branchDropdownOpen)}
              >
                {branchPickerLabel(selectedBranchId, $_('selectBranch'))}
              </button>
              {#if branchDropdownOpen}
                <div class="select-menu">
                  {#each branches as br}
                    <button
                      type="button"
                      class="option option-btn"
                      class:option-active={selectedBranchId === br.id}
                      onclick={() => selectBranch(br.id)}
                    >
                      {br.name ?? br.id}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <!-- `name="branch"` is type=hidden (not validated); proxy drives native constraint validation. -->
            <input
              type="text"
              class="validity-proxy"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
              value={selectedBranchId ? "x" : ""}
              required
            />
          </div>
          {#each currentTypeFields() as fieldName}
            <label>
              <span>{attributeLabel(fieldName)}</span>
              <input type="text" bind:value={attributes[fieldName]} />
            </label>
          {/each}
          <label>
            <span>{$_('purchasedPrice')}</span>
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
            <span>{$_('sellingPrice')}</span>
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
            <span>{$_('quantity')}</span>
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
              <span
                >{$_('investors')} <span class="req-mark" aria-hidden="true">*</span
                ></span
              >
              <input
                bind:this={investorsValidityProxyEl}
                type="text"
                class="validity-proxy"
                tabindex="-1"
                autocomplete="off"
                aria-hidden="true"
                value={selectedInvestorIds.length > 0 ? "x" : ""}
                required
              />
              <input
                type="hidden"
                name="investors"
                value={JSON.stringify(selectedInvestorIds)}
              />
              {#if investors.length > 0}
                <div class="multiselect" bind:this={investorMultiselectEl}>
                  <button
                    type="button"
                    class="select-trigger"
                    onclick={() =>
                      (investorDropdownOpen = !investorDropdownOpen)}
                  >
                    {investorLabel(selectedInvestorIds, $_('selectInvestors'))}
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </fieldset>
      <footer>
        <button
          type="button"
          class="ghost"
          onclick={closeCreateModal}
          disabled={stockFormPending}>{$_('cancel')}</button
        >
        <button type="submit" class="primary" disabled={stockFormPending}>
          {stockFormPending
            ? editingStockId
              ? $_('updating')
              : $_('creating')
            : editingStockId
              ? $_('update')
              : $_('create')}
        </button>
      </footer>
    </form>
  </dialog>
  {#if investorDropdownOpen && !editingStockId && investors.length > 0 && investorMenuPosStyle !== ""}
    <div
      bind:this={investorMenuPortalEl}
      class="select-menu investor-menu-portal"
      style={investorMenuPosStyle}
    >
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
{/if}

{#if showDeleteModal && stockToDelete}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !deleteSubmitting && closeDeleteModal()}
    onkeydown={(e) =>
      !deleteSubmitting &&
      (e.key === "Enter" || e.key === " ") &&
      closeDeleteModal()}
  ></div>
  <dialog
    open
    class="modal"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => deleteSubmitting && e.preventDefault()}
  >
    <header>
      <h2>{$_('deleteStock')}</h2>
      <button
        class="icon"
        aria-label={$_('close')}
        disabled={deleteSubmitting}
        onclick={() => closeDeleteModal()}>✕</button
      >
    </header>
    <div class="modal-content">
      <p>{$_('deleteStockConfirm')}</p>
      <div class="stock-details">
        <p><strong>{$_('typeLabel')}</strong> {productTypeLabel(stockToDelete)}</p>
        <p><strong>{$_('branchLabel')}</strong> {branchLabel(stockToDelete.branch)}</p>
        <p>
          <strong>{$_('attributesLabel')}</strong>
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
        <p><strong>{$_('quantity')}:</strong> {quantityWithUnit(stockToDelete)}</p>
      </div>
      <p class="warning">{$_('thisActionUndone')}</p>
    </div>
    <footer>
      <button
        type="button"
        class="ghost"
        onclick={() => closeDeleteModal()}
        disabled={deleteSubmitting}>{$_('cancel')}</button
      >
      <button
        type="button"
        class="danger"
        onclick={confirmDelete}
        disabled={deleteSubmitting}
        >{deleteSubmitting ? $_('deleting') : $_('delete')}</button
      >
    </footer>
  </dialog>
{/if}

<section class={mc.tableSection}>
  <div class={mc.tableToolbar}>
    <TableSearchInput
      bind:value={searchQuery}
      placeholder={$_('searchByStockName')}
      ariaLabel={$_('search')}
      class="flex-1"
    />
    <div class={mc.tableToolbarFilter}>
      <span class={mc.tableToolbarFilterLabel}>{$_('type')}</span>
      <select class={mc.filterSelectCompact} bind:value={typeFilter} aria-label="Filter by type">
        <option value="all">{$_('all')}</option>
        {#each productTypes as pt}
          {#if pt.name}
            <option value={String(pt.name).trim().toLowerCase()}>
              {typeDisplay(pt.name)}
            </option>
          {/if}
        {/each}
      </select>
    </div>
  </div>
  <div class="overflow-x-auto">
  <table class={mc.table}>
    <thead>
      <tr>
        <th class={mc.colNumHead}>{$_('number')}</th>
        <th
          class={mc.th}
          aria-sort={sortColumn === "type"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <TableSortHeader
            label={$_('type')}
            onclick={() => cycleSort("type")}
            ascActive={isSortActive("type", "asc")}
            descActive={isSortActive("type", "desc")}
          />
        </th>
        <th
          class={mc.th}
          aria-sort={sortColumn === "branch"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <TableSortHeader
            label={$_('branch')}
            onclick={() => cycleSort("branch")}
            ascActive={isSortActive("branch", "asc")}
            descActive={isSortActive("branch", "desc")}
          />
        </th>
        <th
          class={mc.th}
          aria-sort={sortColumn === "origin"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <TableSortHeader
            label={$_('origin')}
            onclick={() => cycleSort("origin")}
            ascActive={isSortActive("origin", "asc")}
            descActive={isSortActive("origin", "desc")}
          />
        </th>
        {#if isSingleTypeFilter}
          {#each activeFields as field}
            <th
              class={mc.th}
              aria-sort={sortColumn === field
                ? sortDirection === "asc"
                  ? "ascending"
                  : "descending"
                : "none"}
            >
              <TableSortHeader
                label={attributeLabel(field)}
                onclick={() => cycleSort(field)}
                ascActive={isSortActive(field, "asc")}
                descActive={isSortActive(field, "desc")}
              />
            </th>
          {/each}
        {:else}
          <th class={mc.th}>{$_('attributes')}</th>
        {/if}
        <th
          class={mc.th}
          aria-sort={sortColumn === "price"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <TableSortHeader
            label={$_('price')}
            onclick={() => cycleSort("price")}
            ascActive={isSortActive("price", "asc")}
            descActive={isSortActive("price", "desc")}
          />
        </th>
        <th
          class={mc.thRight}
          aria-sort={sortColumn === "quantity"
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"}
        >
          <TableSortHeader
            label={$_('quantity')}
            align="center"
            onclick={() => cycleSort("quantity")}
            ascActive={isSortActive("quantity", "asc")}
            descActive={isSortActive("quantity", "desc")}
          />
        </th>
        <th class={mc.thCenter}>{$_('actions')}</th>
      </tr>
    </thead>
    <tbody>
      {#each pagedStocks as s, i}
        <tr
          class={mc.rowClickable}
          onclick={() => goto(`/stocks/${s.id}${currentListQueryString()}`)}
          tabindex="0"
          role="button"
        >
          <td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
          <td class={mc.td}>{productTypeLabel(s)}</td>
          <td class={mc.td}>{branchLabel(s.branch)}</td>
          <td class={mc.td}>{s.origin ? branchLabel(s.origin) : "-"}</td>
          {#if isSingleTypeFilter}
            {#each activeFields as field}
              <td class={mc.td}>{attrValue(s, field)}</td>
            {/each}
          {:else}
            <td class={mc.td}>
              {#if s.attributes && Object.keys(s.attributes).length > 0}
                <div class="flex flex-col gap-0.5 text-sm">
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
          <td class={mc.td}>{formatMoneyValue(s.selling_price)}</td>
          <td class={mc.tdRight}>{quantityWithUnit(s)}</td>
          <td class={mc.tdCenter}>
            <div class="flex items-center justify-center gap-1.5">
              <button
                type="button"
                class={mc.actionBtn}
                onclick={(e) => openEditModal(s, e)}
                aria-label={$_('editStockAria')}
                title={$_('editStockAria')}
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                class={mc.actionBtnDanger}
                onclick={(e) => openDeleteModal(s, e)}
                aria-label={$_('deleteStockAria')}
                title={$_('deleteStockAria')}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          </td>
        </tr>
      {/each}
      {#if filteredStocks.length === 0}
        <tr>
          <td
            colspan={isSingleTypeFilter ? 8 + activeFields.length : 10}
            class={mc.emptyCell}
          >
              {#if stocks.length === 0}
                {$_('noStocksEmpty')}
              {:else}
                {$_('noStocksSearch')}
              {/if}
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
  </div>
  <TablePagination
    bind:page={tablePage}
    bind:pageSize={tablePageSize}
    total={filteredStocks.length}
    resetKey={stocksPaginationResetKey}
  />
</section>

<style>
  fieldset.stock-form-fields {
    border: none;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  /* Synthetic controls for native validation (see comments next to each proxy in markup). */
  input.validity-proxy {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
    border-radius: 0;
    opacity: 0;
    pointer-events: none;
    background: transparent;
    box-shadow: none;
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
    color: #e5e7eb;
  }
  .modal .form {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .modal-form-alert {
    margin: 0 1rem 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid;
  }
  .modal-form-alert.error {
    background: color-mix(in oklab, #ef4444, transparent 78%);
    border-color: color-mix(in oklab, #f87171, transparent 35%);
    color: #fecaca;
  }
  .modal-form-alert.error p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
    font-weight: 600;
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
    position: relative;
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
  /** Investor picker: escape modal overflow clipping + stack above dialog */
  .select-menu.investor-menu-portal {
    position: fixed;
    right: auto;
    z-index: 60;
    overflow-y: auto;
    box-shadow:
      0 14px 40px rgba(0, 0, 0, 0.35),
      0 0 0 1px color-mix(in oklab, var(--surface-2), white 10%);
    -webkit-overflow-scrolling: touch;
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

  .req-mark {
    color: #f97373;
    font-weight: 700;
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
