<script lang="ts">
  import { deserialize } from "$app/forms";
  import { goto } from "$app/navigation";
  import { afterToast, showToast, TOAST_MS } from "$lib/toast";
  import { tick } from "svelte";
  import TablePagination from "$lib/components/TablePagination.svelte";
  import TableSortHeader from "$lib/components/TableSortHeader.svelte";
  import SummaryMetricCard from "$lib/components/SummaryMetricCard.svelte";
  import { mc, statusChipClass } from "$lib/merchant-styles.js";
  import { paginateSlice } from "$lib/pagination.js";
  import {
    buildStockLabel,
    formatCoffeeCapacityWithUnit,
  } from "$lib/stockLabel";
  import { Trash2 } from "@lucide/svelte";
  import type { PageData } from "./$types";

  type StockPanelPos = {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  };

  type CustomerRow = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    phone_number?: string | null;
    address?: string | null;
  };

  type BranchLite = {
    id: string;
    name?: string | null;
  };

  type StockRow = {
    id: string;
    quantity: number;
    selling_price: unknown;
    factor?: unknown;
    attributes?: Record<string, unknown> | null;
    model_number?: string | null;
    type?: string | null;
    country?: string | null;
    unit?: string | null;
    thickness?: number | string | null;
    color?: string | null;
    figure?: string | null;
    /** Source branch id when line came from a transfer */
    origin?: string | null;
  };

  type OrderSummary = {
    id: string;
    created_at: string;
    created_by: string;
    customer_address: string;
    customer_name: string;
    customer_phone: string;
    order_quantity: number;
    status: string;
    stock_id: string;
    stock_name?: string;
    total_amount: number;
    outstanding_amount: number;
    unit?: string | null;
    stock?: {
      unit?: string | null;
      type?: string | null;
      product_type?: string | null;
      attributes?: Record<string, unknown> | null;
      model_number?: string | null;
      country?: string | null;
      color?: string | null;
      figure?: string | null;
      thickness?: number | string | null;
    } | null;
  };

  type PaymentRow = {
    id: string;
    order_id: string;
    amount: number | string;
    created_at: string;
    payment_method?: string;
    created_by?: string;
  };

  type LineRow = {
    rowId: string;
    stockId: string;
    quantity: number;
    unitPrice: number;
  };

  const MAX_LINES = 15;

  let { data }: { data: PageData } = $props();

  let showCancelModal = $state(false);
  let orderToCancel = $state<OrderSummary | null>(null);
  let orders = $state(data.orders as OrderSummary[]);
  let payments = $state((data.payments ?? []) as PaymentRow[]);
  let customers = $state(data.customers as CustomerRow[]);
  let stocks = $state(data.stocks as StockRow[]);
  let errorMessage = $state("");
  let successMessage = $state("");

  let showCreateModal = $state(false);
  let selectedCustomerId = $state("");
  let orderLines = $state<LineRow[]>([
    {
      rowId: crypto.randomUUID(),
      stockId: "",
      quantity: 1,
      unitPrice: 0,
    },
  ]);
  let createSubmitting = $state(false);
  let cancelSubmitting = $state(false);
  /** For partially_paid cancellations: keep credit on balance vs neutralize after cash refund */
  let cancelPartialRefundChoice = $state<"balance" | "cash">("balance");
  let createError = $state("");

  let showAddCustomerModal = $state(false);
  let newFirstName = $state("");
  let newLastName = $state("");
  let newAddress = $state("");
  let newPhone = $state("");
  let addCustomerSubmitting = $state(false);
  let addCustomerError = $state("");

  let stockPickerRowId = $state<string | null>(null);
  let stockSearchQuery = $state("");
  let stockPanelPos = $state<StockPanelPos | null>(null);
  let stockSearchInputEl = $state<HTMLInputElement | null>(null);
  let lastStockSearchFocusRowId: string | null = null;
  let dateRangePreset = $state<"all" | "today" | "last7" | "last30" | "custom">(
    "all",
  );
  let customerFilterName = $state("");
  let customDateFrom = $state("");
  let customDateTo = $state("");
  let customDateFromInputEl = $state<HTMLInputElement | null>(null);
  let customDateToInputEl = $state<HTMLInputElement | null>(null);
  let sortColumn = $state<
    "none" | "date" | "stock" | "customer" | "quantity" | "status" | "total"
  >("none");
  let sortDirection = $state<"asc" | "desc">("asc");
  const customerFilterOptions = $derived.by(() => {
    const names = new Set<string>();
    for (const o of orders) {
      const n = String(o.customer_name ?? "").trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  });
  const filteredOrders = $derived.by(() => {
    const now = new Date();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const endOfDay = (d: Date) =>
      new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        23,
        59,
        59,
        999,
      ).getTime();
    const todayStart = startOfDay(now);
    const fromInputTs = customDateFrom
      ? startOfDay(new Date(customDateFrom))
      : null;
    const toInputTs = customDateTo ? endOfDay(new Date(customDateTo)) : null;
    return orders.filter((o) => {
      if (
        customerFilterName &&
        String(o.customer_name ?? "").trim() !== customerFilterName
      ) {
        return false;
      }
      const created = new Date(o.created_at ?? "").getTime();
      if (!Number.isFinite(created)) return false;
      if (dateRangePreset === "all") return true;
      if (dateRangePreset === "today") {
        return created >= todayStart && created <= endOfDay(now);
      }
      if (dateRangePreset === "last7") {
        const from = todayStart - 6 * 24 * 60 * 60 * 1000;
        return created >= from && created <= endOfDay(now);
      }
      if (dateRangePreset === "last30") {
        const from = todayStart - 29 * 24 * 60 * 60 * 1000;
        return created >= from && created <= endOfDay(now);
      }
      if (fromInputTs != null && created < fromInputTs) return false;
      if (toInputTs != null && created > toInputTs) return false;
      return true;
    });
  });
  const sortedOrders = $derived.by(() => {
    if (sortColumn === "none") return filteredOrders;
    return [...filteredOrders].sort((a, b) => {
      const av =
        sortColumn === "date"
          ? new Date(a.created_at ?? 0).getTime()
          : sortColumn === "stock"
            ? orderStockName(a).toLowerCase()
            : sortColumn === "customer"
              ? String(a.customer_name ?? "").toLowerCase()
              : sortColumn === "quantity"
                ? Number(a.order_quantity ?? 0)
                : sortColumn === "status"
                  ? String(a.status ?? "").toLowerCase()
                  : parseMoneyValue(a.total_amount);
      const bv =
        sortColumn === "date"
          ? new Date(b.created_at ?? 0).getTime()
          : sortColumn === "stock"
            ? orderStockName(b).toLowerCase()
            : sortColumn === "customer"
              ? String(b.customer_name ?? "").toLowerCase()
              : sortColumn === "quantity"
                ? Number(b.order_quantity ?? 0)
                : sortColumn === "status"
                  ? String(b.status ?? "").toLowerCase()
                  : parseMoneyValue(b.total_amount);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDirection === "asc" ? cmp : -cmp;
    });
  });

  let tablePage = $state(1);
  let tablePageSize = $state(10);
  const ordersPaginationResetKey = $derived(
    `${dateRangePreset}|${customerFilterName}|${customDateFrom}|${customDateTo}|${sortColumn}|${sortDirection}|${filteredOrders.length}`,
  );
  const pagedOrders = $derived(
    paginateSlice(sortedOrders, tablePage, tablePageSize),
  );

  const branchesList = $derived((data.branches ?? []) as BranchLite[]);

  function parseMoneyValue(v: unknown): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  $effect(() => {
    orders = data.orders as OrderSummary[];
    payments = (data.payments ?? []) as PaymentRow[];
    customers = data.customers as CustomerRow[];
    stocks = data.stocks as StockRow[];
  });

  function typeDisplay(t: string | null | undefined) {
    if (t === "glass") return "Glass";
    if (t === "brake_lining" || t === "brake_pad" || t === "break_pad")
      return "Brake lining";
    if (t === "coffee_tools") return "Coffee tools";
    return t ?? "—";
  }

  function customerOptionLabel(c: CustomerRow) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    const phone = (c.phone ?? c.phone_number)?.trim() ?? "";
    return phone ? `${name} - ${phone}` : name || c.id;
  }

  function countrySuffix(s: StockRow): string {
    const fromAttr =
      s.attributes?.country != null ? String(s.attributes.country).trim() : "";
    const c = fromAttr || s.country?.trim();
    return c ? ` · ${c}` : "";
  }

  function originSuffix(s: StockRow): string {
    const oid = s.origin != null ? String(s.origin).trim() : "";
    if (!oid) return "";
    const b = branchesList.find((x) => x.id === oid);
    const name = b?.name != null ? String(b.name).trim() : "";
    return name ? ` · from ${name}` : "";
  }

  function stockOptionLabel(s: StockRow) {
    const unit = s.unit?.trim();
    const qtyHint = unit
      ? `${s.quantity} ${unit} avail`
      : `${s.quantity} avail`;
    const typePart = typeDisplay(s.type);
    const rawType = s.type?.trim() ?? "";
    const ctry = countrySuffix(s);
    const orig = originSuffix(s);

    if (rawType === "glass") {
      const parts: string[] = [];
      const th = s.attributes?.thickness ?? s.thickness;
      if (th != null && String(th).trim() !== "") {
        const n = Number(th);
        parts.push(Number.isFinite(n) ? `${n}mm` : `${String(th).trim()}mm`);
      }
      const col =
        s.attributes?.color != null
          ? String(s.attributes.color).trim()
          : (s.color?.trim() ?? "");
      if (col) parts.push(col);
      const fig =
        s.attributes?.figure != null
          ? String(s.attributes.figure).trim()
          : (s.figure?.trim() ?? "");
      if (fig) parts.push(fig);
      const modelFromAttr =
        s.attributes?.model_number != null
          ? String(s.attributes.model_number).trim()
          : "";
      const desc =
        parts.length > 0
          ? parts.join(" ")
          : modelFromAttr || s.model_number?.trim() || s.id.slice(0, 8) + "…";
      return `${typePart} · ${desc}${ctry}${orig} (${qtyHint})`;
    }

    if (rawType === "coffee_tools") {
      const name =
        s.attributes?.name != null ? String(s.attributes.name).trim() : "";
      const capU = formatCoffeeCapacityWithUnit(s.attributes ?? null);
      const desc =
        [name, capU].filter(Boolean).join(" ").trim() || s.id.slice(0, 8) + "…";
      return `${typePart} · ${desc}${orig} (${qtyHint})`;
    }

    const modelFromAttr =
      s.attributes?.model_number != null
        ? String(s.attributes.model_number).trim()
        : "";
    const model =
      modelFromAttr || s.model_number?.trim() || s.id.slice(0, 8) + "…";
    return `${typePart} · ${model}${ctry}${orig} (${qtyHint})`;
  }

  function stockSearchHaystack(s: StockRow): string {
    const oid = s.origin != null ? String(s.origin).trim() : "";
    const br = oid ? branchesList.find((b) => b.id === oid) : undefined;
    const oName = br?.name != null ? String(br.name).trim() : "";
    const attrText = Object.entries(s.attributes ?? {})
      .map(([k, v]) => `${k} ${v == null ? "" : String(v)}`)
      .join(" ");
    const parts = [
      typeDisplay(s.type),
      s.type,
      s.model_number,
      s.country,
      s.color,
      s.figure,
      s.unit,
      String(s.thickness ?? ""),
      String(s.quantity ?? ""),
      oName,
      attrText,
    ];
    return parts
      .filter((p) => p != null && String(p).trim() !== "")
      .join(" ")
      .toLowerCase();
  }

  function stockMatchesSearch(s: StockRow, q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return stockSearchHaystack(s).includes(needle);
  }

  function stocksFilteredForPickerRow(rowId: string): StockRow[] {
    const base = stocksForRow(rowId);
    const q = stockSearchQuery.trim();
    if (!q) return base;
    return base.filter((s) => stockMatchesSearch(s, q));
  }

  function updateStockPanelPosition() {
    if (!stockPickerRowId) return;
    const sel = `[data-stock-trigger="${CSS.escape(stockPickerRowId)}"]`;
    const btn = document.querySelector(sel);
    if (!(btn instanceof HTMLElement)) {
      requestAnimationFrame(() => updateStockPanelPosition());
      return;
    }
    const rect = btn.getBoundingClientRect();
    const gap = 4;
    const padding = 8;
    // Show a roomy panel (≈double the trigger) so each stock label fits on one line,
    // but never wider than the viewport.
    let width = Math.max(rect.width * 2, 360);
    width = Math.min(width, window.innerWidth - padding * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - padding - width);
    }
    const spaceBelow = window.innerHeight - rect.bottom - gap - padding;
    const maxHeight = Math.min(280, Math.max(80, spaceBelow));
    stockPanelPos = {
      top: rect.bottom + gap,
      left,
      width,
      maxHeight,
    };
  }

  function toggleStockPicker(rowId: string) {
    if (stockPickerRowId === rowId) {
      stockPickerRowId = null;
    } else {
      stockPickerRowId = rowId;
      stockSearchQuery = "";
    }
  }

  $effect(() => {
    if (!stockPickerRowId) {
      stockPanelPos = null;
      return;
    }
    void tick().then(() => updateStockPanelPosition());
    const onMove = () => updateStockPanelPosition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const scrollEl = document.querySelector("[data-create-order-scroll]");
    scrollEl?.addEventListener("scroll", onMove);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      scrollEl?.removeEventListener("scroll", onMove);
    };
  });

  $effect(() => {
    if (!stockPickerRowId) {
      lastStockSearchFocusRowId = null;
      return;
    }
    if (!stockPanelPos) return;
    if (lastStockSearchFocusRowId === stockPickerRowId) return;
    lastStockSearchFocusRowId = stockPickerRowId;
    void tick().then(() => stockSearchInputEl?.focus());
  });

  function selectStockForRow(rowId: string, stockId: string) {
    orderLines = orderLines.map((r) =>
      r.rowId === rowId
        ? {
            ...r,
            stockId,
            unitPrice: stockId === "" ? 0 : defaultUnitPriceForStock(stockId),
          }
        : r,
    );
    stockPickerRowId = null;
    stockSearchQuery = "";
  }

  $effect(() => {
    if (!stockPickerRowId) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-stock-combo-wrap]")) return;
      if (t.closest("[data-stock-combo-panel]")) return;
      stockPickerRowId = null;
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  });

  function getStock(stockId: string): StockRow | undefined {
    return stocks.find((s) => s.id === stockId);
  }

  /** Prefill from stock catalog selling price only (per-order edits stay in the form). */
  function defaultUnitPriceForStock(stockId: string): number {
    if (!stockId) return 0;
    return parseMoneyValue(getStock(stockId)?.selling_price);
  }

  /** Order unit always matches stock; shown read-only in the modal. */
  function lineStockUnitLabel(row: LineRow): string {
    if (!row.stockId) return "—";
    const u = getStock(row.stockId)?.unit?.trim();
    return u ?? "(no unit)";
  }

  function takenStockIds(exceptRowId: string): Set<string> {
    const ids = new Set<string>();
    for (const row of orderLines) {
      if (row.rowId !== exceptRowId && row.stockId) ids.add(row.stockId);
    }
    return ids;
  }

  function stocksForRow(exceptRowId: string): StockRow[] {
    const row = orderLines.find((r) => r.rowId === exceptRowId);
    const currentId = row?.stockId ?? "";
    const taken = takenStockIds(exceptRowId);
    return stocks.filter((s) => !taken.has(s.id) || s.id === currentId);
  }

  function lineQuantityError(row: LineRow): string {
    if (!row.stockId) return "";
    const q = Number(row.quantity);
    if (!Number.isFinite(q) || q < 1) return "Minimum quantity is 1";
    const s = getStock(row.stockId);
    if (!s) return "Invalid stock";
    const avail = Number(s.quantity);
    if (q > avail) return "Exceeds available quantity";
    return "";
  }

  function lineUnitPriceError(row: LineRow): string {
    if (!row.stockId) return "";
    const p = Number(row.unitPrice);
    if (!Number.isFinite(p) || p <= 0) {
      return "Enter a valid unit price greater than zero";
    }
    return "";
  }

  const createModalHasErrors = $derived.by(() => {
    if (!selectedCustomerId) return true;
    if (orderLines.length === 0) return true;
    for (const row of orderLines) {
      if (!row.stockId) return true;
      if (lineQuantityError(row)) return true;
      if (lineUnitPriceError(row)) return true;
    }
    return false;
  });

  const canAddLine = $derived.by(() => {
    if (orderLines.length >= MAX_LINES) return false;
    const taken = takenStockIds("");
    const free = stocks.filter((s) => !taken.has(s.id));
    return free.length > 0;
  });

  function resetCreateModal() {
    selectedCustomerId = "";
    stockPickerRowId = null;
    stockSearchQuery = "";
    orderLines = [
      {
        rowId: crypto.randomUUID(),
        stockId: "",
        quantity: 1,
        unitPrice: 0,
      },
    ];
    createError = "";
  }

  function openCreateModal() {
    resetCreateModal();
    showCreateModal = true;
  }

  function closeCreateModal(force?: boolean) {
    if (force !== true && createSubmitting) return;
    showCreateModal = false;
    resetCreateModal();
  }

  function addOrderLine() {
    if (!canAddLine) return;
    orderLines = [
      ...orderLines,
      {
        rowId: crypto.randomUUID(),
        stockId: "",
        quantity: 1,
        unitPrice: 0,
      },
    ];
  }

  function removeOrderLine(rowId: string) {
    orderLines = orderLines.filter((r) => r.rowId !== rowId);
  }

  function openAddCustomerModal() {
    newFirstName = "";
    newLastName = "";
    newAddress = "";
    newPhone = "";
    addCustomerError = "";
    showAddCustomerModal = true;
  }

  function closeAddCustomerModal(force?: boolean) {
    if (force !== true && addCustomerSubmitting) return;
    showAddCustomerModal = false;
  }

  async function submitAddCustomer() {
    if (addCustomerSubmitting) return;
    addCustomerError = "";
    addCustomerSubmitting = true;
    try {
      const fd = new FormData();
      fd.append("first_name", newFirstName);
      fd.append("last_name", newLastName);
      fd.append("address", newAddress);
      fd.append("phone_number", newPhone);

      const response = await fetch("?/createCustomer", {
        method: "POST",
        body: fd,
      });

      const result = deserialize(await response.text());
      if (result.type !== "success" || !("data" in result) || !result.data) {
        addCustomerError = "Could not add customer";
        showToast("Could not add customer", "error");
        return;
      }
      const payload = result.data as {
        success?: boolean;
        message?: string;
        customer?: CustomerRow;
      };
      if (!payload.success) {
        addCustomerError = payload.message ?? "Could not add customer";
        showToast(payload.message ?? "Could not add customer", "error");
        return;
      }
      if (payload.customer) {
        customers = [...customers, payload.customer];
        selectedCustomerId = payload.customer.id;
      }
      showToast(payload.message ?? "Customer added", "success");
      closeAddCustomerModal(true);
      successMessage = "";
      errorMessage = "";
    } catch {
      addCustomerError = "Request failed";
      showToast("Request failed", "error");
    } finally {
      addCustomerSubmitting = false;
    }
  }

  async function submitCreateOrders() {
    if (createSubmitting) return;
    createError = "";
    if (!selectedCustomerId) {
      createError = "Select a customer";
      return;
    }
    if (orderLines.length === 0) {
      createError = "Add at least one stock line";
      return;
    }
    const linesPayload: {
      stock_id: string;
      quantity: number;
      unit_price: number;
    }[] = [];
    for (const row of orderLines) {
      if (!row.stockId) {
        createError = "Each line needs a stock item";
        return;
      }
      const err = lineQuantityError(row);
      if (err) {
        createError = err;
        return;
      }
      const priceErr = lineUnitPriceError(row);
      if (priceErr) {
        createError = priceErr;
        return;
      }
      linesPayload.push({
        stock_id: row.stockId,
        quantity: Number(row.quantity),
        unit_price: Number(row.unitPrice),
      });
    }

    stockPickerRowId = null;
    createSubmitting = true;
    try {
      const fd = new FormData();
      fd.append("customerId", selectedCustomerId);
      fd.append("lines", JSON.stringify(linesPayload));

      const response = await fetch("?/createOrders", {
        method: "POST",
        body: fd,
      });

      const result = deserialize(await response.text());
      if (result.type !== "success" || !("data" in result) || !result.data) {
        createError = "Could not create orders";
        showToast("Could not create orders", "error");
        return;
      }
      const payload = result.data as { success?: boolean; message?: string };
      if (!payload.success) {
        createError = payload.message ?? "Could not create orders";
        showToast(payload.message ?? "Could not create orders", "error");
        return;
      }
      showToast(payload.message ?? "Orders created", "success");
      successMessage = "";
      errorMessage = "";
      closeCreateModal(true);
      afterToast(TOAST_MS, () => window.location.reload());
    } catch {
      createError = "Request failed";
      showToast("Request failed", "error");
    } finally {
      createSubmitting = false;
    }
  }

  function formatOrderDate(iso: string) {
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
  function formatMoney(v: number | string | null | undefined): string {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^0-9.-]/g, ""))
        : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString()}`;
  }

  function orderQtyCell(o: OrderSummary) {
    const u = (o.unit ?? o.stock?.unit ?? "").trim();
    return u ? `${o.order_quantity} ${u}` : String(o.order_quantity);
  }
  function orderStockName(o: OrderSummary): string {
    if (o.stock_name && o.stock_name.trim() !== "") return o.stock_name;
    const s = o.stock;
    if (!s) return o.stock_id.slice(0, 8) + "…";
    return buildStockLabel(s);
  }
  function stockNameParts(name: string): { base: string; more: string } {
    const trimmed = name.trim();
    const m = trimmed.match(/^(.*)\s\+(\d+)\s+more$/i);
    if (!m) return { base: trimmed, more: "" };
    return { base: m[1].trim(), more: `+ ${m[2]} More` };
  }
  function stockNameBase(name: string): string {
    return stockNameParts(name).base;
  }
  function stockNameMore(name: string): string {
    return stockNameParts(name).more;
  }

  function cycleSort(
    col: "date" | "stock" | "customer" | "quantity" | "status" | "total",
  ) {
    if (sortColumn !== col) {
      sortColumn = col;
      sortDirection = col === "date" ? "desc" : "asc";
      return;
    }
    if (sortDirection === "asc") sortDirection = "desc";
    else {
      sortColumn = "none";
      sortDirection = "asc";
    }
  }
  function isSortActive(
    col: "date" | "stock" | "customer" | "quantity" | "status" | "total",
    dir: "asc" | "desc",
  ) {
    return sortColumn === col && sortDirection === dir;
  }
  function openDatePicker(el: HTMLInputElement | null) {
    if (!el) return;
    const inputWithPicker = el as HTMLInputElement & {
      showPicker?: () => void;
    };
    if (typeof inputWithPicker.showPicker === "function") {
      inputWithPicker.showPicker();
      return;
    }
    el.focus();
    el.click();
  }
  const orderSummary = $derived.by(() => {
    let totalCreatedCount = filteredOrders.length;
    let totalCreatedAmount = 0;
    let totalPaidAmount = 0;
    const filteredOrderIds = new Set(
      filteredOrders
        .map((o) => String(o.id ?? ""))
        .filter((id) => id.length > 0),
    );
    for (const o of filteredOrders) {
      const status = String(o.status ?? "")
        .trim()
        .toLowerCase();
      const total = parseMoneyValue(o.total_amount) ?? 0;
      if (status !== "cancelled") {
        totalCreatedAmount += total;
      } else {
        continue;
      }
    }
    for (const p of payments) {
      const orderId = String(p.order_id ?? "").trim();
      if (!orderId || !filteredOrderIds.has(orderId)) continue;
      totalPaidAmount += parseMoneyValue(p.amount) ?? 0;
    }
    const totalUnpaidAmount = totalCreatedAmount - totalPaidAmount;
    return {
      totalCreatedCount,
      totalCreatedAmount,
      totalPaidAmount,
      totalUnpaidAmount,
    };
  });

  function openCancelModal(order: OrderSummary, event: Event) {
    event.stopPropagation();
    cancelPartialRefundChoice = "balance";
    orderToCancel = order;
    showCancelModal = true;
  }

  function totalPaidOnOrder(orderId: string): number {
    let n = 0;
    for (const p of payments) {
      if (p.order_id !== orderId) continue;
      const raw = p.amount;
      const amt =
        typeof raw === "number"
          ? raw
          : Number(String(raw).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(amt)) n += amt;
    }
    return n;
  }

  function closeCancelModal(force?: boolean) {
    if (force !== true && cancelSubmitting) return;
    showCancelModal = false;
    orderToCancel = null;
  }

  async function confirmCancelOrder() {
    if (!orderToCancel || cancelSubmitting) return;

    cancelSubmitting = true;
    try {
      const formData = new FormData();
      formData.append("orderId", orderToCancel.id);
      const st = String(orderToCancel.status ?? "")
        .trim()
        .toLowerCase();
      if (st === "partially_paid") {
        formData.append("partialCancelRefund", cancelPartialRefundChoice);
      }

      const response = await fetch("?/cancelOrder", {
        method: "POST",
        body: formData,
      });

      const result = deserialize(await response.text());
      const payload =
        result.type === "success" && "data" in result
          ? (result.data as { success?: boolean; message?: string } | undefined)
          : undefined;

      if (result.type === "success" && payload?.success) {
        const id = orderToCancel.id;
        orders = orders.map((o: OrderSummary) =>
          o.id === id ? { ...o, status: "cancelled" } : o,
        );
        showToast(payload.message ?? "Order cancelled successfully", "success");
        successMessage = "";
        errorMessage = "";
        closeCancelModal(true);
      } else {
        const msg = payload?.message ?? "Could not cancel order";
        errorMessage = msg;
        successMessage = "";
        showToast(msg, "error");
      }
    } catch {
      errorMessage = "Failed to cancel order. Please try again.";
      successMessage = "";
      showToast("Failed to cancel order. Please try again.", "error");
    } finally {
      cancelSubmitting = false;
    }
  }
</script>

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>Orders</h1>
    <p class={mc.pageSubtitle}>Click a row to view full order details.</p>
  </div>
  <button type="button" class={mc.primaryBtn} onclick={openCreateModal}>
    Create Order
  </button>
</section>

<section class={mc.filterSection} aria-label="Filter orders">
  <label>
    <span class={mc.filterLabel}>Date range</span>
    <select class={mc.filterSelect} bind:value={dateRangePreset}>
      <option value="all">All time</option>
      <option value="today">Today</option>
      <option value="last7">Last 7 days</option>
      <option value="last30">Last 30 days</option>
      <option value="custom">Custom range</option>
    </select>
  </label>

  {#if dateRangePreset === "custom"}
    <label>
      <span class={mc.filterLabel}>From</span>
      <input
        class="{mc.filterDate} cursor-pointer"
        type="date"
        bind:value={customDateFrom}
        bind:this={customDateFromInputEl}
        onclick={() => openDatePicker(customDateFromInputEl)}
        onfocus={() => openDatePicker(customDateFromInputEl)}
      />
    </label>
    <label>
      <span class={mc.filterLabel}>To</span>
      <input
        class="{mc.filterDate} cursor-pointer"
        type="date"
        bind:value={customDateTo}
        bind:this={customDateToInputEl}
        onclick={() => openDatePicker(customDateToInputEl)}
        onfocus={() => openDatePicker(customDateToInputEl)}
      />
    </label>
  {/if}

  <label>
    <span class={mc.filterLabel}>Customer</span>
    <select class={mc.filterSelect} bind:value={customerFilterName}>
      <option value="">All customers</option>
      {#each customerFilterOptions as customerName}
        <option value={customerName}>{customerName}</option>
      {/each}
    </select>
  </label>
</section>

<section class={mc.summaryGrid} aria-label="Orders summary">
  <SummaryMetricCard
    value={`${formatMoney(orderSummary.totalCreatedAmount)} (${orderSummary.totalCreatedCount.toLocaleString()} ${orderSummary.totalCreatedCount === 1 ? "order" : "orders"})`}
    label="Total orders created"
    icon="three"
  />
  <SummaryMetricCard
    value={formatMoney(orderSummary.totalPaidAmount)}
    label="Total amount paid"
    icon="five"
  />
  <SummaryMetricCard
    value={formatMoney(
      orderSummary.totalUnpaidAmount < 0
        ? Math.abs(orderSummary.totalUnpaidAmount)
        : orderSummary.totalUnpaidAmount,
    )}
    label={orderSummary.totalUnpaidAmount < 0
      ? "Total amount overpaid"
      : "Total amount unpaid"}
    icon="eight"
  />
</section>

{#if errorMessage}
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
    onclick={() => !createSubmitting && closeCreateModal()}
    onkeydown={(e) =>
      !createSubmitting &&
      (e.key === "Enter" || e.key === " ") &&
      closeCreateModal()}
  ></div>
  <dialog
    open
    class="modal modal-wide"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => createSubmitting && e.preventDefault()}
    onkeydown={(e) => {
      if (e.key === "Escape" && createSubmitting) {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape" && stockPickerRowId) {
        e.preventDefault();
        stockPickerRowId = null;
      }
    }}
  >
    <header>
      <h2>Create Order</h2>
      <button
        class="icon"
        aria-label="Close"
        onclick={() => closeCreateModal()}
        disabled={createSubmitting}>✕</button
      >
    </header>
    <div class="modal-body" data-create-order-scroll>
      {#if createError}
        <p class="inline-error">{createError}</p>
      {/if}

      {#if !data.companyId}
        <p class="inline-error muted-strong">
          Your account has no branch or company linked, so customers cannot be
          loaded. Contact an administrator.
        </p>
      {:else if customers.length === 0}
        <p class="muted-strong">
          No customers yet for your company. Use &ldquo;Add New Customer&rdquo;
          below.
        </p>
      {/if}

      <label class="block-label">
        <span>Select Customer</span>
        <select
          class="native-select full"
          bind:value={selectedCustomerId}
          required
          disabled={!data.companyId || createSubmitting}
        >
          <option value="">Choose a customer</option>
          {#each customers as c}
            <option value={c.id}>{customerOptionLabel(c)}</option>
          {/each}
        </select>
      </label>

      <button
        type="button"
        class="linkish"
        onclick={openAddCustomerModal}
        disabled={!data.companyId || createSubmitting}
      >
        + Add New Customer
      </button>

      <h3 class="section-title">Stock items</h3>
      <div class="lines">
        {#each orderLines as row (row.rowId)}
          <div
            class="line-row"
            class:line-invalid={row.stockId !== "" &&
              (!!lineQuantityError(row) || !!lineUnitPriceError(row))}
          >
            <div class="grow stock-combo-wrap" data-stock-combo-wrap>
              <span class="sr-only">Stock</span>
              <div class="stock-combobox">
                <button
                  type="button"
                  class="stock-combobox-trigger native-select full"
                  data-stock-trigger={row.rowId}
                  disabled={createSubmitting}
                  aria-expanded={stockPickerRowId === row.rowId}
                  aria-haspopup="listbox"
                  onclick={() =>
                    !createSubmitting && toggleStockPicker(row.rowId)}
                >
                  <span class="stock-combobox-trigger-text">
                    {#if row.stockId}
                      {@const st = getStock(row.stockId)}
                      {st ? stockOptionLabel(st) : "Select stock"}
                    {:else}
                      Select stock
                    {/if}
                  </span>
                  <span class="stock-combobox-caret" aria-hidden="true">▾</span>
                </button>
              </div>
            </div>
            <label class="qty">
              <span class="sr-only">Quantity</span>
              <input
                type="number"
                min="1"
                bind:value={row.quantity}
                disabled={createSubmitting}
                oninput={() => {
                  orderLines = [...orderLines];
                }}
              />
            </label>
            <div
              class="unit-readonly"
              title="Unit comes from the selected stock"
            >
              <span class="unit-label">Unit</span>
              <span class="unit-value">{lineStockUnitLabel(row)}</span>
            </div>
            <label class="line-price">
              <span class="sr-only">Unit price (ETB)</span>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Price"
                title="Unit selling price for this order (editable)"
                bind:value={row.unitPrice}
                oninput={() => {
                  orderLines = [...orderLines];
                }}
                disabled={!row.stockId || createSubmitting}
              />
            </label>
            <button
              type="button"
              class="{mc.actionBtnDanger} line-rm"
              aria-label="Remove this stock from the order"
              title="Remove this stock from the order"
              disabled={createSubmitting}
              onclick={() => removeOrderLine(row.rowId)}
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
            {#if lineQuantityError(row)}
              <p class="line-err">{lineQuantityError(row)}</p>
            {:else if lineUnitPriceError(row)}
              <p class="line-err">{lineUnitPriceError(row)}</p>
            {/if}
          </div>
        {/each}
      </div>

      <div class="line-actions">
        <button
          type="button"
          class={mc.tableBtn}
          onclick={addOrderLine}
          disabled={!canAddLine || createSubmitting}
        >
          + Add line
        </button>
      </div>
    </div>
    {#if stockPickerRowId && stockPanelPos}
      {@const pickerRowId = stockPickerRowId}
      {@const pickerRow = orderLines.find((r) => r.rowId === pickerRowId)}
      <div
        class="stock-combobox-panel stock-combobox-panel--fixed"
        data-stock-combo-panel
        style="top: {stockPanelPos.top}px; left: {stockPanelPos.left}px; width: {stockPanelPos.width}px; max-height: {stockPanelPos.maxHeight}px;"
        role="listbox"
      >
        <input
          bind:this={stockSearchInputEl}
          type="search"
          class="stock-combobox-search"
          placeholder="Search type, model, thickness, color, country…"
          value={stockSearchQuery}
          disabled={createSubmitting}
          oninput={(e) => {
            stockSearchQuery = e.currentTarget.value;
          }}
          onkeydown={(e) => {
            e.stopPropagation();
          }}
        />
        <ul class="stock-combobox-list stock-combobox-list--in-fixed-panel">
          {#each stocksFilteredForPickerRow(pickerRowId) as s (s.id)}
            <li role="none">
              <button
                type="button"
                class="stock-combobox-option"
                role="option"
                aria-selected={pickerRow?.stockId === s.id}
                disabled={createSubmitting}
                onclick={() => selectStockForRow(pickerRowId, s.id)}
              >
                {stockOptionLabel(s)}
              </button>
            </li>
          {:else}
            <li class="stock-combobox-empty">No matching stock</li>
          {/each}
        </ul>
      </div>
    {/if}
    <footer>
      <button
        type="button"
        class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        onclick={() => closeCreateModal()}
        disabled={createSubmitting}>Cancel</button
      >
      <button
        type="button"
        class="primary"
        disabled={createModalHasErrors || createSubmitting}
        onclick={submitCreateOrders}
      >
        {createSubmitting ? "Creating…" : "Create Order"}
      </button>
    </footer>
  </dialog>
{/if}

{#if showAddCustomerModal}
  <div
    class="modal-overlay overlay-nested"
    role="button"
    tabindex="0"
    onclick={() => !addCustomerSubmitting && closeAddCustomerModal()}
    onkeydown={(e) =>
      !addCustomerSubmitting &&
      (e.key === "Enter" || e.key === " ") &&
      closeAddCustomerModal()}
  ></div>
  <dialog
    open
    class="modal modal-nested"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => addCustomerSubmitting && e.preventDefault()}
  >
    <header>
      <h2>New Customer</h2>
      <button
        class="icon"
        aria-label="Close"
        disabled={addCustomerSubmitting}
        onclick={() => closeAddCustomerModal()}>✕</button
      >
    </header>
    <div class="modal-body">
      {#if addCustomerError}
        <p class="inline-error">{addCustomerError}</p>
      {/if}
      <div class="grid-compact">
        <label>
          <span>First name</span>
          <input
            type="text"
            bind:value={newFirstName}
            required
            disabled={addCustomerSubmitting}
          />
        </label>
        <label>
          <span>Last name</span>
          <input
            type="text"
            bind:value={newLastName}
            required
            disabled={addCustomerSubmitting}
          />
        </label>
        <label class="full-row">
          <span>Address</span>
          <input
            type="text"
            bind:value={newAddress}
            disabled={addCustomerSubmitting}
          />
        </label>
        <label class="full-row">
          <span>Phone</span>
          <input
            type="tel"
            bind:value={newPhone}
            required
            disabled={addCustomerSubmitting}
          />
        </label>
      </div>
    </div>
    <footer>
      <button
        type="button"
        class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        onclick={() => closeAddCustomerModal()}
        disabled={addCustomerSubmitting}>Cancel</button
      >
      <button
        type="button"
        class="primary"
        disabled={addCustomerSubmitting ||
          !newFirstName.trim() ||
          !newLastName.trim() ||
          !newPhone.trim()}
        onclick={submitAddCustomer}
      >
        {addCustomerSubmitting ? "Saving…" : "Save"}
      </button>
    </footer>
  </dialog>
{/if}

{#if showCancelModal && orderToCancel}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !cancelSubmitting && closeCancelModal()}
    onkeydown={(e) =>
      !cancelSubmitting &&
      (e.key === "Enter" || e.key === " ") &&
      closeCancelModal()}
  ></div>
  <dialog
    open
    class="modal"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => cancelSubmitting && e.preventDefault()}
  >
    <header>
      <h2>Cancel order</h2>
      <button
        class="icon"
        aria-label="Close"
        disabled={cancelSubmitting}
        onclick={() => closeCancelModal()}>✕</button
      >
    </header>
    <div class="modal-content">
      <p>Are you sure you want this order to be cancelled?</p>
      <div class="order-details">
        <p><strong>Customer:</strong> {orderToCancel.customer_name}</p>
        <p><strong>Phone:</strong> {orderToCancel.customer_phone}</p>
        <p>
          <strong>Quantity:</strong>
          {orderQtyCell(orderToCancel)}
        </p>
        <p>
          <strong>Total Amount:</strong>
          {formatMoney(orderToCancel.total_amount)}
        </p>
        <p><strong>Status:</strong> {orderToCancel.status}</p>
      </div>
      <p class="warning">
        Stock quantities for all order items will be restored. The order will
        stay on record as cancelled.
      </p>
      {#if String(orderToCancel.status ?? "")
        .trim()
        .toLowerCase() === "partially_paid"}
        {@const paidHint = totalPaidOnOrder(orderToCancel.id)}
        <fieldset class="cancel-refund-fieldset">
          <legend class="cancel-refund-legend">Partial payments recorded</legend
          >
          {#if paidHint > 0}
            <p class="cancel-refund-paid-hint muted-strong">
              Payments on file for this order: {formatMoney(paidHint)} (cash / bank).
              Choose how you settled with the customer.
            </p>
          {:else}
            <p class="cancel-refund-paid-hint muted-strong">
              Choose how partial payments should affect the customer ledger
              after cancellation.
            </p>
          {/if}
          <label class="cancel-refund-option">
            <input
              type="radio"
              name="partialCancelRefund"
              value="balance"
              bind:group={cancelPartialRefundChoice}
              disabled={cancelSubmitting}
            />
            <span>
              <strong>Refund to customer balance</strong>
              <span class="cancel-refund-detail"
                >Leave the paid amount as credit on their account (current
                behaviour).</span
              >
            </span>
          </label>
          <label class="cancel-refund-option">
            <input
              type="radio"
              name="partialCancelRefund"
              value="cash"
              bind:group={cancelPartialRefundChoice}
              disabled={cancelSubmitting}
            />
            <span>
              <strong>Refund in cash</strong>
              <span class="cancel-refund-detail"
                >You returned cash/bank takings outside the system — those
                payment lines are cleared from the ledger. Amounts that were
                only moved from customer balance are unchanged.</span
              >
            </span>
          </label>
        </fieldset>
      {/if}
    </div>
    <footer>
      <button
        type="button"
        class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        onclick={() => closeCancelModal()}
        disabled={cancelSubmitting}>Back</button
      >
      <button
        type="button"
        class="danger"
        onclick={confirmCancelOrder}
        disabled={cancelSubmitting}
        >{cancelSubmitting ? "Cancelling…" : "Confirm cancel"}</button
      >
    </footer>
  </dialog>
{/if}

<section class={mc.tableSection}>
  <div class="overflow-x-auto">
    <table class={mc.table}>
      <thead>
        <tr>
          <th class={mc.colNumHead}>#</th>
          <th class={mc.th}
            ><TableSortHeader
              label="Date"
              onclick={() => cycleSort("date")}
              ascActive={isSortActive("date", "asc")}
              descActive={isSortActive("date", "desc")}
            /></th
          >
          <th class={mc.th}
            ><TableSortHeader
              label="Stocks (Item)"
              onclick={() => cycleSort("stock")}
              ascActive={isSortActive("stock", "asc")}
              descActive={isSortActive("stock", "desc")}
            /></th
          >
          <th class={mc.th}
            ><TableSortHeader
              label="Customer"
              onclick={() => cycleSort("customer")}
              ascActive={isSortActive("customer", "asc")}
              descActive={isSortActive("customer", "desc")}
            /></th
          >
          <th class={mc.thCenter}
            ><TableSortHeader
              label="Quantity"
              align="center"
              onclick={() => cycleSort("quantity")}
              ascActive={isSortActive("quantity", "asc")}
              descActive={isSortActive("quantity", "desc")}
            /></th
          >
          <th class={mc.th}
            ><TableSortHeader
              label="Status"
              onclick={() => cycleSort("status")}
              ascActive={isSortActive("status", "asc")}
              descActive={isSortActive("status", "desc")}
            /></th
          >
          <th class={mc.th}
            ><TableSortHeader
              label="Total amount"
              onclick={() => cycleSort("total")}
              ascActive={isSortActive("total", "asc")}
              descActive={isSortActive("total", "desc")}
            /></th
          >
          <th class={mc.thCenter}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each pagedOrders as o, i}
          <tr
            class={mc.rowClickable}
            onclick={() => goto(`/orders/${o.id}`)}
            tabindex="0"
            role="button"
          >
            <td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
            <td class="{mc.td} whitespace-nowrap tabular-nums text-gray-500"
              >{formatOrderDate(o.created_at)}</td
            >
            <td class={mc.td}>
              {stockNameBase(orderStockName(o))}
              {#if stockNameMore(orderStockName(o))}
                <span class="font-semibold text-[#4DA0E6]">
                  {stockNameMore(orderStockName(o))}</span
                >
              {/if}
            </td>
            <td class={mc.td}>{o.customer_name}</td>
            <td class="{mc.tdCenter} whitespace-nowrap">{orderQtyCell(o)}</td>
            <td class={mc.td}
              ><span class={statusChipClass(o.status)}>{o.status}</span></td
            >
            <td class="{mc.td} font-semibold">{formatMoney(o.total_amount)}</td>
            <td class={mc.tdCenter}>
              {#if o.status !== "cancelled" && o.status !== "paid"}
                <button
                  type="button"
                  class="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  onclick={(e) => openCancelModal(o, e)}
                  aria-label="Cancel order"
                  title="Cancel order"
                >
                  Cancel
                </button>
              {:else}
                <span class="text-gray-400">—</span>
              {/if}
            </td>
          </tr>
        {/each}
        {#if sortedOrders.length === 0}
          <tr>
            <td colspan="8" class={mc.emptyCell}>
              {orders.length === 0
                ? "No orders found. Create your first order to get started."
                : "No orders match your current filters."}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
  <TablePagination
    bind:page={tablePage}
    bind:pageSize={tablePageSize}
    total={sortedOrders.length}
    resetKey={ordersPaginationResetKey}
  />
</section>

<style>
  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.6);
    backdrop-filter: blur(2px);
    z-index: 30;
  }
  .overlay-nested {
    z-index: 50;
  }
  .modal {
    position: fixed;
    inset: 0;
    margin: auto;
    max-width: 720px;
    width: calc(100% - 2rem);
    max-height: min(90vh, 900px);
    background: color-mix(in oklab, var(--surface), black 2%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.9rem;
    padding: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
  }
  .modal-wide {
    max-width: min(920px, 100vw - 2rem);
  }
  .modal-nested {
    z-index: 60;
    max-width: 420px;
    max-height: 85vh;
  }
  .modal header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem;
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
  .modal-body {
    padding: 1rem;
    overflow: auto;
    color: #e5e7eb;
  }
  .modal-content {
    padding: 1rem;
    color: white;
  }
  .block-label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0.5rem 0 0.25rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: #cbd5e1;
  }
  .native-select {
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.6rem;
    padding: 0.55rem 0.7rem;
    cursor: pointer;
  }
  .native-select.full {
    width: 100%;
  }

  .stock-combo-wrap {
    position: relative;
    min-width: 0;
  }
  .stock-combobox {
    position: relative;
    width: 100%;
  }
  .stock-combobox-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    height: 2rem;
    padding-top: 0;
    padding-bottom: 0;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .stock-combobox-trigger-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stock-combobox-caret {
    flex-shrink: 0;
    opacity: 0.65;
    font-size: 0.7rem;
  }
  .stock-combobox-panel {
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border: 1px solid #e6eaed;
    border-radius: 0.6rem;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }
  .stock-combobox-panel--fixed {
    position: fixed;
    z-index: 10050;
    box-sizing: border-box;
  }
  .stock-combobox-search {
    width: 100%;
    box-sizing: border-box;
    padding: 0.65rem 0.75rem;
    font-size: 0.95rem;
    border: none;
    border-bottom: 1px solid #e6eaed;
    background: #f9fafb;
    color: #111827;
  }
  .stock-combobox-search::placeholder {
    color: #94a3b8;
  }
  .stock-combobox-search:focus {
    outline: none;
    background: #f1f5f9;
  }
  .stock-combobox-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    max-height: min(240px, 45vh);
    overflow-y: auto;
  }
  .stock-combobox-list--in-fixed-panel {
    flex: 1;
    min-height: 0;
    max-height: none;
  }
  .stock-combobox-option {
    width: 100%;
    display: block;
    text-align: left;
    padding: 0.45rem 0.65rem;
    margin: 0;
    border: none;
    background: transparent;
    color: #1f2937;
    font-size: 0.82rem;
    line-height: 1.35;
    cursor: pointer;
  }
  .stock-combobox-option:hover,
  .stock-combobox-option:focus-visible {
    background: #f1f5f9;
    outline: none;
  }
  .stock-combobox-empty {
    padding: 0.65rem 0.75rem;
    font-size: 0.85rem;
    color: #94a3b8;
    font-style: italic;
  }
  .linkish {
    margin: 0.25rem 0 1rem;
    background: none;
    border: none;
    color: var(--brand, #60a5fa);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 0;
    text-align: left;
  }
  .linkish:hover {
    text-decoration: underline;
  }
  .linkish:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    text-decoration: none;
  }
  .section-title {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: #111827;
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .line-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    grid-template-areas:
      "stock stock stock"
      "qty price remove"
      "unit unit unit";
    gap: 0.5rem;
    align-items: start;
    padding: 0.5rem;
    border-radius: 0.5rem;
    border: 1px solid #e6eaed;
    background: #f9fafb;
  }
  @media (min-width: 600px) {
    .line-row {
      grid-template-columns: 1fr 5.5rem 7rem 6.75rem 2.25rem;
      grid-template-areas: "stock qty unit price remove";
      align-items: end;
    }
  }
  .line-row.line-invalid {
    border-color: #f87171;
    box-shadow: 0 0 0 1px color-mix(in oklab, #ef4444, transparent 40%);
  }
  .line-row .grow {
    grid-area: stock;
    min-width: 0;
  }
  .line-row .qty {
    grid-area: qty;
    min-width: 0;
  }
  .line-row .unit-readonly {
    grid-area: unit;
  }
  .line-row .line-price {
    grid-area: price;
    min-width: 0;
  }
  .line-row .line-rm {
    grid-area: remove;
    align-self: center;
  }
  .line-row .qty input,
  .line-row .line-price input {
    width: 100%;
    height: 2rem;
    padding: 0.25rem 0.45rem;
    border-radius: 0.5rem;
    border: 1px solid #e6eaed;
    background: #ffffff;
    color: #111827;
  }
  .line-row .line-price input:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .line-row .unit-readonly {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    height: 2rem;
    padding: 0 0.5rem;
    border-radius: 0.5rem;
    border: 1px solid #e6eaed;
    background: #eef1f4;
    white-space: nowrap;
  }
  .line-row .unit-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
  }
  .line-row .unit-value {
    font-size: 0.88rem;
    font-weight: 600;
    color: #111827;
    line-height: 1;
  }
  .line-row .line-err {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.8rem;
    color: #fca5a5;
  }
  .line-actions {
    margin-top: 0.75rem;
  }
  .grid-compact {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
  }
  .grid-compact .full-row {
    grid-column: 1 / -1;
  }
  .grid-compact label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #cbd5e1;
  }
  .grid-compact input {
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
  }
  .inline-error {
    color: #fca5a5;
    font-size: 0.9rem;
    margin: 0 0 0.75rem;
  }
  .muted-strong {
    color: #cbd5e1;
    font-size: 0.9rem;
    margin: 0 0 0.75rem;
    line-height: 1.4;
  }
  .inline-error.muted-strong {
    color: #fca5a5;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  .order-details {
    background: #f9fafb;
    border: 1px solid #e6eaed;
    border-radius: 0.5rem;
    padding: 0.75rem;
    margin: 0.75rem 0;
  }
  .order-details p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
    color: #374151;
  }
  .warning {
    color: #ef4444;
    font-weight: 600;
    font-size: 0.9rem;
    margin: 0.75rem 0 0;
  }
  .cancel-refund-fieldset {
    margin: 1rem 0 0;
    padding: 0.85rem 0.95rem;
    border-radius: 0.65rem;
    border: 1px solid #e6eaed;
    background: #f9fafb;
  }
  .cancel-refund-legend {
    padding: 0 0.35rem;
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #94a3b8;
  }
  .cancel-refund-paid-hint {
    margin: 0 0 0.65rem;
  }
  .cancel-refund-option {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    margin: 0.55rem 0 0;
    cursor: pointer;
    font-size: 0.92rem;
    color: #e2e8f0;
    line-height: 1.35;
  }
  .cancel-refund-option input {
    margin-top: 0.2rem;
    flex-shrink: 0;
    accent-color: var(--brand, #3b82f6);
  }
  .cancel-refund-option strong {
    display: block;
    font-weight: 700;
    margin-bottom: 0.15rem;
  }
  .cancel-refund-detail {
    display: block;
    font-size: 0.82rem;
    font-weight: 400;
    color: #94a3b8;
    line-height: 1.4;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 1rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    flex-shrink: 0;
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

  /* Dark mode (dashboard): restore light text on the dark modal surfaces */
  :global(html.dark) .order-details {
    background: #0b1220;
    border-color: rgba(255, 255, 255, 0.1);
  }
  :global(html.dark) .order-details p {
    color: #e5e7eb;
  }
  :global(html.dark) .cancel-refund-fieldset {
    background: #0b1220;
    border-color: rgba(255, 255, 255, 0.1);
  }
  :global(html.dark) .line-row {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
  }
  :global(html.dark) .line-row .unit-readonly {
    background: #0b1220;
    border-color: rgba(255, 255, 255, 0.08);
  }
  :global(html.dark) .stock-combobox-trigger {
    background: #111827;
    color: #e5e7eb;
  }
  :global(html.dark) .stock-combobox-panel {
    background: #0f172a;
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
  }
  :global(html.dark) .stock-combobox-search {
    background: #0b1220;
    border-bottom-color: rgba(255, 255, 255, 0.1);
    color: #e5e7eb;
  }
  :global(html.dark) .stock-combobox-search:focus {
    background: #111827;
  }
  :global(html.dark) .stock-combobox-option:hover,
  :global(html.dark) .stock-combobox-option:focus-visible {
    background: rgba(255, 255, 255, 0.06);
  }
  :global(html.dark) .section-title {
    color: #e2e8f0;
  }
  :global(html.dark) .stock-combobox-search {
    color: #e5e7eb;
  }
  :global(html.dark) .stock-combobox-option {
    color: #e5e7eb;
  }
  :global(html.dark) .line-row .qty input,
  :global(html.dark) .line-row .line-price input {
    background: #111827;
    color: #e5e7eb;
    border-color: rgba(255, 255, 255, 0.12);
  }
  :global(html.dark) .line-row .unit-label {
    color: #94a3b8;
  }
  :global(html.dark) .line-row .unit-value {
    color: #e2e8f0;
  }
</style>
