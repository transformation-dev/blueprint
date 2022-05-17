
<script>
  
  import { location } from 'svelte-spa-router'

  export let label
  export let href

</script>

<div>
  <a href={`/#${href}`} class="tab-label-box link external">
    {label}
  </a>
  <div class="tab-marker" class:selected={href === $location}></div>
</div>

<style>
  
  .tab-label-box {
    margin-top: 8px;
    margin-bottom: 0px;
    height: var(--blueprint-tab-label-box-height) !important;
  }

  .tab-marker {
    height: var(--blueprint-tab-marker-height);
    background-color: var(--f7-theme-color);
  }

  .selected {
    background-color: var(--blueprint-light-blue);
  }

</style>
