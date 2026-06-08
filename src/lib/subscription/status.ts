import type {
	BillingCycle,
	CompanySubscription,
	SubscriptionSnapshot,
	SubscriptionStatus
} from './types';

const GRACE_PERIOD_DAYS = 7;
const ACTIVE_WARNING_DAYS = 14;

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

export function formatBillingCycle(cycle: BillingCycle | null | undefined): string | null {
	if (cycle == null) return null;

	const months = Number(cycle);
	switch (months) {
		case 3:
			return '3 Months';
		case 6:
			return '6 Months';
		case 12:
			return '12 Months';
		default:
			return null;
	}
}

export function formatPlanLabel(subscription: CompanySubscription | null): string | null {
	const planName = subscription?.plan_pricing?.plan?.name?.trim();
	const billingCycle = formatBillingCycle(subscription?.plan_pricing?.billing_cycle);

	if (planName && billingCycle) return `${planName} • ${billingCycle}`;
	if (planName) return planName;
	if (billingCycle) return billingCycle;
	return null;
}

function formatDaysRemaining(days: number): string {
	const safeDays = Math.max(0, days);
	return safeDays === 1 ? '1 day' : `${safeDays} days`;
}

export function getSubscriptionStatus(
	subscription: CompanySubscription | null,
	now = new Date()
): SubscriptionStatus {
	const today = startOfDay(now);
	const trialEndsAt = parseDate(subscription?.trial_ends_at);
	const currentPeriodEnd = parseDate(subscription?.current_period_end);

	if (trialEndsAt && today.getTime() <= startOfDay(trialEndsAt).getTime()) {
		return 'TRIAL';
	}

	if (currentPeriodEnd && today.getTime() <= startOfDay(currentPeriodEnd).getTime()) {
		return 'ACTIVE';
	}

	if (currentPeriodEnd) {
		const graceEndsAt = addDays(startOfDay(currentPeriodEnd), GRACE_PERIOD_DAYS);
		if (today.getTime() <= graceEndsAt.getTime()) {
			return 'GRACE';
		}
	}

	return 'SUSPENDED';
}

export function getSubscriptionDaysRemaining(
	subscription: CompanySubscription | null,
	status: SubscriptionStatus,
	now = new Date()
): number {
	const today = startOfDay(now);
	const trialEndsAt = parseDate(subscription?.trial_ends_at);
	const currentPeriodEnd = parseDate(subscription?.current_period_end);

	switch (status) {
		case 'TRIAL':
			return trialEndsAt ? Math.max(0, daysBetween(today, trialEndsAt)) : 0;
		case 'ACTIVE':
			return currentPeriodEnd ? Math.max(0, daysBetween(today, currentPeriodEnd)) : 0;
		case 'GRACE':
			return currentPeriodEnd
				? Math.max(0, daysBetween(today, addDays(startOfDay(currentPeriodEnd), GRACE_PERIOD_DAYS)))
				: 0;
		case 'SUSPENDED':
		default:
			return 0;
	}
}

function buildWarningMessage(status: SubscriptionStatus, daysRemaining: number): string | null {
	switch (status) {
		case 'TRIAL':
			return `Your free trial ends in ${formatDaysRemaining(daysRemaining)}. Subscribe now to avoid interruption.`;
		case 'ACTIVE':
			if (daysRemaining > ACTIVE_WARNING_DAYS) return null;
			return `Your subscription expires in ${formatDaysRemaining(daysRemaining)}. Renew soon to avoid service interruption.`;
		case 'GRACE':
			return `Your subscription has expired. You have ${formatDaysRemaining(daysRemaining)} remaining in your grace period.`;
		case 'SUSPENDED':
			return 'Your subscription has expired. Please renew your subscription to continue using Bamanstock.';
		default:
			return null;
	}
}

export function computeSubscriptionSnapshot(
	subscription: CompanySubscription | null,
	now = new Date()
): SubscriptionSnapshot {
	const status = getSubscriptionStatus(subscription, now);
	const daysRemaining = getSubscriptionDaysRemaining(subscription, status, now);
	const warningMessage = buildWarningMessage(status, daysRemaining);
	const showWarningBar =
		status === 'TRIAL' ||
		status === 'GRACE' ||
		status === 'SUSPENDED' ||
		(status === 'ACTIVE' && daysRemaining <= ACTIVE_WARNING_DAYS);

	return {
		status,
		daysRemaining,
		planLabel: formatPlanLabel(subscription),
		warningMessage,
		showWarningBar
	};
}

export const SUBSCRIPTION_BLOCKED_MESSAGE =
	'Your subscription has expired. Please renew your subscription to continue using Bamanstock.';

export function isSubscriptionWriteBlocked(
	subscription: CompanySubscription | null,
	now = new Date()
): boolean {
	return getSubscriptionStatus(subscription, now) === 'SUSPENDED';
}
