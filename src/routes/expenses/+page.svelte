<script lang="ts">
  import { deserialize } from "$app/forms";
  import { goto } from "$app/navigation";
  import { navigating } from "$app/state";
  import { page } from "$app/stores";
  import TableLoading from "$lib/components/TableLoading.svelte";
  import TablePagination from "$lib/components/TablePagination.svelte";
  import TableSearchInput from "$lib/components/TableSearchInput.svelte";
  import TableSortHeader from "$lib/components/TableSortHeader.svelte";
  import SummaryMetricCard from "$lib/components/SummaryMetricCard.svelte";
  import { mc } from "$lib/merchant-styles.js";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";
  import {
    SUBSCRIPTION_BLOCKED_MESSAGE,
    subscriptionBlocksMutations,
  } from "$lib/subscription/client";
  import { afterToast, showToast, TOAST_MS } from "$lib/toast";
  import type { PageData } from "./$types";

  type ExpenseRow = PageData["expenses"][number];

  let { data }: { data: PageData } = $props();

  let expenses = $state(data.expenses as ExpenseRow[]);
  let totalCount = $state((data as { totalCount: number }).totalCount ?? 0);
  let totalOperationalExpenseAmount = $state(
    (data as { totalOperationalExpenseAmount: number }).totalOperationalExpenseAmount ?? 0,
  );
  let totalMajorExpenseAmount = $state(
    (data as { totalMajorExpenseAmount: number }).totalMajorExpenseAmount ?? 0,
  );

  let searchQuery = $state($page.url.searchParams.get("search") ?? "");
  let typeFilter = $state(
    ($page.url.searchParams.get("type") as "all" | "operation" | "major") ?? "all",
  );
  let dateRangePreset = $state(
    ($page.url.searchParams.get("dateRange") as "all" | "today" | "last7" | "last30" | "custom") ?? "all",
  );
  let customDateFrom = $state($page.url.searchParams.get("from") ?? "");
  let customDateTo = $state($page.url.searchParams.get("to") ?? "");
  let categoryFilter = $state($page.url.searchParams.get("category") ?? "all");
  let sortColumn = $state<string>(
    $page.url.searchParams.get("sort") ?? "none",
  );
  let sortDirection = $state<"asc" | "desc">(
    ($page.url.searchParams.get("dir") as "asc" | "desc") ?? "desc",
  );
  let tablePage = $state(Number($page.url.searchParams.get("page")) || 1);
  let tablePageSize = $state(Number($page.url.searchParams.get("pageSize")) || 10);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressPageNav = $state(false);

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
  const isMajorOnly = $derived(typeFilter === "major");
  const isOperationOnly = $derived(typeFilter === "operation");
  const hasFilters = $derived(
    searchQuery || typeFilter !== "all" || dateRangePreset !== "all" || categoryFilter !== "all",
  );
  const expenseTableCols = $derived(typeFilter === "all" ? 5 : typeFilter === "major" ? 7 : 9);

  $effect(() => {
    expenses = data.expenses as ExpenseRow[];
    totalCount = (data as { totalCount: number }).totalCount ?? 0;
    totalOperationalExpenseAmount = (data as { totalOperationalExpenseAmount: number }).totalOperationalExpenseAmount ?? 0;
    totalMajorExpenseAmount = (data as { totalMajorExpenseAmount: number }).totalMajorExpenseAmount ?? 0;
  });

  function allParamsFromState(): URLSearchParams {
    const p = new URLSearchParams();
    if (searchQuery) p.set("search", searchQuery);
    if (typeFilter && typeFilter !== "all") p.set("type", typeFilter);
    if (dateRangePreset && dateRangePreset !== "all")
      p.set("dateRange", dateRangePreset);
    if (dateRangePreset === "custom") {
      if (customDateFrom) p.set("from", customDateFrom);
      if (customDateTo) p.set("to", customDateTo);
    }
    if (categoryFilter && categoryFilter !== "all")
      p.set("category", categoryFilter);
    if (sortColumn && sortColumn !== "none") {
      p.set("sort", sortColumn);
      p.set("dir", sortDirection);
    }
    p.set("page", String(tablePage));
    p.set("pageSize", String(tablePageSize));
    return p;
  }

  function navigateWithState() {
    const params = allParamsFromState();
    const qs = params.toString();
    goto(qs ? `/expenses?${qs}` : "/expenses", { replaceState: true, keepFocus: true });
  }

  $effect(() => {
    const q = searchQuery;
    const currentSearch = $page.url.searchParams.get("search") ?? "";
    if (q === currentSearch) return;

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      suppressPageNav = true;
      tablePage = 1;
      navigateWithState();
      suppressPageNav = false;
    }, 600);
  });

  $effect(() => {
    const tf = typeFilter;
    const dr = dateRangePreset;
    const cf = categoryFilter;
    const fd = customDateFrom;
    const td = customDateTo;
    const urlType = $page.url.searchParams.get("type") ?? "all";
    const urlDr = $page.url.searchParams.get("dateRange") ?? "all";
    const urlCf = $page.url.searchParams.get("category") ?? "all";
    const urlFd = $page.url.searchParams.get("from") ?? "";
    const urlTd = $page.url.searchParams.get("to") ?? "";
    if (tf === urlType && dr === urlDr && cf === urlCf && fd === urlFd && td === urlTd) return;

    if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
      if (suppressPageNav) return;
      tablePage = 1;
      navigateWithState();
    }, 600);
    return () => {
      if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
    };
  });

  $effect(() => {
    if (suppressPageNav) return;
    const sc = sortColumn;
    const sd = sortDirection;
    const pg = tablePage;
    const ps = tablePageSize;
    const urlSort = $page.url.searchParams.get("sort") ?? "none";
    const urlDir = $page.url.searchParams.get("dir") ?? "desc";
    const urlPage = Number($page.url.searchParams.get("page")) || 1;
    const urlPageSize = Number($page.url.searchParams.get("pageSize")) || 10;
    if (sc === urlSort && sd === urlDir && pg === urlPage && ps === urlPageSize) return;
    navigateWithState();
  });

  function paymentLabel(p: string) {
    if (p === "bank transfer") return "Bank transfer";
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  function expenseTypeLabel(t: string) {
    const tr = get(_);
    const x = String(t ?? "").trim().toLowerCase();
    if (x === "major") return tr("major");
    return tr("operation");
  }

  function categoryLabel(c: string) {
    const v = String(c ?? "").trim().toLowerCase();
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
</script>

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>{$_('pageExpensesTitle')}</h1>
    <p class={mc.pageSubtitle}>{$_('pageExpensesSubtitle')}</p>
  </div>
  <div class="flex flex-wrap items-end gap-3">
    <TableSearchInput bind:value={searchQuery} placeholder={$_('searchDots')} />
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
    value={formatMoney(totalOperationalExpenseAmount)}
    label={$_('totalOperationalExpenses')}
    icon="four"
  />
  <SummaryMetricCard
    value={formatMoney(totalMajorExpenseAmount)}
    label={$_('totalMajorExpenses')}
    icon="six"
  />
</section>

<section class={mc.filterSection} aria-label="Filter expenses">
  <label>
    <span class={mc.filterLabel}>{$_('type')}</span>
    <select class={mc.filterSelect} bind:value={typeFilter}>
      <option value="all">{$_('all')}</option>
      {#each expenseTypes as t}
        <option value={t}>{expenseTypeLabel(t)}</option>
      {/each}
    </select>
  </label>
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
      {#if navigating.to}
        <TableLoading rows={1} cols={expenseTableCols} />
      {:else}
        {#each expenses as ex, i}
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
        {#if expenses.length === 0 && data.merchantBranchId}
          <tr>
            <td colspan={expenseTableCols} class={mc.emptyCell}>
              {hasFilters ? $_('noExpensesFiltered') : $_('noExpensesEmpty')}
            </td>
          </tr>
        {/if}
        {#if !data.merchantBranchId}
          <tr>
            <td colspan={expenseTableCols} class={mc.emptyCell}>
              {$_('noBranchExpensesSee')}
            </td>
          </tr>
        {/if}
      {/if}
    </tbody>
  </table>
  </div>
  <TablePagination
    bind:page={tablePage}
    bind:pageSize={tablePageSize}
    total={totalCount}
    resetKey={totalCount}
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
