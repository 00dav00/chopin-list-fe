<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { initGoogleSignIn } from "../lib/auth";
  import {
    authNoticeStore,
    hydrateAuthNotice,
    saveToken,
  } from "../stores/auth";

  let error: string | null = null;

  onMount(() => {
    hydrateAuthNotice();

    return initGoogleSignIn(
      "google-signin",
      (token) => {
        saveToken(token);
        push("/dashboard");
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
    {#if $authNoticeStore}
      <p class="meta">{$authNoticeStore}</p>
    {/if}
    <div id="google-signin"></div>
    {#if error}
      <p class="meta">{error}</p>
    {/if}
  </section>
</main>
