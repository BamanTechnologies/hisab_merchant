import { normalizeProductTypeName } from './parseForm';

/** Batch-level fields on stock receive/edit — per product type (future: per company + type from DB). */
export type StockBatchFieldKey = 'expiry_date';

const STOCK_BATCH_FIELDS_BY_TYPE: Record<string, readonly StockBatchFieldKey[]> = {
	glass: [],
	brake_lining: [],
	coffee_tools: [],
	// supermarket: ['expiry_date'],
	// restaurant: ['expiry_date'],
};

export function stockBatchFieldsForType(typeKey: string): readonly StockBatchFieldKey[] {
	const key = normalizeProductTypeName(typeKey);
	return STOCK_BATCH_FIELDS_BY_TYPE[key] ?? [];
}

export function stockBatchFieldEnabled(typeKey: string, field: StockBatchFieldKey): boolean {
	return stockBatchFieldsForType(typeKey).includes(field);
}

/** Show batch expiry when every line with a known type supports it. */
export function shouldCollectBatchExpiry(typeKeys: string[]): boolean {
	const keys = typeKeys.map(normalizeProductTypeName).filter(Boolean);
	if (keys.length === 0) return false;
	return keys.every((k) => stockBatchFieldEnabled(k, 'expiry_date'));
}

export function resolveReceiveExpiryDate(
	typeKeys: string[],
	expiryRaw: string | null,
): string | null {
	return shouldCollectBatchExpiry(typeKeys) ? expiryRaw : null;
}
