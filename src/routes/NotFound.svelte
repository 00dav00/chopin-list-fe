<script lang="ts">
  import { push } from "svelte-spa-router";
</script>

<main>
  <h1>Not found</h1>
  <p>The page you are looking for does not exist.</p>
  <button class="button" on:click={() => push("/dashboard")}>Go to dashboard</button>
</main>
