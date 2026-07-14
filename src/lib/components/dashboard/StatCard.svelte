<script lang="ts">
  import { cn } from "$lib/utils.js";

  type Props = {
    value: string;
    label: string;
    iconBg: string;
    iconColor: string;
    icon: import("svelte").Component;
    loading?: boolean;
  };

  let { value, label, iconBg, iconColor, icon: Icon, loading = false }: Props = $props();
</script>

<article class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 transition hover:shadow-md dark:bg-[#0f172a] dark:ring-white/10">
  <div class="flex items-center justify-between gap-4">
    <div class="min-w-0 flex-1">
      {#if loading}
        <div class="mb-2 h-9 w-24 animate-pulse rounded bg-gray-200"></div>
        <div class="h-5 w-32 animate-pulse rounded bg-gray-100"></div>
      {:else}
        <p class="text-sm 2xl:text-xl font-bold leading-tight tracking-tight text-gray-900 tabular-nums dark:text-gray-50">
          {value}
        </p>
        <p class="mt-1.5 text-xs 2xl:text-sm text-gray-400 dark:text-gray-500">{label}</p>
      {/if}
    </div>
    <div
      class={cn("flex size-10 2xl:size-14 shrink-0 items-center justify-center rounded-lg", iconBg)}
    >
      <Icon size={28} class={iconColor} />
    </div>
  </div>
</article>
