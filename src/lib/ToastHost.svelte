<script lang="ts">
  import { flip } from "svelte/animate";
  import { fly } from "svelte/transition";
  import { toastItems } from "$lib/toast";
</script>

<div class="toast-host" aria-live="polite" aria-relevant="additions">
  {#each $toastItems as t (t.id)}
    <div
      class="toast toast--{t.variant}"
      animate:flip={{ duration: 200 }}
      in:fly={{ x: 40, duration: 220, opacity: 0 }}
      out:fly={{ x: 24, duration: 180, opacity: 0 }}
      role="status"
    >
      <span class="toast-accent" aria-hidden="true"></span>
      <p class="toast-text">{t.message}</p>
    </div>
  {/each}
</div>

<style>
  .toast-host {
    position: fixed;
    top: 4.5rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.65rem;
    max-width: min(22rem, calc(100vw - 2rem));
    pointer-events: none;
  }

  .toast {
    position: relative;
    pointer-events: none;
    margin: 0;
    padding: 0.85rem 1rem 0.85rem 1.1rem;
    border-radius: 0.75rem;
    overflow: hidden;
    /* Light mode (default): clean white card with the primary-colored border. */
    background: #ffffff;
    color: #0f172a;
    border: 1px solid #4da0e6;
    box-shadow:
      0 4px 6px -1px rgba(15, 23, 42, 0.08),
      0 14px 30px -12px rgba(77, 160, 230, 0.4);
  }

  .toast--success .toast-accent {
    background: linear-gradient(180deg, #34d399, #10b981);
  }

  .toast--error {
    border-color: #ef4444;
    box-shadow:
      0 4px 6px -1px rgba(15, 23, 42, 0.08),
      0 14px 30px -12px rgba(239, 68, 68, 0.32);
  }

  .toast--error .toast-text {
    color: #b91c1c;
  }

  .toast--error .toast-accent {
    background: linear-gradient(180deg, #f87171, #ef4444);
  }

  .toast-accent {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 0.75rem 0 0 0.75rem;
  }

  .toast-text {
    margin: 0;
    padding-left: 0.35rem;
    font-size: 0.9rem;
    line-height: 1.45;
    font-weight: 600;
  }

  /* Dark mode: keep the original rich gradient treatment. */
  :global(html.dark) .toast {
    border: 1px solid color-mix(in oklab, white, transparent 82%);
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.25),
      0 12px 28px -8px rgba(15, 118, 110, 0.45);
  }

  :global(html.dark) .toast--success {
    background: linear-gradient(
      135deg,
      color-mix(in oklab, #0d9488, #0f172a 35%) 0%,
      color-mix(in oklab, #0369a1, #0f172a 28%) 55%,
      color-mix(in oklab, #059669, #0f172a 22%) 100%
    );
    color: #ecfeff;
  }

  :global(html.dark) .toast--success .toast-accent {
    background: linear-gradient(
      180deg,
      rgba(165, 243, 252, 0.95),
      rgba(45, 212, 191, 0.55)
    );
  }

  :global(html.dark) .toast--error {
    background: linear-gradient(
      135deg,
      color-mix(in oklab, #b91c1c, #1e1b4b 25%) 0%,
      color-mix(in oklab, #7f1d1d, #0f172a 15%) 100%
    );
    color: #fef2f2;
    border-color: color-mix(in oklab, white, transparent 82%);
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.3),
      0 14px 32px -10px rgba(220, 38, 38, 0.5);
  }

  :global(html.dark) .toast--error .toast-text {
    color: #fef2f2;
  }

  :global(html.dark) .toast--error .toast-accent {
    background: linear-gradient(180deg, #fecaca, rgba(248, 113, 113, 0.5));
  }

  :global(html.dark) .toast-text {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }
</style>
