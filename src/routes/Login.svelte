<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { initGoogleSignIn } from "../lib/auth";
  import { saveToken } from "../stores/auth";

  let error: string | null = null;

  onMount(() => {
    return initGoogleSignIn(
      "google-signin",
      (token) => {
        saveToken(token);
        push("/lists");
      },
      (message) => {
        error = message;
      }
    );
  });
</script>

<main>
  <header class="page-header">
    <div>
      <h1>Shoplist</h1>
      <p>Sign in with Google to manage your lists.</p>
    </div>
  </header>

  <section class="card stack">
    <div id="google-signin"></div>
    {#if error}
      <p class="meta">{error}</p>
    {/if}
  </section>
</main>
