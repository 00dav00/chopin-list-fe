<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { api } from "./api";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { getApiErrorMessage } from "./errors";
  import { notify } from "./notices";
  import type { UnmatchedItemOut } from "./types";

  // Asks the shopper whether to share items that fit no group. Only the run
  // id goes to the server; it already holds the names, so nothing typed here
  // can reach the admins' inbox.
  export let runId: string | null = null;
  export let unmatched: UnmatchedItemOut[] = [];

  const dispatch = createEventDispatcher<{ close: void }>();
  let sending = false;

  $: open = runId !== null && unmatched.length > 0;
  $: names = [...new Set(unmatched.map((entry) => entry.name))];

  const close = () => {
    if (sending) return;
    dispatch("close");
  };

  const send = async () => {
    if (!runId || sending) return;
    sending = true;
    try {
      await api.sendGroupingRun(runId);
      notify({ message: "Sent to the admins. Thanks!", severity: "success" });
      dispatch("close");
    } catch (err) {
      const message = "Couldn't send them right now. Try again.";
      if (getApiErrorMessage(err, message)) {
        notify({ message, severity: "error" });
      }
    } finally {
      sending = false;
    }
  };
</script>

<ConfirmDialog
  {open}
  title="Some items didn't fit a group"
  message="Send them to the admins so they can add a group? Only the item names are shared."
  confirmLabel="Send to admins"
  cancelLabel="Not now"
  busyLabel="Sending..."
  busy={sending}
  danger={false}
  on:confirm={send}
  on:cancel={close}
>
  <ul class="unmatched-list">
    {#each names as name (name)}
      <li>{name}</li>
    {/each}
  </ul>
</ConfirmDialog>
