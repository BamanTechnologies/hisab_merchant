<script lang="ts">
  import { IconMap, type IconType } from "$assets/index.js";
  import { cn } from "$lib/utils.js";
  import type { Component } from "svelte";

  interface IconProps {
    iconName: IconType;
    size?: number;
    aspectFit?: boolean;
    class?: string;
    [key: string]: any;
  }

  let {
    iconName,
    size = 24,
    aspectFit = false,
    class: className,
    ...restProps
  }: IconProps = $props();

  // Check if this is a flag icon (PNG image)
  const isFlagIcon = $derived(iconName.startsWith("flags/"));

  // Get the lazy loader function for this icon
  const iconLoader = $derived(IconMap[iconName]);

  // Load the icon
  const iconPromise = $derived(iconLoader());
</script>

{#await iconPromise then iconModule}
  {#if isFlagIcon}
    <!-- Flag icons are rendered as img tags -->
    {@const iconSrc = iconModule.default as string}
    <img
      src={iconSrc}
      alt={iconName}
      width={size}
      height={size}
      class={cn(
        "inline-block",
        aspectFit ? "object-contain" : "object-cover",
        className
      )}
      {...restProps}
    />
  {:else}
    <!-- SVG icons are rendered as Svelte components (Svelte 5 dynamic component syntax) -->
    {@const IconComponent = iconModule.default as Component}
    <IconComponent
      {size}
      class={cn(
        "inline-block shrink-0",
        aspectFit ? "object-contain" : "",
        className
      )}
      {...restProps}
    />
  {/if}
{:catch error}
  <!-- Fallback for missing icons -->
  <div
    class={cn(
      "inline-flex items-center justify-center bg-muted text-muted-foreground",
      className
    )}
    style="width: {size}px; height: {size}px;"
    {...restProps}
  >
    <span class="text-xs">?</span>
  </div>
{/await}
