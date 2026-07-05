import type { FifoBatchRow, FifoSlice } from './types';

export function parseQty(v: unknown): number {
	if (v == null) return 0;
	if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
	const n = Number(String(v).replace(/[^0-9.-]/g, ''));
	return Number.isFinite(n) ? n : 0;
}

export function parseMoney(v: unknown): number {
	return parseQty(v);
}

/** Allocate requested quantity across batches in FIFO order (caller sorts by created_at ASC). */
export function allocateFifo(
	batches: FifoBatchRow[],
	requestedQty: number,
): { slices: FifoSlice[]; remaining: number } {
	const need = parseQty(requestedQty);
	if (need <= 0) return { slices: [], remaining: 0 };

	let remaining = need;
	const slices: FifoSlice[] = [];

	for (const batch of batches) {
		if (remaining <= 0) break;
		const available = parseQty(batch.quantity);
		if (available <= 0) continue;
		const take = Math.min(available, remaining);
		slices.push({
			stock_id: batch.id,
			quantity: take,
			selling_price: parseMoney(batch.selling_price),
			batch_number: batch.batch_number ?? null,
		});
		remaining -= take;
	}

	return { slices, remaining };
}

export function sellingPriceRange(batches: FifoBatchRow[]): string {
	const prices = batches
		.map((b) => parseMoney(b.selling_price))
		.filter((p) => p > 0);
	if (prices.length === 0) return '—';
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	if (min === max) return min.toFixed(2);
	return `${min.toFixed(2)}–${max.toFixed(2)}`;
}

export function defaultUnitPriceFromBatches(batches: FifoBatchRow[]): number {
	const positive = batches.filter((b) => parseQty(b.quantity) > 0);
	if (positive.length === 0) return 0;
	return parseMoney(positive[0].selling_price);
}
