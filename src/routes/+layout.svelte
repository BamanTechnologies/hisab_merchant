<script lang="ts">
	import "../app.css";
	import favicon from "$lib/assets/favicon.svg";
	import ToastHost from "$lib/ToastHost.svelte";
	import SubscriptionWarningBar from "$lib/components/SubscriptionWarningBar.svelte";
	import { subscriptionStore } from "$lib/subscription/client";
	import { browser } from "$app/environment";
	import { navigating, page } from "$app/state";
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import type { LayoutData } from "./$types";
	import {
		ArrowLeftRight,
		BarChart3,
		Globe,
		LogOut,
		Menu,
		Moon,
		Package,
		Receipt,
		ShoppingCart,
		Sun,
		Users,
		Wallet,
		X,
	} from "@lucide/svelte";
	import { cn } from "$lib/utils.js";
	import { _ } from "svelte-i18n";
	import { setLocale, localeAbbr, locale } from "$lib/i18n/index.js";

	let { data, children }: { data: LayoutData; children: import("svelte").Snippet } =
		$props();

	function shellVisible(): boolean {
		const serverOk = data.merchantContext != null;
		if (!browser) return serverOk;
		return serverOk || !!localStorage.getItem("authToken");
	}

	let isAuthenticated = $state(shellVisible());
	let sidebarOpen = $state(false);
	let theme = $state<"light" | "dark">("light");

	const APP_PREFIXES = [
		"/stocks",
		"/transfers",
		"/orders",
		"/customers",
		"/payments",
		"/expenses",
		"/reports",
	] as const;

	const isAppShellRoute = $derived(
		APP_PREFIXES.some((prefix) => page.url.pathname.startsWith(prefix)),
	);

	const navItems = $derived([
		{ href: "/stocks", label: $_('navStocks'), icon: Package, match: "/stocks" },
		{ href: "/transfers", label: $_('navTransfers'), icon: ArrowLeftRight, match: "/transfers" },
		{ href: "/orders", label: $_('navOrders'), icon: ShoppingCart, match: "/orders" },
		{ href: "/customers", label: $_('navCustomers'), icon: Users, match: "/customers" },
		{ href: "/payments", label: $_('navPayments'), icon: Wallet, match: "/payments" },
		{ href: "/expenses", label: $_('navExpenses'), icon: Receipt, match: "/expenses" },
		{ href: "/reports", label: $_('navReports'), icon: BarChart3, match: "/reports" },
	]);

	$effect(() => {
		const serverOk = data.merchantContext != null;
		if (!browser) {
			isAuthenticated = serverOk;
			return;
		}
		isAuthenticated = serverOk || !!localStorage.getItem("authToken");
	});

	$effect.pre(() => {
		if (data.merchantContext) {
			subscriptionStore.setFromServer(data.subscriptionLoad);
			return;
		}
		subscriptionStore.reset();
	});

	$effect(() => {
		if (!browser) return;
		document.body.classList.toggle("merchant-app-active", isAppShellRoute);
		document.documentElement.classList.toggle("merchant-zoom", isAppShellRoute);
		return () => {
			document.body.classList.remove("merchant-app-active");
			document.documentElement.classList.remove("merchant-zoom");
		};
	});

	// Dark mode only applies inside the dashboard shell; landing/auth keep their own look.
	$effect(() => {
		if (!browser) return;
		document.documentElement.classList.toggle(
			"dark",
			isAppShellRoute && theme === "dark",
		);
	});

	// Close the mobile drawer whenever the route changes.
	$effect(() => {
		void page.url.pathname;
		sidebarOpen = false;
	});

	// Lock body scroll while the mobile drawer is open.
	$effect(() => {
		if (!browser) return;
		document.body.style.overflow = sidebarOpen ? "hidden" : "";
		return () => {
			document.body.style.overflow = "";
		};
	});

	onMount(() => {
		theme = localStorage.getItem("theme") === "dark" ? "dark" : "light";

		const token = localStorage.getItem("authToken");
		if (token) {
			document.cookie = `authToken=${token}; path=/; secure; samesite=strict`;
			const branchId = localStorage.getItem("merchantBranchId");
			if (branchId) {
				document.cookie = `merchantBranchId=${branchId}; path=/; secure; samesite=strict`;
			}
		}

		const path = page.url.pathname;
		const needsAuth = APP_PREFIXES.some((prefix) => path.startsWith(prefix));
		if (!token && data.merchantContext == null && needsAuth) {
			goto("/sign-in");
		}
	});

	function toggleTheme() {
		theme = theme === "dark" ? "light" : "dark";
		if (browser) localStorage.setItem("theme", theme);
	}

	function handleLogout() {
		subscriptionStore.reset();
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

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape") sidebarOpen = false;
	}}
/>

