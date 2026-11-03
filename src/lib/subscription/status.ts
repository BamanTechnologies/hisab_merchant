import type {
  BillingCycle,
  CompanySubscription,
  SubscriptionSnapshot,
  SubscriptionStatus,
} from "./types";

const GRACE_PERIOD_DAYS = 7;
const ACTIVE_WARNING_REMAINING_RATIO = 0.3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(from: Date, to: Date): number {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  return Math.round((end - start) / MS_PER_DAY);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatBillingCycle(
  cycle: BillingCycle | null | undefined,
): string | null {
  if (cycle == null) return null;

  const months = Number(cycle);
  switch (months) {
    case 3:
      return "3 Months";
    case 6:
      return "6 Months";
    case 12:
      return "12 Months";
    default:
      return null;
  }
}

export function formatPlanLabel(
  subscription: CompanySubscription | null,
): string | null {
  const planName = subscription?.plan_pricing?.plan?.name?.trim();
  const billingCycle = formatBillingCycle(
    subscription?.plan_pricing?.billing_cycle,
  );

  if (planName && billingCycle) return `${planName} • ${billingCycle}`;
  if (planName) return planName;
  if (billingCycle) return billingCycle;
  return null;
}

function formatDaysRemaining(days: number): string {
  const safeDays = Math.max(0, days);
  return safeDays === 1 ? "1 day" : `${safeDays} days`;
}

export function getSubscriptionStatus(
  subscription: CompanySubscription | null,
  now = new Date(),
): SubscriptionStatus {
  const today = startOfDay(now);
  const trialEndsAt = parseDate(subscription?.trial_ends_at);
  const startDate = parseDate(subscription?.start_date);
  const endDate = parseDate(subscription?.end_date);

  if (
    startDate &&
    endDate &&
    today.getTime() >= startOfDay(startDate).getTime() &&
    trialEndsAt &&
    today.getTime() <= startOfDay(trialEndsAt).getTime()
  ) {
    return "TRIAL";
  }

  if (endDate && today.getTime() <= startOfDay(endDate).getTime()) {
    return "ACTIVE";
  }

  if (endDate) {
    const graceEndsAt = addDays(startOfDay(endDate), GRACE_PERIOD_DAYS);
    if (today.getTime() <= graceEndsAt.getTime()) {
      return "GRACE";
    }
  }

  return "SUSPENDED";
}

export function getSubscriptionDaysRemaining(
  subscription: CompanySubscription | null,
  status: SubscriptionStatus,
  now = new Date(),
): number {
  const today = startOfDay(now);
  const trialEndsAt = parseDate(subscription?.trial_ends_at);
  const endDate = parseDate(subscription?.end_date);

  switch (status) {
    case "TRIAL":
      return trialEndsAt ? Math.max(0, daysBetween(today, trialEndsAt)) : 0;
    case "ACTIVE":
      return endDate ? Math.max(0, daysBetween(today, endDate)) : 0;
    case "GRACE":
      return endDate
        ? Math.max(
            0,
            daysBetween(today, addDays(startOfDay(endDate), GRACE_PERIOD_DAYS)),
          )
        : 0;
    case "SUSPENDED":
    default:
      return 0;
  }
}

export function computeSubscriptionSnapshot(
  subscription: CompanySubscription | null,
  hasActiveSubscription: boolean | null = null,
  now = new Date(),
  loadError: string | null = null,
): SubscriptionSnapshot {
  if (loadError || !subscription || hasActiveSubscription === false) {
    return {
      status: "SUSPENDED",
      daysRemaining: 0,
      planLabel: formatPlanLabel(subscription),
      warningMessage: loadError
        ? "We could not verify your subscription. Please add or upgrade your subscription to continue using Bamanstock."
        : subscription
          ? "Your active subscription has expired. Please upgrade your subscription to continue using Bamanstock."
          : "Your company has no active subscription. Please add a subscription to continue using Bamanstock.",
      showWarningBar: true,
    };
  }

  const status = getSubscriptionStatus(subscription, now);
  const startDate = parseDate(subscription?.start_date);
  const endDate = parseDate(subscription?.end_date);
  const daysRemaining =
    startDate && endDate ? Math.max(0, daysBetween(now, endDate)) : 0;
  const totalDays =
    startDate && endDate ? Math.max(0, daysBetween(startDate, endDate)) : 0;
  const remainingRatio = totalDays > 0 ? daysRemaining / totalDays : 1;
  const warningMessage =
    status === "TRIAL"
      ? `Your free trial ends in ${formatDaysRemaining(daysRemaining)}. Subscribe now to avoid interruption.`
      : status === "ACTIVE" && remainingRatio <= ACTIVE_WARNING_REMAINING_RATIO
        ? `Your subscription expires in ${formatDaysRemaining(daysRemaining)}. Renew soon to avoid service interruption.`
        : null;
  const showWarningBar =
    hasActiveSubscription === true &&
    ((status === "TRIAL" && remainingRatio <= ACTIVE_WARNING_REMAINING_RATIO) ||
      (status === "ACTIVE" &&
        remainingRatio <= ACTIVE_WARNING_REMAINING_RATIO));

  return {
    status,
    daysRemaining,
    planLabel: formatPlanLabel(subscription),
    warningMessage,
    showWarningBar,
  };
}

export const SUBSCRIPTION_BLOCKED_MESSAGE =
  "Your subscription has expired. Please renew your subscription to continue using Bamanstock.";

export function isSubscriptionWriteBlocked(
  subscription: CompanySubscription | null,
  now = new Date(),
): boolean {
  return getSubscriptionStatus(subscription, now) === "SUSPENDED";
}
