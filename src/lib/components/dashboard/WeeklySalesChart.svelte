<script lang="ts">
  import { browser } from "$app/environment";

  export type SalesTrend = {
    sales_date: string;
    total_sales: number;
  };

  type Props = {
    data: SalesTrend[];
    loading?: boolean;
  };

  let { data, loading = false }: Props = $props();

  let chartContainer: HTMLDivElement | undefined = $state();
  let chartInstance: ApexCharts | undefined = $state();

  function formatDateLabel(dateStr: string): string {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  let categories = $derived(data.map((d) => formatDateLabel(d.sales_date)));
  let seriesData = $derived(data.map((d) => d.total_sales));

  function getOptions() {
    return {
      chart: {
        type: "bar" as const,
        height: 280,
        toolbar: { show: false },
        fontFamily: "Raleway, sans-serif",
      },
      colors: ["#4DA0E6"],
      plotOptions: {
        bar: {
          borderRadius: 6,
          columnWidth: "55%",
        },
      },
      grid: {
        borderColor: "#f0f0f0",
        strokeDashArray: 4,
        xaxis: { lines: { show: false } },
      },
      xaxis: {
        categories: categories,
        labels: {
          style: { colors: "#9ca3af", fontSize: "13px", fontWeight: 500 },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: "#9ca3af", fontSize: "12px" },
          formatter: (val: number) => `ETB ${val.toLocaleString()}`,
        },
      },
      dataLabels: { enabled: false },
      tooltip: {
        y: {
          formatter: (val: number) => `ETB ${val.toLocaleString()}`,
        },
      },
      series: [
        {
          name: "Sales",
          data: seriesData,
        },
      ],
    };
  }

  async function ensureChartRendered() {
    if (!browser || !chartContainer) return;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = undefined;
    }
    const mod = await import("apexcharts");
    if (!chartContainer) return;
    const ApexCharts = mod.default;
    chartInstance = new ApexCharts(chartContainer, getOptions());
    chartInstance.render();
  }

  $effect(() => {
    if (loading || !browser || !chartContainer) return;
    if (seriesData.length === 0) {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = undefined;
      }
      return;
    }
    if (chartInstance) {
      chartInstance.updateOptions(getOptions());
    } else {
      ensureChartRendered();
    }
  });

  $effect(() => {
    if (!chartContainer) return;
    return () => {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = undefined;
      }
    };
  });
</script>

<div class="relative">
  <div bind:this={chartContainer} class="h-[280px] w-full"></div>
  {#if loading}
    <div class="absolute inset-0 animate-pulse rounded bg-gray-100 dark:bg-gray-800"></div>
  {:else if categories.length === 0}
    <div class="absolute inset-0 flex items-center justify-center rounded bg-white text-sm text-gray-400 dark:bg-[#0f172a] dark:text-gray-500">
      No sales data for this period
    </div>
  {/if}
</div>