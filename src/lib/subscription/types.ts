export type BillingCycle = 3 | 6 | 12;

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'SUSPENDED';

export type SubscriptionPlan = {
	id: string;
	name: string;
};

export type SubscriptionPlanPricing = {
	id: string;
	billing_cycle: BillingCycle;
	price: number | string;
	plan: SubscriptionPlan | null;
};

export type CompanySubscription = {
	id: string;
	company_id: string;
	start_date: string | null;
	end_date: string | null;
	trial_started_at: string | null;
	trial_ends_at: string | null;
	current_period_start: string | null;
	current_period_end: string | null;
	plan_pricing: SubscriptionPlanPricing | null;
};

export type SubscriptionSnapshot = {
	status: SubscriptionStatus;
	daysRemaining: number;
	planLabel: string | null;
	warningMessage: string | null;
	showWarningBar: boolean;
};

export type SubscriptionLoadResult = {
	subscription: CompanySubscription | null;
	hasActiveSubscription: boolean | null;
	error: string | null;
	loaded: boolean;
};
