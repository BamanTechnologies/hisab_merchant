import type { PageServerLoad } from "./$types";
import { getMerchantIdFromRequest } from "$lib/auth";
import { fetchMerchantBranchId as fetchBranchId } from "$lib/merchantBranch.server";
import {
  fetchStats,
  fetchOutstandingCredit,
  fetchTopSellingProducts,
  fetchRecentStocks,
  fetchWeeklySalesTrend,
  fetchCompanyBranchIds,
  fetchLowStockProducts,
  fetchTopCustomers,
  fetchUnpaidOrders,
  fetchProductLabel,
  fetchProductTypeName,
  type DashboardProductFilter,
} from "$lib/dashboard.server";
import { fetchProductTypes } from "$lib/inventory/productTypes.server";
import type { ProductTypeRow } from "$lib/inventory/productTypes.server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reject anything that is not a uuid so bad query params cannot reach Hasura. */
function readUuidParam(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  return value && UUID_PATTERN.test(value) ? value : null;
}

export const load: PageServerLoad = async ({ request, parent, url }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getMerchantIdFromRequest(request) ?? null;

  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const groupBy = url.searchParams.get("groupBy") ?? "per_week";

  const productId = readUuidParam(url, "product_id");
  const productTypeId = readUuidParam(url, "product_type_id");

  const companyId = merchantContext?.companyId ?? null;
  const branchId = merchantContext?.branch ?? null;

  // Same catalogue as the orders and stocks list pages, so all three filters
  // offer the same options.
  const [productTypes, selectedProduct, productTypeName] = await Promise.all([
    fetchProductTypes(merchantId),
    fetchProductLabel(productId),
    fetchProductTypeName(productTypeId),
  ]);

  const productFilter: DashboardProductFilter = {
    productId,
    productTypeId,
    productTypeName,
  };

  if (!merchantId) {
    return {
      totalSales: 0,
      totalOrders: 0,
      pendingPayments: 0,
      outstandingCredit: 0,
      topCustomers: [],
      unpaidOrders: [],
      topProducts: [],
      recentStocks: [],
      salesTrend: [],
      lowStockProducts: [],
      productTypes,
      selectedProduct,
      productFilter,
      companyId,
      branchId: branchId?.id ?? null,
    };
  }

  const merchantBranchId =
    merchantContext?.merchantBranchId ?? (await fetchBranchId(merchantId));

  let branchIds: string[] = [];
  if (companyId) {
    branchIds = await fetchCompanyBranchIds(companyId);
  } else if (merchantBranchId) {
    branchIds = [merchantBranchId];
  }

  const [
    stats,
    outstandingCredit,
    topCustomers,
    unpaidOrders,
    topProducts,
    recentStocks,
    salesTrend,
    lowStockProducts,
  ] = await Promise.all([
    fetchStats(merchantId, from, to, productFilter),
    fetchOutstandingCredit(merchantId, from, to, productFilter),
    fetchTopCustomers(merchantId, from, to, productFilter),
    fetchUnpaidOrders(merchantId, from, to, productFilter),
    fetchTopSellingProducts(merchantId, from, to, productFilter),
    fetchRecentStocks(branchIds, productFilter),
    fetchWeeklySalesTrend(merchantId, from, to, groupBy, productFilter),
    companyId
      ? fetchLowStockProducts(companyId, branchId?.id ?? null, productFilter)
      : Promise.resolve([]),
  ]);

  return {
    totalSales: stats.totalSales,
    totalOrders: stats.totalOrders,
    pendingPayments: stats.pendingPayments,
    outstandingCredit,
    topCustomers,
    unpaidOrders,
    topProducts,
    recentStocks,
    salesTrend,
    lowStockProducts,
    productTypes,
    selectedProduct,
    productFilter,
    companyId,
    branchId: branchId?.id ?? null,
  };
};
