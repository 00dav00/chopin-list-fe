<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api, ApiError } from "../lib/api";
  import type { TemplateOut } from "../lib/types";
  import { clearToken } from "../stores/auth";

  let templates: TemplateOut[] = [];
  let loading = true;
  let error: string | null = null;
  let newName = "";
  let creating = false;
  let deletingId: string | null = null;

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString();

  const loadTemplates = async () => {
    loading = true;
    error = null;
    try {
      templates = await api.listTemplates();
    } catch (err) {
      error = err instanceof ApiError ? err.detail || err.message : "Load failed.";
    } finally {
      loading = false;
    }
  };

  const createTemplate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    creating = true;
    error = null;
    try {
      const created = await api.createTemplate({ name, items: [] });
      const { items, ...templateSummary } = created;
      templates = [templateSummary, ...templates];
      newName = "";
    } catch (err) {
      error = err instanceof ApiError ? err.detail || err.message : "Create failed.";
    } finally {
      creating = false;
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (deletingId) return;
    if (!window.confirm("Delete this template?")) return;
    deletingId = templateId;
    error = null;
    try {
      await api.deleteTemplate(templateId);
      templates = templates.filter((template) => template.id !== templateId);
    } catch (err) {
      error = err instanceof ApiError ? err.detail || err.message : "Delete failed.";
    } finally {
      deletingId = null;
    }
  };

  const logout = () => {
    clearToken();
    push("/login");
  };

  onMount(loadTemplates);
</script>

<main>
  <header class="page-header">
    <div>
      <h1>Templates</h1>
      <p>Reuse your favorite set of items.</p>
    </div>
    <div class="nav-links">
      <button class="button ghost" on:click={() => push("/lists")}>Lists</button>
      <button class="button secondary" on:click={logout}>Sign out</button>
    </div>
  </header>

  <section class="card stack">
    <div class="toolbar">
      <input
        class="input"
        placeholder="New template name"
        bind:value={newName}
      />
      <button class="button" disabled={creating} on:click={createTemplate}>
        {creating ? "Creating..." : "Create template"}
      </button>
    </div>
  </section>

  {#if loading}
    <p class="meta">Loading templates...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if templates.length === 0}
    <section class="card">
      <h2>No templates yet</h2>
      <p>Build a template to speed up list creation.</p>
    </section>
  {:else}
    <section class="list-grid">
      {#each templates as template}
        <article class="card item-row">
          <div>
            <h2>{template.name}</h2>
            <p class="meta">Updated {formatDate(template.updated_at)}</p>
          </div>
          <div class="toolbar">
            <button
              class="button"
              on:click={() => push(`/templates/${template.id}`)}
            >
              Open
            </button>
            <button
              class="button ghost"
              disabled={deletingId === template.id}
              on:click={() => deleteTemplate(template.id)}
            >
              {deletingId === template.id ? "Deleting..." : "Delete"}
            </button>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</main>
