import { formatCoffeeCapacityWithUnit } from '$lib/stockLabel';
import { normalizeProductTypeName, PRODUCT_TYPE_FIELDS } from './parseForm';
import { resolveBatchProduct } from './groupStock';
import type { StockBatchRecord } from './types';

function isLinkedBatch(batch: StockBatchRecord): boolean {
	return Boolean(
		batch.product_id ?? (typeof batch.product?.id === 'string' ? batch.product.id : null),
	);
}

/** Normalized type key (glass, brake_lining, …) — product first when linked. */
export function batchTypeKey(batch: StockBatchRecord): string {
	if (isLinkedBatch(batch) && batch.product?.product_type?.name) {
		return normalizeProductTypeName(String(batch.product.product_type.name)).toLowerCase();
	}
	const pt = batch.product_type;
	if (pt && typeof pt === 'object' && pt.name != null) {
		return normalizeProductTypeName(String(pt.name)).toLowerCase();
	}
	if (batch.type != null && String(batch.type).trim() !== '') {
		return normalizeProductTypeName(String(batch.type)).toLowerCase();
	}
	return '';
}

export function batchTypeLabel(batch: StockBatchRecord): string {
	const key = batchTypeKey(batch);
	if (!key) return '—';
	if (key === 'brake_lining') return 'Brake lining';
	return key.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Identity attributes — from linked product when present, else stock row. */
export function batchAttributes(batch: StockBatchRecord): Record<string, unknown> {
	if (isLinkedBatch(batch) && batch.product?.attributes) {
		return batch.product.attributes ?? {};
	}
	return batch.attributes ?? {};
}

function legacyColumnFallback(batch: StockBatchRecord, key: string): unknown {
	if (isLinkedBatch(batch)) return undefined;
	const fallback: Record<string, unknown> = {
		thickness: batch.thickness,
		factor: batch.factor,
		color: batch.color,
		figure: batch.figure,
		model_number: batch.model_number,
		country: batch.country,
	};
	return fallback[key];
}

export function batchAttrValue(batch: StockBatchRecord, key: string): unknown {
	if (batchTypeKey(batch) === 'coffee_tools' && key === 'capacity') {
		const merged = formatCoffeeCapacityWithUnit(batchAttributes(batch));
		if (merged) return merged;
	}
	const attrs = batchAttributes(batch);
	const fromAttrs = attrs[key];
	if (fromAttrs != null && String(fromAttrs).trim() !== '') return fromAttrs;
	return legacyColumnFallback(batch, key);
}

export function batchAttributeLabel(key: string): string {
	if (key === 'model_number') return 'Model No';
	if (key === 'capacity_unit') return 'Capacity unit';
	return key.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Rows for the combined Attributes column (all-types view). */
export function batchAttributeEntries(batch: StockBatchRecord): [string, unknown][] {
	const typeKey = batchTypeKey(batch);
	const attrs = batchAttributes(batch);
	const fieldNames = PRODUCT_TYPE_FIELDS[typeKey] ?? [];

	if (typeKey === 'coffee_tools') {
		const merged = formatCoffeeCapacityWithUnit(attrs);
		const out: [string, unknown][] = [];
		let mergedShown = false;
		for (const [k, v] of Object.entries(attrs)) {
			if (k === 'capacity' || k === 'capacity_unit') {
				if (!mergedShown && merged) {
					out.push(['capacity', merged]);
					mergedShown = true;
				}
				continue;
			}
			if (v != null && String(v).trim() !== '') out.push([k, v]);
		}
		if (!mergedShown && merged) out.push(['capacity', merged]);
		if (out.length > 0) return out;
	}

	const fromAttrs = Object.entries(attrs).filter(
		([, v]) => v != null && String(v).trim() !== '',
	);
	if (fromAttrs.length > 0) return fromAttrs;

	if (isLinkedBatch(batch)) return [];

	const fromLegacyFields: [string, unknown][] = [];
	for (const key of fieldNames.length > 0 ? fieldNames : Object.keys(attrs)) {
		const v = batchAttrValue(batch, key);
		if (v != null && String(v).trim() !== '') fromLegacyFields.push([key, v]);
	}
	return fromLegacyFields;
}

export function activeTypeFields(typeFilter: string): string[] {
	if (typeFilter === 'all') return [];
	const fields = PRODUCT_TYPE_FIELDS[typeFilter] ?? [];
	if (typeFilter === 'coffee_tools') {
		return fields.filter((k) => k !== 'capacity_unit');
	}
	return fields;
}

export function batchSortAttrValue(batch: StockBatchRecord, col: string): string | number {
	if (col === 'type') return batchTypeKey(batch);
	const v = batchAttrValue(batch, col);
	if (v == null || v === '') return '';
	const raw = String(v).trim();
	const normalized = raw.replace(/[^0-9.-]/g, '');
	const n = Number(normalized);
	const looksNumeric = normalized !== '' && /[0-9]/.test(normalized);
	if (looksNumeric && Number.isFinite(n)) return n;
	return raw.toLowerCase();
}

export function batchSearchHaystack(batch: StockBatchRecord): string {
	const parts = [
		batchTypeLabel(batch),
		resolveBatchProduct(batch).name,
		batch.batch_number,
		batch.branch,
		batch.origin,
	];
	for (const [, v] of batchAttributeEntries(batch)) {
		parts.push(String(v ?? ''));
	}
	for (const key of Object.keys(PRODUCT_TYPE_FIELDS).flatMap((t) => PRODUCT_TYPE_FIELDS[t] ?? [])) {
		const v = batchAttrValue(batch, key);
		if (v != null) parts.push(String(v));
	}
	return parts.join(' ').toLowerCase();
}
