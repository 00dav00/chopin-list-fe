<script lang="ts">
  import Router, { location, push } from "svelte-spa-router";
  import { onMount } from "svelte";
  import { setUnauthorizedHandler } from "./lib/api";
  import {
    authStore,
    bootstrapAuth,
    isTokenExpired,
    clearToken,
    setAuthNotice,
  } from "./stores/auth";
  import Login from "./routes/Login.svelte";
  import Dashboard from "./routes/Dashboard.svelte";
  import Lists from "./routes/Lists.svelte";
  import CompletedLists from "./routes/CompletedLists.svelte";
  import ListDetail from "./routes/ListDetail.svelte";
  import Templates from "./routes/Templates.svelte";
  import TemplateDetail from "./routes/TemplateDetail.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes = {
    "/": Dashboard,
    "/login": Login,
    "/dashboard": Dashboard,
    "/lists": Lists,
    "/lists/completed": CompletedLists,
    "/lists/:listId": ListDetail,
    "/templates": Templates,
    "/templates/:templateId": TemplateDetail,
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

    bootstrapAuth();

    return () => {
      setUnauthorizedHandler(null);
    };
  });

  $: isAuthed =
    Boolean($authStore.token) && !isTokenExpired($authStore.expiry);

  $: if ($authStore.ready) {
    if (!isAuthed && $location !== "/login") {
      push("/login");
    }
    if (isAuthed && $location === "/login") {
      push("/dashboard");
    }
  }
</script>

{#if !$authStore.ready}
  <div class="app-loading">Loading...</div>
{:else}
  <Router {routes} />
{/if}
