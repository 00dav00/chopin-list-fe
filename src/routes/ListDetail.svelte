<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api, ApiError } from "../lib/api";
  import { getApiErrorMessage } from "../lib/errors";
  import NavMenu from "../lib/NavMenu.svelte";
  import type { ItemOut, ListOut } from "../lib/types";
  import { authStore } from "../stores/auth";

  // Time between a refetch failure and the offline banner mounting.
  // Tuning knob; module constant per team convention (constants over env).
  const BANNER_GRACE_MS = 5_000;

  export let params: { listId?: string } = {};

  let list: ListOut | null = null;
  let items: ItemOut[] = [];
  let loading = true;
  let error: string | null = null;
  let listName = "";
  let savingName = false;
  let renameModalOpen = false;
  let completeSuggestionModalOpen = false;
  let completingList = false;
  let activatingList = false;

  let newItemName = "";
  let newItemQty = "1";
  let creatingItem = false;
  let addItemModalOpen = false;
  // When set, the add-item modal is in "insert" mode: the new item is
  // positioned relative to this item id (via create + reorder) instead of
  // appended at the end. Null = append (the floating "Add item" flow).
  // `insertSide` chooses above vs below the target.
  let insertTargetId: string | null = null;
  let insertSide: "above" | "below" = "above";

  let editingItemId: string | null = null;
  let editName = "";
  let editQty = "";
  let savingItem = false;
  let togglingItemId: string | null = null;
  let updatingQtyItemId: string | null = null;
  let reorderingItems = false;
  let draggedItemId: string | null = null;
  let dragOverItemId: string | null = null;

  let currentListId = "";

  // Visibility-gated refetch state.
  let lastEtag: string | null = null;
  let bannerMounted = false;
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;
  // Last-write-wins buffer: while the edit-clobber guard defers a refetch,
  // only the most-recent payload is retained; older deferred payloads are
  // dropped on arrival of a newer one.
  let bufferedRefetch: {
    list: ListOut;
    items: ItemOut[];
    etag: string | null;
  } | null = null;
  // Monotonic refetch counter — used to drop in-flight refetch results that
  // were superseded before they returned (keeps last-write-wins honest).
  let refetchCounter = 0;
  let inflightController: AbortController | null = null;

  $: isListCompleted = list?.completed ?? false;
  $: purchasedItems = items.filter((item) => item.purchased);
  $: unpurchasedItems = items.filter((item) => !item.purchased);

  // Edit-clobber guard predicates: defer refetch reconciliation while the
  // user has a focused item input, an open modal binding to server-owned
  // fields, or an in-flight drag.
  $: hasFocusedItemInput = editingItemId !== null;
  $: isDragging = draggedItemId !== null || reorderingItems;
  $: hasOpenModal = renameModalOpen || addItemModalOpen;
  $: refetchDeferred = hasFocusedItemInput || isDragging || hasOpenModal;

  // Apply the buffered refetch when the guard releases (blur / dragend).
  $: if (!refetchDeferred && bufferedRefetch) {
    applyBufferedRefetch();
  }

  const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const stepQuantity = (value: string, delta: number) => {
    const parsed = Number(value.trim());
    const current = Number.isNaN(parsed) ? 0 : parsed;
    const next = Math.max(0, current + delta);
    return Number.isInteger(next) ? next.toString() : `${next}`;
  };

  const sortItems = (nextItems: ItemOut[]) =>
    [...nextItems].sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

  const nextSortOrder = (currentItems: ItemOut[]) =>
    currentItems.reduce((maxSortOrder, item) => {
      return item.sort_order > maxSortOrder ? item.sort_order : maxSortOrder;
    }, 0) + 1;

  const moveItem = (
    currentItems: ItemOut[],
    sourceItemId: string,
    targetItemId: string
  ) => {
    const sourceIndex = currentItems.findIndex((item) => item.id === sourceItemId);
    const targetIndex = currentItems.findIndex((item) => item.id === targetItemId);

    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      sourceIndex === targetIndex
    ) {
      return currentItems;
    }

    const reordered = [...currentItems];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    return reordered;
  };

  // Apply buffered refetch payload once the clobber guard releases.
  // TODO: a successful local write (saveItem/toggleItem/etc.) that lands
  // during the deferred window can be reverted here when the buffer carries
  // pre-write server state. Track a mutationCounter and drop the buffer if
  // it advanced since capture, or refetch fresh on guard release.
  const applyBufferedRefetch = () => {
    if (!bufferedRefetch) return;
    const buffered = bufferedRefetch;
    bufferedRefetch = null;
    list = buffered.list;
    listName = buffered.list.name;
    items = sortItems(buffered.items);
    if (buffered.etag) lastEtag = buffered.etag;
  };

  // Banner timer state machine (idle → pending → mounted → idle).
  // Single timer per failure run. A success at any stage clears both timer
  // and banner; a fresh failure after success starts a new timer.
  const handleRefetchSuccess = () => {
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
    bannerMounted = false;
  };

  const handleRefetchError = (err: unknown) => {
    // Server replied (ApiError) or we aborted the request: not "offline".
    if (err instanceof ApiError) return;
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (bannerTimer || bannerMounted) return;
    bannerTimer = setTimeout(() => {
      bannerMounted = true;
      bannerTimer = null;
    }, BANNER_GRACE_MS);
  };

  const loadList = async (listId: string) => {
    loading = true;
    error = null;
    try {
      const [listData, itemData] = await Promise.all([
        api.getList(listId),
        api.listItems(listId),
      ]);
      list = listData;
      listName = listData.name;
      items = sortItems(itemData);
    } catch (err) {
      const message = getApiErrorMessage(err, "Load failed.");
      if (message) {
        error = message;
      }
    } finally {
      loading = false;
    }
  };

  // Visibility/focus-gated background refetch with ETag (If-None-Match).
  // The first background refetch after a fresh page load sends no
  // If-None-Match (lastEtag is null) and captures the ETag from the 200
  // response; subsequent refetches send it and may receive 304.
  const backgroundRefetch = async () => {
    if (!currentListId) return;

    // Coalesce rapid focus/visibility events and cancel cross-list races
    // by aborting any in-flight refetch before starting a new one.
    inflightController?.abort();
    const controller = new AbortController();
    inflightController = controller;

    const myToken = ++refetchCounter;
    try {
      const result = await api.getListWithEtag(
        currentListId,
        lastEtag,
        controller.signal
      );
      if (myToken !== refetchCounter) return;

      if (result.status === 304) {
        if (result.etag) lastEtag = result.etag;
        handleRefetchSuccess();
        return;
      }

      // 200: also refetch items. Every item write bumps lists.updated_at,
      // so an ETag mismatch means items may have changed.
      const fetchedItems = await api.listItems(currentListId);
      if (myToken !== refetchCounter) return;

      const payload = {
        list: result.list,
        items: fetchedItems,
        etag: result.etag,
      };

      if (refetchDeferred) {
        // Last-write-wins: stash the newest payload, drop any older deferred.
        // lastEtag advances only when the buffered payload is applied, so
        // If-None-Match continues to describe the displayed state.
        bufferedRefetch = payload;
        handleRefetchSuccess();
        return;
      }

      list = payload.list;
      listName = payload.list.name;
      items = sortItems(payload.items);
      if (payload.etag) lastEtag = payload.etag;
      handleRefetchSuccess();
    } catch (err) {
      if (myToken !== refetchCounter) return;
      handleRefetchError(err);
    } finally {
      if (inflightController === controller) {
        inflightController = null;
      }
    }
  };

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      void backgroundRefetch();
    }
  };

  const onWindowFocus = () => {
    void backgroundRefetch();
  };

  // Window-level dragend fallback: per-element dragend is not fired on
  // Esc-cancel, drop on a disabled target, or when the source element is
  // removed mid-drag. Without this, draggedItemId can stay set and pin
  // refetchDeferred=true indefinitely.
  const onWindowDragEnd = () => {
    draggedItemId = null;
    dragOverItemId = null;
  };

  // Reset all per-list refetch state. Bumping refetchCounter and aborting
  // the in-flight request guarantee no late-resolving fetch can write into
  // the new list's view.
  const resetRefetchState = () => {
    refetchCounter++;
    inflightController?.abort();
    inflightController = null;
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
    bannerMounted = false;
    lastEtag = null;
    bufferedRefetch = null;
    draggedItemId = null;
    dragOverItemId = null;
  };

  onMount(() => {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onWindowFocus);
      window.addEventListener("dragend", onWindowDragEnd);
    }
  });

  onDestroy(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("dragend", onWindowDragEnd);
    }
    refetchCounter++;
    inflightController?.abort();
    inflightController = null;
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
  });

  const updateListName = async () => {
    if (!list || savingName || isListCompleted) return;
    const name = listName.trim();
    if (!name) return;
    savingName = true;
    error = null;
    try {
      list = await api.updateList(list.id, { name });
      listName = list.name;
      renameModalOpen = false;
    } catch (err) {
      const message = getApiErrorMessage(err, "Update failed.");
      if (message) {
        error = message;
      }
    } finally {
      savingName = false;
    }
  };

  const createItem = async () => {
    if (!list || creatingItem || isListCompleted) return;
    const name = newItemName.trim();
    if (!name) return;
    creatingItem = true;
    error = null;
    const targetId = insertTargetId;
    const side = insertSide;
    const previousItems = items;
    let created: ItemOut | null = null;
    try {
      created = await api.createItem(list.id, {
        name,
        qty: parseOptionalNumber(newItemQty),
        sort_order: nextSortOrder(previousItems),
      });
      if (targetId) {
        // Insert relative to target: integer sort_orders are contiguous, so
        // there is no gap to bisect. Re-emit the full id list with the new item
        // spliced at the target's index (above) or just after it (below), and
        // let the BE renumber 0..N atomically. A "below" on the last item lands
        // at the end (append-equivalent).
        const targetIndex = previousItems.findIndex(
          (item) => item.id === targetId
        );
        const insertAt =
          targetIndex < 0
            ? previousItems.length
            : targetIndex + (side === "below" ? 1 : 0);
        const reordered = [...previousItems];
        reordered.splice(insertAt, 0, created);
        const updated = await api.reorderListItems(
          list.id,
          reordered.map((item) => item.id)
        );
        items = sortItems(updated);
      } else {
        items = sortItems([...previousItems, created]);
      }
      newItemName = "";
      newItemQty = "1";
      insertTargetId = null;
      addItemModalOpen = false;
    } catch (err) {
      if (created) {
        // Create succeeded but the reposition (reorder) failed — a partial
        // success: the item exists at the bottom of the list on the server.
        // Surface it via the app-wide full-screen `error` pattern (matching
        // every other mutation failure for v1; a non-blocking inline notice is
        // deferred to a separate cross-cutting ticket). The copy is purely
        // informational — it names where the item landed and does not instruct
        // a drag the user can't perform while the list is hidden. Local state
        // still appends the item so the list is correct once the error clears.
        items = sortItems([...previousItems, created]);
        // Neutral / direction-agnostic on purpose: the same failure path fires
        // for both above and below inserts, so the copy must not name a side.
        error =
          "Item added, but it couldn't be placed where you wanted. It's at the bottom of your list.";
        newItemName = "";
        newItemQty = "1";
        insertTargetId = null;
        addItemModalOpen = false;
      } else {
        const message = getApiErrorMessage(err, "Create failed.");
        if (message) {
          error = message;
        }
      }
    } finally {
      creatingItem = false;
    }
  };

  const openAddItemModal = () => {
    if (isListCompleted) return;
    newItemName = "";
    newItemQty = "1";
    insertTargetId = null;
    addItemModalOpen = true;
  };

  const openInsertModal = (itemId: string, side: "above" | "below") => {
    if (isListCompleted) return;
    newItemName = "";
    newItemQty = "1";
    insertTargetId = itemId;
    insertSide = side;
    addItemModalOpen = true;
  };

  const openRenameModal = () => {
    if (!list || isListCompleted) return;
    listName = list.name;
    renameModalOpen = true;
  };

  const closeRenameModal = () => {
    if (savingName) return;
    renameModalOpen = false;
  };

  const closeAddItemModal = () => {
    if (creatingItem) return;
    insertTargetId = null;
    addItemModalOpen = false;
  };

  const incrementNewItemQty = () => {
    newItemQty = stepQuantity(newItemQty, 1);
  };

  const decrementNewItemQty = () => {
    newItemQty = stepQuantity(newItemQty, -1);
  };

  const incrementEditQty = () => {
    editQty = stepQuantity(editQty, 1);
  };

  const decrementEditQty = () => {
    editQty = stepQuantity(editQty, -1);
  };

  const clearDragState = () => {
    draggedItemId = null;
    dragOverItemId = null;
  };

  const handleDragStart = (event: DragEvent, itemId: string) => {
    if (editingItemId || reorderingItems || isListCompleted) {
      event.preventDefault();
      return;
    }

    draggedItemId = itemId;
    event.dataTransfer?.setData("text/plain", itemId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (event: DragEvent, targetItemId: string) => {
    if (
      !draggedItemId ||
      draggedItemId === targetItemId ||
      reorderingItems ||
      isListCompleted
    )
      return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    dragOverItemId = targetItemId;
  };

  const handleDrop = async (event: DragEvent, targetItemId: string) => {
    event.preventDefault();
    if (!list || reorderingItems) {
      clearDragState();
      return;
    }

    const sourceItemId =
      draggedItemId || event.dataTransfer?.getData("text/plain") || null;
    if (!sourceItemId || sourceItemId === targetItemId) {
      clearDragState();
      return;
    }

    const previousItems = items;
    const reordered = moveItem(previousItems, sourceItemId, targetItemId);
    if (reordered === previousItems) {
      clearDragState();
      return;
    }

    items = reordered;
    reorderingItems = true;
    error = null;
    clearDragState();

    try {
      const updated = await api.reorderListItems(
        list.id,
        reordered.map((item) => item.id)
      );
      items = sortItems(updated);
    } catch (err) {
      items = previousItems;
      const message = getApiErrorMessage(err, "Reorder failed.");
      if (message) {
        error = message;
      }
    } finally {
      reorderingItems = false;
    }
  };

  const toggleItem = async (itemId: string) => {
    if (togglingItemId || isListCompleted) return;
    const targetItem = items.find((item) => item.id === itemId);
    const shouldSuggestCompletion =
      !!targetItem && !targetItem.purchased && unpurchasedItems.length === 1;

    togglingItemId = itemId;
    error = null;
    try {
      const updated = await api.toggleItem(itemId);
      items = sortItems(
        items.map((item) => (item.id === itemId ? updated : item))
      );
      if (shouldSuggestCompletion && updated.purchased) {
        completeSuggestionModalOpen = true;
      }
    } catch (err) {
      const message = getApiErrorMessage(err, "Toggle failed.");
      if (message) {
        error = message;
      }
    } finally {
      togglingItemId = null;
    }
  };

  const deleteItem = async (itemId: string) => {
    if (isListCompleted) return;
    if (!window.confirm("Delete this item?")) return;
    error = null;
    try {
      await api.deleteItem(itemId);
      items = items.filter((item) => item.id !== itemId);
    } catch (err) {
      const message = getApiErrorMessage(err, "Delete failed.");
      if (message) {
        error = message;
      }
    }
  };

  const adjustItemQty = async (item: ItemOut, delta: number) => {
    if (updatingQtyItemId || editingItemId === item.id || isListCompleted) return;

    const currentQty = item.qty ?? 0;
    const nextQty = Math.max(0, currentQty + delta);
    if (nextQty === currentQty) return;

    updatingQtyItemId = item.id;
    error = null;
    try {
      const updated = await api.updateItem(item.id, {
        name: item.name,
        qty: nextQty,
      });
      items = sortItems(
        items.map((entry) => (entry.id === item.id ? updated : entry))
      );
    } catch (err) {
      const message = getApiErrorMessage(err, "Update failed.");
      if (message) {
        error = message;
      }
    } finally {
      updatingQtyItemId = null;
    }
  };

  const startEditItem = (item: ItemOut) => {
    if (isListCompleted) return;
    editingItemId = item.id;
    editName = item.name;
    editQty = item.qty?.toString() ?? "";
  };

  const cancelEditItem = () => {
    editingItemId = null;
  };

  const saveItem = async (itemId: string) => {
    if (savingItem || isListCompleted) return;
    const name = editName.trim();
    if (!name) return;
    savingItem = true;
    error = null;
    try {
      const payload = {
        name,
        qty: parseOptionalNumber(editQty),
      };
      const updated = await api.updateItem(itemId, payload);
      items = sortItems(
        items.map((item) => (item.id === itemId ? updated : item))
      );
      editingItemId = null;
    } catch (err) {
      const message = getApiErrorMessage(err, "Update failed.");
      if (message) {
        error = message;
      }
    } finally {
      savingItem = false;
    }
  };

  const completeCurrentList = async () => {
    if (!list || completingList || activatingList) return;
    completingList = true;
    error = null;
    try {
      list = await api.completeList(list.id);
      completeSuggestionModalOpen = false;
    } catch (err) {
      const message = getApiErrorMessage(err, "Complete failed.");
      if (message) {
        error = message;
      }
    } finally {
      completingList = false;
    }
  };

  const activateCurrentList = async () => {
    if (!list || activatingList || completingList) return;
    activatingList = true;
    error = null;
    try {
      list = await api.activateList(list.id);
      completeSuggestionModalOpen = false;
    } catch (err) {
      const message = getApiErrorMessage(err, "Activate failed.");
      if (message) {
        error = message;
      }
    } finally {
      activatingList = false;
    }
  };

  $: if (params.listId && params.listId !== currentListId) {
    if (currentListId) {
      // Mid-session route change: invalidate per-list refetch state so an
      // in-flight or buffered refetch for the previous list cannot apply
      // onto the new one.
      resetRefetchState();
    }
    currentListId = params.listId;
    loadList(currentListId);
  }

  const closeCompleteSuggestionModal = () => {
    if (completingList) return;
    completeSuggestionModalOpen = false;
  };
</script>

<main>
  {#if bannerMounted}
    <div class="banner offline-banner" role="status" aria-live="polite">
      Offline — please refresh
    </div>
  {/if}
  <header class="page-header">
    <div class="page-header-main">
      <div class="title-with-action">
        <button
          class="button ghost icon-button"
          type="button"
          aria-label="Edit list name"
          title="Edit name"
          disabled={isListCompleted}
          on:click={openRenameModal}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.79 1.79 3.75 3.75 1.96-1.62z"
            />
          </svg>
        </button>
        <h1>{list ? list.name : "List"}</h1>
      </div>
    </div>
    <div class="page-header-side">
      <div class="nav-links">
        <NavMenu isAdmin={$authStore.user?.admin ?? false} />
      </div>
    </div>
  </header>

  {#if loading}
    <p class="meta">Loading list...</p>
  {:else if error}
    <p class="meta">{error}</p>
  {:else if !list}
    <p class="meta">List not found.</p>
  {:else}
    <section class="card stack">
      <div class="row">
        <div>
          <h2>Items ({purchasedItems.length}/{items.length})</h2>
          {#if isListCompleted}
            <p class="meta">This list is completed and read-only.</p>
          {:else}
            <p class="meta">Add, edit, or tick items as you shop.</p>
          {/if}
        </div>
        <div class="toolbar">
          {#if isListCompleted}
            <span class="pill">Completed</span>
            <button
              class="button"
              disabled={activatingList || completingList}
              on:click={activateCurrentList}
            >
              Mark active
            </button>
          {:else}
            <button
              class="button ghost"
              disabled={activatingList || completingList}
              on:click={completeCurrentList}
            >
              Mark complete
            </button>
          {/if}
        </div>
      </div>

      {#if unpurchasedItems.length === 0}
        <p class="meta">No items yet.</p>
      {:else}
        <div class="stack">
          {#each unpurchasedItems as item (item.id)}
            <div
              class="card draggable-item"
              class:drag-over={dragOverItemId === item.id}
              draggable={editingItemId !== item.id && !reorderingItems && !isListCompleted}
              role="listitem"
              aria-grabbed={draggedItemId === item.id}
              on:dragstart={(event) => handleDragStart(event, item.id)}
              on:dragover={(event) => handleDragOver(event, item.id)}
              on:drop={(event) => handleDrop(event, item.id)}
              on:dragend={clearDragState}
            >
              {#if editingItemId === item.id}
                <div class="inline-form">
                  <input class="input" bind:value={editName} />
                  <div class="qty-stepper">
                    <button
                      class="button ghost icon-button stepper-button"
                      type="button"
                      aria-label="Decrease quantity"
                      on:click={decrementEditQty}
                    >
                      -
                    </button>
                    <input
                      class="input qty-input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Qty"
                      bind:value={editQty}
                    />
                    <button
                      class="button ghost icon-button stepper-button"
                      type="button"
                      aria-label="Increase quantity"
                      on:click={incrementEditQty}
                    >
                      +
                    </button>
                  </div>
                  <div class="toolbar">
                    <button
                      class="button"
                      disabled={savingItem}
                      on:click={() => saveItem(item.id)}
                    >
                      {savingItem ? "Saving..." : "Save"}
                    </button>
                    <button class="button ghost" on:click={cancelEditItem}>
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <div class="item-row">
                  <div class="item-main">
                    <input
                      class="item-checkbox"
                      type="checkbox"
                      checked={item.purchased}
                      disabled={togglingItemId === item.id || isListCompleted}
                      aria-label={`Purchased ${item.name}`}
                      on:change={() => toggleItem(item.id)}
                    />
                    <div>
                      {#if item.purchased}
                        <div class="item-summary-checked">
                          <span>{item.name}</span>
                          {#if item.qty !== null && item.qty !== undefined}
                            <span>(x {item.qty})</span>
                          {/if}
                        </div>
                      {:else}
                        <h3>{item.name}</h3>
                        <div class="meta">
                          {#if item.qty !== null && item.qty !== undefined}
                            (x {item.qty})
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="toolbar">
                    <button
                      class="button ghost icon-button qty-inline-button"
                      type="button"
                      aria-label={`Increase quantity for ${item.name}`}
                      disabled={updatingQtyItemId === item.id || isListCompleted}
                      on:click={() => adjustItemQty(item, 1)}
                    >
                      +
                    </button>
                    <button
                      class="button ghost icon-button qty-inline-button"
                      type="button"
                      aria-label={`Decrease quantity for ${item.name}`}
                      disabled={
                        updatingQtyItemId === item.id ||
                        (item.qty ?? 0) <= 1 ||
                        isListCompleted
                      }
                      on:click={() => adjustItemQty(item, -1)}
                    >
                      -
                    </button>
                    <button
                      class="button ghost icon-button"
                      aria-label={`Insert item above ${item.name}`}
                      title="Insert above"
                      disabled={isListCompleted}
                      on:click={() => openInsertModal(item.id, "above")}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M11 2h2v3h3v2h-3v3h-2V7H8V5h3V2zM4 14h16v2H4v-2zm0 4h16v2H4v-2z" />
                      </svg>
                    </button>
                    <button
                      class="button ghost icon-button"
                      aria-label={`Insert item below ${item.name}`}
                      title="Insert below"
                      disabled={isListCompleted}
                      on:click={() => openInsertModal(item.id, "below")}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 4h16v2H4V4zM4 8h16v2H4V8zM11 22H13V19H16V17H13V14H11V17H8V19H11Z" />
                      </svg>
                    </button>
                    <button
                      class="button ghost icon-button"
                      aria-label="Edit"
                      title="Edit"
                      disabled={isListCompleted}
                      on:click={() => startEditItem(item)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.79 1.79 3.75 3.75 1.96-1.62z"
                        />
                      </svg>
                    </button>
                    <button
                      class="button danger icon-button"
                      aria-label="Delete"
                      title="Delete"
                      disabled={isListCompleted}
                      on:click={() => deleteItem(item.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h2v9H7V9zm4 0h2v9h-2V9zm4 0h2v9h-2V9zM6 21h12l1-14H5l1 14z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    {#if purchasedItems.length > 0}
      <section class="card stack">
        <div class="row">
          <div>
            <h2>Purchased items</h2>
          </div>
        </div>

        <div class="stack">
          {#each purchasedItems as item (item.id)}
            <div class="card item-row compact-item-card">
              <div class="item-main">
                <input
                  class="item-checkbox"
                  type="checkbox"
                  checked={item.purchased}
                  disabled={togglingItemId === item.id || isListCompleted}
                  aria-label={`Purchased ${item.name}`}
                  on:change={() => toggleItem(item.id)}
                />
                <div class="item-summary-checked">
                  <span>{item.name}</span>
                  {#if item.qty !== null && item.qty !== undefined}
                    <span>(x {item.qty})</span>
                  {/if}
                </div>
              </div>
              <div class="toolbar">
                <button
                  class="button danger icon-button"
                  aria-label="Delete"
                  title="Delete"
                  disabled={isListCompleted}
                  on:click={() => deleteItem(item.id)}
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
        </div>
      </section>
    {/if}

    <button class="button floating-add-item" disabled={isListCompleted} on:click={openAddItemModal}>
      Add item
    </button>
  {/if}
</main>

{#if addItemModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeAddItemModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-list-item-title"
    >
      <h3 id="add-list-item-title">
        {insertTargetId
          ? insertSide === "below"
            ? "Insert item below"
            : "Insert item above"
          : "Add item"}
      </h3>
      <div class="inline-form">
        <input class="input" placeholder="Item name" bind:value={newItemName} />
        <div class="qty-stepper">
          <button
            class="button ghost icon-button stepper-button"
            type="button"
            aria-label="Decrease quantity"
            on:click={decrementNewItemQty}
          >
            -
          </button>
          <input
            class="input qty-input"
            type="number"
            min="0"
            step="1"
            placeholder="Qty"
            bind:value={newItemQty}
          />
          <button
            class="button ghost icon-button stepper-button"
            type="button"
            aria-label="Increase quantity"
            on:click={incrementNewItemQty}
          >
            +
          </button>
        </div>
      </div>
      <div class="toolbar">
        <button class="button ghost" disabled={creatingItem} on:click={closeAddItemModal}>
          Cancel
        </button>
        <button class="button" disabled={creatingItem} on:click={createItem}>
          {creatingItem
            ? "Creating..."
            : insertTargetId
              ? "Insert item"
              : "Create item"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if renameModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeRenameModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-list-title"
    >
      <h3 id="rename-list-title">Change list name</h3>
      <input class="input" placeholder="List name" bind:value={listName} />
      <div class="toolbar">
        <button class="button ghost" disabled={savingName} on:click={closeRenameModal}>
          Cancel
        </button>
        <button class="button" disabled={savingName} on:click={updateListName}>
          {savingName ? "Saving..." : "Save name"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if completeSuggestionModalOpen}
  <div class="modal-backdrop" role="presentation" on:click|self={closeCompleteSuggestionModal}>
    <section
      class="modal card stack"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-list-suggestion-title"
    >
      <h3 id="complete-list-suggestion-title">All items are now purchased.</h3>
      <p class="meta">Would you like to mark this list as complete?</p>
      <div class="toolbar">
        <button class="button ghost" disabled={completingList} on:click={closeCompleteSuggestionModal}>
          Keep active
        </button>
        <button class="button" disabled={completingList} on:click={completeCurrentList}>
          {completingList ? "Completing..." : "Mark list complete"}
        </button>
      </div>
    </section>
  </div>
{/if}
