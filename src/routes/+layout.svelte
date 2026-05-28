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
		LogOut,
		Package,
		Receipt,
		ShoppingCart,
		Users,
		Wallet,
	} from "@lucide/svelte";
	import { cn } from "$lib/utils.js";

	let { data, children }: { data: LayoutData; children: import("svelte").Snippet } =
		$props();

	function shellVisible(): boolean {
		const serverOk = data.merchantContext != null;
		if (!browser) return serverOk;
		return serverOk || !!localStorage.getItem("authToken");
	}

	let isAuthenticated = $state(shellVisible());

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

	const navItems = [
		{ href: "/stocks", label: "Stocks", icon: Package, match: "/stocks" },
		{ href: "/transfers", label: "Transfers", icon: ArrowLeftRight, match: "/transfers" },
		{ href: "/orders", label: "Orders", icon: ShoppingCart, match: "/orders" },
		{ href: "/customers", label: "Customers", icon: Users, match: "/customers" },
		{ href: "/payments", label: "Payments", icon: Wallet, match: "/payments" },
		{ href: "/expenses", label: "Expenses", icon: Receipt, match: "/expenses" },
		{ href: "/reports", label: "Reports", icon: BarChart3, match: "/reports" },
	] as const;

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
				aria-label="Go to landing page"
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

			<div class="mt-auto border-t border-gray-100 pt-4">
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#D15B7A] transition hover:bg-red-50"
					onclick={handleLogout}
				>
					<LogOut size={20} strokeWidth={2} />
					Logout
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
					<span class="sr-only">Loading page</span>
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
