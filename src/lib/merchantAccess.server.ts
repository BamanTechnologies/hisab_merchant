import type { MerchantAppContext } from '$lib/merchantContext.server';

/** Route-level access flags for the signed-in merchant (extend when roles land in Hasura). */
export type MerchantRouteAccess = {
	/** Catalog list and product detail pages. */
	products: boolean;
	/** Purchase/cost prices on product overview and batch edit flows. */
	viewPurchasePrice: boolean;
};

const FULL_ACCESS: MerchantRouteAccess = {
	products: true,
	viewPurchasePrice: true,
};

/**
 * Resolve access for a merchant session. Defaults to full owner access until a
 * hired/staff role column exists on `merchant`.
 */
export function resolveMerchantRouteAccess(
	merchantContext: Pick<MerchantAppContext, 'merchantId'> | null,
): MerchantRouteAccess {
	if (!merchantContext?.merchantId) {
		return { products: false, viewPurchasePrice: false };
	}
	return FULL_ACCESS;
}

/** First app screen after sign-in: products when allowed, otherwise stocks. */
export function resolveDefaultAppRoute(access: MerchantRouteAccess): '/products' | '/stocks' {
	if (access.products) return '/products';
	return '/stocks';
}

export function canViewPurchasePrice(access: MerchantRouteAccess): boolean {
	return access.viewPurchasePrice;
}
