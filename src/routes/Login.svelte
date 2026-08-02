<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api, ApiError } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import { initGoogleSignIn } from "../lib/auth";
  import {
    authNoticeStore,
    clearToken,
    clearPendingApproval,
    clearReturnTo,
    hydrateAuthNotice,
    isPendingApproval,
    saveToken,
    setCurrentUser,
    setPendingApproval,
  } from "../stores/auth";

  let error: string | null = null;
  let timedOut = false;
  let pendingApproval = false;

  onMount(() => {
    hydrateAuthNotice();
    pendingApproval = isPendingApproval();

    return initGoogleSignIn(
      "google-signin",
      async (token) => {
        error = null;
        timedOut = false;
        pendingApproval = false;
        clearPendingApproval();
        saveToken(token);
        try {
          const user = await api.getMe();
          setCurrentUser(user);
          // No push here. App.svelte's redirect guard owns the post-auth
          // destination and has already navigated by this point -- saveToken
          // above flips isAuthed synchronously, so the guard runs while this
          // await is still in flight. A push here lands *after* that
          // navigation and silently overwrites it, which sends an admin
          // arriving from a notification deep-link to the dashboard instead.
          // Only visible with a realistic network delay; with an instantly
          // resolved fetch the two land in the opposite order and it passes.
        } catch (err) {
          clearToken();
          if (err instanceof ApiError && err.status === 403) {
            pendingApproval = true;
            setPendingApproval();
            // Load-bearing, and covered: "discards the emailed return path
            // when sign-in ends in pending approval" in src/App.test.ts fails
            // if you remove this line. Do not delete it as defensive.
            //
            // App.svelte's redirect arm is the only thing that consumes a
            // stashed return path, and it requires a populated $authStore.user.
            // A 403 never produces one, so this branch is the sole exit where
            // the stash would otherwise survive -- and approval is a multi-day
            // wait, so it would resurface at an unrelated later sign-in in this
            // tab. Only returnTo touchpoint outside App.svelte.
            clearReturnTo();
          } else {
            clearPendingApproval();
            error = getApiErrorMessage(err, "Sign in failed.");
          }
        }
      },
      (message) => {
        error = message;
        timedOut = false;
      },
      () => {
        timedOut = true;
        error = null;
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
    {#if pendingApproval}
      <div class="pending-notice">
        <p><strong>Account pending approval</strong></p>
        <p>Your account has been registered but needs to be approved by an admin before you can sign in. Try signing in again below once you've been notified.</p>
      </div>
    {:else if timedOut}
      <p class="meta">Google sign-in didn't load. Reload the page to try again.</p>
      <button class="button ghost" on:click={() => location.reload()}>Reload page</button>
    {:else if error}
      <p class="meta">{error}</p>
    {/if}
  </section>
</main>

<style>
  .pending-notice {
    background-color: #fdf6e3;
    border: 1px solid #e8c97a;
    border-radius: 12px;
    padding: 0.85rem 1rem;
    font-size: 0.9rem;
    line-height: 1.5;
    color: #4a3a00;
  }

  .pending-notice p {
    margin: 0;
    color: #4a3a00;
  }

  .pending-notice p + p {
    margin-top: 0.35rem;
  }
</style>
