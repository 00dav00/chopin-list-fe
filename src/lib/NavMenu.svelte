<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { clearToken } from "../stores/auth";

  export let isAdmin = false;

  let isOpen = false;
  let menuRoot: HTMLElement | null = null;

  const navigate = (path: string) => {
    isOpen = false;
    push(path);
  };

  const toggleMenu = () => {
    isOpen = !isOpen;
  };

  const closeMenu = () => {
    isOpen = false;
  };

  const logout = () => {
    closeMenu();
    clearToken();
    push("/login");
  };

  const onDocumentClick = (event: MouseEvent) => {
    if (!isOpen || !menuRoot) return;
    const target = event.target as Node | null;
    if (target && !menuRoot.contains(target)) {
      closeMenu();
    }
  };

  const onEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  };

  onMount(() => {
    window.addEventListener("mousedown", onDocumentClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onDocumentClick);
      window.removeEventListener("keydown", onEscape);
    };
  });
</script>

<div class="nav-menu-wrap" bind:this={menuRoot}>
  <button
    class="button ghost icon-button nav-menu-toggle"
    type="button"
    aria-label="Open navigation menu"
    aria-expanded={isOpen}
    on:click={toggleMenu}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
    </svg>
  </button>

  {#if isOpen}
    <section class="nav-menu-panel" aria-label="Main navigation">
      <button class="button ghost nav-menu-item" on:click={() => navigate("/dashboard")}>Dashboard</button>

      <div class="nav-menu-divider" role="separator"></div>

      <button class="button ghost nav-menu-item" on:click={() => navigate("/templates")}>Templates</button>

      <div class="nav-menu-divider" role="separator"></div>

      <div class="nav-menu-group">
        <p class="nav-menu-label">Lists</p>
        <button class="button ghost nav-menu-item" on:click={() => navigate("/lists")}>Active</button>
        <button class="button ghost nav-menu-item" on:click={() => navigate("/lists/completed")}>Completed</button>
      </div>

      {#if isAdmin}
        <div class="nav-menu-divider" role="separator"></div>

        <div class="nav-menu-group">
          <p class="nav-menu-label">Users</p>
          <button class="button ghost nav-menu-item" on:click={() => navigate("/admin/active-users")}>Active</button>
          <button class="button ghost nav-menu-item" on:click={() => navigate("/admin/pending-users")}>Pending</button>
        </div>
      {/if}

      <div class="nav-menu-divider" role="separator"></div>

      <button class="button ghost nav-menu-item signout-menu-item" on:click={logout}>Sign out</button>
    </section>
  {/if}
</div>
