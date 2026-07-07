<script lang="ts">
	import { tick } from 'svelte';

	type Investor = {
		id: string;
		first_name: string;
		last_name: string;
	};

	type Props = {
		investors: Investor[];
		selectedIds?: string[];
		disabled?: boolean;
		placeholder?: string;
		emptyHint?: string;
	};

	let {
		investors,
		selectedIds = $bindable([]),
		disabled = false,
		placeholder = 'Select investors',
		emptyHint = 'Add investors to your company before creating products.',
	}: Props = $props();

	let open = $state(false);
	let rootEl = $state<HTMLDivElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	let menuPosStyle = $state('');

	function investorLabel(ids: string[]): string {
		if (ids.length === 0) return placeholder;
		const names = investors
			.filter((i) => ids.includes(i.id))
			.map((i) => `${i.first_name} ${i.last_name}`.trim());
		return names.join(', ');
	}

	function toggleInvestor(id: string) {
		if (selectedIds.includes(id)) {
			selectedIds = selectedIds.filter((x) => x !== id);
		} else {
			selectedIds = [...selectedIds, id];
		}
	}

	function updateMenuPosition() {
		const el = rootEl;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const gap = 6;
		const pad = 10;
		const width = rect.width;
		let left = Math.max(pad, Math.min(rect.left, window.innerWidth - width - pad));
		const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
		const spaceAbove = rect.top - gap - pad;
		let top = rect.bottom + gap;
		let maxHeight = Math.min(280, Math.max(100, spaceBelow));
		if (spaceBelow < 120 && spaceAbove > spaceBelow) {
			maxHeight = Math.min(280, Math.max(100, spaceAbove));
			top = rect.top - gap - maxHeight;
			top = Math.max(pad, top);
		}
		menuPosStyle = `top:${top}px;left:${left}px;width:${width}px;max-height:${maxHeight}px`;
	}

	$effect(() => {
		if (!open) menuPosStyle = '';
	});

	$effect(() => {
		if (!open) return;

		let raf = 0;
		const schedulePosition = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => updateMenuPosition());
		};

		void tick().then(schedulePosition);

		window.addEventListener('resize', schedulePosition);
		window.addEventListener('scroll', schedulePosition, true);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', schedulePosition);
			window.removeEventListener('scroll', schedulePosition, true);
		};
	});

	$effect(() => {
		if (!open || disabled) return;

		const onPointerDown = (e: PointerEvent) => {
			const node = e.target as Node;
			if (!rootEl?.contains(node) && !menuEl?.contains(node)) {
				open = false;
			}
		};

		document.addEventListener('pointerdown', onPointerDown, true);
		return () => document.removeEventListener('pointerdown', onPointerDown, true);
	});
</script>

{#if investors.length === 0}
	<p class="investor-empty">{emptyHint}</p>
{:else}
	<div class="multiselect" bind:this={rootEl}>
		<button
			type="button"
			class="select-trigger"
			{disabled}
			aria-expanded={open}
			onclick={() => {
				if (disabled) return;
				open = !open;
			}}
		>
			{investorLabel(selectedIds)}
		</button>
	</div>
{/if}

{#if open && investors.length > 0 && menuPosStyle !== ''}
	<div
		bind:this={menuEl}
		class="select-menu investor-menu-portal"
		style={menuPosStyle}
		role="listbox"
		aria-multiselectable="true"
	>
		{#each investors as inv (inv.id)}
			<label class="option">
				<input
					type="checkbox"
					checked={selectedIds.includes(inv.id)}
					onchange={() => toggleInvestor(inv.id)}
				/>
				<span>{inv.first_name} {inv.last_name}</span>
			</label>
		{/each}
	</div>
{/if}

<style>
	.investor-empty {
		margin: 0;
		font-size: 0.8125rem;
		color: #94a3b8;
		line-height: 1.45;
	}
</style>
