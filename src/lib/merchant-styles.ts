import { cn } from "$lib/utils.js";

/** Shared Tailwind classes for merchant app pages (Figma light dashboard). */
export const mc = {
	pageHeader: "mb-6 flex flex-wrap items-start justify-between gap-4",
	pageTitle: "font-[Sora] text-2xl font-bold tracking-tight text-gray-900",
	pageSubtitle: "mt-1 text-sm text-gray-500",
	primaryBtn:
		"inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#3d8fd4] bg-[#4DA0E6] px-4 text-sm font-semibold leading-none text-white transition hover:bg-[#3d8fd4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4DA0E6] disabled:opacity-50",
	ghostBtn:
		"inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50",
	/** Compact action button for table rows (30px, matches filters). */
	tableBtn:
		"inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50",
	filterSection:
		"mb-4 grid items-end gap-4 rounded-xl border border-[#e6eaed] bg-white p-5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]",
	filterLabel: "mb-1.5 block text-sm font-medium text-gray-500",
	/** Select fields — chevron via `.merchant-filter-select` in app.css */
	filterSelect:
		"merchant-filter-select h-[30px] w-full rounded-[5px] border border-[#e6eaed] bg-white py-0 pl-3 pr-9 text-sm font-medium text-gray-800 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20",
	/** Compact select for table toolbar (type, status, etc.) */
	filterSelectCompact:
		"merchant-filter-select h-[30px] min-w-[8.5rem] rounded-[5px] border border-[#e6eaed] bg-white py-0 pl-3 pr-9 text-sm font-medium text-gray-800 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20",
	/** Date inputs (keep native picker; no chevron) */
	filterDate:
		"h-[30px] w-full rounded-[5px] border border-[#e6eaed] bg-white py-0 pl-3 pr-3 text-sm font-medium text-gray-800 focus:border-[#4DA0E6] focus:outline-none focus:ring-2 focus:ring-[#4DA0E6]/20",
	summaryGrid: "mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
	tableSection: "overflow-hidden rounded-[5px] border border-[#e6eaed] bg-white",
	tableToolbar:
		"flex flex-wrap items-center justify-between gap-3 border-b border-[#e6eaed] bg-white px-4 py-3",
	/** Inline label + control in table toolbar (same row as search). */
	tableToolbarFilter: "flex h-[30px] shrink-0 flex-row items-center gap-2",
	tableToolbarFilterLabel:
		"shrink-0 whitespace-nowrap text-sm font-medium leading-none text-gray-500",
	table: "w-full min-w-[640px] border-collapse text-sm",
	/** Table header row — #f2f2f2, 30px height */
	th: "h-[30px] border-b border-[#e6eaed] bg-[#f2f2f2] px-4 text-left text-sm font-medium text-[#1a1a1a]",
	thCenter:
		"h-[30px] border-b border-[#e6eaed] bg-[#f2f2f2] px-4 text-center text-sm font-medium text-[#1a1a1a]",
	thRight:
		"h-[30px] border-b border-[#e6eaed] bg-[#f2f2f2] px-4 text-right text-sm font-medium text-[#1a1a1a]",
	td: "border-b border-gray-100 px-4 py-2 align-middle text-sm text-gray-700",
	tdRight: "border-b border-gray-100 px-4 py-2 text-right align-middle text-sm text-gray-700",
	tdCenter: "border-b border-gray-100 px-4 py-2 text-center align-middle text-sm text-gray-700",
	colNum:
		"w-12 whitespace-nowrap border-b border-gray-100 bg-white px-4 py-2 text-center text-sm tabular-nums text-gray-500",
	colNumHead:
		"h-[30px] w-12 whitespace-nowrap border-b border-[#e6eaed] bg-[#f2f2f2] px-4 text-center text-sm font-medium tabular-nums text-[#1a1a1a]",
	rowClickable: "cursor-pointer transition hover:bg-gray-50/80",
	emptyCell: "border-b border-gray-100 px-4 py-8 text-center text-sm text-gray-500",
	sortBtn:
		"inline-flex h-[30px] items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-[#1a1a1a] transition-colors hover:text-[#1a1a1a]/80",
	actionBtn:
		"inline-flex size-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white text-gray-600 transition hover:bg-gray-50",
	actionBtnDanger:
		"inline-flex size-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white text-red-600 transition hover:bg-red-50",
	link: "font-semibold text-[#4DA0E6] hover:underline",
	alertError: "mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800",
	alertSuccess:
		"mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800",
} as const;

const chipBase =
	"inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-semibold capitalize text-white before:size-1.5 before:shrink-0 before:rounded-full before:bg-white before:content-['']";

/** Payment / order status pill (Figma colors). */
export function statusChipClass(status: string | null | undefined): string {
	const s = String(status ?? "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "_");
	if (s === "paid" || s === "fully_paid" || s === "completed") {
		return cn(chipBase, "bg-[#67B186]");
	}
	if (s === "partially_paid") {
		return cn(chipBase, "bg-[#F4C44E]");
	}
	if (s === "unpaid" || s === "not_paid") {
		return cn(chipBase, "bg-[#D15B5B]");
	}
	if (s === "cancelled") {
		return cn(chipBase, "bg-gray-400");
	}
	return cn(chipBase, "bg-gray-400");
}

/** SMS delivery status pill (reports list). */
export function smsStatusChipClass(status: string | null | undefined): string {
	const s = String(status ?? "")
		.trim()
		.toLowerCase();
	if (s === "sent" || s === "delivered") {
		return cn(chipBase, "bg-[#67B186]");
	}
	if (s === "pending") {
		return cn(chipBase, "bg-[#F4C44E]");
	}
	return cn(chipBase, "bg-[#D15B5B]");
}
