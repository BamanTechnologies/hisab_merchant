/** Short uppercase code from a company name (e.g. "Amanuel Import" → "AI"). */
export function companyCodeFromName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return 'BAT';

	const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
	if (words.length >= 2) {
		const initials = words
			.map((w) => w.replace(/[^a-zA-Z0-9]/g, '')[0])
			.filter(Boolean)
			.join('');
		if (initials.length >= 2) return initials.toUpperCase().slice(0, 4);
	}

	const alnum = trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
	return (alnum.slice(0, 3) || 'BAT');
}

/** Random batch label like AMI-0042 from company name. */
export function generateBatchNumber(companyName: string): string {
	const code = companyCodeFromName(companyName);
	const digits = Math.floor(Math.random() * 10_000)
		.toString()
		.padStart(4, '0');
	return `${code}-${digits}`;
}

function normalizeBatchKey(value: string): string {
	return value.trim().toLowerCase();
}

/** Pick a batch number not present in `taken` (case-insensitive). */
export function resolveUniqueBatchNumber(
	companyName: string,
	taken: Iterable<string>,
	preferred: string | null = null,
): string {
	const takenNorm = new Set(
		[...taken].map(normalizeBatchKey).filter((k) => k.length > 0),
	);

	const pref = preferred?.trim();
	if (pref && !takenNorm.has(normalizeBatchKey(pref))) return pref;

	for (let attempt = 0; attempt < 100; attempt++) {
		const candidate = generateBatchNumber(companyName);
		if (!takenNorm.has(normalizeBatchKey(candidate))) return candidate;
	}

	const code = companyCodeFromName(companyName);
	return `${code}-${Date.now().toString().slice(-6)}`;
}
