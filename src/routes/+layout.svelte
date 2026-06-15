<script lang="ts">
	import "../app.css";
	import favicon from "$lib/assets/favicon.svg";
	import ToastHost from "$lib/ToastHost.svelte";
	import { browser } from "$app/environment";
	import { navigating, page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import type { LayoutData } from "./$types";
	import {
		ArrowLeftRight,
		BarChart3,
		ChevronDown,
		Languages,
		LogOut,
		Package,
		Receipt,
		ShoppingCart,
		Users,
		Wallet,
	} from "@lucide/svelte";
	import { cn } from "$lib/utils.js";
	import { _, locale } from "svelte-i18n";
	import { setLocale, localeAbbr } from "$lib/i18n/index.js";

	let { data, children }: { data: LayoutData; children: import("svelte").Snippet } =
		$props();

	function shellVisible(): boolean {
		const serverOk = data.merchantContext != null;
		if (!browser) return serverOk;
		return serverOk || !!localStorage.getItem("authToken");
	}

	let isAuthenticated = $state(shellVisible());
	let showLangDropdown = $state(false);

	const APP_PREFIXES = [
		"/stocks",
		"/transfers",
		"/orders",
		"/customers",
		"/payments",
		"/expenses",
		"/reports",
	] as const;

	const isAppShellRoute = $derived.by(() => {
		const path = $page.url.pathname;
		return APP_PREFIXES.some((prefix) => path.startsWith(prefix));
	});

	const navItems = $derived([
		{ href: "/stocks",    label: $_('navStocks'),    icon: Package,        match: "/stocks"    },
		{ href: "/transfers", label: $_('navTransfers'), icon: ArrowLeftRight, match: "/transfers" },
		{ href: "/orders",    label: $_('navOrders'),    icon: ShoppingCart,   match: "/orders"    },
		{ href: "/customers", label: $_('navCustomers'), icon: Users,          match: "/customers" },
		{ href: "/payments",  label: $_('navPayments'),  icon: Wallet,         match: "/payments"  },
		{ href: "/expenses",  label: $_('navExpenses'),  icon: Receipt,        match: "/expenses"  },
		{ href: "/reports",   label: $_('navReports'),   icon: BarChart3,      match: "/reports"   },
	]);

	const langOptions = [
		{ value: "en", label: "English",      abbr: "ENG" },
		{ value: "am", label: "አማርኛ",         abbr: "AMH" },
		{ value: "om", label: "Afaan Oromoo",  abbr: "ORO" },
	];

	$effect(() => {
		const serverOk = data.merchantContext != null;
		if (!browser) {
			isAuthenticated = serverOk;
			return;
		}
		isAuthenticated = serverOk || !!localStorage.getItem("authToken");
	});

	$effect(() => {
		if (!browser) return;
		document.body.classList.toggle("merchant-app-active", isAppShellRoute);
		return () => document.body.classList.remove("merchant-app-active");
	});

	onMount(() => {
		const token = localStorage.getItem("authToken");
		if (token) {
			document.cookie = `authToken=${token}; path=/; secure; samesite=strict`;
			const branchId = localStorage.getItem("merchantBranchId");
			if (branchId) {
				document.cookie = `merchantBranchId=${branchId}; path=/; secure; samesite=strict`;
			}
		}

		const path = $page.url.pathname;
		const needsAuth = APP_PREFIXES.some((prefix) => path.startsWith(prefix));
		if (!token && data.merchantContext == null && needsAuth) {
			goto("/sign-in");
		}
	});

	function handleLogout() {
		localStorage.removeItem("authToken");
		localStorage.removeItem("merchantBranchId");
		document.cookie =
			"authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
		document.cookie =
			"merchantBranchId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
		isAuthenticated = false;
		goto("/sign-in");
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ToastHost />

{#if isAppShellRoute}
	<div class="merchant-app flex min-h-screen bg-[#F8F9FA] font-[Raleway,sans-serif] text-gray-900">
		<aside
			class="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col border-r border-gray-200 bg-white px-3 pb-5 pt-5"
			aria-label="Main navigation"
		>
			<a
				href="/"
				class="-mt-4 mb-6 flex shrink-0 items-center px-2"
				aria-label={$_('goToLanding')}
			>
				<img
					src="/logonew.png"
					alt="Bamanstock"
					class="h-14 w-auto max-w-full object-cover md:h-20"
				/>
			</a>

			<nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto">
				{#each navItems as item}
					{@const Icon = item.icon}
					{@const active = $page.url.pathname.startsWith(item.match)}
					<a
						href={item.href}
						class={cn(
							"relative flex items-center gap-3 rounded-r-lg py-2.5 pl-4 pr-3 text-sm font-medium transition",
							active
								? "bg-[#F0F7FF] font-semibold text-[#4DA0E6]"
								: "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
						)}
					>
						{#if active}
							<span
								class="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-[#4DA0E6]"
								aria-hidden="true"
							></span>
						{/if}
						<Icon size={20} strokeWidth={2} class={active ? "text-[#4DA0E6]" : "text-gray-500"} />
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="mt-auto border-t border-gray-100 pt-4 flex flex-col gap-1">
				<!-- Language switcher -->
				<div class="relative">
					<button
						type="button"
						class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
						onclick={() => (showLangDropdown = !showLangDropdown)}
					>
						<Languages size={20} strokeWidth={2} class="text-gray-500" />
						<span class="flex-1 text-left">{localeAbbr($locale)}</span>
						<ChevronDown size={14} class="text-gray-400 transition-transform {showLangDropdown ? 'rotate-180' : ''}" />
					</button>
					{#if showLangDropdown}
						<div class="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50">
							{#each langOptions as opt}
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-2 text-sm transition hover:bg-gray-50 {$locale === opt.value ? 'font-semibold text-[#4DA0E6]' : 'text-gray-700'}"
									onclick={() => { setLocale(opt.value); showLangDropdown = false; }}
								>
									<span class="w-8 text-xs font-mono text-gray-400">{opt.abbr}</span>
									{opt.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Logout -->
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#D15B7A] transition hover:bg-red-50"
					onclick={handleLogout}
				>
					<LogOut size={20} strokeWidth={2} />
					{$_('logout')}
				</button>
			</div>
		</aside>

		<main class="relative min-w-0 flex-1 p-6 pb-16">
			{@render children?.()}
			{#if $navigating}
				<div
					class="absolute inset-0 z-50 flex items-center justify-center bg-[#F8F9FA]/70 backdrop-blur-sm"
					aria-busy="true"
					aria-live="polite"
					role="status"
				>
					<div
						class="size-10 animate-spin rounded-full border-[3px] border-[#4DA0E6]/25 border-t-[#4DA0E6]"
						aria-hidden="true"
					></div>
					<span class="sr-only">{$_('loadingPage')}</span>
				</div>
			{/if}
		</main>
	</div>
{:else}
	{@render children?.()}
{/if}

<style>
	:global(body:not(.merchant-app-active)) {
		margin: 0;
		background: linear-gradient(180deg, #0f172a 0%, #0b1220 100%);
		color: #e5e7eb;
	}

	:global(body:not(.merchant-app-active) dialog) {
		color: #e5e7eb;
	}

	:global(body:not(.merchant-app-active) dialog :is(h1, h2, h3, h4)) {
		color: #f8fafc;
	}

	:global(body.merchant-app-active) {
		margin: 0;
		background: #f8f9fa;
		color: #111827;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