{#if isAppShellRoute}
	<div class="merchant-app flex min-h-screen bg-[#F8F9FA] font-[Raleway,sans-serif] text-gray-900 dark:bg-[#0b1220] dark:text-gray-100">
		{#if sidebarOpen}
			<button
				type="button"
				class="fixed inset-0 z-40 bg-black/40 lg:hidden"
				aria-label="Close navigation"
				onclick={() => (sidebarOpen = false)}
			></button>
		{/if}

		<aside
			class={cn(
				"fixed inset-y-0 left-0 z-50 flex h-dvh w-[260px] shrink-0 flex-col border-r border-gray-200 bg-white px-3 pb-5 pt-5 transition-transform duration-300 ease-in-out dark:border-white/10 dark:bg-[#0f172a] lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0",
				sidebarOpen ? "translate-x-0" : "-translate-x-full",
			)}
			aria-label="Main navigation"
		>
			<div class="-mt-4 mb-6 flex shrink-0 items-center justify-between gap-2 px-2">
				<a
					href="/"
					class="flex items-center"
					aria-label="Go to landing page"
				>
					<img
						src="/logonew.png"
						alt="Bamanstock"
						class="h-14 w-auto max-w-full object-cover md:h-20"
					/>
				</a>
				<button
					type="button"
					class="-mr-1 flex size-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 lg:hidden"
					aria-label="Close menu"
					onclick={() => (sidebarOpen = false)}
				>
					<X size={20} strokeWidth={2} />
				</button>
			</div>

			<nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
				{#each navItems as item}
					{@const Icon = item.icon}
					{@const active = page.url.pathname.startsWith(item.match)}
					<a
						href={item.href}
						class={cn(
							"relative flex items-center gap-3 rounded-r-lg py-2.5 pl-4 pr-3 text-sm font-medium transition",
							active
								? "bg-[#F0F7FF] font-semibold text-[#4DA0E6] dark:bg-[#4DA0E6]/15"
								: "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white",
						)}
					>
						{#if active}
							<span
								class="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-[#4DA0E6]"
								aria-hidden="true"
							></span>
						{/if}
						<Icon size={20} strokeWidth={2} class={active ? "text-[#4DA0E6]" : "text-gray-500 dark:text-gray-400"} />
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="mt-auto flex flex-col gap-1 border-t border-gray-100 pt-4 dark:border-white/10">
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
					onclick={toggleTheme}
					aria-pressed={theme === "dark"}
				>
					{#if theme === "dark"}
						<Sun size={20} strokeWidth={2} class="text-[#4DA0E6]" />
						{$_('lightMode')}
					{:else}
						<Moon size={20} strokeWidth={2} class="text-gray-500" />
						{$_('darkMode')}
					{/if}
				</button>
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
					onclick={() => {
						const next = $locale === 'en' ? 'am' : $locale === 'am' ? 'om' : 'en';
						setLocale(next);
					}}
					aria-label="Switch language"
				>
					<Globe size={20} strokeWidth={2} class="text-gray-500 dark:text-gray-400" />
					{localeAbbr($locale)}
				</button>
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#D15B7A] transition hover:bg-red-50 dark:hover:bg-red-500/10"
					onclick={handleLogout}
				>
					<LogOut size={20} strokeWidth={2} />
					{$_('logout')}
				</button>
			</div>
		</aside>

		<div class="flex min-w-0 flex-1 flex-col">
			<div class="sticky top-0 z-30 shrink-0">
				<header
					class="flex items-center gap-3 border-b border-gray-200 bg-white/95 px-4 py-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-[#0f172a]/95 lg:hidden"
				>
				<button
					type="button"
					class="flex size-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
					aria-label="Open menu"
					aria-expanded={sidebarOpen}
					onclick={() => (sidebarOpen = true)}
				>
					<Menu size={22} strokeWidth={2} />
				</button>
				<a href="/" class="flex items-center" aria-label="Go to landing page">
					<img
						src="/logonew.png"
						alt="Bamanstock"
						class="h-14 w-auto max-w-full object-cover"
					/>
				</a>
				<button
					type="button"
					class="ml-auto flex size-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
					aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
					aria-pressed={theme === "dark"}
					onclick={toggleTheme}
				>
					{#if theme === "dark"}
						<Sun size={20} strokeWidth={2} />
					{:else}
						<Moon size={20} strokeWidth={2} />
					{/if}
				</button>
			</header>

				{#if isAuthenticated}
					<SubscriptionWarningBar />
				{/if}
			</div>

			<main class="relative min-w-0 flex-1 p-4 pb-16 sm:p-6">
				{@render children?.()}
				{#if navigating.to}
					<div
						class="fixed inset-0 z-60 flex items-center justify-center bg-[#F8F9FA]/80 backdrop-blur-sm dark:bg-[#0b1220]/80"
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

	:global(html.dark body.merchant-app-active) {
		background: #0b1220;
		color: #f3f4f6;
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
