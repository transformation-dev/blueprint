
<script>

  import { location } from 'svelte-spa-router'

  export let label
  export let href

  let marked = false
  const markerOn = () => marked = true
  const markerOff = () => marked = false

</script>

<a href={`/#${href}`} class="container link external" on:mouseover={markerOn} on:focus={markerOn} on:mouseleave={markerOff} on:blur={markerOff}>
  <div class="tab-label-box">
    <span class="icon icon-link"></span>
    <span class="label">{label}</span>
  </div>
</a>
<div class="tab-marker" class:selected={href === $location || marked}></div>

<style>

  .container {
    height: 40px;
    display: flex;
    flex-direction: column;
    align-items: left;
    justify-content: flex-end;
    text-decoration: none;
  }

  /* Focusing the button with a keyboard will show a focus ring. */
  .container:focus-visible {
    outline: 3px;
  }
  
  /* Focusing the button with a mouse, touch, or stylus will make it look like a button is down. */
  .container:focus:not(:focus-visible) {
    outline: 0px;
    box-shadow: inset 1px 1px 5px black;
  }
  
  .tab-label-box {
    margin-inline-start: 12px;
    margin-inline-end: 12px;
    margin-block-end: 8px;
  }

  .label {
    font-size: 1rem;
    font-weight: 300;
    color: var(--agnostic-primary-light);
  }

  .label:hover {
    color: var(--agnostic-primary-hover);
  }

  .tab-marker {
    height: 5px;
  }

  .selected {
    background-color: var(--agnostic-primary-hover);
  }

</style>
