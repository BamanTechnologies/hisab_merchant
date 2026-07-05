/**
 * Product naming standards — single source of truth for documentation and future
 * company-level DB configuration.
 *
 * Runtime implementation: `buildStockDescriptor()` / `buildStockLabel()` in
 * `$lib/stockLabel.ts`, and `buildCatalogProductName()` in `$lib/inventory/productLabel.ts`.
 *
 * TODO (future): load overrides from DB per company + product_type, merge with these defaults.
 */

import { PRODUCT_TYPE_FIELDS, normalizeProductTypeName } from './parseForm';

export type ProductNamingStandard = {
	/** Normalized key, e.g. glass, brake_lining, coffee_tools */
	typeKey: string;
	/** Shown in parentheses on full labels, e.g. "Brake lining" */
	displayTypeLabel: string;
	/** Form fields collected in products.attributes (from PRODUCT_TYPE_FIELDS) */
	attributeFields: readonly string[];
	/** Fields that participate in the descriptor / products.name (may omit form-only fields like factor) */
	descriptorFields: readonly string[];
	/** Plain-language rule for merchants and implementers */
	descriptorRule: string;
	/** Whether products.name is auto-generated on create (no manual Name field) */
	autoGenerateName: boolean;
	examples: Array<{
		attributes: Record<string, string>;
		descriptor: string;
		fullLabel: string;
	}>;
};

const STANDARDS: ProductNamingStandard[] = [
	{
		typeKey: 'glass',
		displayTypeLabel: 'Glass',
		attributeFields: PRODUCT_TYPE_FIELDS.glass,
		descriptorFields: ['thickness', 'color', 'figure', 'country'],
		descriptorRule:
			'Join thickness (with "mm" suffix), color, and figure with spaces. ' +
			'If country is set and not already in the string, append it. ' +
			'Factor is stored in attributes but not included in the name.',
		autoGenerateName: true,
		examples: [
			{
				attributes: { thickness: '5', color: 'blue', figure: 'plain' },
				descriptor: '5mm blue plain',
				fullLabel: '5mm blue plain (Glass)',
			},
			{
				attributes: { thickness: '5', color: 'blue', figure: 'plain', country: 'Ethiopia' },
				descriptor: '5mm blue plain Ethiopia',
				fullLabel: '5mm blue plain Ethiopia (Glass)',
			},
		],
	},
	{
		typeKey: 'brake_lining',
		displayTypeLabel: 'Brake lining',
		attributeFields: PRODUCT_TYPE_FIELDS.brake_lining,
		descriptorFields: ['model_number', 'country'],
		descriptorRule:
			'Use model_number when present, otherwise country. ' +
			'If country is set and not already in the descriptor, append it. ' +
			'Aliases brake_pad and break_pad normalize to brake_lining.',
		autoGenerateName: true,
		examples: [
			{
				attributes: { model_number: 'BL-442', country: 'India' },
				descriptor: 'BL-442 India',
				fullLabel: 'BL-442 India (Brake lining)',
			},
			{
				attributes: { model_number: 'BL-442' },
				descriptor: 'BL-442',
				fullLabel: 'BL-442 (Brake lining)',
			},
			{
				attributes: { country: 'India' },
				descriptor: 'India',
				fullLabel: 'India (Brake lining)',
			},
		],
	},
	{
		typeKey: 'coffee_tools',
		displayTypeLabel: 'Coffee Tools',
		attributeFields: PRODUCT_TYPE_FIELDS.coffee_tools,
		descriptorFields: ['name', 'capacity', 'capacity_unit'],
		descriptorRule:
			'Join attributes.name and capacity+capacity_unit (e.g. 1000 + ml → 1000ML). ' +
			'The tool name lives in attributes.name, not a separate manual products.name field.',
		autoGenerateName: true,
		examples: [
			{
				attributes: { name: 'French Press', capacity: '1000', capacity_unit: 'ml' },
				descriptor: 'French Press 1000ML',
				fullLabel: 'French Press 1000ML (Coffee Tools)',
			},
		],
	},
];

const byTypeKey = new Map<string, ProductNamingStandard>(
	STANDARDS.map((s) => [s.typeKey, s]),
);

/** All built-in naming standards (future: merge with company DB rows). */
export function getProductNamingStandards(): readonly ProductNamingStandard[] {
	return STANDARDS;
}

/** Lookup by normalized type key (handles brake_pad → brake_lining). */
export function getProductNamingStandard(typeKey: string): ProductNamingStandard | null {
	const key = normalizeProductTypeName(typeKey);
	return byTypeKey.get(key) ?? null;
}

/** Whether this type uses auto-generated products.name from attributes. */
export function isAutoNameType(typeKey: string): boolean {
	return getProductNamingStandard(typeKey)?.autoGenerateName ?? false;
}

/**
 * Layers used everywhere in the app:
 *
 * 1. descriptor  → stored in `products.name` (auto types) or manual entry (other types)
 * 2. fullLabel   → `{descriptor} ({displayTypeLabel})` via buildProductLabel / buildStockLabel
 *
 * Legacy stock rows without product_id: same rules, reading attributes JSON first,
 * then legacy columns on `stock` (thickness, model_number, country, …).
 */

export const PRODUCT_NAMING_LAYERS = {
	descriptor:
		'Identity string — model+country, glass dimensions, coffee tool name+capacity. Stored in products.name.',
	fullLabel: 'Descriptor plus type in parentheses — shown in stocks, orders, and product lists.',
} as const;
