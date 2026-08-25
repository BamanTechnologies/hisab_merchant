<script lang="ts">
	import { browser } from "$app/environment";
	import { mc } from "$lib/merchant-styles.js";
	import type { SendSmsActionResult } from "$lib/sms";
	import { _ } from "svelte-i18n";

	let {
		customerIds,
		oncancel,
		oncomplete,
	}: {
		customerIds: string[];
		oncancel?: () => void;
		oncomplete?: () => void;
	} = $props();

	let smsMessage = $state("");
	let smsSending = $state(false);
	let smsError = $state<string | null>(null);
	let smsResult = $state<SendSmsActionResult | null>(null);

	function requestClose() {
		if (smsSending) return;
		const completed = smsResult != null;
		smsResult = null;
		smsError = null;
		smsMessage = "";
		if (completed) oncomplete?.();
		else oncancel?.();
	}

	async function submitSms() {
		const message = smsMessage.trim();
		if (!message || customerIds.length === 0 || smsSending) return;

		smsSending = true;
		smsError = null;
		try {
			const token = browser ? localStorage.getItem("authToken") : null;
			if (!token) throw new Error($_("smsNoAuthToken"));

			const res = await fetch("/api/customers/send-sms", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ customerIds, message }),
			});
			const result = await res.json();
			if (!res.ok) {
				throw new Error(
					(result as { error?: string }).error ?? $_("smsRequestFailed"),
				);
			}
			smsResult = result as SendSmsActionResult;
		} catch (err) {
			smsError = err instanceof Error ? err.message : String(err);
		} finally {
			smsSending = false;
		}
	}
</script>

<div
	class="modal-overlay"
	role="button"
	tabindex="0"
	onclick={requestClose}
	onkeydown={(e) => (e.key === "Enter" || e.key === " ") && requestClose()}
></div>
<dialog
	open
	class="modal"
	onclick={(e) => e.stopPropagation()}
>
	<header>
		<h2>{smsResult ? $_('smsResultTitle') : $_('smsModalTitle')}</h2>
		<button
			class="icon"
			aria-label="Close"
			disabled={smsSending}
			onclick={requestClose}>✕</button
		>
	</header>

	{#if smsResult}
		<div class="modal-body">
			{#if smsError}
				<p class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
					{smsError}
				</p>
			{/if}
			<div class="space-y-3">
				<div class="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm dark:border-green-500/30 dark:bg-green-500/10">
					<span class="font-medium text-green-800 dark:text-green-300">{$_('smsSuccessCount')}</span>
					<span class="font-semibold tabular-nums text-green-900 dark:text-green-200">{smsResult.success_count ?? 0}</span>
				</div>
				<div class="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-500/30 dark:bg-red-500/10">
					<span class="font-medium text-red-800 dark:text-red-300">{$_('smsFailureCount')}</span>
					<span class="font-semibold tabular-nums text-red-900 dark:text-red-200">{smsResult.failure_count ?? 0}</span>
				</div>
				{#if smsResult.message}
					<p class="text-sm text-gray-600 dark:text-gray-400">{smsResult.message}</p>
				{/if}
				{#if smsResult.error != null && String(smsResult.error).trim() !== ""}
					<p class="text-sm text-red-700 dark:text-red-400">{$_('status')}: {String(smsResult.error)}</p>
				{/if}
			</div>
		</div>
		<footer>
			<button
				type="button"
				class={mc.primaryBtn}
				onclick={requestClose}>{$_('close')}</button
			>
		</footer>
	{:else}
		<div class="modal-body">
			<p class="mb-3 text-sm text-gray-500 dark:text-gray-400">
				{$_('customersSelected', { values: { count: customerIds.length } })}
			</p>
			<label class="block-label" for="sms-message-input">
				{$_('smsMessageLabel')}
			</label>
			<textarea
				id="sms-message-input"
				class="sms-textarea"
				rows="5"
				bind:value={smsMessage}
				placeholder={$_('smsMessagePlaceholder')}
				disabled={smsSending}
			></textarea>
			{#if smsError}
				<p class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
					{smsError}
				</p>
			{/if}
		</div>
		<footer>
			<button
				type="button"
				class="inline-flex h-[30px] shrink-0 items-center justify-center rounded-[5px] border border-[#e6eaed] bg-white px-3 text-sm font-medium text-[#1a1a1a] transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
				onclick={requestClose}
				disabled={smsSending}>{$_('back')}</button
			>
			<button
				type="button"
				class={mc.primaryBtn}
				onclick={submitSms}
				disabled={smsSending || smsMessage.trim() === "" || customerIds.length === 0}
				>{smsSending ? $_('sending') : $_('smsSendAction')}</button
			>
		</footer>
	{/if}
</dialog>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(2, 6, 23, 0.6);
		backdrop-filter: blur(2px);
		z-index: 30;
	}
	.modal {
		position: fixed;
		inset: 0;
		margin: auto;
		max-width: 480px;
		width: calc(100% - 2rem);
		max-height: min(90vh, 720px);
		background: color-mix(in oklab, var(--surface), black 2%);
		border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
		border-radius: 0.9rem;
		padding: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
	}
	.modal header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
		flex-shrink: 0;
	}
	.modal h2 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
		color: #f8fafc;
	}
	.modal .icon {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 1.1rem;
		cursor: pointer;
	}
	.modal .icon:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.modal-body {
		padding: 1rem;
		overflow: auto;
		color: #e5e7eb;
	}
	.modal footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem;
		border-top: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
		flex-shrink: 0;
	}
	.block-label {
		display: block;
		margin-bottom: 0.35rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #cbd5e1;
	}
	.sms-textarea {
		width: 100%;
		resize: vertical;
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklab, var(--surface-2), white 12%);
		background: color-mix(in oklab, var(--surface-2), white 2%);
		color: #e5e7eb;
		padding: 0.6rem 0.75rem;
		font-size: 0.95rem;
	}
	.sms-textarea:focus {
		outline: none;
		border-color: #4da0e6;
		box-shadow: 0 0 0 2px rgb(77 160 230 / 0.2);
	}
	.sms-textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
