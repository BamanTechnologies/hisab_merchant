<script lang="ts">
  import { deserialize } from "$app/forms";
  import { onMount } from "svelte";
  import TablePagination from "$lib/components/TablePagination.svelte";
  import TableSortHeader from "$lib/components/TableSortHeader.svelte";
  import SummaryMetricCard from "$lib/components/SummaryMetricCard.svelte";
  import { mc } from "$lib/merchant-styles.js";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";
  import {
    SUBSCRIPTION_BLOCKED_MESSAGE,
    subscriptionBlocksMutations,
  } from "$lib/subscription/client";
  import { paginateSlice } from "$lib/pagination.js";
  import { afterToast, showToast, TOAST_MS } from "$lib/toast";
  import type { PageData } from "./$types";

  type ExpenseRow = PageData["expenses"][number];

  let { data }: { data: PageData } = $props();

  let expenses = $state(data.expenses as ExpenseRow[]);
  let typeFilter = $state<"all" | "operation" | "major">("all");
  let dateRangePreset = $state<"all" | "today" | "last7" | "last30" | "custom">(
    "all",
  );
  let customDateFrom = $state("");
  let customDateTo = $state("");
  /** "all" or a category value from `categories` (operation + major rows store `category`). */
  let categoryFilter = $state<string>("all");
  let sortColumn = $state<string>("none");
  let sortDirection = $state<"asc" | "desc">("asc");
  let tablePage = $state(1);
  let tablePageSize = $state(10);
  let listStateReady = $state(false);

  $effect(() => {
    expenses = data.expenses as ExpenseRow[];
  });

  let showModal = $state(false);
  let submitting = $state(false);
  const subscriptionLocked = $derived($subscriptionBlocksMutations);
  let formError = $state("");
  let sentTo = $state("");
  let expenseType = $state<"operation" | "major">("operation");
  let fromPerson = $state("");
  let fromAccount = $state("");
  let toAccount = $state("");
  let category = $state("");
  let paymentType = $state("");
  let amount = $state("");
  let note = $state("");
  let receipt = $state("");

  const paymentTypes = data.paymentTypes ?? [];
  const expenseTypes = data.expenseTypes ?? ["operation", "major"];
  const categories = data.categories ?? [];
  const EXPENSE_LIST_STATE_KEY = "expenses:list-state:v2";

  function expenseCreatedInRange(ex: ExpenseRow): boolean {
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
    const created = new Date(ex.created_at ?? "").getTime();
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
    if (dateRangePreset === "custom") {
      if (fromInputTs != null && created < fromInputTs) return false;
      if (toInputTs != null && created > toInputTs) return false;
      return true;
    }
    return true;
  }

  function expenseMatchesCategory(ex: ExpenseRow): boolean {
    if (categoryFilter === "all") return true;
    return (
      String(ex.category ?? "")
        .trim()
        .toLowerCase() === categoryFilter.trim().toLowerCase()
    );
  }

  const filteredExpenses = $derived.by(() => {
    const byType =
      typeFilter === "all"
        ? expenses
        : expenses.filter(
            (ex) => (ex.expense_type ?? "operation") === typeFilter,
          );
    return byType.filter(
      (ex) => expenseCreatedInRange(ex) && expenseMatchesCategory(ex),
    );
  });

  const displayOperationalTotal = $derived.by(() => {
    let s = 0;
    for (const e of filteredExpenses) {
      if (String(e.expense_type ?? "operation").toLowerCase() === "operation")
        s += Number(e.amount ?? 0);
    }
    return s;
  });
  const displayMajorTotal = $derived.by(() => {
    let s = 0;
    for (const e of filteredExpenses) {
      if (String(e.expense_type ?? "").toLowerCase() === "major")
        s += Number(e.amount ?? 0);
    }
    return s;
  });
  const isMajorOnly = $derived(typeFilter === "major");
  const isOperationOnly = $derived(typeFilter === "operation");
  const sortedExpenses = $derived.by(() => {
    const base = filteredExpenses;
    if (sortColumn === "none") return base;
    return [...base].sort((a, b) => {
      const av =
        sortColumn === "date"
          ? new Date(a.created_at ?? 0).getTime()
          : sortColumn === "amount"
            ? Number(a.amount ?? 0)
            : sortColumn === "type"
              ? String(a.expense_type ?? "").toLowerCase()
              : sortColumn === "paid_by"
                ? String(a.from_person ?? "").toLowerCase()
                : sortColumn === "sent_to"
                  ? String(a.sent_to ?? "").toLowerCase()
                  : sortColumn === "from_account"
                    ? String(a.from_account ?? "").toLowerCase()
                    : sortColumn === "to_account"
                      ? String(a.to_account ?? "").toLowerCase()
                      : sortColumn === "category"
                        ? String(a.category ?? "").toLowerCase()
                        : String(a.payment_type ?? "").toLowerCase();
      const bv =
        sortColumn === "date"
          ? new Date(b.created_at ?? 0).getTime()
          : sortColumn === "amount"
            ? Number(b.amount ?? 0)
            : sortColumn === "type"
              ? String(b.expense_type ?? "").toLowerCase()
              : sortColumn === "paid_by"
                ? String(b.from_person ?? "").toLowerCase()
                : sortColumn === "sent_to"
                  ? String(b.sent_to ?? "").toLowerCase()
                  : sortColumn === "from_account"
                    ? String(b.from_account ?? "").toLowerCase()
                    : sortColumn === "to_account"
                      ? String(b.to_account ?? "").toLowerCase()
                      : sortColumn === "category"
                        ? String(b.category ?? "").toLowerCase()
                        : String(b.payment_type ?? "").toLowerCase();
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDirection === "asc" ? cmp : -cmp;
    });
  });

  const expensesPaginationResetKey = $derived(
    `${typeFilter}|${dateRangePreset}|${customDateFrom}|${customDateTo}|${categoryFilter}|${sortColumn}|${sortDirection}`,
  );
  const pagedExpenses = $derived(
    paginateSlice(sortedExpenses, tablePage, tablePageSize),
  );

  function paymentLabel(p: string) {
    if (p === "bank transfer") return "Bank transfer";
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  function expenseTypeLabel(t: string) {
    const tr = get(_);
    const x = String(t ?? "")
      .trim()
      .toLowerCase();
    if (x === "major") return tr("major");
    return tr("operation");
  }

  function categoryLabel(c: string) {
    const v = String(c ?? "")
      .trim()
      .toLowerCase();
    if (!v) return "—";
    if (v === "lc") return "LC";
    return String(c).replace(/\b\w/g, (ch) => ch.toUpperCase());
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
  function formatMoney(v: number | string | null | undefined): string {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^0-9.-]/g, ""))
        : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    const amount = safe.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return `ETB ${amount}`;
  }
  function detailsEntries(ex: ExpenseRow): Array<[string, string]> {
    const t = get(_);
    const type = String(ex.expense_type ?? "operation").toLowerCase();
    if (type === "major") {
      return [
        [t("paidBy"), ex.from_person || "—"],
        [t("fromAccount"), ex.from_account || "—"],
        [t("sentToName"), ex.sent_to || "—"],
        [t("toAccount"), ex.to_account || "—"],
      ];
    }
    return [
      [t("paidBy"), ex.from_person || "—"],
      [t("sentToName"), ex.sent_to || "—"],
      [t("category"), categoryLabel(ex.category)],
      [t("method"), paymentLabel(ex.payment_type)],
      [t("note"), ex.note?.trim() ? ex.note : "—"],
      [t("receiptOptional"), receiptPreview(ex.receipt)],
    ];
  }
  function cycleSort(col: string) {
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
  function isSortActive(col: string, dir: "asc" | "desc") {
    return sortColumn === col && sortDirection === dir;
  }

  function openModal() {
    if (subscriptionLocked) return;
    formError = "";
    expenseType = "operation";
    fromPerson = "";
    fromAccount = "";
    toAccount = "";
    sentTo = "";
    category = categories[0] ?? "";
    paymentType = paymentTypes[0] ?? "";
    amount = "";
    note = "";
    receipt = "";
    showModal = true;
  }

  function closeModal(force?: boolean) {
    if (force !== true && submitting) return;
    showModal = false;
  }

  async function submitExpense(e: Event) {
    e.preventDefault();
    if (submitting) return;
    formError = "";
    if (!data.merchantBranchId) {
      formError = get(_)("noBranchSave");
      showToast(get(_)("noBranchSave"), "error");
      return;
    }
    submitting = true;
    try {
      const fd = new FormData();
      fd.append("expense_type", expenseType);
      fd.append("from_person", fromPerson.trim());
      fd.append("from_account", fromAccount.trim());
      fd.append("to_account", toAccount.trim());
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
        formError = get(_)("couldNotSave");
        showToast(get(_)("couldNotSave"), "error");
        return;
      }
      const payload = result.data as { success?: boolean; message?: string };
      if (!payload.success) {
        formError = payload.message ?? get(_)("couldNotSave");
        showToast(payload.message ?? get(_)("couldNotSave"), "error");
        return;
      }
      showToast(payload.message ?? get(_)("expenseSaved"), "success");
      closeModal(true);
      afterToast(TOAST_MS, () => window.location.reload());
    } catch {
      formError = get(_)("couldNotSave");
      showToast(get(_)("couldNotSave"), "error");
    } finally {
      submitting = false;
    }
  }

  function applyListStateFromParams(params: URLSearchParams) {
    const nextType = String(params.get("type") ?? "")
      .trim()
      .toLowerCase();
    if (
      nextType === "operation" ||
      nextType === "major" ||
      nextType === "all"
    ) {
      typeFilter = nextType;
    } else {
      typeFilter = "all";
    }

    const d = String(params.get("date") ?? "")
      .trim()
      .toLowerCase();
    if (
      d === "today" ||
      d === "last7" ||
      d === "last30" ||
      d === "custom" ||
      d === "all"
    ) {
      if (d === "today") dateRangePreset = "today";
      else if (d === "last7") dateRangePreset = "last7";
      else if (d === "last30") dateRangePreset = "last30";
      else if (d === "custom") dateRangePreset = "custom";
      else dateRangePreset = "all";
    } else {
      dateRangePreset = "all";
    }
    customDateFrom = String(params.get("from") ?? "").trim();
    customDateTo = String(params.get("to") ?? "").trim();

    const catRaw = String(
      params.get("category") ?? params.get("cat") ?? "",
    ).trim();
    if (!catRaw || catRaw.toLowerCase() === "all") {
      categoryFilter = "all";
    } else {
      const found = categories.find(
        (c) => c.toLowerCase() === catRaw.toLowerCase(),
      );
      categoryFilter = found ?? "all";
    }
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const hasUrlState =
      params.has("type") ||
      params.has("date") ||
      params.has("from") ||
      params.has("to") ||
      params.has("category") ||
      params.has("cat");
    if (hasUrlState) {
      applyListStateFromParams(params);
    } else {
      try {
        const raw = window.sessionStorage.getItem(EXPENSE_LIST_STATE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            type?: string;
            date?: string;
            from?: string;
            to?: string;
            category?: string;
          };
          const fallback = new URLSearchParams();
          if (typeof parsed.type === "string")
            fallback.set("type", parsed.type);
          if (typeof parsed.date === "string")
            fallback.set("date", parsed.date);
          if (typeof parsed.from === "string")
            fallback.set("from", parsed.from);
          if (typeof parsed.to === "string") fallback.set("to", parsed.to);
          if (typeof parsed.category === "string")
            fallback.set("category", parsed.category);
          applyListStateFromParams(fallback);
        }
      } catch {}
    }
    listStateReady = true;
  });

  $effect(() => {
    if (!listStateReady) return;
    const params = new URLSearchParams();
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (dateRangePreset !== "all") params.set("date", dateRangePreset);
    if (dateRangePreset === "custom") {
      if (customDateFrom) params.set("from", customDateFrom);
      if (customDateTo) params.set("to", customDateTo);
    }
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
    window.sessionStorage.setItem(
      EXPENSE_LIST_STATE_KEY,
      JSON.stringify({
        type: typeFilter,
        date: dateRangePreset,
        from: customDateFrom,
        to: customDateTo,
        category: categoryFilter,
      }),
    );
  });
