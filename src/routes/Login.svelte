<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import { initGoogleSignIn } from "../lib/auth";
  import {
    authNoticeStore,
    clearToken,
    hydrateAuthNotice,
    saveToken,
    setCurrentUser,
  } from "../stores/auth";

  let error: string | null = null;

  onMount(() => {
    hydrateAuthNotice();

    return initGoogleSignIn(
      "google-signin",
      async (token) => {
        saveToken(token);
        try {
          const user = await api.getMe();
          setCurrentUser(user);
          push("/dashboard");
        } catch (err) {
          clearToken();
          error = getApiErrorMessage(err, "Sign in failed.");
        }
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
