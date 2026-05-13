<script lang="ts">
  import type { PageData } from "./$types";

  type Transfer = {
    id: string;
    stock?: string | null;
    destination_stock?: string | null;
    from?: string | null;
    to?: string | null;
    created_by?: string | null;
    destination_merchant?: string | null;
    quantity?: number | string | null;
    created_at?: string | null;
  };

  type Branch = { id: string; name?: string | null };
  type Merchant = { id: string; first_name?: string | null; last_name?: string | null };

  let { data }: { data: PageData } = $props();

  const transfers = (data.transfers ?? []) as Transfer[];
  const branches = (data.branches ?? []) as Branch[];
  const merchants = (data.merchants ?? []) as Merchant[];
  const merchantId = (data.merchantId ?? "") as string;

  let fromFilter = $state("");
  let toFilter = $state("");
  let destinationMerchantFilter = $state("");
  let createdByFilter = $state("");

  function branchName(id: string | null | undefined) {
    if (!id) return "—";
    const b = branches.find((x) => x.id === id);
    return b?.name?.trim() ? b.name : `${id.slice(0, 8)}…`;
  }

  function merchantName(id: string | null | undefined) {
    if (!id) return "—";
    const m = merchants.find((x) => x.id === id);
    if (!m) return `${id.slice(0, 8)}…`;
    const full = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
    return full || `${id.slice(0, 8)}…`;
  }

  function formatDate(v: string | null | undefined) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function quantityLabel(v: number | string | null | undefined) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n.toLocaleString() : "—";
  }

  function nonEmptyStockId(v: string | null | undefined): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  }

  /** Link target: sender → source stock; receiver → destination line, or legacy `stock` if missing. */
  function chosenStockId(t: Transfer) {
    const isSender = t.created_by === merchantId;
    if (isSender) return nonEmptyStockId(t.stock);
    return nonEmptyStockId(t.destination_stock) ?? nonEmptyStockId(t.stock);
  }

  function clearFilters() {
    fromFilter = "";
    toFilter = "";
    destinationMerchantFilter = "";
    createdByFilter = "";
  }

  const senderMerchantIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const t of transfers) {
      if (t.created_by) ids.add(t.created_by);
    }
    return Array.from(ids);
  });

  const destinationMerchantIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const t of transfers) {
      if (t.destination_merchant) ids.add(t.destination_merchant);
    }
    return Array.from(ids);
  });

  const filteredTransfers = $derived.by(() =>
    transfers.filter((t) => {
      if (fromFilter && t.from !== fromFilter) return false;
      if (toFilter && t.to !== toFilter) return false;
      if (
        destinationMerchantFilter &&
        t.destination_merchant !== destinationMerchantFilter
      ) {
        return false;
      }
      if (createdByFilter && t.created_by !== createdByFilter) return false;
      return true;
    }),
  );
</script>

<section class="header">
  <div>
    <h1>Transfers</h1>
    <p class="muted">
      Transfers where you are sender or destination merchant.
    </p>
  </div>
</section>

<section class="filters">
  <label>
    <span>From</span>
    <select bind:value={fromFilter}>
      <option value="">All</option>
      {#each branches as b}
        <option value={b.id}>{branchName(b.id)}</option>
      {/each}
    </select>
  </label>
  <label>
    <span>To</span>
    <select bind:value={toFilter}>
      <option value="">All</option>
      {#each branches as b}
        <option value={b.id}>{branchName(b.id)}</option>
      {/each}
    </select>
  </label>
  <label>
    <span>Destination merchant</span>
    <select bind:value={destinationMerchantFilter}>
      <option value="">All</option>
      {#each destinationMerchantIds as id}
        <option value={id}>{merchantName(id)}</option>
      {/each}
    </select>
  </label>
  <label>
    <span>Created by</span>
    <select bind:value={createdByFilter}>
      <option value="">All</option>
      {#each senderMerchantIds as id}
        <option value={id}>{merchantName(id)}</option>
      {/each}
    </select>
  </label>
  <div class="filter-actions">
    <button class="ghost" type="button" onclick={clearFilters}>Clear</button>
  </div>
</section>

<section class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>#</th>
        <th>From</th>
        <th>To</th>
        <th>From merchant</th>
        <th>To merchant</th>
        <th class="right">Quantity</th>
        <th>Date</th>
        <th class="center">Action</th>
      </tr>
    </thead>
    <tbody>
      {#if filteredTransfers.length === 0}
        <tr>
          <td colspan="8" class="empty">
            No transfers found for current filters.
          </td>
        </tr>
      {:else}
        {#each filteredTransfers as t, i}
          {@const stockId = chosenStockId(t)}
          <tr>
            <td>{i + 1}</td>
            <td>{branchName(t.from)}</td>
            <td>{branchName(t.to)}</td>
            <td>{merchantName(t.created_by)}</td>
            <td>{merchantName(t.destination_merchant)}</td>
            <td class="right">{quantityLabel(t.quantity)}</td>
            <td>{formatDate(t.created_at)}</td>
            <td class="center">
              {#if stockId}
                <a class="link-btn" href={`/stocks/${stockId}`}>View stock</a>
              {:else}
                <span class="muted">Unavailable</span>
              {/if}
            </td>
          </tr>
        {/each}
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
    margin-bottom: 1rem;
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(4, minmax(180px, 1fr)) auto;
    gap: 0.75rem;
    margin-bottom: 1rem;
    align-items: end;
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .filters span {
    color: #94a3b8;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .filters select {
    background: color-mix(in oklab, var(--surface-2), white 2%);
    color: #e5e7eb;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
    border-radius: 0.6rem;
    padding: 0.55rem 0.7rem;
    font-weight: 600;
  }
  .filter-actions {
    display: flex;
    gap: 0.55rem;
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
    padding: 0.75rem;
    text-align: left;
  }
  th {
    color: #94a3b8;
    font-size: 0.9rem;
    font-weight: 700;
  }
  td {
    border-top: 1px solid color-mix(in oklab, var(--surface-2), white 8%);
    vertical-align: middle;
  }
  .right {
    text-align: right;
  }
  .center {
    text-align: center;
  }
  .link-btn {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    font-weight: 700;
    color: #0b1220;
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--brand), white 10%),
      var(--brand)
    );
    border: 1px solid color-mix(in oklab, var(--brand), black 35%);
    border-radius: 0.55rem;
    padding: 0.34rem 0.65rem;
  }
  .empty {
    text-align: center;
    color: #94a3b8;
    padding: 1.4rem;
  }
  @media (max-width: 1100px) {
    .filters {
      grid-template-columns: repeat(2, minmax(180px, 1fr));
    }
  }
</style>