</script>

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>{$_('pageExpensesTitle')}</h1>
    <p class={mc.pageSubtitle}>{$_('pageExpensesSubtitle')}</p>
  </div>
  <div class="flex flex-wrap items-end gap-3">
    <label>
      <span class={mc.filterLabel}>{$_('type')}</span>
      <select class={mc.filterSelect} bind:value={typeFilter}>
        <option value="all">{$_('all')}</option>
        {#each expenseTypes as t}
          <option value={t}>{expenseTypeLabel(t)}</option>
        {/each}
      </select>
    </label>
    <button
      type="button"
      class={mc.primaryBtn}
      onclick={openModal}
      disabled={!data.merchantBranchId || subscriptionLocked}
      title={subscriptionLocked
        ? SUBSCRIPTION_BLOCKED_MESSAGE
        : !data.merchantBranchId
        ? "Assign a branch to your account to record expenses"
        : ""}
    >
      {$_('createExpense')}
    </button>
  </div>
</section>

{#if !data.merchantBranchId}
  <p class="mb-4 text-sm text-amber-800">
    {$_('noBranchExpensesMsg')}
  </p>
{/if}

{#if formError && !showModal}
  <div class={mc.alertError}>
    <p>{formError}</p>
  </div>
{/if}

<section class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Expense totals">
  <SummaryMetricCard
    value={formatMoney(displayOperationalTotal)}
    label={$_('totalOperationalExpenses')}
    icon="four"
  />
  <SummaryMetricCard
    value={formatMoney(displayMajorTotal)}
    label={$_('totalMajorExpenses')}
    icon="six"
  />
</section>

<section class={mc.filterSection} aria-label="Filter expenses">
  <label>
    <span class={mc.filterLabel}>{$_('dateRange')}</span>
    <select class={mc.filterSelect} bind:value={dateRangePreset}>
      <option value="all">{$_('allTime')}</option>
      <option value="today">{$_('today')}</option>
      <option value="last7">{$_('last7Days')}</option>
      <option value="last30">{$_('last30Days')}</option>
      <option value="custom">{$_('customRange')}</option>
    </select>
  </label>
  {#if dateRangePreset === "custom"}
    <label>
      <span class={mc.filterLabel}>{$_('from')}</span>
      <input
        type="date"
        class="{mc.filterDate} cursor-pointer"
        bind:value={customDateFrom}
      />
    </label>
    <label>
      <span class={mc.filterLabel}>{$_('to')}</span>
      <input
        type="date"
        class="{mc.filterDate} cursor-pointer"
        bind:value={customDateTo}
      />
    </label>
  {/if}
  <label>
    <span class={mc.filterLabel}>{$_('category')}</span>
    <select class={mc.filterSelect} bind:value={categoryFilter}>
      <option value="all">{$_('allCategories')}</option>
      {#each categories as c}
        <option value={c}>{categoryLabel(c)}</option>
      {/each}
    </select>
  </label>
</section>

<section class={mc.tableSection}>
  <div class="overflow-x-auto">
  <table class={mc.table}>
    <thead>
      {#if isMajorOnly}
        <tr>
          <th class={mc.colNumHead}>{$_('number')}</th>
          <th class={mc.th}><TableSortHeader label={$_('date')} onclick={() => cycleSort("date")} ascActive={isSortActive("date", "asc")} descActive={isSortActive("date", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('amount')} onclick={() => cycleSort("amount")} ascActive={isSortActive("amount", "asc")} descActive={isSortActive("amount", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('paidBy')} onclick={() => cycleSort("paid_by")} ascActive={isSortActive("paid_by", "asc")} descActive={isSortActive("paid_by", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('fromAccount')} onclick={() => cycleSort("from_account")} ascActive={isSortActive("from_account", "asc")} descActive={isSortActive("from_account", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('sentToName')} onclick={() => cycleSort("sent_to")} ascActive={isSortActive("sent_to", "asc")} descActive={isSortActive("sent_to", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('toAccount')} onclick={() => cycleSort("to_account")} ascActive={isSortActive("to_account", "asc")} descActive={isSortActive("to_account", "desc")} /></th>
        </tr>
      {:else if isOperationOnly}
        <tr>
          <th class={mc.colNumHead}>{$_('number')}</th>
          <th class={mc.th}><TableSortHeader label={$_('date')} onclick={() => cycleSort("date")} ascActive={isSortActive("date", "asc")} descActive={isSortActive("date", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('amount')} onclick={() => cycleSort("amount")} ascActive={isSortActive("amount", "asc")} descActive={isSortActive("amount", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('paidBy')} onclick={() => cycleSort("paid_by")} ascActive={isSortActive("paid_by", "asc")} descActive={isSortActive("paid_by", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('sentToName')} onclick={() => cycleSort("sent_to")} ascActive={isSortActive("sent_to", "asc")} descActive={isSortActive("sent_to", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('category')} onclick={() => cycleSort("category")} ascActive={isSortActive("category", "asc")} descActive={isSortActive("category", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('method')} onclick={() => cycleSort("payment")} ascActive={isSortActive("payment", "asc")} descActive={isSortActive("payment", "desc")} /></th>
          <th class={mc.th}>{$_('note')}</th>
          <th class={mc.th}>{$_('receiptOptional')}</th>
        </tr>
      {:else}
        <tr>
          <th class={mc.colNumHead}>{$_('number')}</th>
          <th class={mc.th}><TableSortHeader label={$_('date')} onclick={() => cycleSort("date")} ascActive={isSortActive("date", "asc")} descActive={isSortActive("date", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('type')} onclick={() => cycleSort("type")} ascActive={isSortActive("type", "asc")} descActive={isSortActive("type", "desc")} /></th>
          <th class={mc.th}><TableSortHeader label={$_('amount')} onclick={() => cycleSort("amount")} ascActive={isSortActive("amount", "asc")} descActive={isSortActive("amount", "desc")} /></th>
          <th class={mc.th}>{$_('actions')}</th>
        </tr>
      {/if}
    </thead>
    <tbody>
      {#each pagedExpenses as ex, i}
        {#if isMajorOnly}
          <tr class="hover:bg-gray-50 dark:hover:bg-white/5">
            <td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
            <td class="{mc.td} whitespace-nowrap tabular-nums text-gray-500">{formatDate(ex.created_at)}</td>
            <td class="{mc.td} font-semibold">{formatMoney(ex.amount)}</td>
            <td class={mc.td}>{ex.from_person || "—"}</td>
            <td class={mc.td}>{ex.from_account || "—"}</td>
            <td class={mc.td}>{ex.sent_to || "—"}</td>
            <td class={mc.td}>{ex.to_account || "—"}</td>
          </tr>
        {:else if isOperationOnly}
          <tr class="hover:bg-gray-50 dark:hover:bg-white/5">
            <td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
            <td class="{mc.td} whitespace-nowrap tabular-nums text-gray-500">{formatDate(ex.created_at)}</td>
            <td class="{mc.td} font-semibold">{formatMoney(ex.amount)}</td>
            <td class={mc.td}>{ex.from_person || "—"}</td>
            <td class={mc.td}>{ex.sent_to}</td>
            <td class={mc.td}>{categoryLabel(ex.category)}</td>
            <td class={mc.td}>{paymentLabel(ex.payment_type)}</td>
            <td class={mc.td}>{ex.note?.trim() ? ex.note : "—"}</td>
            <td class={mc.td} title={ex.receipt ?? ""}>{receiptPreview(ex.receipt)}</td>
          </tr>
        {:else}
          <tr class="hover:bg-gray-50 dark:hover:bg-white/5">
            <td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
            <td class="{mc.td} whitespace-nowrap tabular-nums text-gray-500">{formatDate(ex.created_at)}</td>
            <td class={mc.td}>{expenseTypeLabel(ex.expense_type ?? "operation")}</td>
            <td class="{mc.td} font-semibold">{formatMoney(ex.amount)}</td>
            <td class={mc.td}>
              <div class="attr-stack">
                {#each detailsEntries(ex) as [k, v]}
                  <div class="attr-row">
                    <span class="attr-key">{k}</span>
                    <span class="attr-sep">:</span>
                    <span class="attr-val">{v}</span>
                  </div>
                {/each}
              </div>
            </td>
          </tr>
        {/if}
      {/each}
      {#if filteredExpenses.length === 0 && data.merchantBranchId}
        <tr>
          <td
            colspan={typeFilter === "all" ? 5 : typeFilter === "major" ? 7 : 9}
            class={mc.emptyCell}
          >
              {#if expenses.length > 0}
                {$_('noExpensesFiltered')}
              {:else}
                {$_('noExpensesEmpty')}
              {/if}
          </td>
        </tr>
      {/if}
      {#if !data.merchantBranchId}
        <tr>
          <td
            colspan={typeFilter === "all" ? 5 : typeFilter === "major" ? 7 : 9}
            class={mc.emptyCell}
          >
              {$_('noBranchExpensesSee')}
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
  </div>
  <TablePagination
    bind:page={tablePage}
    bind:pageSize={tablePageSize}
    total={sortedExpenses.length}
    resetKey={expensesPaginationResetKey}
  />
</section>

{#if showModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !submitting && closeModal()}
    onkeydown={(e) =>
      !submitting && (e.key === "Enter" || e.key === " ") && closeModal()}
  ></div>
  <dialog
    open
    class="modal modal-compact"
    onclick={(e) => e.stopPropagation()}
    oncancel={(e) => submitting && e.preventDefault()}
  >
    <header class="modal-head">
      <h2>{$_('createExpense')}</h2>
      <button
        type="button"
        class="icon-close"
        disabled={submitting}
        onclick={() => closeModal()}
        aria-label="Close">✕</button
      >
    </header>
    <form class="modal-body" onsubmit={submitExpense}>
      {#if formError}
        <p class="inline-error">{formError}</p>
      {/if}

      <fieldset class="expense-form-fields" disabled={submitting}>
        <label class="field">
          <span>{$_('expenseType')}</span>
          <select bind:value={expenseType} required class="native-select">
            {#each expenseTypes as t}
              <option value={t}>{expenseTypeLabel(t)}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>{$_('paidBy')}</span>
          <input
            type="text"
            name="from_person"
            bind:value={fromPerson}
            required
            autocomplete="name"
            placeholder={$_('whoReceived')}
          />
        </label>

        {#if expenseType === "major"}
          <label class="field">
            <span>{$_('fromAccount')}</span>
            <input
              type="text"
              name="from_account"
              bind:value={fromAccount}
              required
              placeholder={$_('bankOrSource')}
            />
          </label>

          <label class="field">
            <span>{$_('toAccount')}</span>
            <input
              type="text"
              name="to_account"
              bind:value={toAccount}
              required
              placeholder={$_('destAccount')}
            />
          </label>
        {/if}

        <label class="field">
          <span>{$_('sentToName')}</span>
          <input
            type="text"
            name="sent_to"
            bind:value={sentTo}
            required
            autocomplete="name"
            placeholder={$_('whoReceived')}
          />
        </label>

        <label class="field">
          <span>{$_('category')}</span>
          <select bind:value={category} required class="native-select">
            {#each categories as c}
              <option value={c}>{categoryLabel(c)}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>{$_('paymentType')}</span>
          <select bind:value={paymentType} required class="native-select">
            {#each paymentTypes as p}
              <option value={p}>{paymentLabel(p)}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>{$_('amountETB')}</span>
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
          <span>{$_('note')}</span>
          <textarea
            name="note"
            bind:value={note}
            rows="3"
            placeholder={$_('optionalDetails')}
          ></textarea>
        </label>

        <label class="field">
          <span>{$_('receiptOptional')}</span>
          <textarea
            name="receipt"
            bind:value={receipt}
            rows="2"
            placeholder={$_('refUrlDesc')}
          ></textarea>
        </label>
      </fieldset>

      <footer class="modal-foot">
        <button
          type="button"
          class="ghost"
          onclick={() => closeModal()}
          disabled={submitting}>{$_('cancel')}</button
        >
        <button type="submit" class="primary" disabled={submitting}>
          {submitting ? $_('saving') : $_('save')}
        </button>
      </footer>
    </form>
  </dialog>
{/if}

<style>
  fieldset.expense-form-fields {
    border: none;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .attr-stack {
    display: inline-flex;
    flex-direction: column;
    gap: 0.38rem;
  }
  .attr-row {
    display: inline-flex;
    align-items: baseline;
    column-gap: 0.35rem;
  }
  .attr-key {
    font-weight: 600;
  }
  .attr-sep {
    opacity: 0.75;
    margin: 0 0.15rem;
  }
</style>
