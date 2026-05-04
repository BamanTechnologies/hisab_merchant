<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { Camera, Music2, Play } from "@lucide/svelte";
  import { onMount } from "svelte";
  import heroBackground from "$lib/assets/landing/hero-background.png";
  import browserScreenshot from "$lib/assets/landing/browser-screenshot.png";

  let isAuthenticated = $state(false);
  let faqOpen = $state<Record<number, boolean>>({ 0: true });

  onMount(() => {
    if (!browser) return;
    isAuthenticated = !!localStorage.getItem("authToken");
  });

  function handleLogout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("merchantBranchId");
    document.cookie =
      "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie =
      "merchantBranchId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    isAuthenticated = false;
    goto("/sign-in");
  }

  function toggleFaq(index: number) {
    faqOpen[index] = !faqOpen[index];
  }
</script>

<div class="landing">
  <section class="landing-nav-section">
    <nav class="landing-nav">
      <a href="/" class="brand-link" aria-label="Go to landing page">
        <img src="/bamanstock-logo.png" alt="Bamanstock" class="nav-logo" />
      </a>
      <div class="landing-nav-links" aria-label="Landing sections">
        <a href="#features">Features</a>
        <a href="#how-it-works">How It Works</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
      </div>
      <div class="actions">
        <a class="primary" href="/stocks" data-sveltekit-reload
          >Open Dashboard</a
        >
        {#if isAuthenticated}
          <button class="ghost" type="button" onclick={handleLogout}
            >Logout</button
          >
        {:else}
          <a class="ghost" href="/sign-in">Sign In</a>
        {/if}
      </div>
    </nav>
  </section>

  <section class="landing-main-section">
    <section class="hero" style={`background-image: url(${heroBackground});`}>
      <div class="hero-inner">
        <h1>Manage Your Stock. Know Your Business.</h1>
        <p>
          A privacy-first stock management platform for investors and merchants:
          control branches, track inventory, and view performance in one unified
          dashboard.
        </p>
        <div class="cta-row">
          <a class="primary" href="/stocks" data-sveltekit-reload
            >Get Started Now -></a
          >
          <a class="ghost" href="#features">Learn More</a>
        </div>
      </div>
    </section>

    <section class="shot-wrap">
      <div class="shot-frame">
        <img
          src={browserScreenshot}
          alt="BamanStock Dashboard"
          class="browser-shot"
        />
      </div>
    </section>

    <section class="trusted-section">
      <h2 class="trusted-title">Trusted by Leading Businesses</h2>
      <div class="trusted-row">
        <span class="trusted-item"><span class="mark">◎</span> Ephemeral</span>
        <span class="trusted-item"><span class="mark">◣</span> Wildcrafted</span
        >
        <span class="trusted-item"><span class="mark">▦</span> Codecraft_</span>
        <span class="trusted-item"><span class="mark">✶</span> Convergence</span
        >
        <span class="trusted-item"><span class="mark">✦</span> ImgCompress</span
        >
      </div>
    </section>

    <section id="features" class="panel panel-light features-section">
      <div class="section-head center">
        <span class="chip">Features</span>
        <h2>The Clear Way to Manage Your Stock.</h2>
        <p>
          Simplify operations and gain total visibility with features designed
          to give investors confidence and merchants efficiency.
        </p>
      </div>
      <div class="feature-grid">
        <article class="card">
          <div class="icon-box">[]</div>
          <h3>Smart Inventory Control</h3>
          <p>
            From stock levels to item movement, you'll always know what's
            available, and where.
          </p>
        </article>
        <article class="card">
          <div class="icon-box">[#]</div>
          <h3>Branch & Merchant Management</h3>
          <p>
            Assign merchants and products to specific branches with complete
            clarity and flexibility.
          </p>
        </article>
        <article class="card">
          <div class="icon-box">[=]</div>
          <h3>Powerful Reporting & Insights</h3>
          <p>
            Generate clean, accurate reports that help investors understand
            performance at a glance.
          </p>
        </article>
      </div>
    </section>

    <section id="how-it-works" class="panel panel-soft">
      <div class="how-grid">
        <div class="how-left">
          <p class="small-note">
            <span class="small-dot">◉</span> Trusted by Growing Businesses
          </p>
          <h2>Three Steps to Your Most Organized Workflow</h2>
          <a href="#features" class="primary">Learn more -></a>
        </div>
        <div class="steps steps-stagger">
          <div class="step">
            <div class="n">01</div>
            <h3>Create Your Account</h3>
            <p>Sign up using your email and choose your role.</p>
            <div class="step-line"></div>
          </div>
          <div class="step">
            <div class="n">02</div>
            <h3>Set Up Your Workspace</h3>
            <p>Add your team, locations, merchants, or deals.</p>
            <div class="step-line"></div>
          </div>
          <div class="step">
            <div class="n">03</div>
            <h3>Track, Manage & Grow</h3>
            <p>View real-time data and monitor progress across branches.</p>
            <div class="step-line"></div>
          </div>
        </div>
      </div>
    </section>

    <section id="about" class="panel panel-light testimonials-section">
      <div class="section-head center testimonials-head">
        <h2>What our customers have to say about our product.</h2>
        <p>Proven. Reliable. Loved by Users. ❤️</p>
      </div>
      <div class="testimonials-grid">
        <article class="testimonial">
          <div class="quote">“</div>
          <p>
            Before switching, we were juggling spreadsheets, WhatsApp chats, and
            scattered files. Now everything locations, merchants, and deal
            statuses is in one place.
          </p>
          <div class="person">
            <span class="avatar">SM</span>
            <strong>Sophia M.</strong>
          </div>
        </article>
        <article class="testimonial">
          <div class="quote">“</div>
          <p>
            As an investor managing multiple locations, keeping track of
            merchants and stock movements was always chaotic. This dashboard
            gives me real-time insights on everything.
          </p>
          <div class="person">
            <span class="avatar">NA</span>
            <strong>Nathan A.</strong>
          </div>
        </article>
      </div>
    </section>

    <section class="panel cta-panel">
      <div class="section-head center cta-head">
        <div class="cta-meta">
          <p class="rating">★★★★★ <span>4.9/5</span></p>
          <div class="cta-avatars">
            <span class="dot dot-teal"></span>
            <span class="dot dot-purple"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-orange"></span>
            <span class="dot dot-badge">100K+</span>
          </div>
          <p class="cta-caption">
            Over 100K+ Entrepreneurs, and business choose us
          </p>
        </div>
        <h2>Start Managing Your Stock With Confidence Today.</h2>
        <p>
          Simplify stock tracking, empower your merchants, and gain real-time
          insights across all locations, all in one clean interface.
        </p>
        <a href="/stocks" class="primary" data-sveltekit-reload
          >Get Started Now -></a
        >
      </div>
    </section>

    <section class="panel panel-light faq-section">
      <div class="section-head center faq-head">
        <h2>Frequently Asked Questions</h2>
        <p>Everything you need to know about Baman Stock</p>
      </div>

      <div class="faq">
        <div class="faq-item">
          <button type="button" onclick={() => toggleFaq(0)}>
            <span class="q">How does BamanStock work?</span>
            <span class={`icon ${faqOpen[0] ? "open" : ""}`}
              >{faqOpen[0] ? "−" : "+"}</span
            >
          </button>
          {#if faqOpen[0]}
            <p>
              BamanStock is designed to help investors manage multiple merchants
              and locations from one centralized dashboard. Investors create
              locations (branches), assign merchants to those locations, and
              link specific stock items to each location.
            </p>
          {/if}
        </div>

        <div class="faq-item">
          <button type="button" onclick={() => toggleFaq(1)}>
            <span class="q">Can merchants manage stock on their own?</span>
            <span class={`icon ${faqOpen[1] ? "open" : ""}`}
              >{faqOpen[1] ? "−" : "+"}</span
            >
          </button>
          {#if faqOpen[1]}
            <p>
              Yes, merchants can manage assigned location stock and view reports
              for their branches.
            </p>
          {/if}
        </div>

        <div class="faq-item">
          <button type="button" onclick={() => toggleFaq(2)}>
            <span class="q"
              >What is the purpose of locations in the system?</span
            >
            <span class={`icon ${faqOpen[2] ? "open" : ""}`}
              >{faqOpen[2] ? "−" : "+"}</span
            >
          </button>
          {#if faqOpen[2]}
            <p>
              Locations represent branches and let you track inventory and
              merchant activity separately.
            </p>
          {/if}
        </div>

        <div class="faq-item">
          <button type="button" onclick={() => toggleFaq(3)}>
            <span class="q">How secure is my data on BamanStock?</span>
            <span class={`icon ${faqOpen[3] ? "open" : ""}`}
              >{faqOpen[3] ? "−" : "+"}</span
            >
          </button>
          {#if faqOpen[3]}
            <p>
              Data is protected with secure authentication and role-based
              access, so each user only sees and manages what they are allowed
              to access.
            </p>
          {/if}
        </div>

        <div class="faq-item">
          <button type="button" onclick={() => toggleFaq(4)}>
            <span class="q"
              >Can I make changes later to different locations?</span
            >
            <span class={`icon ${faqOpen[4] ? "open" : ""}`}
              >{faqOpen[4] ? "−" : "+"}</span
            >
          </button>
          {#if faqOpen[4]}
            <p>
              Yes. You can update assignments, stock links, and operational
              details anytime as your business grows and processes evolve.
            </p>
          {/if}
        </div>
      </div>
    </section>

    <section id="contact" class="panel panel-light contact-section">
      <div class="section-head center contact-head">
        <h2>How we can help you?</h2>
      </div>
      <form class="contact-form">
        <div class="field-grid">
          <label>
            <span class="label-title">Your full name*</span>
            <div class="field-line">
              <input type="text" placeholder="What's your name?" />
              <span class="field-icon">☺</span>
            </div>
          </label>
          <label>
            <span class="label-title">Your email address*</span>
            <div class="field-line">
              <input type="email" placeholder="Enter your email address" />
              <span class="field-icon">✉</span>
            </div>
          </label>
          <label>
            <span class="label-title">Your phone number</span>
            <div class="field-line">
              <input type="tel" placeholder="Enter your phone number" />
              <span class="field-icon">◔</span>
            </div>
          </label>
          <label>
            <span class="label-title">Your subject</span>
            <div class="field-line">
              <input type="text" placeholder="How can we help you?" />
              <span class="field-icon">▢</span>
            </div>
          </label>
        </div>
        <label class="message-field">
          <span class="label-title">Your message</span>
          <div class="field-line">
            <textarea rows="3" placeholder="Describe about your project"
            ></textarea>
            <span class="field-icon">☷</span>
          </div>
        </label>
        <div class="contact-foot">
          <p>
            We are committed to protecting your privacy. We will never collect
            information about you without your explicit consent.
          </p>
          <button type="submit" class="primary">Send Message</button>
        </div>
      </form>
    </section>

    <footer class="landing-footer">
      <div class="footer-grid">
        <div class="footer-left">
          <img
            src="/bamanstock-logo.png"
            alt="Bamanstock"
            class="footer-logo"
          />
          <p>Summit Salitemhret Road, Addis Ababa, Ethiopia</p>
          <p>+251912051241</p>
        </div>
        <div class="footer-right">
          <div class="footer-links">
            <a href="/terms">Terms of Use</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/disclaimer">Disclaimer</a>
          </div>
          <div class="social-links" aria-label="Social links">
            <a href="https://www.tiktok.com" aria-label="TikTok">
              <Music2 size={18} />
            </a>
            <a href="https://www.instagram.com" aria-label="Instagram">
              <Camera size={18} />
            </a>
            <a href="https://www.youtube.com" aria-label="YouTube">
              <Play size={18} />
            </a>
          </div>
        </div>
      </div>
      <p class="copyright">Copyright © 2025. Bamanstock All rights reserved</p>
    </footer>
  </section>
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }
  .landing {
    width: 100%;
    max-width: none;
    padding: 0.3rem 0;
    box-sizing: border-box;
    background: #ffffff;
  }
  .landing-nav-section {
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 90;
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid #e5e7eb;
  }
  .landing-main-section {
    width: 100%;
  }
  .hero {
    min-height: 680px;
    background-size: cover;
    background-position: center;
    border-radius: 1rem;
    display: grid;
    place-items: center;
    margin-bottom: 2rem;
    padding: 2rem 1rem;
  }
  .hero-inner {
    text-align: center;
    max-width: 920px;
    transform: translateY(-14px);
  }
  .hero h1 {
    margin: 0 0 1rem;
    font-size: clamp(2.2rem, 4.4vw, 3.8rem);
    color: #17458d;
    font-family: "Sora", ui-sans-serif, system-ui, sans-serif;
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.15;
  }
  .hero p {
    margin: 0 auto 1.2rem;
    color: #1f2937;
    font-size: clamp(1rem, 1.5vw, 1.08rem);
    font-family: "Raleway", ui-sans-serif, system-ui, sans-serif;
    font-weight: 500;
    line-height: 1.6;
    max-width: 62ch;
  }
  .cta-row {
    display: flex;
    justify-content: center;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
  .shot-wrap {
    margin: -13rem 0 2rem;
  }
  .shot-frame {
    max-width: min(1120px, 94vw);
    margin: 0 auto;
    border-radius: 1rem;
    overflow: hidden;
    border: none;
    background: transparent;
    box-shadow: 0 20px 36px rgba(15, 23, 42, 0.12);
  }
  .browser-shot {
    width: 100%;
    display: block;
  }
  .panel {
    padding: 4.25rem 0;
  }
  .panel-light {
    background: #f8fafc;
    color: #0f172a;
  }
  .features-section {
    background: #ffffff;
    min-height: 368px;
    padding-top: 6rem;
    padding-bottom: 6rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .panel-soft {
    background: #f7fbff;
    color: #0f172a;
  }
  .section-head {
    max-width: 900px;
    margin: 0 auto 2rem;
  }
  .section-head.center {
    text-align: center;
  }
  .section-head h2 {
    margin: 0 0 0.7rem;
    font-size: clamp(1.7rem, 3.5vw, 2.8rem);
  }
  .section-head p {
    margin: 0;
    color: #64748b;
  }
  .chip {
    display: inline-block;
    padding: 0.35rem 0.95rem;
    border-radius: 999px;
    border: 1px solid #e5e7eb;
    background: #f8fafc;
    color: #6b7280;
    font-size: 0.86rem;
    margin-bottom: 1rem;
  }
  .trusted-section {
    padding: 4.25rem 0 2.75rem;
    text-align: center;
  }
  .trusted-title {
    margin: 0 0 1.6rem;
    font-size: clamp(2rem, 3.5vw, 3rem);
    font-family: "Sora", ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    color: #111827;
  }
  .trusted-row {
    display: flex;
    flex-wrap: wrap;
    gap: 1.15rem 1.8rem;
    align-items: center;
    justify-content: center;
  }
  .trusted-item {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: #1f2937;
    font-weight: 600;
    font-size: 2rem;
  }
  .trusted-item .mark {
    color: #4f46e5;
    font-size: 1.2rem;
    line-height: 1;
  }
  .feature-grid {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.4rem;
  }
  .card {
    border: 1px solid #eef2f7;
    border-radius: 1rem;
    padding: 1.6rem;
    background: #fff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  }
  .card h3 {
    margin: 0 0 0.6rem;
    font-family: "Sora", ui-sans-serif, system-ui, sans-serif;
    font-size: 1.05rem;
  }
  .card p {
    margin: 0;
    color: #64748b;
    line-height: 1.7;
  }
  .icon-box {
    width: 3rem;
    height: 3rem;
    border-radius: 0.75rem;
    background: #eff6ff;
    display: grid;
    place-items: center;
    margin-bottom: 1rem;
    color: #38bdf8;
    font-weight: 700;
  }
  .how-grid {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1.1fr;
    column-gap: 4.5rem;
    row-gap: 2.4rem;
    align-items: center;
  }
  .how-left {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    min-height: 100%;
  }
  .small-note {
    color: #6b7280;
    margin: 0 0 1rem;
    font-size: 1.55rem;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }
  .small-dot {
    color: #f4c400;
    font-size: 1rem;
  }
  .steps {
    display: grid;
    gap: 1rem;
  }
  .steps-stagger .step:nth-child(2) {
    margin-left: 40%;
  }
  .step {
    position: relative;
    padding: 0.1rem 0 1.4rem 4.2rem;
    background: transparent;
    border: none;
    max-width: 300px;
  }
  .step .n {
    position: absolute;
    left: 0;
    top: -0.3rem;
    font-size: 4.8rem;
    font-weight: 800;
    color: #e5e7eb;
    line-height: 1;
    z-index: 0;
  }
  .step h3 {
    position: relative;
    z-index: 1;
    margin: 0 0 0.3rem;
    font-size: 2rem;
    line-height: 1.22;
  }
  .step p {
    position: relative;
    z-index: 1;
    margin: 0;
    color: #64748b;
    line-height: 1.65;
  }
  .step-line {
    position: relative;
    z-index: 1;
    width: 42px;
    height: 3px;
    background: #f4c400;
    border-radius: 3px;
    margin-top: 0.7rem;
  }
  .testimonials-section {
    background: #f8fafc;
    padding-top: 5.2rem;
    padding-bottom: 5.5rem;
  }
  .testimonials-head {
    margin-bottom: 2.6rem;
  }
  .testimonials-head h2 {
    max-width: 920px;
    margin: 0 auto 0.9rem;
    font-family: "Sora", ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    font-size: clamp(2rem, 3.9vw, 3.35rem);
    line-height: 1.2;
    color: #111827;
  }
  .testimonials-head p {
    font-size: 1.5rem;
    color: #111827;
  }
  .testimonials-grid {
    max-width: 1120px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2.8rem;
  }
  .testimonial {
    text-align: center;
    padding: 0.9rem 0.6rem;
  }
  .quote {
    font-size: 5.8rem;
    line-height: 0.8;
    color: #d1d5db;
    font-weight: 700;
    margin-bottom: 0.4rem;
  }
  .testimonial p {
    margin: 0 auto 1.4rem;
    max-width: 35ch;
    color: #1f2937;
    font-size: 24px;
    line-height: 1.7;
    font-weight: 400;
  }
  .person {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
  }
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    font-size: 0.66rem;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(150deg, #475569 0%, #1f2937 100%);
  }
  .person strong {
    font-size: 1rem;
    color: #374151;
  }
  .cta-panel {
    position: relative;
    overflow: hidden;
    background: radial-gradient(
      circle at 10% 95%,
      #1d3f76 0%,
      #0e346f 40%,
      #082c67 100%
    );
    border-radius: 1.8rem;
    margin: 1.2rem auto 2.2rem;
    max-width: 76rem;
    padding-top: 4rem;
    padding-bottom: 4.2rem;
    color: #fff;
  }
  .cta-panel::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.22;
    background-image: linear-gradient(
        to right,
        rgba(255, 255, 255, 0.13) 1px,
        transparent 1px
      ),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.13) 1px, transparent 1px);
    background-size: 80px 80px;
  }
  .cta-head {
    position: relative;
    z-index: 1;
    max-width: 860px;
    margin-bottom: 0;
  }
  .cta-meta {
    margin: 0 auto 1.95rem;
  }
  .cta-panel .section-head p,
  .cta-panel .section-head h2 {
    color: #fff;
  }
  .cta-panel .section-head h2 {
    max-width: 760px;
    margin: 0 auto 1.35rem;
    font-size: clamp(2.2rem, 4vw, 3.6rem);
    line-height: 1.18;
  }
  .cta-panel .section-head p {
    max-width: 760px;
    margin-left: auto;
    margin-right: auto;
    font-size: 1.75rem;
    line-height: 1.55;
    color: rgba(255, 255, 255, 0.92);
  }
  .cta-panel .section-head h2 + p {
    margin-bottom: 2rem;
  }
  .cta-panel .section-head .primary {
    margin-top: 1.5rem;
  }
  .rating {
    font-weight: 700;
    color: #facc15 !important;
    margin: 0 0 0.55rem !important;
    letter-spacing: 0.04em;
    font-size: 1.25rem !important;
  }
  .rating span {
    color: #e2e8f0;
    margin-left: 0.35rem;
    letter-spacing: 0;
  }
  .cta-avatars {
    display: inline-flex;
    align-items: center;
    margin-bottom: 0.65rem;
  }
  .dot {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 2px 9px rgba(15, 23, 42, 0.26);
  }
  .dot + .dot {
    margin-left: -5px;
  }
  .dot-teal {
    background: #2fbaa6;
  }
  .dot-purple {
    background: #7c71d5;
  }
  .dot-yellow {
    background: #ffc73a;
  }
  .dot-orange {
    background: #f29f4c;
  }
  .dot-badge {
    width: 34px;
    height: 34px;
    margin-left: -6px;
    display: inline-grid;
    place-items: center;
    font-size: 0.45rem;
    font-weight: 700;
    color: #111827;
    background: #e5e7eb;
    border-color: #ffffff;
  }
  .cta-caption {
    margin: 0 !important;
    font-size: 1.45rem !important;
    line-height: 1.35 !important;
    color: rgba(255, 255, 255, 0.94) !important;
  }
  .faq-section {
    background: #f8fafc;
    padding-top: 5.1rem;
    padding-bottom: 4.8rem;
  }
  .faq-head {
    margin-bottom: 2.2rem;
  }
  .faq-head h2 {
    margin: 0 0 0.9rem;
    font-size: 45px;
    font-family: "Sora", ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    color: #111827;
  }
  .faq-head p {
    color: #6b7280;
    font-size: 1.45rem;
  }
  .faq {
    max-width: 1120px;
    margin: 0 auto;
    border-top: 1px solid #e5e7eb;
  }
  .faq-item {
    border-bottom: 1px solid #e5e7eb;
  }
  .faq-item button {
    width: 100%;
    padding: 1.9rem 1.25rem 1.6rem;
    border: none;
    background: transparent;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
    text-align: left;
  }
  .faq-item .q {
    font-size: 26px;
    color: #111827;
    line-height: 1.3;
    font-weight: 500;
  }
  .faq-item .icon {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    background: #f3f4f6;
    color: #6b7280;
    font-size: 1.05rem;
    line-height: 1;
    flex-shrink: 0;
    margin-left: 1rem;
  }
  .faq-item .icon.open {
    background: #4aa8ea;
    color: #ffffff;
  }
  .faq-item p {
    margin: 0;
    padding: 0 1.25rem 1.5rem;
    color: #4b5563;
    font-size: 17px;
    font-weight: 400;
    line-height: 1.6;
    max-width: 105ch;
  }
  .contact-section {
    background: #f8fafc;
    padding-top: 5.2rem;
    padding-bottom: 5.3rem;
  }
  .contact-head h2 {
    font-size: 58px;
    line-height: 1.15;
    margin-bottom: 1.2rem;
  }
  .contact-form {
    max-width: 1120px;
    margin: 0 auto;
    display: grid;
    gap: 1.75rem;
  }
  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.85rem 2rem;
  }
  .contact-form label {
    display: grid;
    gap: 0.65rem;
    font-weight: 500;
    color: #1f2937;
  }
  .label-title {
    font-size: 16px;
    font-weight: 600;
  }
  .field-line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 0.58rem;
  }
  .contact-form input,
  .contact-form textarea {
    border: none;
    background: transparent;
    padding: 0;
    font: inherit;
    width: 100%;
    color: #111827;
    outline: none;
  }
  .contact-form input::placeholder,
  .contact-form textarea::placeholder {
    color: #9ca3af;
    font-size: 14px;
  }
  .field-icon {
    color: #6b7280;
    font-size: 0.9rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .message-field {
    grid-column: 1 / -1;
  }
  .message-field .field-line {
    align-items: flex-start;
    min-height: 4.2rem;
  }
  .message-field .field-icon {
    padding-top: 0.35rem;
  }
  .contact-foot {
    display: flex;
    justify-content: space-between;
    gap: 1.25rem;
    align-items: flex-end;
    border-top: 1px solid #eef2f7;
    padding-top: 1.5rem;
  }
  .contact-foot p {
    margin: 0;
    color: #6b7280;
    font-size: 17px;
    line-height: 1.5;
    max-width: 64ch;
  }
  .contact-foot .primary {
    min-width: 188px;
    text-align: center;
  }
  .landing-footer {
    margin-top: 2rem;
    background: #e9f0f9;
    border-radius: 0;
    padding: 3rem 1rem 1.2rem;
  }
  .footer-grid {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 2.2rem;
    flex-wrap: wrap;
  }
  .footer-logo {
    width: 210px;
    height: auto;
    margin-bottom: 0.6rem;
    margin-top: 0.5rem;
  }
  .footer-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .footer-left p {
    color: #1f2937;
    margin: 0.5rem 0;
    font-size: 1.2rem;
    line-height: 1.45;
    font-weight: 400;
  }
  .footer-right {
    margin-left: auto;
    display: grid;
    justify-items: end;
    gap: 1.2rem;
  }
  .footer-grid p {
    color: #334155;
    margin: 0.35rem 0;
  }
  .footer-links {
    display: flex;
    gap: 1.8rem;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .footer-links a {
    color: #111827;
    text-decoration: none;
    font-size: 1.12rem;
  }
  .social-links {
    display: inline-flex;
    align-items: center;
    gap: 0.85rem;
  }
  .social-links a {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    text-decoration: none;
    background: #111827;
    color: #ffffff;
    line-height: 0;
  }
  .social-links :global(svg) {
    width: 18px;
    height: 18px;
    stroke-width: 2.1;
  }
  .copyright {
    margin: 1.2rem 0 0;
    text-align: right;
    color: #111827;
    font-size: 1.12rem;
    border-top: 1px solid #d6dee8;
    padding-top: 1rem;
  }
  .landing-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.4rem;
    width: 100%;
    padding: 0.6rem 0 0.3rem;
  }
  .landing-nav-links {
    display: inline-flex;
    align-items: center;
    gap: 2.1rem;
    margin: 0 auto;
  }
  .landing-nav-links a {
    text-decoration: none;
    color: #334155;
    font-family: "Raleway", ui-sans-serif, system-ui, sans-serif;
    font-weight: 400;
    font-size: 16px;
  }
  .landing-nav-links a:hover {
    color: #0f172a;
  }
  .brand-link {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
  .nav-logo {
    display: block;
    width: min(220px, 45vw);
    height: 35px;
    object-fit: cover;
    object-position: left center;
  }
  h1 {
    color: #0f172a;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-right: 1rem;
  }
  .primary,
  .ghost {
    text-decoration: none;
    border-radius: 0.6rem;
    padding: 0.58rem 0.95rem;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .primary {
    border: 1px solid color-mix(in oklab, var(--brand), black 35%);
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--brand), white 10%),
      var(--brand)
    );
    color: #0b1220;
  }
  .ghost {
    border: 1px solid color-mix(in oklab, var(--surface-2), white 18%);
    background: color-mix(in oklab, var(--surface-2), white 8%);
    color: #e5e7eb;
  }

  @media (max-width: 640px) {
    .landing-nav {
      flex-direction: column;
      align-items: flex-start;
    }
    .landing-nav-links {
      order: 3;
      width: 100%;
      margin: 0.35rem 0 0;
      flex-wrap: wrap;
      gap: 0.8rem 1rem;
    }
    .actions {
      justify-content: flex-start;
    }
    .feature-grid,
    .testimonials-grid,
    .how-grid,
    .field-grid {
      grid-template-columns: 1fr;
    }
    .steps-stagger .step:nth-child(2) {
      margin-left: 0;
    }
    .trusted-row {
      justify-content: flex-start;
    }
    .shot-wrap {
      margin-top: -2rem;
    }
    .contact-foot {
      flex-direction: column;
      align-items: flex-start;
    }
    .landing-footer {
      padding: 2rem 1rem 1.2rem;
    }
    .footer-right {
      margin-left: 0;
      justify-items: start;
    }
    .copyright {
      text-align: left;
    }
  }
</style>
