<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import Icon, { type IconType } from "$lib/components/ui/Icon/index.js";
  import { IconMap } from "$assets/index.js";

  const iconCategories = {
    "Navigation & UI": [
      "icon/menu",
      "icon/search",
      "icon/home",
      "icon/settings",
      "icon/user",
      "icon/users",
      "icon/bell",
      "icon/mail",
    ] as IconType[],
    Actions: [
      "icon/plus",
      "icon/minus",
      "icon/x",
      "icon/check",
      "icon/edit",
      "icon/trash",
      "icon/save",
      "icon/download",
      "icon/upload",
    ] as IconType[],
    Commerce: [
      "icon/shopping-cart",
      "icon/shopping-bag",
      "icon/package",
      "icon/credit-card",
      "icon/trending-up",
      "icon/building",
      "icon/bar-chart",
    ] as IconType[],
    "Media & Files": ["icon/image", "icon/file", "icon/folder"] as IconType[],
    "Arrows & Navigation": [
      "icon/arrow-left",
      "icon/arrow-right",
      "icon/arrow-up",
      "icon/arrow-down",
      "icon/chevron-left",
      "icon/chevron-right",
    ] as IconType[],
    "Status & Feedback": [
      "icon/info",
      "icon/alert-circle",
      "icon/check-circle",
      "icon/x-circle",
      "icon/eye",
      "icon/eye-off",
      "icon/shield",
      "icon/lock",
    ] as IconType[],
  };

  const colorCategories = {
    "Primary Colors": [
      { name: "primary", var: "--primary", foreground: "--primary-foreground" },
      { name: "secondary", var: "--secondary", foreground: "--secondary-foreground" },
      { name: "accent", var: "--accent", foreground: "--accent-foreground" },
    ],
    "Semantic Colors": [
      { name: "destructive", var: "--destructive", foreground: "--destructive-foreground" },
      { name: "success", var: "--success", foreground: "--success-foreground" },
      { name: "warning", var: "--warning", foreground: "--warning-foreground" },
      { name: "info", var: "--info", foreground: "--info-foreground" },
    ],
    "UI Colors": [
      { name: "background", var: "--background", foreground: "--foreground" },
      { name: "card", var: "--card", foreground: "--card-foreground" },
      { name: "muted", var: "--muted", foreground: "--muted-foreground" },
      { name: "border", var: "--border" },
      { name: "input", var: "--input" },
      { name: "ring", var: "--ring" },
    ],
  };
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <header class="border-b border-border bg-card">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Icon iconName="icon/home" size={24} class="text-info" />
          <h1 class="text-2xl font-bold text-foreground">BamanStock Design System</h1>
        </div>
        <Button variant="outline" href="/" size="sm">
          <Icon iconName="icon/arrow-left" size={16} />
          Back to Home
        </Button>
      </div>
      <p class="mt-2 text-sm text-muted-foreground">
        Guidelines for using colors and icons in the project
      </p>
    </div>
  </header>

  <main class="container mx-auto px-6 py-8 space-y-12">
    <!-- Color System -->
    <section>
      <div class="mb-6">
        <h2 class="text-3xl font-bold text-foreground mb-2">Color System</h2>
        <p class="text-muted-foreground">
          All colors are defined using OKLCH color space in
          <code class="px-1.5 py-0.5 rounded bg-muted text-sm">src/app.css</code>.
          Use CSS variables for consistent theming and dark mode support.
        </p>
      </div>

      {#each Object.entries(colorCategories) as [category, colors]}
        <div class="mb-8">
          <h3 class="text-xl font-semibold text-foreground mb-4">{category}</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each colors as color}
              <div class="border border-border rounded-lg overflow-hidden">
                <div class="h-24 flex items-center justify-center" style="background-color: var({color.var})">
                  {#if color.foreground}
                    <span class="text-sm font-medium px-3 py-1 rounded" style="color: var({color.foreground})">{color.name}</span>
                  {:else}
                    <span class="text-sm font-medium text-foreground/50">{color.name}</span>
                  {/if}
                </div>
                <div class="p-3 bg-card border-t border-border">
                  <code class="text-xs text-muted-foreground">var({color.var})</code>
                  {#if color.foreground}
                    <br />
                    <code class="text-xs text-muted-foreground">var({color.foreground})</code>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}

      <div class="mt-8 p-6 bg-card border border-border rounded-lg">
        <h4 class="text-lg font-semibold mb-3">Usage Example</h4>
        <div class="space-y-3">
          <div class="flex gap-3 flex-wrap">
            <Button variant="default">Primary Button</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
          </div>
          <div class="flex gap-3 flex-wrap">
            <div class="px-4 py-2 rounded bg-success text-success-foreground text-sm font-medium">Success Message</div>
            <div class="px-4 py-2 rounded bg-warning text-warning-foreground text-sm font-medium">Warning Message</div>
            <div class="px-4 py-2 rounded bg-info text-info-foreground text-sm font-medium">Info Message</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Icon System -->
    <section>
      <div class="mb-6">
        <h2 class="text-3xl font-bold text-foreground mb-2">Icon System</h2>
        <p class="text-muted-foreground mb-2">
          Icons are managed centrally in
          <code class="px-1.5 py-0.5 rounded bg-muted text-sm">src/assets/index.ts</code>.
        </p>
        <div class="text-sm text-muted-foreground space-y-1">
          <p>• <strong>Lucide Icons:</strong> Already available icons from Lucide Svelte</p>
          <p>• <strong>Custom Icons:</strong> Add SVG files to <code class="px-1 py-0.5 rounded bg-muted">src/assets/icon/</code></p>
          <p>• <strong>Social:</strong> Add to <code class="px-1 py-0.5 rounded bg-muted">src/assets/</code> social category</p>
        </div>
      </div>

      {#each Object.entries(iconCategories) as [category, icons]}
        <div class="mb-8">
          <h3 class="text-xl font-semibold text-foreground mb-4">{category}</h3>
          <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
            {#each icons as iconName}
              {#if IconMap[iconName] !== undefined}
                <div class="flex flex-col items-center gap-2 p-4 border border-border rounded-lg bg-card hover:bg-accent transition-colors">
                  <Icon {iconName} size={32} class="text-foreground" />
                  <code class="text-xs text-muted-foreground text-center break-all">{iconName}</code>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/each}

      <!-- Icon Sizes -->
      <div class="mt-8 p-6 bg-card border border-border rounded-lg">
        <h4 class="text-lg font-semibold mb-4">Icon Sizes</h4>
        <div class="flex items-center gap-6">
          {#each [16, 24, 32, 48, 64] as size}
            <div class="flex flex-col items-center gap-2">
              <Icon iconName="icon/user" {size} />
              <span class="text-xs text-muted-foreground">{size}px</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Usage Example -->
      <div class="mt-6 p-6 bg-card border border-border rounded-lg">
        <h4 class="text-lg font-semibold mb-3">Usage Example</h4>
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <Icon iconName="icon/search" size={20} class="text-muted-foreground" />
            <span class="text-sm text-foreground">Icon in text</span>
          </div>
          <Button>
            <Icon iconName="icon/plus" size={16} />
            Add Item
          </Button>
          <div class="flex gap-2">
            <Icon iconName="icon/check-circle" size={24} class="text-success" />
            <Icon iconName="icon/alert-circle" size={24} class="text-warning" />
            <Icon iconName="icon/x-circle" size={24} class="text-destructive" />
            <Icon iconName="icon/info" size={24} class="text-info" />
          </div>
          <pre class="p-4 bg-muted rounded text-xs overflow-x-auto"><code>{`<script>
  import Icon from "$lib/components/ui/Icon/index.js";
</` + `script>

<!-- Basic usage -->
<Icon iconName="icon/user" size={24} />

<!-- With custom styling -->
<Icon iconName="icon/check-circle" size={24} class="text-success" />

<!-- In buttons -->
<Button>
  <Icon iconName="icon/plus" size={16} />
  Add Item
</Button>`}</code></pre>
        </div>
      </div>
    </section>

    <!-- Guidelines -->
    <section class="border-t border-border pt-8">
      <h2 class="text-3xl font-bold text-foreground mb-4">Guidelines</h2>
      <div class="grid md:grid-cols-2 gap-6">
        <div class="p-6 bg-card border border-border rounded-lg">
          <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
            <Icon iconName="icon/settings" size={20} class="text-info" />
            Adding Colors
          </h3>
          <ol class="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Open <code class="px-1 py-0.5 rounded bg-muted">src/app.css</code></li>
            <li>Add color variable in <code class="px-1 py-0.5 rounded bg-muted">:root</code> and <code class="px-1 py-0.5 rounded bg-muted">.dark</code></li>
            <li>Add to <code class="px-1 py-0.5 rounded bg-muted">@theme inline</code> for Tailwind access</li>
            <li>Use OKLCH format: <code class="px-1 py-0.5 rounded bg-muted">oklch(L C H)</code></li>
          </ol>
        </div>

        <div class="p-6 bg-card border border-border rounded-lg">
          <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
            <Icon iconName="icon/plus" size={20} class="text-info" />
            Adding Icons
          </h3>
          <ol class="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li><strong>Lucide:</strong> Add to <code class="px-1 py-0.5 rounded bg-muted">icon</code> object in <code class="px-1 py-0.5 rounded bg-muted">src/assets/index.ts</code></li>
            <li><strong>Custom SVG:</strong> Place in <code class="px-1 py-0.5 rounded bg-muted">src/assets/icon/</code> and import</li>
            <li><strong>Social:</strong> Add to the <code class="px-1 py-0.5 rounded bg-muted">social</code> category in the registry</li>
            <li>Use format: <code class="px-1 py-0.5 rounded bg-muted">'category/name'</code></li>
          </ol>
        </div>
      </div>
    </section>
  </main>
</div>

<style>
  code {
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  }
</style>
