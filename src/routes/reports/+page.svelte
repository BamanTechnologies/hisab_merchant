<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { soldUnitPriceForReportOrder } from "$lib/reportSoldPrice";
  import {
    buildStockLabel,
    formatCoffeeCapacityWithUnit,
  } from "$lib/stockLabel";
  import TablePagination from "$lib/components/TablePagination.svelte";
  import { mc, smsStatusChipClass } from "$lib/merchant-styles.js";
  import {
    SUBSCRIPTION_BLOCKED_MESSAGE,
    subscriptionBlocksMutations,
  } from "$lib/subscription/client";
  import { paginateSlice } from "$lib/pagination.js";
  import { afterToast, showToast, toastFromActionResult, TOAST_MS } from "$lib/toast";

  type Report = {
    id: string;
    investor_phone: string;
    sms_status: string;
    message: string;
    updated_at: string;
  };

  type Investor = {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  };

  type ReportData = {
    stocks: Array<{
      id: string;
      type?: string | null;
      product_type?: string | null;
      attributes?: Record<string, unknown> | null;
      model_number?: string | null;
      country?: string | null;
      thickness?: number | string | null;
      color?: string | null;
      figure?: string | null;
      quantity: number;
      selling_price: string;
      factor?: number | string | null;
    }>;
    orders: Array<{
      id: string;
      stock_id: string;
      stock_name?: string;
      order_quantity: number;
      total_amount: string;
      created_at: string;
      customer_name: string;
      selling_price: string;
    }>;
    orders_aggregate: {
      aggregate: {
        sum: {
          total_amount: string;
        };
      };
    };
    payments: Array<{
      id: string;
      amount: string;
      payment_method: string;
      created_at: string;
      customer_name: string;
      selling_price: string;
    }>;
    payments_aggregate: {
      aggregate: {
        sum: {
          amount: string;
        };
      };
    };
    investor_by_pk: {
      id: string;
      first_name: string;
      phone_number: string;
    };
    merchant_by_pk: {
      id: string;
      first_name: string;
      last_name: string;
    };
  };

  let { data }: { data: PageData } = $props();
  const reports = (data.reports ?? []) as Report[];
  const investors = data.investors;

  let selectedReport = $state<Report | null>(null);
  let showModal = $state(false);
  let showGenerateModal = $state(false);
  let showPreviewModal = $state(false);
  let selectedInvestor = $state<Investor | null>(null);
  let generatedReportData = $state<ReportData | null>(null);
  let errorMessage = $state("");
  let successMessage = $state("");
  let generateReportPending = $state(false);
  let sendReportPending = $state(false);
  let resendReportPending = $state(false);
  const subscriptionLocked = $derived($subscriptionBlocksMutations);
  let tablePage = $state(1);
  let tablePageSize = $state(10);

  const pagedReports = $derived(paginateSlice(reports, tablePage, tablePageSize));

  function formatDate(dateString: string) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      return "Invalid Date";
    }
  }

  function reportStockTypeLabel(t: string | null | undefined) {
    if (t === "glass") return "Glass";
    if (t === "brake_lining" || t === "brake_pad" || t === "break_pad")
      return "Brake lining";
    if (t === "coffee_tools") return "Coffee tools";
    return t && String(t).trim() !== "" ? String(t) : "—";
  }

  function reportDash(v: unknown) {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }

  /** Hasura / JSON may return `attributes` as object or stringified JSON. */
  function reportStockAttributes(
    stock: ReportData["stocks"][number],
  ): Record<string, unknown> {
    const raw = stock.attributes;
    if (raw == null) return {};
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }
    if (typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  function reportStockTypeKey(s: {
    type?: string | null;
    product_type?: string | null;
  }) {
    return String(s.type ?? s.product_type ?? "")
      .trim()
      .toLowerCase();
  }

  /** Model #: legacy column first, then JSONB `attributes.model_number` when needed. */
  function reportStockModelCell(stock: ReportData["stocks"][number]) {
    const top = stock.model_number != null ? String(stock.model_number).trim() : "";
    if (top !== "") return reportDash(top);
    const attrs = reportStockAttributes(stock);
    const m =
      attrs.model_number != null ? String(attrs.model_number).trim() : "";
    return reportDash(m || null);
  }

  /** Name: `attributes.name` when present (e.g. coffee_tools); future types can use alongside model #. */
  function reportStockNameCell(stock: ReportData["stocks"][number]) {
    const attrs = reportStockAttributes(stock);
    const n = attrs.name != null ? String(attrs.name).trim() : "";
    return reportDash(n || null);
  }

  /** Align with `buildStockLabel`: JSONB first, then legacy columns (glass etc.). */
  function reportStockCountryCell(stock: ReportData["stocks"][number]) {
    const attrs = reportStockAttributes(stock);
    const fromAttr =
      attrs.country != null ? String(attrs.country).trim() : "";
    if (fromAttr !== "") return reportDash(fromAttr);
    return reportDash(stock.country);
  }

  function reportStockColorCell(stock: ReportData["stocks"][number]) {
    const attrs = reportStockAttributes(stock);
    const fromAttr = attrs.color != null ? String(attrs.color).trim() : "";
    if (fromAttr !== "") return reportDash(fromAttr);
    return reportDash(stock.color);
  }

  function reportStockFigureCell(stock: ReportData["stocks"][number]) {
    const attrs = reportStockAttributes(stock);
    const fromAttr = attrs.figure != null ? String(attrs.figure).trim() : "";
    if (fromAttr !== "") return reportDash(fromAttr);
    return reportDash(stock.figure);
  }

  /** Same resolution order as `soldUnitPriceForReportOrder` / order creation. */
  function reportStockFactorCell(stock: ReportData["stocks"][number]) {
    const attrs = reportStockAttributes(stock);
    const fromAttr = attrs.factor;
    const fromCol = stock.factor;
    const pick =
      fromAttr != null && String(fromAttr).trim() !== ""
        ? fromAttr
        : fromCol != null && String(fromCol).trim() !== ""
          ? fromCol
          : null;
    return reportDash(pick);
  }

  function reportStockThicknessCell(stock: ReportData["stocks"][number]) {
    if (reportStockTypeKey(stock) === "coffee_tools") {
      const cap = formatCoffeeCapacityWithUnit(reportStockAttributes(stock));
      return cap.trim() !== "" ? cap : "—";
    }
    const attrs = reportStockAttributes(stock);
    const fromAttr =
      attrs.thickness != null ? String(attrs.thickness).trim() : "";
    if (fromAttr !== "") return reportDash(fromAttr);
    return reportDash(stock.thickness);
  }
  function formatMoney(v: number | string | null | undefined): string {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^0-9.-]/g, ""))
        : Number(v ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `ETB ${safe.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }
  const reportStockNameByStockId = $derived.by(() => {
    const map = new Map<string, string>();
    for (const s of generatedReportData?.stocks ?? []) {
      map.set(
        s.id,
        buildStockLabel({
          ...s,
          attributes: reportStockAttributes(s),
        }),
      );
    }
    return map;
  });

  function isFailedSmsStatus(status: string) {
    const s = status.toLowerCase();
    return s === "failed" || s === "error";
  }

  function openModal(report: Report) {
    selectedReport = report;
    showModal = true;
  }

  function closeModal() {
    if (resendReportPending) return;
    showModal = false;
    selectedReport = null;
  }

  function openGenerateModal() {
    if (subscriptionLocked) return;
    showGenerateModal = true;
    selectedInvestor = null;
  }

  function closeGenerateModal() {
    if (generateReportPending) return;
    showGenerateModal = false;
    selectedInvestor = null;
  }

  function selectInvestor(investor: Investor) {
    selectedInvestor = investor;
  }

  function generateReport() {
    if (!selectedInvestor) return;
    // Form will submit naturally to server action
  }

  function closePreviewModal() {
    if (sendReportPending) return;
    showPreviewModal = false;
    generatedReportData = null;
  }

  function sendReport() {
    if (!generatedReportData) return;
    // Form will submit naturally to server action
  }

</script>

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>Reports</h1>
    <p class={mc.pageSubtitle}>Investor SMS reports and delivery status.</p>
  </div>
  <button
    type="button"
    class={mc.primaryBtn}
    onclick={openGenerateModal}
    disabled={subscriptionLocked}
    title={subscriptionLocked ? SUBSCRIPTION_BLOCKED_MESSAGE : undefined}
  >
    Generate Report
  </button>
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

{#if reports.length === 0}
  <p class="rounded-xl bg-white px-6 py-10 text-center text-sm text-gray-500">
    No reports found.
  </p>
{:else}
  <section class={mc.tableSection}>
    <div class="overflow-x-auto">
      <table class={mc.table}>
        <thead>
          <tr>
            <th class={mc.colNumHead}>#</th>
            <th class={mc.th}>Date</th>
            <th class={mc.th}>Investor Phone</th>
            <th class={mc.th}>SMS Status</th>
            <th class={mc.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each pagedReports as report, i (report.id)}
            <tr class={mc.rowClickable} onclick={() => openModal(report)}>
              <td class={mc.colNum}>{(tablePage - 1) * tablePageSize + i + 1}</td>
              <td class="{mc.td} whitespace-nowrap tabular-nums text-gray-500">{formatDate(report.updated_at)}</td>
              <td class={mc.td}>{report.investor_phone}</td>
              <td class={mc.td}>
                <span class={smsStatusChipClass(report.sms_status)}>
                  {report.sms_status}
                </span>
              </td>
              <td class={mc.td} onclick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  class={mc.tableBtn}
                  onclick={(e) => {
                    e.stopPropagation();
                    openModal(report);
                  }}
                >
                  View Message
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <TablePagination bind:page={tablePage} bind:pageSize={tablePageSize} total={reports.length} />
  </section>
{/if}

{#if showModal && selectedReport}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !resendReportPending && closeModal()}
    onkeydown={(e) =>
      e.key === "Escape" && !resendReportPending && closeModal()}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) =>
        e.key === "Escape" && !resendReportPending && closeModal()}
    >
      <header>
        <h2>SMS Message Details</h2>
        <button
          class="icon"
          aria-label="Close"
          disabled={resendReportPending}
          onclick={closeModal}>✕</button
        >
      </header>

      <div class="message-content">
        <div class="message-header">
          <div class="message-info">
            <div class="info-item">
              <span class="label">To:</span>
              <span>{selectedReport.investor_phone}</span>
            </div>
            <div class="info-item">
              <span class="label">Status:</span>
              <span class={smsStatusChipClass(selectedReport.sms_status)}>
                {selectedReport.sms_status}
              </span>
            </div>
            <div class="info-item">
              <span class="label">Sent:</span>
              <span>{formatDate(selectedReport.updated_at)}</span>
            </div>
          </div>
        </div>

        <div class="message-body">
          <h3>Message Content:</h3>
          <div class="message-text">
            {selectedReport.message}
          </div>
        </div>
      </div>
      <footer class="message-footer">
        {#if isFailedSmsStatus(selectedReport.sms_status)}
          <form
            method="POST"
            action="?/resendReport"
            onsubmit={() => {
              errorMessage = "";
              successMessage = "";
            }}
            style="display: inline-flex; gap: 0.5rem;"
            use:enhance={() => {
              resendReportPending = true;
              return async ({ update, result }) => {
                try {
                  await update();
                } finally {
                  resendReportPending = false;
                }
                const t = toastFromActionResult(result);
                if (t) showToast(t.message, t.variant);
                const d =
                  result.type === "success" && result.data
                    ? (result.data as { success?: boolean; message?: string })
                    : null;
                if (d?.success) {
                  successMessage = d.message ?? "";
                  errorMessage = "";
                } else if (d && d.success === false) {
                  errorMessage = d.message ?? "";
                  successMessage = "";
                }
              };
            }}
          >
            <input type="hidden" name="report_id" value={selectedReport.id} />
            <button
              type="submit"
              class="primary small"
              disabled={resendReportPending || subscriptionLocked}
              title={subscriptionLocked ? SUBSCRIPTION_BLOCKED_MESSAGE : undefined}
            >
              {resendReportPending ? "Sending…" : "Resend"}
            </button>
          </form>
        {/if}
      </footer>
    </div>
  </div>
{/if}

{#if showGenerateModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !generateReportPending && closeGenerateModal()}
    onkeydown={(e) =>
      e.key === "Escape" && !generateReportPending && closeGenerateModal()}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) =>
        e.key === "Escape" && !generateReportPending && closeGenerateModal()}
    >
      <header>
        <h2>Generate Investor Report</h2>
        <button
          class="icon"
          aria-label="Close"
          disabled={generateReportPending}
          onclick={closeGenerateModal}>✕</button
        >
      </header>

      <form
        class="form"
        method="POST"
        action="?/generateReport"
        onsubmit={generateReport}
        use:enhance={() => {
          generateReportPending = true;
          return async ({ update, result }) => {
            try {
              await update();
            } finally {
              generateReportPending = false;
            }
            const t = toastFromActionResult(result);
            if (t) showToast(t.message, t.variant);
            if (
              result.type === "success" &&
              result.data &&
              typeof result.data === "object"
            ) {
              const d = result.data as {
                success?: boolean;
                reportData?: ReportData;
              };
              if (d.success && d.reportData) {
                generatedReportData = d.reportData;
                showGenerateModal = false;
                showPreviewModal = true;
                selectedInvestor = null;
                successMessage = "";
                errorMessage = "";
              } else if (d.success === false) {
                errorMessage = "";
                successMessage = "";
              }
            }
          };
        }}
      >
        <div class="investor-selection">
          <span class="investor-selection-label">Select investor</span>
          <div class="investor-list" role="radiogroup" aria-label="Select investor">
            {#each investors as investor (investor.id)}
              <label
                class="investor-item"
                class:investor-item-selected={selectedInvestor?.id === investor.id}
              >
                <input
                  type="radio"
                  class="investor-radio"
                  name="investor_id"
                  value={investor.id}
                  checked={selectedInvestor?.id === investor.id}
                  disabled={generateReportPending}
                  onchange={() => selectInvestor(investor)}
                />
                <span class="investor-avatar" aria-hidden="true">
                  {(investor.first_name?.[0] ?? "").toUpperCase()}{(investor.last_name?.[0] ?? "").toUpperCase()}
                </span>
                <div class="investor-info">
                  <span class="investor-name"
                    >{investor.first_name} {investor.last_name}</span
                  >
                  <span class="investor-phone">{investor.phone_number}</span>
                </div>
              </label>
            {/each}
          </div>
        </div>

        {#if selectedInvestor}
          <input
            type="hidden"
            name="investor_phone"
            value={selectedInvestor.phone_number}
          />
        {/if}

        <footer>
          <button
            type="button"
            class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            onclick={closeGenerateModal}
            disabled={generateReportPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="primary"
            disabled={!selectedInvestor || generateReportPending || subscriptionLocked}
            title={subscriptionLocked ? SUBSCRIPTION_BLOCKED_MESSAGE : undefined}
          >
            {generateReportPending ? "Generating…" : "Generate Report"}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}

{#if showPreviewModal && generatedReportData}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={() => !sendReportPending && closePreviewModal()}
    onkeydown={(e) =>
      e.key === "Escape" && !sendReportPending && closePreviewModal()}
  >
    <div
      class="modal large"
      role="dialog"
      aria-modal="true"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) =>
        e.key === "Escape" && !sendReportPending && closePreviewModal()}
    >
      <header>
        <h2>Investor Report Preview</h2>
        <button
          class="icon"
          aria-label="Close"
          disabled={sendReportPending}
          onclick={closePreviewModal}>✕</button
        >
      </header>

      <div class="report-content">
        <div class="report-header">
          <h3>Report for {generatedReportData.investor_by_pk.first_name}</h3>
          <p>Phone: {generatedReportData.investor_by_pk.phone_number}</p>
          <p>
            Generated by: {generatedReportData.merchant_by_pk.first_name}
            {generatedReportData.merchant_by_pk.last_name}
          </p>
        </div>

        <div class="report-section">
          <h4>Stocks ({generatedReportData.stocks.length})</h4>
          {#if generatedReportData.stocks.length > 0}
            <div class="data-table">
              <table>
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th>Type</th>
                    <th>Model #</th>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Color</th>
                    <th>Figure</th>
                    <th>Thickness / Capacity</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {#each generatedReportData.stocks as stock, i (stock.id)}
                    <tr>
                      <td class="col-num">{i + 1}</td>
                      <td
                        >{reportStockTypeLabel(
                          stock.type ?? stock.product_type,
                        )}</td
                      >
                      <td>{reportStockModelCell(stock)}</td>
                      <td>{reportStockNameCell(stock)}</td>
                      <td>{reportStockCountryCell(stock)}</td>
                      <td>{reportStockColorCell(stock)}</td>
                      <td>{reportStockFigureCell(stock)}</td>
                      <td>{reportStockThicknessCell(stock)}</td>
                      <td>{stock.quantity}</td>
                      <td>{formatMoney(stock.selling_price)}</td>
                      <td>{reportStockFactorCell(stock)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="no-data">No stocks found</p>
          {/if}
        </div>

        <div class="report-section">
          <h4>Orders ({generatedReportData.orders.length})</h4>
          {#if generatedReportData.orders.length > 0}
            <div class="data-table">
              <table>
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th>Stock</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Total</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {#each generatedReportData.orders as order, i (`${order.id}-${order.stock_id}-${i}`)}
                    <tr>
                      <td class="col-num">{i + 1}</td>
                      <td
                        >{order.stock_name ??
                          reportStockNameByStockId.get(order.stock_id) ??
                          order.stock_id.slice(0, 8) + "…"}</td
                      >
                      <td>{order.order_quantity}</td>
                      <td
                        >{formatMoney(soldUnitPriceForReportOrder(
                          order,
                          generatedReportData.stocks,
                        ))}</td
                      >
                      <td>{formatMoney(order.total_amount)}</td>
                      <td>{formatDate(order.created_at)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <div class="summary">
              <strong
                >Total Orders: {formatMoney(
                  generatedReportData.orders_aggregate.aggregate.sum.total_amount,
                )}</strong
              >
            </div>
          {:else}
            <p class="no-data">No orders found</p>
          {/if}
        </div>

        <div class="report-section">
          <h4>Payments ({generatedReportData.payments.length})</h4>
          {#if generatedReportData.payments.length > 0}
            <div class="data-table">
              <table>
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {#each generatedReportData.payments as payment, i (payment.id)}
                    <tr>
                      <td class="col-num">{i + 1}</td>
                      <td>{payment.customer_name}</td>
                      <td>{formatMoney(payment.amount)}</td>
                      <td>{payment.payment_method}</td>
                      <td>{formatDate(payment.created_at)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <div class="summary">
              <strong
                >Total Payments: {formatMoney(
                  generatedReportData.payments_aggregate.aggregate.sum.amount,
                )}</strong
              >
            </div>
          {:else}
            <p class="no-data">No payments found</p>
          {/if}
        </div>
      </div>

      <footer>
        <form
          method="POST"
          action="?/sendReport"
          onsubmit={sendReport}
          style="display: contents;"
          use:enhance={() => {
            sendReportPending = true;
            return async ({ update, result }) => {
              try {
                await update();
              } finally {
                sendReportPending = false;
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
                successMessage = "";
                errorMessage = "";
                afterToast(TOAST_MS, () => {
                  closePreviewModal();
                  window.location.reload();
                });
              }
            };
          }}
        >
          <input
            type="hidden"
            name="report_data"
            value={JSON.stringify(generatedReportData)}
          />
          <button
            type="button"
            class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            onclick={closePreviewModal}
            disabled={sendReportPending}
          >
            Close
          </button>
          <button
            type="submit"
            class="primary"
            disabled={sendReportPending || subscriptionLocked}
            title={subscriptionLocked ? SUBSCRIPTION_BLOCKED_MESSAGE : undefined}
          >
            {sendReportPending ? "Sending…" : "Send Report"}
          </button>
        </form>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* Modal-only styles (list page uses Tailwind via mc.*) */
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.45);
  }

  .modal {
    background: var(--surface-1);
    border-radius: 0.75rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    color: #e5e7eb;
  }

  .modal header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }

  .modal h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #f8fafc;
    margin: 0;
  }

  .icon {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
  }

  .icon:hover {
    background: color-mix(in oklab, var(--surface-2), white 10%);
    color: #e2e8f0;
  }

  .message-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.75rem 1.5rem 1rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    gap: 0.5rem;
  }

  .message-content {
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .message-header {
    margin-bottom: 1.5rem;
  }

  .message-info {
    display: grid;
    gap: 0.75rem;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .info-item .label {
    font-weight: 600;
    color: #374151;
    min-width: 60px;
  }

  .info-item span:not(.label) {
    color: #111827;
  }

  .message-body h3 {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.75rem;
  }

  .message-text {
    background: #f9fafb;
    border: 1px solid #e6eaed;
    border-radius: 0.5rem;
    padding: 1rem;
    color: #111827;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }

  .primary {
    appearance: none;
    border: 1px solid color-mix(in oklab, var(--brand), black 35%);
    background: var(--brand);
    color: #0b1220;
    font-weight: 700;
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
  }
  .primary.small {
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
  }

  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal.large {
    max-width: 900px;
    max-height: 90vh;
  }

  .report-content {
    padding: 1.5rem;
    max-height: 60vh;
    overflow-y: auto;
  }

  .report-header {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
  }

  .report-header h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
  }

  .report-header p {
    color: #4b5563;
    margin: 0.25rem 0;
  }

  .report-section {
    margin-bottom: 2rem;
  }

  .report-section h4 {
    font-size: 1.1rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 1rem;
  }

  .data-table {
    background: #ffffff;
    border-radius: 0.5rem;
    overflow-x: auto;
    border: 1px solid #e6eaed;
    margin-bottom: 1rem;
  }

  .data-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table th {
    background: #f2f2f2;
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    font-size: 0.875rem;
  }

  .data-table td {
    padding: 0.5rem 0.75rem;
    color: #374151;
    font-size: 0.875rem;
    border-bottom: 1px solid #eef0f2;
  }
  .col-num {
    width: 2.25rem;
    white-space: nowrap;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .summary {
    padding: 0.75rem;
    background: color-mix(in oklab, var(--surface-2), white 5%);
    border-radius: 0.5rem;
    color: #f8fafc;
  }

  .no-data {
    color: #94a3b8;
    font-style: italic;
    text-align: center;
    padding: 2rem;
  }

  /* Dark mode (dashboard): white-ish text on dark surfaces */
  :global(html.dark) .report-header {
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }

  :global(html.dark) .report-header h3,
  :global(html.dark) .report-section h4,
  :global(html.dark) .message-body h3,
  :global(html.dark) .info-item span:not(.label) {
    color: #f8fafc;
  }

  :global(html.dark) .report-header p,
  :global(html.dark) .info-item .label {
    color: #e5e7eb;
  }

  :global(html.dark) .data-table {
    background: #0b1220;
    border-color: rgba(255, 255, 255, 0.1);
  }

  :global(html.dark) .data-table th {
    background: #111827;
    color: #e5e7eb;
  }

  :global(html.dark) .data-table td {
    color: #cbd5e1;
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  :global(html.dark) .message-text {
    background: #0b1220;
    border-color: rgba(255, 255, 255, 0.1);
    color: #e5e7eb;
  }

  @media (max-width: 720px) {
    .modal {
      margin: 0.5rem;
      max-height: 90vh;
    }

    .data-table {
      overflow-x: auto;
    }

    .data-table table {
      min-width: 600px;
    }
  }
</style>
