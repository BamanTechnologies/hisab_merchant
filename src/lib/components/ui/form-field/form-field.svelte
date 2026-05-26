<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import Icon from "$lib/components/ui/Icon/index.js";
  import { cn } from "$lib/utils.js";
  import type { HTMLInputAttributes } from "svelte/elements";

  interface FormFieldProps extends Omit<HTMLInputAttributes, "type"> {
    label: string;
    id: string;
    type?: "text" | "email" | "tel" | "password" | "number";
    showPasswordToggle?: boolean;
    class?: string;
    containerClass?: string;
  }

  let {
    label,
    id,
    type = "text",
    showPasswordToggle = false,
    class: className,
    containerClass,
    value = $bindable(),
    ...restProps
  }: FormFieldProps = $props();

  let showPassword = $state(false);
  const inputType = $derived(
    showPasswordToggle && type === "password"
      ? showPassword
        ? "text"
        : "password"
      : type
  );
</script>

<div class={cn("space-y-2", containerClass)}>
  <label for={id} class="text-sm font-medium text-foreground">
    {label}
  </label>
  {#if showPasswordToggle && type === "password"}
    <div class="relative">
      <Input
        {id}
        type={inputType}
        bind:value
        class={cn("pr-10", className)}
        {...restProps}
      />
      <button
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        onclick={() => (showPassword = !showPassword)}
        tabindex="-1"
      >
        <Icon
          iconName={showPassword ? "icon/eye-off" : "icon/eye"}
          size={20}
        />
      </button>
    </div>
  {:else}
    <Input {id} type={inputType} bind:value class={className} {...restProps} />
  {/if}
</div>

