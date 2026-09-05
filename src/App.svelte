<script lang="ts">
  import Router, { location, push } from "svelte-spa-router";
  import { onMount } from "svelte";
  import { setUnauthorizedHandler } from "./lib/api";
  import {
    authStore,
    bootstrapAuth,
    captureReturnTo,
    isTokenExpired,
    clearToken,
    setAuthNotice,
    takeReturnTo,
  } from "./stores/auth";
  import Login from "./routes/Login.svelte";
  import Dashboard from "./routes/Dashboard.svelte";
  import Lists from "./routes/Lists.svelte";
  import CompletedLists from "./routes/CompletedLists.svelte";
import ListDetail from "./routes/ListDetail.svelte";
  import Templates from "./routes/Templates.svelte";
  import TemplateDetail from "./routes/TemplateDetail.svelte";
  import PendingUsers from "./routes/PendingUsers.svelte";
  import ActiveUsers from "./routes/ActiveUsers.svelte";
  import NotFound from "./routes/NotFound.svelte";
  import Notices from "./lib/Notices.svelte";

  const routes = {
    "/": Dashboard,
    "/login": Login,
    "/dashboard": Dashboard,
    "/lists": Lists,
    "/lists/completed": CompletedLists,
    "/lists/:listId": ListDetail,
    "/templates": Templates,
    "/templates/:templateId": TemplateDetail,
    "/admin/pending-users": PendingUsers,
    "/admin/active-users": ActiveUsers,
    "*": NotFound,
  };

  onMount(() => {
    setUnauthorizedHandler(() => {
      setAuthNotice("Authentication failed. Please sign in again.");
      clearToken();
      if ($location !== "/login") {
        push("/login");
      }
    });

    // An admin arriving from a notification email lands here before any
    // redirect, so the origin route is still in $location. Read it once, at
    // boot: capturing inside the guard below would also fire on a mid-session
    // 401, which is session expiry rather than a deep-link.
    captureReturnTo($location);

    bootstrapAuth();

    return () => {
      setUnauthorizedHandler(null);
    };
  });

  $: isAuthed =
    Boolean($authStore.token) && !isTokenExpired($authStore.expiry);

  $: if ($authStore.ready) {
    if (!isAuthed) {
      if ($location !== "/login") {
        push("/login");
      }
    } else if ($location === "/login" && $authStore.user) {
      // The only post-auth navigator; Login.svelte deliberately no longer
      // pushes. Waiting on $authStore.user is load-bearing: isAuthed is
      // token-only, and every allowlisted target is admin-gated, so navigating
      // before the profile loads bounces the admin straight back out.
      push(takeReturnTo() ?? "/dashboard");
    }
  }
</script>

{#if !$authStore.ready}
  <div class="app-loading">Loading...</div>
{:else}
  <Router {routes} />
{/if}

<!-- App-wide non-blocking notice stack; mounted once so it survives route
     changes. -->
<Notices />
