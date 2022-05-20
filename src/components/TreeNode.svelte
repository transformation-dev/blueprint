
<script>
  export let opened = false
  export let selected = false
  export let level = 0

  import { slide } from 'svelte/transition'
  import Icon from 'svelte-awesome'
  import arrowRight from 'svelte-awesome/icons/arrow-right'
  import arrowDown from 'svelte-awesome/icons/arrow-down'

  function toggle(e) {
    console.log(level)
    console.log('got toggle', e)
    e.stopPropagation()
    opened = !opened
  }

</script>

<li on:click={toggle} style="padding-left: 1.5rem;" transition:slide>
  <div style="display: flex;">
    <div style="width: 1.5rem;">
      <Icon data={opened ? arrowDown : arrowRight} />
    </div>
    <slot name="label"></slot>
  </div>
  {#if opened}
    <ul>
      <slot name="children"></slot>
    </ul>
  {/if}
</li>