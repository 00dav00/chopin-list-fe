<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { api } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import NavMenu from "../lib/NavMenu.svelte";
  import type { TemplateOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  let templates: TemplateOut[] = [];
  let loading = true;
  let error: string | null = null;
  let newName = "";
  let creating = false;
  let createTemplateModalOpen = false;
  let deletingId: string | null = null;
  let createListModalTemplate: TemplateOut | null = null;
  let createListName = "";
  let creatingListFromTemplate = false;
  let deleteModalTemplate: TemplateOut | null = null;

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString();

  const loadTemplates = async () => {
    loading = true;
    error = null;
    try {
      templates = await api.listTemplates();
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
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
      createTemplateModalOpen = false;
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creating = false;
    }
  };

  const openCreateTemplateModal = () => {
    newName = "";
    createTemplateModalOpen = true;
  };

  const closeCreateTemplateModal = () => {
    if (creating) return;
    createTemplateModalOpen = false;
  };

  const deleteTemplate = async (templateId: string) => {
    if (deletingId) return;
    deletingId = templateId;
    error = null;
    try {
      await api.deleteTemplate(templateId);
      templates = templates.filter((template) => template.id !== templateId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Delete failed.");
      if (message) {
        error = message;
      }
    } finally {
      deletingId = null;
    }
  };

  const openDeleteTemplateModal = (template: TemplateOut) => {
    if (deletingId) return;
    deleteModalTemplate = template;
  };

  const closeDeleteTemplateModal = () => {
    if (deletingId) return;
    deleteModalTemplate = null;
  };

  const confirmDeleteTemplate = async () => {
    if (!deleteModalTemplate) return;
    const templateId = deleteModalTemplate.id;
    await deleteTemplate(templateId);
    if (!error) {
      deleteModalTemplate = null;
    }
  };

  const openCreateListModal = (template: TemplateOut) => {
    createListModalTemplate = template;
    createListName = "";
  };

  const closeCreateListModal = () => {
    if (creatingListFromTemplate) return;
    createListModalTemplate = null;
    createListName = "";
  };

  const createListFromTemplate = async () => {
    if (!createListModalTemplate || creatingListFromTemplate) return;
    creatingListFromTemplate = true;
    error = null;
    try {
      const created = await api.createListFromTemplate(createListModalTemplate.id, {
        name: createListName.trim() || null,
      });
      closeCreateListModal();
      push(`/lists/${created.id}`);
    } catch (err) {
      const message = getApiErrorMessage(err, "Create failed.");
      if (message) {
        error = message;
      }
    } finally {
      creatingListFromTemplate = false;
    }
  };

  onMount(loadTemplates);
</script>

<main>
  <header class="page-header">
    <div class="page-header-main">
      <h1>Templates</h1>
    </div>
    <div class="page-header-side">
      <p class="header-description">Reuse your favorite set of items.</p>
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

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
        <div
          class="card item-row card-clickable"
          role="button"
          tabindex="0"
          on:click={() => push(`/templates/${template.id}`)}
          on:keydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              push(`/templates/${template.id}`);
            }
          }}
        >
          <div>
            <h2>{template.name}</h2>
            <p class="meta">Updated {formatDate(template.updated_at)}</p>
            <p class="meta">{template.items_count} items</p>
          </div>
          <div class="toolbar">
            <button
              class="button icon-button"
              aria-label="Create list from template"
              title="Create list from template"
              on:click|stopPropagation={() => openCreateListModal(template)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3.25 13.9 8.1l4.85 1.9-4.85 1.9L12 16.75l-1.9-4.85-4.85-1.9 4.85-1.9L12 3.25zm7.25 10.5.95 2.4 2.4.95-2.4.95-.95 2.4-.95-2.4-2.4-.95 2.4-.95.95-2.4zM4.75 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"
                />
              </svg>
            </button>
            <button
              class="button danger icon-button"
              aria-label="Delete"
              title="Delete"
              disabled={deletingId === template.id}
              on:click|stopPropagation={() => openDeleteTemplateModal(template)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9zM6 21h12l1-14H5l1 14z"
                />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <button class="button floating-add-item" on:click={openCreateTemplateModal}>
    Add template
  </button>
</main>

{#if createTemplateModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeCreateTemplateModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-template-title"
    >
      <h3 id="create-template-title">Create template</h3>
      <input
        class="input"
        placeholder="New template name"
        bind:value={newName}
      />
      <div class="toolbar">
        <button class="button ghost" disabled={creating} on:click={closeCreateTemplateModal}>
          Cancel
        </button>
        <button class="button" disabled={creating} on:click={createTemplate}>
          {creating ? "Creating..." : "Create template"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if createListModalTemplate}
  <div class="modal-backdrop" role="presentation" on:click|self={closeCreateListModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-list-from-template-title"
    >
      <h3 id="create-list-from-template-title">Create list from template</h3>
      <p class="meta">Template: {createListModalTemplate.name}</p>
      <input
        class="input"
        placeholder="Optional list name"
        bind:value={createListName}
      />
      <div class="toolbar">
        <button
          class="button ghost"
          disabled={creatingListFromTemplate}
          on:click={closeCreateListModal}
        >
          Cancel
        </button>
        <button
          class="button"
          disabled={creatingListFromTemplate}
          on:click={createListFromTemplate}
        >
          {creatingListFromTemplate ? "Creating..." : "Create list"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if deleteModalTemplate}
  <div class="modal-backdrop" role="presentation" on:click|self={closeDeleteTemplateModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-template-title"
    >
      <h3 id="delete-template-title">Delete template?</h3>
      <p class="meta">
        This permanently deletes <strong>{deleteModalTemplate.name}</strong>.
      </p>
      <div class="toolbar">
        <button class="button ghost" disabled={deletingId !== null} on:click={closeDeleteTemplateModal}>
          Cancel
        </button>
        <button class="button danger" disabled={deletingId !== null} on:click={confirmDeleteTemplate}>
          {deletingId !== null ? "Deleting..." : "Delete template"}
        </button>
      </div>
    </section>
  </div>
{/if}
