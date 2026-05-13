<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { formatCoffeeCapacityWithUnit } from "$lib/stockLabel";
  import { afterToast, showToast, toastFromActionResult, TOAST_MS } from "$lib/toast";
  import type { PageData } from "./$types";

  type Investor = {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string;
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
    };
    quantity: number;
    selling_price: number | string;
    factor?: number | null;
    thickness?: number | string | null;
    unit?: string | null;
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
    return String(stock?.product_type?.name ?? stock?.type ?? "")
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
    const attrs = (stock?.attributes ?? {}) as Record<string, unknown>;
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

  function openTransferModal() {
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

<section>
  <h1>Stock Details</h1>
  {#if stock}
    <div class="header-actions">
      <button
        type="button"
        class="secondary"
        onclick={openTransferModal}
        disabled={!canTransferStock}
        title={!canTransferStock
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
    </div>

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

    <div class="detail">
      <div>
        <span class="label">Type:</span><span class="value-chip">{typeDisplay(productTypeName())}</span>
      </div>
      <div>
        <span class="label">Origin:</span><span
          >{stock.origin ? originBranchName ?? "—" : "-"}</span
        >
      </div>
      <div>
        <span class="label">Selling price:</span><span
          >{formatMoney(stock.selling_price)}</span
        >
      </div>
      <div>
        <span class="label">Quantity:</span><span>{quantityDisplay}</span>
      </div>
      {#each dynamicFields as key}
        <div>
          <span class="label">{attributeLabel(key)}:</span><span>{attr(key)}</span>
        </div>
      {/each}
      <div>
        <span class="label">Investors:</span><span>{investorNames}</span>
      </div>
    </div>
  {:else if stockHeldAtBranch}
    <div class="held-elsewhere" role="status">
      <p class="held-elsewhere-title">View this stock in its branch</p>
      <p class="held-elsewhere-body">
        Full stock details are available in the sender branch
        <strong>{stockHeldAtBranch.name}</strong>. Switch your workspace to that
        branch (or ask a teammate there) to open this record.
      </p>
    </div>
  {:else}
    <p class="muted">Stock not found.</p>
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
</section>

<style>
  h1 {
    margin: 0 0 0.5rem;
  }
  .muted {
    color: #94a3b8;
  }
  .held-elsewhere {
    max-width: 32rem;
    padding: 1rem 1.15rem;
    border-radius: 0.9rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 14%);
    background: color-mix(in oklab, var(--surface-2), white 5%);
  }
  .held-elsewhere-title {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
    font-weight: 700;
    color: #e5e7eb;
  }
  .held-elsewhere-body {
    margin: 0;
    color: #cbd5e1;
    line-height: 1.55;
  }
  .held-elsewhere-body strong {
    color: #f1f5f9;
  }
  .header-actions {
    margin: 0 0 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .secondary {
    appearance: none;
    background: transparent;
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--brand), white 25%);
    font-weight: 700;
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    cursor: pointer;
  }
  .secondary:hover:not(:disabled) {
    background: color-mix(in oklab, var(--brand), black 85%);
    color: #0b1220;
  }
  .secondary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .modal-compact {
    max-width: 440px;
  }
  .transfer-form .grid-single {
    grid-template-columns: 1fr;
  }
  .native-select {
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.6rem;
    padding: 0.55rem 0.7rem;
    cursor: pointer;
  }
  .transfer-note {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    color: #94a3b8;
    line-height: 1.4;
  }
  fieldset.transfer-form-fields {
    border: none;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .detail {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 0.75rem 1.1rem;
    background:
      radial-gradient(
        120% 90% at 0% 0%,
        color-mix(in oklab, var(--brand), transparent 88%),
        transparent 55%
      ),
      color-mix(in oklab, var(--surface-2), white 4%);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.9rem;
    padding: 1.05rem 1.1rem;
    box-shadow: 0 14px 26px rgba(0, 0, 0, 0.22);
  }
  .detail > div {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
  }
  .label {
    color: #94a3b8;
    font-weight: 700;
  }
  .value-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--brand), black 70%);
    color: #dbeafe;
    font-weight: 700;
    font-size: 0.86rem;
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

  .primary:disabled {
    background: color-mix(in oklab, var(--surface-2), black 20%);
    border-color: color-mix(in oklab, var(--surface-2), black 20%);
    color: color-mix(in oklab, var(--text-2), black 30%);
    cursor: not-allowed;
    box-shadow: none;
    opacity: 0.6;
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
    color: #e5e7eb;
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
  input {
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.6rem;
    padding: 0.55rem 0.7rem;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    padding: 1rem;
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
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

  @media (max-width: 720px) {
    .detail {
      grid-template-columns: 1fr;
    }
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
