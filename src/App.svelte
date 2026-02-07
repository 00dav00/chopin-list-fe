<script lang="ts">
  import Router, { location, push } from "svelte-spa-router";
  import { onMount } from "svelte";
  import {
    authStore,
    bootstrapAuth,
    isTokenExpired,
  } from "./stores/auth";
  import Login from "./routes/Login.svelte";
  import Lists from "./routes/Lists.svelte";
  import ListDetail from "./routes/ListDetail.svelte";
  import Templates from "./routes/Templates.svelte";
  import TemplateDetail from "./routes/TemplateDetail.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes = {
    "/login": Login,
    "/lists": Lists,
    "/lists/:listId": ListDetail,
    "/templates": Templates,
    "/templates/:templateId": TemplateDetail,
    "*": NotFound,
  };

  onMount(() => {
    bootstrapAuth();
  });

  $: isAuthed =
    Boolean($authStore.token) && !isTokenExpired($authStore.expiry);

  $: if ($authStore.ready) {
    if (!isAuthed && $location !== "/login") {
      push("/login");
    }
    if (isAuthed && $location === "/login") {
      push("/lists");
    }
  }
</script>

{#if !$authStore.ready}
  <div class="app-loading">Loading...</div>
{:else}
  <Router {routes} />
{/if}
