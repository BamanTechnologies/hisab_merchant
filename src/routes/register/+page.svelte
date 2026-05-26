<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { FormField } from "$lib/components/ui/form-field/index.js";
  import Icon from "$lib/components/ui/Icon/index.js";
  import { onMount, onDestroy } from "svelte";

  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let currentSlide = $state(0);
  let carouselContainer: HTMLDivElement;
  let isDragging = $state(false);
  let startX = $state(0);
  let scrollLeft = $state(0);
  let autoScrollInterval: ReturnType<typeof setInterval> | null = null;

  const slides = [
    {
      title: "Organize stocks across locations",
      description:
        "Manage products, merchants, and inventory across all your branches from one secure platform.",
    },
    {
      title: "Real-time inventory tracking",
      description:
        "Get instant updates on stock levels, track movements, and prevent stockouts with automated alerts.",
    },
    {
      title: "Streamlined business operations",
      description:
        "Simplify your workflow with powerful analytics, reporting tools, and seamless integration capabilities.",
    },
  ];

  function goToSlide(index: number) {
    currentSlide = index;
    if (carouselContainer) {
      carouselContainer.scrollTo({ left: index * carouselContainer.clientWidth, behavior: "smooth" });
    }
    startAutoScroll();
  }

  function handleScroll() {
    if (carouselContainer && !isDragging) {
      currentSlide = Math.round(carouselContainer.scrollLeft / carouselContainer.clientWidth);
    }
  }

  function startAutoScroll() {
    if (autoScrollInterval) clearInterval(autoScrollInterval);
    autoScrollInterval = setInterval(() => {
      if (!isDragging && carouselContainer) goToSlide((currentSlide + 1) % slides.length);
    }, 3000);
  }

  function stopAutoScroll() {
    if (autoScrollInterval) { clearInterval(autoScrollInterval); autoScrollInterval = null; }
  }

  onMount(() => {
    carouselContainer?.addEventListener("scroll", handleScroll);
    startAutoScroll();
  });

  onDestroy(() => stopAutoScroll());

  $effect(() => { isDragging ? stopAutoScroll() : startAutoScroll(); });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Raleway:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen bg-white flex items-center justify-center p-4">
  <div class="w-full max-w-6xl flex flex-col lg:flex-row rounded-2xl overflow-hidden shadow-xl">

    <!-- Left: carousel panel -->
    <div
      class="hidden lg:flex lg:w-1/2 relative bg-cover bg-center overflow-hidden"
      style="background-image: url('/role.jpg'); min-height: 600px;"
    >
      <div class="absolute inset-0 z-0" style="background: linear-gradient(157.39deg, rgba(0, 136, 251, 0.75) -10.27%, rgba(14, 65, 108, 0.97) 98.36%);"></div>
      <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent z-0"></div>

      <div class="relative z-10 flex flex-col justify-between h-full p-12 text-white">
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          bind:this={carouselContainer}
          class="flex-1 flex overflow-x-auto snap-x snap-mandatory"
          style="scroll-snap-type: x mandatory; cursor: grab; scrollbar-width: none; -ms-overflow-style: none;"
          role="region"
          aria-label="Onboarding carousel"
          onscroll={handleScroll}
          onmousedown={(e) => { isDragging = true; startX = e.pageX - carouselContainer.offsetLeft; scrollLeft = carouselContainer.scrollLeft; carouselContainer.style.cursor = "grabbing"; }}
          onmousemove={(e) => { if (!isDragging) return; e.preventDefault(); carouselContainer.scrollLeft = scrollLeft - (e.pageX - carouselContainer.offsetLeft - startX) * 2; }}
          onmouseup={() => { isDragging = false; if (carouselContainer) carouselContainer.style.cursor = "grab"; }}
          onmouseleave={() => { isDragging = false; if (carouselContainer) carouselContainer.style.cursor = "grab"; }}
          ontouchstart={(e) => { isDragging = true; startX = e.touches[0].pageX - carouselContainer.offsetLeft; scrollLeft = carouselContainer.scrollLeft; }}
          ontouchmove={(e) => { if (!isDragging) return; carouselContainer.scrollLeft = scrollLeft - (e.touches[0].pageX - carouselContainer.offsetLeft - startX) * 2; }}
          ontouchend={() => { isDragging = false; }}
        >
          {#each slides as slide}
            <div class="min-w-full h-full flex flex-col justify-center snap-start">
              <div class="space-y-12 max-w-md">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                    <Icon iconName="icon/trending-up" size={32} class="text-info" />
                  </div>
                  <span class="text-2xl font-bold tracking-wide">BAMANSTOCK</span>
                </div>
                <div class="space-y-4">
                  <h1 class="text-[29px] font-bold leading-[38px]">{slide.title}</h1>
                  <p class="text-xs leading-4 text-white/90">{slide.description}</p>
                </div>
              </div>
            </div>
          {/each}
        </div>

        <div class="flex items-center gap-2 pb-8">
          {#each slides as _, index}
            <button
              type="button"
              class="transition-all duration-300 {currentSlide === index ? 'w-8 h-1.5 bg-white rounded-full' : 'w-1.5 h-1.5 bg-white/50 rounded-full hover:bg-white/75'}"
              onclick={() => goToSlide(index)}
              aria-label="Go to slide {index + 1}"
            ></button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Right: register form -->
    <div class="w-full lg:w-1/2 bg-white flex items-center justify-center p-8 lg:p-16">
      <div class="w-full max-w-md space-y-8">

        <div class="space-y-2 text-center lg:text-left">
          <h2 class="text-3xl font-bold text-foreground">Create an Account</h2>
          <p class="text-muted-foreground text-sm">Please enter your details to continue.</p>
        </div>

        <form class="space-y-6" onsubmit={(e) => e.preventDefault()}>
          <FormField
            id="name"
            name="name"
            label="Full Name"
            type="text"
            placeholder="Enter your full name"
            bind:value={name}
            required
          />

          <FormField
            id="email"
            name="email"
            label="Email"
            type="email"
            placeholder="Enter your email address"
            bind:value={email}
            required
          />

          <FormField
            id="phone"
            name="phone"
            label="Phone Number"
            type="tel"
            placeholder="+2519********"
            bind:value={phone}
            required
          />

          <FormField
            id="password"
            name="password"
            label="Password"
            type="password"
            placeholder="Enter your password"
            bind:value={password}
            showPasswordToggle
            required
          />

          <FormField
            id="confirm-password"
            name="confirm-password"
            label="Confirm Password"
            type="password"
            placeholder="Enter your password again"
            bind:value={confirmPassword}
            showPasswordToggle
            required
          />

          <Button
            type="submit"
            size="lg"
            class="w-full bg-info text-info-foreground hover:bg-info/90 rounded-full py-6 text-lg font-medium"
          >
            Create Account
          </Button>
        </form>

        <div class="text-center text-sm text-muted-foreground">
          Already have an account?
          <a href="/sign-in" class="text-info font-bold ml-1 hover:opacity-80">Log In</a>
        </div>

      </div>
    </div>

  </div>
</div>
