import type { PageServerLoad } from "./$types";
import { getUserIdFromRequest } from "$lib/auth";
import { fetchMerchantBranchId as fetchBranchId } from "$lib/merchantBranch.server";
import {
  fetchStats,
  fetchOutstandingCredit,
  fetchRecentPayments,
  fetchTopSellingProducts,
  fetchRecentStocks,
  fetchCompanyBranchIds,
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
      recentPayments: [],
      recentPaymentsCount: 0,
      topProducts: [],
      recentStocks: [],
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

  const [stats, outstandingCredit, paymentsResult, topProducts, recentStocks] =
    await Promise.all([
      fetchStats(merchantId, from, to),
      fetchOutstandingCredit(merchantId, from, to),
      fetchRecentPayments(merchantId, from, to),
      fetchTopSellingProducts(merchantId, from, to),
      fetchRecentStocks(branchIds),
    ]);

  return {
    totalSales: stats.totalSales,
    totalOrders: stats.totalOrders,
    pendingPayments: stats.pendingPayments,
    outstandingCredit,
    recentPayments: paymentsResult.payments,
    recentPaymentsCount: paymentsResult.totalCount,
    topProducts,
    recentStocks,
  };
};
