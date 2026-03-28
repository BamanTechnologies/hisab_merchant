<script lang="ts">
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  let { data, form }: { data: PageData; form?: any } = $props();
  let phone = $state("");
  let password = $state("");
  let errorMessage = $state("");
  let successMessage = $state("");

  function handleLogin(e: Event) {
    // Clear previous messages
    errorMessage = "";
    successMessage = "";

    // Allow form to submit naturally to server action
    // No preventDefault needed
  }

  // Handle form responses
  $effect(() => {
    if (form) {
      console.log("Form response received:", form);

      // Check if token exists in response
      if (form.token) {
        // Login successful - token present
        successMessage = "Login successful";
        errorMessage = "";

        // Store token in localStorage
        localStorage.setItem("authToken", form.token);
        if (form.merchantBranchId) {
          localStorage.setItem("merchantBranchId", form.merchantBranchId);
          document.cookie = `merchantBranchId=${form.merchantBranchId}; path=/; secure; samesite=strict`;
        } else {
          localStorage.removeItem("merchantBranchId");
          document.cookie =
            "merchantBranchId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
        // Redirect to dashboard
        goto("/");
      } else {
        // Login failed - no token
        errorMessage = "One of the details is incorrect";
        successMessage = "";
        console.log("Login failed - no token in response");
      }
    }
  });

  // Also handle form data from the page data
  $effect(() => {
    if ((data as any)?.form) {
      console.log("Data form response received:", (data as any).form);

      // Check if token exists in response
      if ((data as any).form.token) {
        // Login successful - token present
        successMessage = "Login successful";
        errorMessage = "";

        // Store token in localStorage
        localStorage.setItem("authToken", (data as any).form.token);
        const b = (data as any).form.merchantBranchId;
        if (b) {
          localStorage.setItem("merchantBranchId", b);
          document.cookie = `merchantBranchId=${b}; path=/; secure; samesite=strict`;
        } else {
          localStorage.removeItem("merchantBranchId");
          document.cookie =
            "merchantBranchId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
        // Redirect to dashboard
        goto("/");
      } else {
        // Login failed - no token
        errorMessage = "One of the details is incorrect";
        successMessage = "";
        console.log("Login failed from data - no token in response");
      }
    }
  });
</script>

<div class="signin-container">
  <div class="signin-card">
    <div class="signin-header">
      <h1>Hisab</h1>
      <p>Sign in to your account</p>
    </div>

    {#if errorMessage}
      <div class="alert error">
        <p>{errorMessage}</p>
      </div>
    {/if}

    {#if successMessage}
      <div class="alert success">
        <p>{successMessage}</p>
      </div>
    {/if}

    <form
      class="signin-form"
      method="POST"
      action="?/login"
      onsubmit={handleLogin}
    >
      <div class="form-group">
        <label for="phone">Phone Number</label>
        <input
          id="phone"
          type="tel"
          name="phone"
          bind:value={phone}
          placeholder="Enter your phone number"
          required
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          name="password"
          bind:value={password}
          placeholder="Enter your password"
          required
        />
      </div>

      <button type="submit" class="signin-button"> Sign In </button>
    </form>
  </div>
</div>

<style>
  .signin-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    padding: 1rem;
  }

  .signin-card {
    background: var(--surface-1);
    border-radius: 1rem;
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    padding: 2rem;
    width: 100%;
    max-width: 400px;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  .signin-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .signin-header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--brand);
    margin: 0 0 0.5rem 0;
  }

  .signin-header p {
    color: #94a3b8;
    margin: 0;
    font-size: 1rem;
  }

  .signin-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 600;
    color: #e2e8f0;
    font-size: 0.875rem;
  }

  .form-group input {
    appearance: none;
    background: var(--surface-2);
    border: 1px solid color-mix(in oklab, var(--surface-2), white 10%);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    color: #f8fafc;
    font-size: 1rem;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .form-group input::placeholder {
    color: #64748b;
  }

  .signin-button {
    appearance: none;
    border: 1px solid color-mix(in oklab, var(--brand), black 35%);
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--brand), white 10%),
      var(--brand)
    );
    color: #0b1220;
    font-weight: 700;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 1rem;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.2) inset,
      0 8px 20px rgba(59, 130, 246, 0.2);
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .signin-button:hover {
    transform: translateY(-1px);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.2) inset,
      0 12px 25px rgba(59, 130, 246, 0.3);
  }

  .signin-button:active {
    transform: translateY(0);
  }

  .alert {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .alert.error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .alert.success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #86efac;
  }

  .alert p {
    margin: 0;
    font-size: 0.875rem;
  }

  @media (max-width: 480px) {
    .signin-card {
      padding: 1.5rem;
    }

    .signin-header h1 {
      font-size: 2rem;
    }
  }
</style>
