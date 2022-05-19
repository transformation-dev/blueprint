
<script>

  import { slide } from 'svelte/transition'
  import Icon from 'svelte-awesome'
  import arrowRight from 'svelte-awesome/icons/arrow-right'
  import arrowLeft from 'svelte-awesome/icons/arrow-left'
  export let node
  export let level = 0
	
  function toggle() {
    node.expanded = !node.expanded;
  }

  console.log

</script>

<h1>POC</h1>


<li on:click={toggle} style="padding-left:{level*1}rem" transition:slide>
  {#if !node.expanded }
    <Icon data={arrowRight} />
  {:else}
    <Icon data={arrowLeft} />
  {/if}
  {node.data}
</li>

{#if node.expanded && node.children}
    {#each node.children as child}
      <svelte:self node={child} level={level+1}/>
    {/each}
{/if}

<style>
  li {
      border-bottom: solid 1px #eee;
      margin: 0 0;
      padding: 0rem;
      background: #fafafa;
      display: flex;
  }
</style>
