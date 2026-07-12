<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";

  type Props = {
    loading?: boolean;
  };

  let { loading = false }: Props = $props();

  let chartContainer: HTMLDivElement | undefined = $state();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chartInstance: any = $state();


  const dayLabels = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

  const chartOptions = {
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
      categories: dayLabels,
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
        data: [45000, 52000, 38000, 61000, 48000, 72000, 58000],
      },
    ],
  };

  onMount(() => {
    if (!browser || !chartContainer) return;
    import("apexcharts").then((mod) => {
      if (!chartContainer) return;
      const ApexCharts = mod.default;
      chartInstance = new ApexCharts(chartContainer, chartOptions);
      chartInstance.render();
    });
    return () => {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = undefined;
      }
    };
  });
</script>

{#if loading}
  <div class="mb-4 h-6 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
  <div class="h-[280px] animate-pulse rounded bg-gray-100 dark:bg-gray-800"></div>
{:else}
  <div bind:this={chartContainer} class="h-[280px] w-full"></div>
{/if}
