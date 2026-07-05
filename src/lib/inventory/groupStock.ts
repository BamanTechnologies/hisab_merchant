import { parseMoney, parseQty, sellingPriceRange } from './fifo';
import { buildProductLabel } from './productLabel';
import { buildStockLabel } from '$lib/stockLabel';
import type { ProductRecord, StockBatchRecord } from './types';

export type StockGroupRow = {
	productId: string;
	label: string;
	product: ProductRecord;
	batches: StockBatchRecord[];
	totalQty: number;
	sellingRange: string;
	batchCount: number;
	isExpandable: boolean;
	/** True when batch predates products table and has no product_id yet */
	isLegacy: boolean;
};

function resolveProductTypeName(batch: StockBatchRecord): string | null {
	const pt = batch.product_type;
	if (pt && typeof pt === 'object' && pt.name != null) {
		return String(pt.name).trim() || null;
	}
	if (typeof pt === 'string' && pt.trim() !== '') return pt.trim();
	return batch.type != null ? String(batch.type).trim() : null;
}

/** Build a display product from a legacy stock row (no products.product link). */
function legacyProductFromBatch(batch: StockBatchRecord): ProductRecord {
	const label = buildStockLabel({
		type: batch.type,
		product_type: resolveProductTypeName(batch),
		attributes: batch.attributes,
		model_number: batch.model_number,
		country: batch.country,
		color: batch.color,
		figure: batch.figure,
		thickness: batch.thickness,
	});

	return {
		id: batch.id,
		name: label,
		default_unit: batch.unit != null ? String(batch.unit).trim() || '—' : '—',
		factor: batch.factor,
		attributes: batch.attributes ?? {},
		investors: [],
		is_active: true,
		product_type:
			batch.product_type && typeof batch.product_type === 'object'
				? batch.product_type
				: null,
	};
}

function groupKeyForBatch(batch: StockBatchRecord): string | null {
	const linked =
		batch.product_id ??
		(typeof batch.product?.id === 'string' ? batch.product.id : null);
	if (linked) return linked;
	// Legacy rows without product_id: one group per batch until backfilled
	return `legacy:${batch.id}`;
}

export function groupStockByProduct(batches: StockBatchRecord[]): StockGroupRow[] {
	if (!Array.isArray(batches) || batches.length === 0) return [];

	const byProduct = new Map<string, StockBatchRecord[]>();

	for (const batch of batches) {
		const key = groupKeyForBatch(batch);
		if (!key) continue;
		const list = byProduct.get(key) ?? [];
		list.push(batch);
		byProduct.set(key, list);
	}

	const groups: StockGroupRow[] = [];

	for (const [productId, list] of byProduct) {
		const sorted = [...list].sort((a, b) => {
			const ta = new Date(a.created_at ?? 0).getTime();
			const tb = new Date(b.created_at ?? 0).getTime();
			if (ta !== tb) return ta - tb;
			return String(a.id).localeCompare(String(b.id));
		});

		const isLegacy = productId.startsWith('legacy:');
		const linkedProduct = sorted[0]?.product;
		const product =
			linkedProduct ??
			(sorted[0] ? legacyProductFromBatch(sorted[0]) : null);
		if (!product) continue;

		const fifoRows = sorted.map((b) => ({
			id: b.id,
			quantity: parseQty(b.quantity),
			selling_price: parseMoney(b.selling_price),
			created_at: b.created_at ?? '',
			batch_number: b.batch_number,
		}));

		groups.push({
			productId,
			label: isLegacy ? product.name : buildProductLabel(product),
			product,
			batches: sorted,
			totalQty: sorted.reduce((sum, b) => sum + parseQty(b.quantity), 0),
			sellingRange: sellingPriceRange(fifoRows),
			batchCount: sorted.length,
			isExpandable: sorted.length > 1,
			isLegacy,
		});
	}

	return groups.sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveBatchProduct(batch: StockBatchRecord): ProductRecord {
	if (batch.product) return batch.product;
	return legacyProductFromBatch(batch);
}

export function batchDisplayLabel(batch: StockBatchRecord): string {
	const linked =
		batch.product_id ??
		(typeof batch.product?.id === 'string' ? batch.product.id : null);
	const product = resolveBatchProduct(batch);
	if (linked) return buildProductLabel(product);
	return product.name;
}
