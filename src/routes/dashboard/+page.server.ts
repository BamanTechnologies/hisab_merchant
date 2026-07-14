import type { PageServerLoad } from "./$types";
import { getUserIdFromRequest } from "$lib/auth";
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
} from "$lib/dashboard.server";

export const load: PageServerLoad = async ({ request, parent, url }) => {
  const { merchantContext } = await parent();
  const merchantId =
    merchantContext?.merchantId ?? getUserIdFromRequest(request) ?? null;

  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

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
    };
  }

  const merchantBranchId =
    merchantContext?.merchantBranchId ??
    (await fetchBranchId(merchantId));

  let branchIds: string[] = [];
  const companyId = merchantContext?.companyId ?? null;
  if (companyId) {
    branchIds = await fetchCompanyBranchIds(companyId);
  } else if (merchantBranchId) {
    branchIds = [merchantBranchId];
  }

  const [stats, outstandingCredit, topCustomers, unpaidOrders, topProducts, recentStocks, salesTrend, lowStockProducts] =
    await Promise.all([
      fetchStats(merchantId, from, to),
      fetchOutstandingCredit(merchantId, from, to),
      fetchTopCustomers(merchantId, from, to),
      fetchUnpaidOrders(merchantId, from, to),
      fetchTopSellingProducts(merchantId, from, to),
      fetchRecentStocks(branchIds),
      fetchWeeklySalesTrend(merchantId, from, to),
      companyId ? fetchLowStockProducts(companyId) : Promise.resolve([]),
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
  };
};
