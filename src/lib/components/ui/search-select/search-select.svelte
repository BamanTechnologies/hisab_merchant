<script lang="ts">
  import { tick } from 'svelte';
  import { cn } from '$lib/utils.js';

  type SearchResult = {
    id: string;
    name?: string | null;
    [key: string]: unknown;
  };

  type Props = {
    value: string;
    selected?: SearchResult | null;
    onselect?: (itemId: string, item: SearchResult) => void;
    companyId: string;
    branchId?: string;
    endpoint?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    label?: string;
    id?: string;
    itemLabel?: (item: SearchResult) => string;
    class?: string;
    containerClass?: string;
    name?: string;
  };

  let {
    value = $bindable(''),
    selected = $bindable(null),
    onselect,
    companyId,
    branchId,
    endpoint = '/api/products/search',
    placeholder = 'Select...',
    disabled = false,
    required = false,
    label,
    id,
    itemLabel = defaultItemLabel,
    class: className,
    containerClass,
    name,
  }: Props = $props();

  function defaultItemLabel(p: SearchResult): string {
    const n = p.name?.trim() || '';
    const unit = typeof p.default_unit === 'string' ? p.default_unit.trim() : '';
    if (n && unit) return `${n} · ${unit}`;
    return n || 'Unnamed item';
  }

  let open = $state(false);
  let searchQuery = $state('');
  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let highlightedIndex = $state(-1);
  let rootEl = $state<HTMLDivElement | null>(null);
  let panelEl = $state<HTMLDivElement | null>(null);
  let searchInputEl = $state<HTMLInputElement | null>(null);
  let panelStyle = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let selectedItem = $state<SearchResult | null>(null);

  let searchAttempted = $state(false);
  let initialLoaded = $state(false);

  function getLabel(): string {
    const item = selectedItem ?? selected;
    if (value && item) return itemLabel(item);
    if (value) return value;
    return placeholder;
  }

  function loadInitialProducts() {
    if (initialLoaded) return;
    initialLoaded = true;
    searchAttempted = true;
    fetchProducts('');
  }

  function toggle() {
    if (disabled) return;
    open = !open;
    if (open) {
      searchQuery = '';
      highlightedIndex = -1;
      loadInitialProducts();
    } else {
      results = [];
      initialLoaded = false;
    }
  }

  function close() {
    open = false;
    searchQuery = '';
    results = [];
    highlightedIndex = -1;
    initialLoaded = false;
    clearTimeout(debounceTimer);
  }

  function fetchProducts(search: string) {
    if (!companyId) {
      console.error('[search-select] companyId is empty — cannot search');
      results = [];
      return;
    }

    loading = true;

    const params = new URLSearchParams({ q: search, companyId });
    if (branchId) params.set('branchId', branchId);

    fetch(`${endpoint}?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error('Search failed');
        return r.json() as Promise<SearchResult[]>;
      })
      .then((data) => {
        results = data;
        highlightedIndex = data.length > 0 ? 0 : -1;
      })
      .catch((err) => {
        console.error('[search-select]', err);
        results = [];
      })
      .finally(() => {
        loading = false;
      });
  }

  function doSearch(q: string) {
    const trimmed = q.trim();
    searchAttempted = true;
    fetchProducts(trimmed);
  }

  function onSearchInput(e: Event) {
    const q = (e.target as HTMLInputElement).value;
    searchQuery = q;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(q), 300);
  }

  function selectItem(item: SearchResult) {
    value = item.id;
    selectedItem = item;
    selected = item;
    onselect?.(item.id, item);
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, results.length - 1);
      scrollHighlightedIntoView();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      scrollHighlightedIntoView();
      return;
    }

    if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < results.length) {
      e.preventDefault();
      selectItem(results[highlightedIndex]);
      return;
    }
  }

  function scrollHighlightedIntoView() {
    if (!panelEl) return;
    const item = panelEl.querySelector<HTMLElement>('[data-highlighted]');
    item?.scrollIntoView({ block: 'nearest' });
  }

  function updatePanelPosition() {
    if (!open || !rootEl) return;
    const rect = rootEl.getBoundingClientRect();
    const gap = 4;
    const padding = 8;
    let width = Math.max(rect.width, 320);
    width = Math.min(width, window.innerWidth - padding * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - padding - width);
    }
    const spaceBelow = window.innerHeight - rect.bottom - gap - padding;
    const maxHeight = Math.min(280, Math.max(80, spaceBelow));
    panelStyle = `top:${rect.bottom + gap}px;left:${left}px;width:${width}px;max-height:${maxHeight}px`;
  }

  $effect(() => {
    if (!open) {
      panelStyle = '';
      return;
    }

    void tick().then(() => {
      updatePanelPosition();
      searchInputEl?.focus();
    });

    const onScroll = () => updatePanelPosition();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  });

  $effect(() => {
    if (!open || disabled) return;

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootEl?.contains(t) && !panelEl?.contains(t)) {
        close();
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  });

  $effect(() => {
    clearTimeout(debounceTimer);
    return () => clearTimeout(debounceTimer);
  });
</script>

<div class={cn("relative", containerClass)} data-search-select-root>
  {#if label}
    <label for={id} class="mb-1.5 block text-sm font-medium text-foreground">
      {label}
    </label>
  {/if}

  <div
    bind:this={rootEl}
    class={cn(
      'search-select-trigger-container',
      disabled && 'opacity-50 cursor-not-allowed',
      className
    )}
    data-search-select-root
  >
    <button
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-controls="search-select-listbox"
      aria-haspopup="listbox"
      aria-required={required}
      {id}
      {name}
      disabled={disabled}
      class="search-select-trigger"
      onclick={toggle}
    >
      <span class="search-select-trigger-text">
        {getLabel()}
      </span>
      <span class="search-select-caret" aria-hidden="true">▾</span>
    </button>
  </div>
</div>

{#if open}
  <div
    bind:this={panelEl}
    class="search-select-panel"
    style={panelStyle}
    role="listbox"
    tabindex="0"
    id="search-select-listbox"
    onkeydown={onKeydown}
  >
    <input
      bind:this={searchInputEl}
      type="text"
      class="search-select-search"
      placeholder="Type to search..."
      value={searchQuery}
      oninput={onSearchInput}
      onkeydown={onKeydown}
      autocomplete="off"
      role="searchbox"
    />

    {#if loading}
      <div class="search-select-status">
        <span class="search-select-spinner"></span>
        Searching…
      </div>
    {:else if searchAttempted && results.length === 0}
      <div class="search-select-empty">No products found</div>
    {:else if results.length > 0}
      <ul class="search-select-list">
        {#each results as item, i (item.id)}
          <li role="none">
            <button
              type="button"
              class={cn('search-select-option', item.id === value && 'search-select-option-selected')}
              role="option"
              aria-selected={item.id === value}
              data-highlighted={i === highlightedIndex ? '' : undefined}
              onclick={() => selectItem(item)}
            >
              <span class="search-select-option-label">{itemLabel(item)}</span>
              {#if item.id === value}
                <span class="search-select-checkmark">✓</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {:else if searchAttempted}
      <div class="search-select-empty">No products found</div>
    {/if}
  </div>
{/if}

<style>
  .search-select-trigger-container {
    position: relative;
    min-width: 0;
  }

  .search-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    height: 2rem;
    padding: 0 0.75rem;
    text-align: left;
    cursor: pointer;
    font: inherit;
    border: 1px solid var(--border, #e6eaed);
    border-radius: 5px;
    background: white;
    color: #1f2937;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .search-select-trigger:focus-visible {
    border-color: #4DA0E6;
    outline: none;
    box-shadow: 0 0 0 2px rgba(77, 160, 230, 0.2);
  }

  .search-select-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .search-select-trigger-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-select-caret {
    flex-shrink: 0;
    opacity: 0.65;
    font-size: 0.7rem;
  }

  .search-select-panel {
    position: fixed;
    z-index: 10050;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border: 1px solid #e6eaed;
    border-radius: 0.6rem;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }

  .search-select-search {
    width: 100%;
    box-sizing: border-box;
    padding: 0.65rem 0.75rem;
    font-size: 0.95rem;
    border: none;
    border-bottom: 1px solid #e6eaed;
    background: #f9fafb;
    color: #111827;
    outline: none;
  }

  .search-select-search::placeholder {
    color: #94a3b8;
  }

  .search-select-search:focus {
    background: #f1f5f9;
  }

  .search-select-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .search-select-option {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
    padding: 0.45rem 0.65rem;
    margin: 0;
    border: none;
    background: transparent;
    color: #1f2937;
    font-size: 0.82rem;
    line-height: 1.35;
    cursor: pointer;
  }

  .search-select-option:hover,
  .search-select-option:focus-visible,
  .search-select-option[data-highlighted] {
    background: #f1f5f9;
    outline: none;
  }

  .search-select-option-selected {
    background: #f0f7ff;
  }

  .search-select-option-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-select-checkmark {
    flex-shrink: 0;
    color: #4DA0E6;
    font-weight: 700;
    font-size: 0.85rem;
  }

  .search-select-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.75rem;
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .search-select-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid #e6eaed;
    border-top-color: #4DA0E6;
    border-radius: 50%;
    animation: search-select-spin 0.6s linear infinite;
  }

  @keyframes search-select-spin {
    to { transform: rotate(360deg); }
  }

  .search-select-empty {
    padding: 0.65rem 0.75rem;
    font-size: 0.85rem;
    color: #94a3b8;
    font-style: italic;
  }

  :global(html.dark) .search-select-trigger {
    background: #111827;
    border-color: rgba(255, 255, 255, 0.1);
    color: #e5e7eb;
  }

  :global(html.dark) .search-select-panel {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
  }

  :global(html.dark) .search-select-search {
    background: #111827;
    color: #e5e7eb;
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }

  :global(html.dark) .search-select-search:focus {
    background: #1f2937;
  }

  :global(html.dark) .search-select-option {
    color: #e5e7eb;
  }

  :global(html.dark) .search-select-option:hover,
  :global(html.dark) .search-select-option:focus-visible,
  :global(html.dark) .search-select-option[data-highlighted] {
    background: #374151;
  }

  :global(html.dark) .search-select-search::placeholder {
    color: #6b7280;
  }

  :global(html.dark) .search-select-option-selected {
    background: #1e3a5f;
  }

  :global(html.dark) .search-select-checkmark {
    color: #60a5fa;
  }
</style>
