
<script>

  export let tree
  export let showAll
  export let openAllShown
  export let handleNodeChosen  // Using a callback because the event approach was ugly with the recursion 
  export let chosenBreadcrumbsArray
  export let parentBreadcrumbsArray = []

  function clickTreeNode(e, node) {
    // var $ = f7.$
    // if ($(e.target).is('.treeview-toggle')) return
    handleNodeChosen(getNewBreadcrumbsArray(parentBreadcrumbsArray, node))
  }

  function getNewBreadcrumbsArray(breadcrumbsArray, node) {
    const newArray = [...breadcrumbsArray]
    newArray.push(node)
    return newArray
  }

  function breadcrumbsEqual(a, b) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id) return false
    }
    return true
  }

  import { slide } from 'svelte/transition'
  import Icon from 'svelte-awesome'
  import arrowRight from 'svelte-awesome/icons/arrow-right'
  import arrowLeft from 'svelte-awesome/icons/arrow-left'

  // export let level = 0
	
  function toggle() {
    // node.expanded = !node.expanded
    console.log('got toggle')
  }

  console.log

</script>

{#each tree as node}
  {#if node.show || showAll}
    {#if node.children?.length > 0}
      <!-- <TreeviewItem selectable selected={node.highlight} opened={node.show && openAllShown} onClick={(e) => clickTreeNode(e, node)}> -->
      <li on:click={toggle} style="padding-left:{parentBreadcrumbsArray.length * 1}rem" transition:slide>
        <div 
          class:chosen={breadcrumbsEqual(chosenBreadcrumbsArray, getNewBreadcrumbsArray(parentBreadcrumbsArray, node))} 
        >
          {@html node.label}
        </div>
        <svelte:self 
          tree={node.children}         
          handleNodeChosen={handleNodeChosen}
          chosenBreadcrumbsArray={chosenBreadcrumbsArray}
          showAll={showAll}
          openAllShown={openAllShown}
          parentBreadcrumbsArray = {getNewBreadcrumbsArray(parentBreadcrumbsArray, node)}
        />
      </li>
    {:else}
      <!-- <TreeviewItem selectable selected={node.highlight} onClick={(e) => clickTreeNode(e, node)}> -->
      <li on:click={toggle} style="padding-left:{parentBreadcrumbsArray.length * 1}rem" transition:slide>
        <div 
          class:chosen={breadcrumbsEqual(chosenBreadcrumbsArray, getNewBreadcrumbsArray(parentBreadcrumbsArray, node))} 
        >
          {@html node.label}
        </div>
      </li>
    {/if}
  {/if}
{/each}

<style>
  .chosen {
    color: var(--blueprint-light-blue);
  }
</style>

<!--
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

-->