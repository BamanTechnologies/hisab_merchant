import { config, getGraphQLHeaders } from '$lib/config';
import type { MovementType } from './types';

const INSERT_MOVEMENTS_BULK = `
  mutation InsertStockMovements($objects: [stock_movements_insert_input!]!) {
    insert_stock_movements(objects: $objects) {
      affected_rows
    }
  }
`;

export type StockMovementInsert = {
	company_id: string;
	branch_id: string | null;
	stock_id: string;
	product_id: string | null;
	movement_type: MovementType;
	quantity_delta: number;
	unit?: string | null;
	unit_cost?: number | null;
	unit_price?: number | null;
	reference?: string | null;
	reference_type?: string | null;
	note?: string | null;
	created_by: string;
};

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
	const response = await fetch(config.graphql.endpoint, {
		method: 'POST',
		headers: getGraphQLHeaders(),
		body: JSON.stringify({ query, variables }),
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	const result = await response.json();
	if (result.errors) {
		throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
	}

	return result.data as T;
}

export async function insertStockMovements(objects: StockMovementInsert[]): Promise<void> {
	if (objects.length === 0) return;
	const data = await gql<{
		insert_stock_movements: { affected_rows: number } | null;
	}>(INSERT_MOVEMENTS_BULK, { objects });
	const affected = data.insert_stock_movements?.affected_rows ?? 0;
	if (affected !== objects.length) {
		throw new Error(`Movement insert mismatch: expected ${objects.length}, got ${affected}`);
	}
}
