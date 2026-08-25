export type SendSmsActionResult = {
	error?: string | number | null;
	failure_count?: number | null;
	message?: string | null;
	status_code?: number | null;
	success_count?: number | null;
};
