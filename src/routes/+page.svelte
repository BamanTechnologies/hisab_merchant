<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import Icon from "$lib/components/ui/Icon/index.js";
  import { onMount } from "svelte";
  import heroBackground from "$lib/assets/landing/hero-background.png";
  import browserScreenshot from "$lib/assets/landing/browser-screenshot.png";

  let isAuthenticated = $state(false);
  let faqOpen = $state<Record<number, boolean>>({ 0: true });
  let mobileMenuOpen = $state(false);

  onMount(() => {
    if (!browser) return;
    isAuthenticated = !!localStorage.getItem("authToken");
  });

  function handleLogout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("merchantBranchId");
    document.cookie = "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "merchantBranchId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    isAuthenticated = false;
    goto("/sign-in");
  }

  function toggleFaq(index: number) {
    faqOpen[index] = !faqOpen[index];
  }

  async function smoothScrollToHash(e: Event, hash?: string) {
    e?.preventDefault?.();
    if (!browser) return;

    const targetHash = hash || (e.currentTarget as HTMLAnchorElement)?.getAttribute?.("href");
    if (!targetHash || !targetHash.startsWith("#")) return;

    const id = targetHash.slice(1);
    const el = document.getElementById(id);
    if (!el) return;

    const navOffset = 80; 

    await new Promise((res) => setTimeout(res, 80));

    const top = el.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top, behavior: "smooth" });
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Raleway:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen bg-background">

  <!-- Navbar -->
  <nav class="sticky top-0 z-50 border-b border-border/20 bg-white/90 backdrop-blur-sm">
    <div class="container mx-auto px-6">
      <div class="flex h-16 items-center justify-between">
        <a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src="./logonew.png" alt="Bamanstock" class="h-14 md:h-20 w-auto object-cover" />
        </a>

        <div class="hidden md:flex items-center gap-8">
          <a href="#features" onclick={(e) => smoothScrollToHash(e, '#features')} class="text-foreground hover:text-info transition-colors text-sm">Features</a>
          <a href="#how-it-works" onclick={(e) => smoothScrollToHash(e, '#how-it-works')} class="text-foreground hover:text-info transition-colors text-sm">How It Works</a>
          <a href="#about" onclick={(e) => smoothScrollToHash(e, '#about')} class="text-foreground hover:text-info transition-colors text-sm">About</a>
          <a href="#contact" onclick={(e) => smoothScrollToHash(e, '#contact')} class="text-foreground hover:text-info transition-colors text-sm">Contact</a>
        </div>

        <div class="hidden md:flex items-center gap-3">
          {#if isAuthenticated}
            <Button variant="outline" href="/stocks" size="sm">Open Dashboard</Button>
            <Button onclick={handleLogout} size="sm" class="bg-info text-info-foreground hover:bg-info/90">Logout</Button>
          {:else}
            <a href="/sign-in" class="text-info hover:opacity-80 transition-opacity text-sm font-medium">Sign in</a>
            <Button href="/register" size="sm" class="bg-info text-info-foreground hover:bg-info/90">Register</Button>
          {/if}
        </div>

        <!-- Hamburger button (mobile only) -->
        <button
          class="md:hidden flex items-center justify-center w-10 h-10 rounded-lg hover:bg-muted transition-colors"
          onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {#if mobileMenuOpen}
            <Icon iconName="icon/x" size={22} class="text-info" />
          {:else}
            <Icon iconName="icon/menu" size={22} class="text-info" />
          {/if}
        </button>
      </div>
    </div>

    <!-- Mobile menu dropdown -->
    {#if mobileMenuOpen}
      <div class="md:hidden border-t border-border/20 bg-white/95 backdrop-blur-sm px-6 py-4 space-y-1">
        <a href="#features" onclick={(e) => { smoothScrollToHash(e, '#features'); mobileMenuOpen = false; }} class="block py-3 text-foreground hover:text-info transition-colors text-sm font-medium border-b border-border/10">Features</a>
        <a href="#how-it-works" onclick={(e) => { smoothScrollToHash(e, '#how-it-works'); mobileMenuOpen = false; }} class="block py-3 text-foreground hover:text-info transition-colors text-sm font-medium border-b border-border/10">How It Works</a>
        <a href="#about" onclick={(e) => { smoothScrollToHash(e, '#about'); mobileMenuOpen = false; }} class="block py-3 text-foreground hover:text-info transition-colors text-sm font-medium border-b border-border/10">About</a>
        <a href="#contact" onclick={(e) => { smoothScrollToHash(e, '#contact'); mobileMenuOpen = false; }} class="block py-3 text-foreground hover:text-info transition-colors text-sm font-medium border-b border-border/10">Contact</a>
        <div class="pt-3 flex flex-col gap-2">
          {#if isAuthenticated}
            <Button variant="outline" href="/stocks" class="w-full">Open Dashboard</Button>
            <Button onclick={handleLogout} class="w-full bg-info text-info-foreground hover:bg-info/90">Logout</Button>
          {:else}
            <a href="/sign-in" class="block py-2 text-center text-info hover:opacity-80 transition-opacity text-sm font-medium">Sign in</a>
            <Button href="/register" class="w-full bg-info text-info-foreground hover:bg-info/90">Register</Button>
          {/if}
        </div>
      </div>
    {/if}
  </nav>

  <!-- Hero Section -->
  <section
    class="relative overflow-hidden bg-cover bg-center flex items-center"
    style="background-image: url({heroBackground}); height: 984px; padding-top: 64px;"
  >
    <div class="container mx-auto px-6 relative z-10 -mt-48">
      <div class="max-w-4xl mx-auto text-center space-y-8">
        <h1 class="text-5xl text-blue-900 lg:text-6xl font-bold leading-tight" style="font-family: 'Sora', sans-serif;">
          Manage Your Stock. Know Your Business.
        </h1>
        <p class="text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto" style="font-family: 'Raleway', sans-serif;">
          A privacy-first stock management platform for investors and merchants —
          control branches, track inventory, and view performance in one unified dashboard.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          <Button
            href="/sign-in"
            size="lg"
            class="bg-info text-info-foreground hover:bg-info/90 min-w-[200px]"
          >
            Get Started Now
            <Icon iconName="icon/arrow-right" size={20} />
          </Button>
          <Button variant="outline" size="lg" href="#features" onclick={(e) => smoothScrollToHash(e, '#features')} class="min-w-[200px]">
            Learn More
          </Button>
        </div>
      </div>
    </div>
  </section>

  <!-- Dashboard Screenshot -->
  <section class="relative -mt-24 lg:-mt-64 mb-16 lg:mb-24 z-20">
    <div class="container mx-auto px-6">
      <div class="max-w-7xl mx-auto">
        <div class="rounded-2xl shadow-2xl overflow-hidden border border-border bg-card">
          <img src={browserScreenshot} alt="BamanStock Dashboard" class="w-full h-auto" />
        </div>
      </div>
    </div>
  </section>

  <!-- Trusted Section -->
  <section class="py-16 text-center">
    <h2 class="text-3xl lg:text-4xl font-bold text-foreground mb-10" style="font-family: 'Sora', sans-serif;">
      Trusted by Leading Businesses
    </h2>
    <div class="flex flex-wrap justify-center items-center gap-8 lg:gap-12">
      <span class="text-2xl font-semibold text-foreground flex items-center gap-2"><span class="text-indigo-500">◎</span> Ephemeral</span>
      <span class="text-2xl font-semibold text-foreground flex items-center gap-2"><span class="text-indigo-500">◣</span> Wildcrafted</span>
      <span class="text-2xl font-semibold text-foreground flex items-center gap-2"><span class="text-indigo-500">▦</span> Codecraft_</span>
      <span class="text-2xl font-semibold text-foreground flex items-center gap-2"><span class="text-indigo-500">✶</span> Convergence</span>
      <span class="text-2xl font-semibold text-foreground flex items-center gap-2"><span class="text-indigo-500">✦</span> ImgCompress</span>
    </div>
  </section>

  <!-- Features Section -->
  <section id="features" class="py-16 lg:py-24 bg-white">
    <div class="container mx-auto px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-12">
          <span class="inline-block px-4 py-1.5 rounded-full bg-info text-info-foreground hover:bg-info/90 text-sm font-medium mb-4">
            Features
          </span>
          <h2 class="text-4xl lg:text-5xl font-bold text-foreground mb-6">
            The Clear Way to Manage Your Stock.
          </h2>
          <p class="text-xl text-muted-foreground max-w-3xl mx-auto">
            Simplify operations and gain total visibility with features designed
            to give investors confidence and merchants efficiency.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <div class="p-8 bg-card border border-border rounded-lg">
            <div class="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center mb-6">
              <Icon iconName="icon/package" size={24} class="text-info" />
            </div>
            <h3 class="text-xl font-semibold text-foreground mb-3">Smart Inventory Control</h3>
            <p class="text-muted-foreground">
              From stock levels to item movement, you'll always know what's available, and where.
            </p>
          </div>

          <div class="p-8 bg-card border border-border rounded-lg">
            <div class="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center mb-6">
              <Icon iconName="icon/building" size={24} class="text-info" />
            </div>
            <h3 class="text-xl font-semibold text-foreground mb-3">Branch & Merchant Management</h3>
            <p class="text-muted-foreground">
              Assign merchants and products to specific branches with complete clarity and flexibility.
            </p>
          </div>

          <div class="p-8 bg-card border border-border rounded-lg">
            <div class="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center mb-6">
              <Icon iconName="icon/bar-chart" size={24} class="text-info" />
            </div>
            <h3 class="text-xl font-semibold text-foreground mb-3">Powerful Reporting & Insights</h3>
            <p class="text-muted-foreground">
              Generate clean, accurate reports that help investors understand performance at a glance.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section id="how-it-works" class="py-16 lg:py-24" style="background-color: #F7FBFF; min-height: 728px;">
    <div class="container mx-auto px-6">
      <div class="max-w-7xl mx-auto">
        <div class="grid lg:grid-cols-2 gap-12 items-center">
          <div class="max-w-lg">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-5 h-5 bg-warning rounded flex items-center justify-center">
                <Icon iconName="icon/search" size={12} class="text-warning-foreground" />
              </div>
              <span class="text-sm text-muted-foreground">Trusted by Growing Businesses</span>
            </div>
            <h2 class="font-bold text-foreground mb-6" style="font-size: 45px; line-height: 1.2; font-family: 'Sora', sans-serif;">
              Three Steps to Your Most Organized Workflow
            </h2>
            <Button href="#features" onclick={(e) => smoothScrollToHash(e, '#features')} class="bg-info text-info-foreground hover:bg-info/90">
              Learn more
              <Icon iconName="icon/arrow-right" size={16} />
            </Button>
          </div>

          <div>
            <div style="width: 305px; height: 204px;">
              <div class="font-bold text-muted-foreground/20 select-none pointer-events-none" style="font-family: 'Sora', sans-serif; font-size: 100px; line-height: 1;">01</div>
              <div style="padding-left: 45px; margin-top: -35px;">
                <h3 class="text-xl font-semibold text-foreground mb-2">Create Your Account</h3>
                <p class="text-foreground mb-3">Sign up using your phone number and get started.</p>
                <div class="w-12 h-0.5 bg-warning"></div>
              </div>
            </div>

            <div style="width: 305px; height: 204px; margin-left: auto;">
              <div class="font-bold text-muted-foreground/20 select-none pointer-events-none" style="font-family: 'Sora', sans-serif; font-size: 100px; line-height: 1;">02</div>
              <div style="padding-left: 45px; margin-top: -35px;">
                <h3 class="text-xl font-semibold text-foreground mb-2">Set Up Your Workspace</h3>
                <p class="text-foreground mb-3">Add your team, locations, merchants, or deals.</p>
                <div class="w-12 h-0.5 bg-warning"></div>
              </div>
            </div>

            <div style="width: 305px; height: 204px;">
              <div class="font-bold text-muted-foreground/20 select-none pointer-events-none" style="font-family: 'Sora', sans-serif; font-size: 100px; line-height: 1;">03</div>
              <div style="padding-left: 45px; margin-top: -35px;">
                <h3 class="text-xl font-semibold text-foreground mb-2">Track, Manage & Grow</h3>
                <p class="text-foreground mb-3">View real-time data and monitor progress across branches.</p>
                <div class="w-12 h-0.5 bg-warning"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Testimonials -->
  <section id="about" class="py-16 lg:py-24 bg-white">
    <div class="container mx-auto px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-12">
          <h2 class="font-bold text-foreground mb-4" style="font-size: 45px; font-family: 'Sora', sans-serif;">
            What our customers have to say about our product.
          </h2>
          <p class="text-xl text-muted-foreground">Proven. Reliable. Loved by Users. ❤️</p>
        </div>

        <div class="grid md:grid-cols-2 gap-8">
          <div class="relative p-8 bg-card border border-border rounded-lg">
            <Icon iconName="icon/quote" size={48} class="text-muted/30 mb-4" />
            <p class="text-foreground mb-6 text-lg">
              Before switching, we were juggling spreadsheets, WhatsApp chats, and scattered files.
              Now everything — locations, merchants, and deal statuses — is in one place.
            </p>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-info flex items-center justify-center text-info-foreground font-semibold">SM</div>
              <span class="text-foreground font-medium">Sophia M.</span>
            </div>
          </div>

          <div class="relative p-8 bg-card border border-border rounded-lg">
            <Icon iconName="icon/quote" size={48} class="text-muted/30 mb-4" />
            <p class="text-foreground mb-6 text-lg">
              As an investor managing multiple locations, keeping track of merchants and stock
              movements was always chaotic. This dashboard gives me real-time insights on everything.
            </p>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-info flex items-center justify-center text-info-foreground font-semibold">NA</div>
              <span class="text-foreground font-medium">Nathan A.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section class="py-16 lg:py-24 mx-4 lg:mx-[93px] rounded-4xl" style="background-color: #0E416C;">
    <div class="container mx-auto px-6">
      <div class="max-w-4xl mx-auto text-center text-white">
        <div class="flex items-center justify-center gap-2 mb-4">
          <div class="flex gap-1">
            {#each Array(5) as _}
              <Icon iconName="icon/star" size={20} class="text-warning fill-warning" />
            {/each}
          </div>
          <span class="text-white font-semibold">4.9/5</span>
        </div>

        <div class="flex items-center justify-center gap-1 mb-2">
          <div class="w-8 h-8 rounded-full bg-green-500 border border-white/60"></div>
          <div class="w-8 h-8 rounded-full bg-yellow-500 border border-white/60 -ml-1"></div>
          <div class="w-8 h-8 rounded-full bg-purple-500 border border-white/60 -ml-1"></div>
          <div class="w-8 h-8 rounded-full bg-orange-500 border border-white/60 -ml-1"></div>
          <div class="w-8 h-8 rounded-full bg-white text-foreground flex items-center justify-center text-xs font-bold border border-white/60 -ml-1">100K+</div>
        </div>
        <p class="text-white/90 mb-8">Over 100K+ Entrepreneurs, and business choose us</p>

        <h2 class="text-4xl lg:text-5xl font-bold text-white mb-6">
          Start Managing Your Stock With Confidence Today.
        </h2>
        <p class="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
          Simplify stock tracking, empower your merchants, and gain real-time
          insights across all locations, all in one clean interface.
        </p>
        <Button href="/sign-in" size="lg" class="bg-info text-info-foreground hover:bg-info/90 min-w-[200px]">
          Get Started Now
          <Icon iconName="icon/arrow-right" size={20} />
        </Button>
      </div>
    </div>
  </section>

  <!-- FAQ Section -->
  <section class="py-16 lg:py-24 bg-white">
    <div class="container mx-auto px-6">
      <div class="max-w-4xl mx-auto">
        <div class="text-center mb-12">
          <h2 class="font-bold text-foreground mb-4" style="font-size: 45px; font-family: 'Sora', sans-serif;">
            Frequently Asked Questions
          </h2>
          <p class="text-xl text-muted-foreground">Everything you need to know about Baman Stock</p>
        </div>

        <div class="space-y-4">
          {#each [
            { q: "How does BamanStock work?", a: "BamanStock is designed to help investors manage multiple merchants and locations from one centralized dashboard. Investors create locations (branches), assign merchants to those locations, and link specific stock items to each location." },
            { q: "Can merchants manage stock on their own?", a: "Yes, merchants can manage assigned location stock and view reports for their branches." },
            { q: "What is the purpose of locations in the system?", a: "Locations represent branches and let you track inventory and merchant activity separately for each site." },
            { q: "How secure is my data on BamanStock?", a: "Data is protected with secure authentication and role-based access, so each user only sees and manages what they are allowed to access." },
            { q: "Can I make changes later to different locations?", a: "Yes. You can update assignments, stock links, and operational details anytime as your business grows and processes evolve." },
          ] as item, index}
            <div class="border border-border rounded-lg overflow-hidden">
              <button
                type="button"
                class="w-full flex items-center justify-between p-6 text-left hover:bg-muted/50 transition-colors"
                onclick={() => toggleFaq(index)}
              >
                <h3 class="text-lg font-semibold text-foreground">{item.q}</h3>
                <Icon
                  iconName={faqOpen[index] ? "icon/minus" : "icon/plus"}
                  size={20}
                  class="text-info transition-transform flex-shrink-0 ml-4"
                />
              </button>
              {#if faqOpen[index]}
                <div class="px-6 pb-6 text-muted-foreground">{item.a}</div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <!-- Contact Section -->
  <section id="contact" class="py-16 lg:py-24 bg-white">
    <div class="container mx-auto px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-12">
          <h2 class="font-bold text-foreground mb-4" style="font-size: 45px; font-family: 'Sora', sans-serif;">
            How we can help you?
          </h2>
        </div>

        <form class="space-y-6">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div class="space-y-6">
              <div>
                <label for="fullName" class="block text-sm font-medium text-foreground mb-2">Your full name*</label>
                <div class="relative">
                  <input type="text" id="fullName" placeholder="What's your name?"
                    class="w-full px-4 py-3 pr-12 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-info focus:border-transparent bg-white text-foreground" />
                  <Icon iconName="icon/smile" size={20} class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div>
                <label for="phone" class="block text-sm font-medium text-foreground mb-2">Your phone number</label>
                <div class="relative">
                  <input type="tel" id="phone" placeholder="Enter your phone number"
                    class="w-full px-4 py-3 pr-12 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-info focus:border-transparent bg-white text-foreground" />
                  <Icon iconName="icon/phone" size={20} class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            <div class="space-y-6">
              <div>
                <label for="email" class="block text-sm font-medium text-foreground mb-2">Your email address*</label>
                <div class="relative">
                  <input type="email" id="email" placeholder="Enter your email address"
                    class="w-full px-4 py-3 pr-12 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-info focus:border-transparent bg-white text-foreground" />
                  <Icon iconName="icon/mail" size={20} class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div>
                <label for="subject" class="block text-sm font-medium text-foreground mb-2">Your subject</label>
                <div class="relative">
                  <input type="text" id="subject" placeholder="How can we help you?"
                    class="w-full px-4 py-3 pr-12 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-info focus:border-transparent bg-white text-foreground" />
                  <Icon iconName="icon/file-text" size={20} class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label for="message" class="block text-sm font-medium text-foreground mb-2">Your message</label>
            <div class="relative">
              <textarea id="message" rows={6} placeholder="Describe about your project"
                class="w-full min-h-[150px] px-4 py-3 pr-12 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-info focus:border-transparent resize-none bg-white text-foreground"></textarea>
              <Icon iconName="icon/message-circle" size={20} class="absolute right-4 top-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center border-t border-border pt-6">
            <p class="text-sm text-muted-foreground">
              We are committed to protecting your privacy. We will never collect information about you without your explicit consent.
            </p>
            <div class="flex justify-end">
              <Button type="submit" class="bg-info text-info-foreground hover:bg-info/90 px-8 py-3">
                Send Message
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer style="background: #F0F7FC; position: relative;">
    <div style="background: linear-gradient(to bottom, rgba(77, 160, 230, 0.1) 0%, rgba(77, 160, 230, 0.1) 38%, rgba(255, 255, 255, 0.1) 100%); position: absolute; inset: 0; pointer-events: none;"></div>
    <div style="position: relative; z-index: 1;">
      <div class="container mx-auto px-6 py-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div class="space-y-4">
            <div class="flex items-center gap-2">
              <div class="w-10 h-10 rounded-xl bg-info flex items-center justify-center">
                <Icon iconName="icon/trending-up" size={20} class="text-info-foreground" />
              </div>
              <span class="text-xl font-bold text-info">BAMANSTOCK</span>
            </div>
            <p class="text-foreground text-sm">Summit Salitemhret Road, Addis Ababa, Ethiopia</p>
            <p class="text-foreground text-sm">+251912051241</p>
          </div>

          <div class="flex flex-col items-start lg:items-end space-y-6">
            <div class="flex flex-wrap gap-6 lg:gap-8">
              <a href="/terms" class="text-foreground text-sm hover:text-info transition-colors">Terms of Use</a>
              <a href="/privacy" class="text-foreground text-sm hover:text-info transition-colors">Privacy Policy</a>
              <a href="/disclaimer" class="text-foreground text-sm hover:text-info transition-colors">Disclaimer</a>
            </div>
            <div class="flex gap-4">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer"
                class="w-10 h-10 rounded-full bg-black flex items-center justify-center hover:opacity-80 transition-opacity" aria-label="Facebook">
                <Icon iconName="social/facebook" size={20} class="text-white" />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"
                class="w-10 h-10 rounded-full bg-black flex items-center justify-center hover:opacity-80 transition-opacity" aria-label="Instagram">
                <Icon iconName="social/instagram" size={20} class="text-white" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer"
                class="w-10 h-10 rounded-full bg-black flex items-center justify-center hover:opacity-80 transition-opacity" aria-label="YouTube">
                <Icon iconName="social/youtube" size={20} class="text-white" />
              </a>
            </div>
          </div>
        </div>

        <div class="border-t border-border pt-6">
          <p class="text-foreground text-sm text-center">Copyright © 2025. Bamanstock All rights reserved</p>
        </div>
      </div>
    </div>
  </footer>

</div>
