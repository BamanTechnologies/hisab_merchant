export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function paginateSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
	const size = Math.max(1, pageSize);
	const totalPages = Math.max(1, Math.ceil(items.length / size));
	const safePage = Math.min(Math.max(1, page), totalPages);
	const start = (safePage - 1) * size;
	return items.slice(start, start + size);
}

export function buildPageList(current: number, total: number): (number | "…")[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}
	const pages = new Set<number>([1, total, current, current - 1, current + 1]);
	const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
	const out: (number | "…")[] = [];
	let prev = 0;
	for (const p of sorted) {
		if (prev && p - prev > 1) out.push("…");
		out.push(p);
		prev = p;
	}
	return out;
}
