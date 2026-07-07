<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { mc } from "$lib/merchant-styles.js";
  import {
    SUBSCRIPTION_BLOCKED_MESSAGE,
    subscriptionBlocksMutations,
  } from "$lib/subscription/client";
  import { formatCoffeeCapacityWithUnit } from "$lib/stockLabel";
  import { afterToast, showToast, toastFromActionResult, TOAST_MS } from "$lib/toast";
  import type { PageData } from "./$types";

  type Investor = {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
  };
  type ProductRef = {
    id?: string | null;
    name?: string | null;
    product_type?: { id?: string | null; name?: string | null } | null;
    attributes?: Record<string, unknown> | null;
  };

  type Stock = {
    id: string;
    product_type?: { id?: string | null; name?: string | null } | null;
    attributes?: Record<string, unknown> | null;
    model_number?: string | null;
    country?: string | null;
    branch?: string | null;
    origin?: string | null;
    type?: string | null;
    color?: string | null;
    created_by: string;
    figure?: string | null;
    investors: string[];
    merchant: {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
    };
    quantity: number;
    selling_price: number | string;
    factor?: number | null;
    thickness?: number | string | null;
    unit?: string | null;
    product?: ProductRef | null;
  };

  type TransferBranch = { id: string; name?: string | null };
  type TransferMerchant = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    branch: string;
  };

  let { data }: { data: PageData } = $props();
  const stock = data.stock as Stock | null;
  const stockHeldAtBranch = data.stockHeldAtBranch as
    | { id: string; name: string }
    | null
    | undefined;
  const originBranchName = data.originBranchName ?? null;
  const investors = data.investors;
  const transferTargetBranches = (data.transferTargetBranches ??
    []) as TransferBranch[];
  const merchantsInTransferBranches = (data.merchantsInTransferBranches ??
    []) as TransferMerchant[];

  let errorMessage = $state("");
  let successMessage = $state("");

  const investorNames = $derived(
    stock
      ? stock.investors
          .map((investorId: string) => {
            // If the investor ID is the merchant's ID, show "Myself"
            if (investorId === (data as any).merchantId) {
              return "Myself";
            }
            // Otherwise, find the investor in the investors list
            const investor = investors.find(
              (i: Investor) => i.id === investorId
            );
            return investor
              ? `${investor.first_name} ${investor.last_name}`
              : "Unknown";
          })
          .join(", ")
      : "-"
  );

  let showTransferModal = $state(false);
  let transferFormPending = $state(false);
  let transferQuantity = $state(0);
  let transferToBranchId = $state("");
  let transferNewMerchantId = $state("");

  const merchantsForDestinationBranch = $derived(
    transferToBranchId
      ? merchantsInTransferBranches.filter(
          (m) => m.branch === transferToBranchId
        )
      : []
  );

  const maxTransferQty = $derived(
    stock ? Math.max(0, Number(stock.quantity)) : 0,
  );
  const PRODUCT_TYPE_FIELDS: Record<string, string[]> = {
    glass: ["thickness", "color", "figure", "factor"],
    brake_lining: ["model_number", "country"],
    coffee_tools: ["name", "capacity", "capacity_unit"],
  };

  const canSubmitTransfer = $derived(
    !!transferToBranchId &&
      merchantsForDestinationBranch.length > 0 &&
      !!transferNewMerchantId &&
      transferQuantity > 0 &&
      transferQuantity <= maxTransferQty
  );

  const canTransferStock = $derived(
    !!stock &&
      Number(stock.quantity) > 0 &&
      !!stock.branch &&
      transferTargetBranches.length > 0
  );

  const subscriptionLocked = $derived($subscriptionBlocksMutations);

  function merchantOptionLabel(m: TransferMerchant) {
    const name = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
    return name || m.id;
  }

  function typeDisplay(t: string | null | undefined) {
    const x = String(t ?? "").trim();
    if (!x) return "—";
    if (x === "brake_lining" || x === "brake_pad" || x === "break_pad")
      return "Brake lining";
    return x
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }
  function productTypeName() {
    return String(stock?.product_type?.name ?? stock?.product?.product_type?.name ?? stock?.type ?? "")
      .trim()
      .toLowerCase();
  }
  function attributeLabel(key: string) {
    if (key === "model_number") return "Model No";
    if (key === "capacity_unit") return "Capacity unit";
    return key
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }
  function attr(key: string) {
    if (productTypeName() === "coffee_tools" && key === "capacity") {
      const merged = formatCoffeeCapacityWithUnit(stock?.attributes ?? null);
      if (merged) return merged;
    }
    const attrs = {...(stock?.product?.attributes ?? {}), ...(stock?.attributes ?? {})} as Record<string, unknown>;
    const fallback: Record<string, unknown> = {
      model_number: stock?.model_number,
      country: stock?.country,
      thickness: stock?.thickness,
      color: stock?.color,
      figure: stock?.figure,
      factor: stock?.factor,
    };
    return dash(attrs?.[key] ?? fallback[key]);
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
  const dynamicFields = $derived.by(() => {
    const raw =
      PRODUCT_TYPE_FIELDS[productTypeName()] ??
      Object.keys(stock?.attributes ?? {});
    if (productTypeName() === "coffee_tools") {
      return raw.filter((k) => k !== "capacity_unit");
    }
    return raw;
  });
  function dash(v: unknown) {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }
  const quantityDisplay = $derived.by(() => {
    if (!stock) return "—";
    const u = (stock.unit ?? "").trim();
    return u ? `${stock.quantity} ${u}` : String(stock.quantity);
  });

  const productName = $derived(
    stock?.product?.name?.trim() ? stock.product.name : null,
  );
  const staffName = $derived(
    stock
      ? [stock.merchant?.first_name, stock.merchant?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() || "—"
      : "—",
  );

  const stockDetailRows = $derived.by(() => {
    if (!stock) return [] as { label: string; value: string }[];
    const rows: { label: string; value: string }[] = [];
    if (productName) {
      rows.push({ label: "Product", value: productName });
    }
    rows.push({
      label: "Origin",
      value: stock.origin ? (originBranchName ?? "—") : "—",
    });
    for (const key of dynamicFields) {
      rows.push({ label: attributeLabel(key), value: attr(key) });
    }
    rows.push({ label: "Investors", value: investorNames });
    rows.push({ label: "Staff", value: staffName });
    return rows;
  });

  function openTransferModal() {
    if (subscriptionLocked) return;
    errorMessage = "";
    successMessage = "";
    transferQuantity = Number(stock?.quantity ?? 0);
    transferToBranchId = "";
    transferNewMerchantId = "";
    showTransferModal = true;
  }

  function closeTransferModal() {
    if (transferFormPending) return;
    showTransferModal = false;
    transferToBranchId = "";
    transferNewMerchantId = "";
  }

  function onTransferBranchChange() {
    transferNewMerchantId = "";
  }

  function submitTransfer(e: Event) {
    errorMessage = "";
    successMessage = "";
    if (!canSubmitTransfer) {
      e.preventDefault();
      if (transferQuantity <= 0 || transferQuantity > maxTransferQty) {
        errorMessage = `Enter a quantity greater than 0 and at most ${maxTransferQty}.`;
      } else if (transferToBranchId && merchantsForDestinationBranch.length === 0) {
        errorMessage =
          "No merchants are assigned to the selected branch. Add a merchant first.";
      } else if (!transferNewMerchantId) {
        errorMessage = "Select a merchant for the destination branch.";
      }
    }
  }

  function statusClass(s: string) {
    if (s === "fully paid") return "ok";
    if (s === "partially paid") return "warn";
    return "bad";
  }
</script>

<section class={mc.pageHeader}>
  <div>
    <h1 class={mc.pageTitle}>Stock Details</h1>
    {#if stock}
      <p class={mc.pageSubtitle}>{typeDisplay(productTypeName())}</p>
    {/if}
  </div>
  {#if stock}
    <button
      type="button"
      class={mc.primaryBtn}
      onclick={openTransferModal}
      disabled={!canTransferStock || subscriptionLocked}
      title={subscriptionLocked
        ? SUBSCRIPTION_BLOCKED_MESSAGE
        : !canTransferStock
        ? !stock?.branch
          ? "Stock has no branch"
          : transferTargetBranches.length === 0
            ? "No other branches in the same company"
            : Number(stock?.quantity) <= 0
              ? "No quantity to transfer"
              : "Cannot transfer"
        : "Move this stock to another branch in the same company"}
    >
      Transfer stock
    </button>
  {/if}
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

{#if stock}
  <div class={mc.tableSection}>
    <div class="border-b border-[#e6eaed] bg-[#f2f2f2] px-5 py-4 dark:border-white/10 dark:bg-[#111827]">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Product type
          </p>
          <p class="mt-1 text-lg font-semibold text-[#1a1a1a] dark:text-gray-100">
            {typeDisplay(productTypeName())}
          </p>
        </div>
        <div class="flex flex-wrap gap-8 sm:gap-10">
          <div>
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Selling price</p>
            <p class="mt-1 text-lg font-bold tabular-nums text-[#1a1a1a] dark:text-gray-100">
              {formatMoney(stock.selling_price)}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Quantity on hand</p>
            <p class="mt-1 text-lg font-bold tabular-nums text-[#1a1a1a] dark:text-gray-100">
              {quantityDisplay}
            </p>
          </div>
        </div>
      </div>
    </div>

    <dl class="grid divide-x divide-y divide-[#e6eaed] dark:divide-white/10 sm:grid-cols-2 lg:grid-cols-3">
      {#each stockDetailRows as row}
        <div class="bg-white px-5 py-3.5 dark:bg-[#0f172a]">
          <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">{row.label}</dt>
          <dd class="mt-1 text-sm font-medium leading-snug text-[#1a1a1a] dark:text-gray-100">
            {row.value}
          </dd>
        </div>
      {/each}
    </dl>
  </div>
{:else if stockHeldAtBranch}
  <div
    class="rounded-[5px] border border-[#e6eaed] bg-white px-5 py-4 dark:border-white/10 dark:bg-[#0f172a]"
    role="status"
  >
    <p class="text-base font-semibold text-[#1a1a1a] dark:text-gray-100">View this stock in its branch</p>
    <p class="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      Full stock details are available in the sender branch
      <strong class="font-semibold text-[#1a1a1a] dark:text-gray-100">{stockHeldAtBranch.name}</strong>.
      Switch your workspace to that branch (or ask a teammate there) to open this
      record.
    </p>
  </div>
{:else}
  <p class="text-sm text-gray-500 dark:text-gray-400">Stock not found.</p>
{/if}

  {#if showTransferModal && stock}
    <div
      class="modal-overlay"
      role="button"
      tabindex="0"
      onclick={() => !transferFormPending && closeTransferModal()}
      onkeydown={(e) =>
        !transferFormPending &&
        (e.key === "Enter" || e.key === " ") &&
        closeTransferModal()}
    ></div>
    <dialog
      open
      class="modal modal-compact"
      onclick={(e) => e.stopPropagation()}
      oncancel={(e) => transferFormPending && e.preventDefault()}
    >
      <header>
        <h2>Transfer stock</h2>
        <button
          class="icon"
          aria-label="Close"
          disabled={transferFormPending}
          onclick={closeTransferModal}>✕</button
        >
      </header>
      <form
        class="form transfer-form"
        method="POST"
        action="?/transferStock"
        onsubmit={submitTransfer}
        use:enhance={() => {
          transferFormPending = true;
          return async ({ update, result }) => {
            try {
              await update();
            } finally {
              transferFormPending = false;
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
              showTransferModal = false;
              transferToBranchId = "";
              transferNewMerchantId = "";
              afterToast(TOAST_MS, () => void invalidateAll());
            } else if (t?.variant === "error") {
              errorMessage = "";
            }
          };
        }}
      >
        <fieldset class="transfer-form-fields" disabled={transferFormPending}>
        <div class="grid grid-single">
          <label>
            <span>Quantity to transfer</span>
            <input
              type="number"
              name="quantity"
              bind:value={transferQuantity}
              min="0.0001"
              max={maxTransferQty || undefined}
              step="any"
              required
              title="Amount to move to the destination branch; source line is reduced by this amount"
            />
          </label>
          <label>
            <span>Move to</span>
            <select
              name="to_branch"
              bind:value={transferToBranchId}
              required
              class="native-select"
              onchange={onTransferBranchChange}
            >
              <option value="" disabled>Select branch</option>
              {#each transferTargetBranches as br}
                <option value={br.id}>{br.name ?? br.id}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>Merchant</span>
            <select
              name="stock_created_by"
              bind:value={transferNewMerchantId}
              class="native-select"
              required={merchantsForDestinationBranch.length > 0}
              disabled={!transferToBranchId ||
                merchantsForDestinationBranch.length === 0}
            >
              <option value="" disabled>
                {!transferToBranchId
                  ? "Select a branch first"
                  : merchantsForDestinationBranch.length === 0
                    ? "No merchants in this branch"
                    : "Select merchant"}
              </option>
              {#each merchantsForDestinationBranch as m}
                <option value={m.id}>{merchantOptionLabel(m)}</option>
              {/each}
            </select>
          </label>
        </div>
        </fieldset>
        <p class="transfer-note">
          A <strong>new stock line</strong> is created at the destination branch with
          the quantity you enter (same product details). This line’s
          <strong>created_by</strong> and <strong>updated_by</strong> are the
          selected merchant. The current line’s quantity is reduced and
          <strong>updated_by</strong> is set to you. A <strong>transfers</strong> row
          records from branch, to branch, <strong>quantity moved</strong>, and
          initiator.
        </p>
        <footer>
          <button
            type="button"
            class="ghost"
            onclick={closeTransferModal}
            disabled={transferFormPending}>
            Cancel
          </button>
          <button
            type="submit"
            class="primary"
            disabled={!canSubmitTransfer || transferFormPending}
            >{transferFormPending ? "Transferring…" : "Transfer"}</button
          >
        </footer>
      </form>
    </dialog>
  {/if}

<style>
  fieldset.transfer-form-fields {
    border: none;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .transfer-form .grid-single {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.9rem;
  }

  .transfer-note {
    margin: 0 0 0.5rem;
    font-size: 0.8125rem;
    color: #6b7280;
    line-height: 1.45;
  }
</style>
