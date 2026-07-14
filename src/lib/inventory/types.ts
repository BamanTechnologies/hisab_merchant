export type MovementType =
	| 'PURCHASE'
	| 'SALE'
	| 'TRANSFER_IN'
	| 'TRANSFER_OUT'
	| 'ADJUSTMENT'
	| 'DAMAGE'
	| 'EXPIRED'
	| 'RETURN';

export type FifoBatchRow = {
	id: string;
	quantity: number;
	selling_price: number;
	created_at: string;
	batch_number?: string | null;
};

export type FifoSlice = {
	stock_id: string;
	quantity: number;
	selling_price: number;
	batch_number?: string | null;
};

export type ProductTypeRef = {
	id: string;
	name?: string | null;
};

export type ProductRecord = {
	id: string;
	name: string;
	default_unit: string;
	factor?: number | string | null;
	attributes?: Record<string, unknown> | null;
	investors?: string[] | null;
	is_active?: boolean | null;
	barcode?: string | null;
	qr_code?: string | null;
	treshold_quantity?: number | string | null;
	product_type?: ProductTypeRef | null;
};

export type StockBatchRecord = {
	id: string;
	product_id?: string | null;
	branch?: string | null;
	/** Branch this batch was transferred from; null = received here. */
	origin?: string | null;
	quantity: number | string;
	purchased_price?: number | string | null;
	selling_price?: number | string | null;
	batch_number?: string | null;
	expiry_date?: string | null;
	created_at?: string | null;
	product?: ProductRecord | null;
	/** Legacy columns — present on rows created before products migration */
	type?: string | null;
	product_type?: ProductTypeRef | string | null;
	attributes?: Record<string, unknown> | null;
	unit?: string | null;
	model_number?: string | null;
	country?: string | null;
	color?: string | null;
	figure?: string | null;
	thickness?: number | string | null;
	factor?: number | string | null;
};

export type StockMovementRecord = {
	id: string;
	movement_type: string;
	quantity_delta: number | string;
	unit?: string | null;
	unit_cost?: number | string | null;
	unit_price?: number | string | null;
	reference?: string | null;
	reference_type?: string | null;
	note?: string | null;
	created_at: string;
	stock?: {
		id?: string | null;
		batch_number?: string | null;
	} | null;
};
