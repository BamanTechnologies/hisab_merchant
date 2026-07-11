<script lang="ts">
  let { rows = 5, cols = 5 }: { rows?: number; cols?: number } = $props();
</script>

{#each Array(rows) as _, i}
  <tr>
    <td colspan={cols}>
      <div class="loading-bar"
						aria-busy="true"
						aria-live="polite"
						role="status"></div>
    </td>
  </tr>
{/each}
<style>
  .loading-bar {
		height: 3px;
		background: linear-gradient(90deg, transparent 0%, #4DA0E6 30%, #4DA0E6 70%, transparent 100%);
		background-size: 200% 100%;
		animation: loading-bar 1.2s ease-in-out infinite;
	}

	@keyframes loading-bar {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}
</style>