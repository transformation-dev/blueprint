<script>
  import { f7, TreeviewItem } from 'framework7-svelte'

  export let tree
  export let showAll
  export let openAllShown
  export let handleNodeChosen  // Using a callback because the event approach was ugly with the recursion 
  export let chosenBreadcrumbsArray
  export let parentBreadcrumbsArray = []

  function clickTreeNode(e, node) {
    var $ = f7.$
    if ($(e.target).is('.treeview-toggle')) return
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

</script>

{#each tree as node}
  {#if node.show || showAll}
    {#if node.children?.length > 0}
      <TreeviewItem selectable selected={node.highlight} opened={node.show && openAllShown} onClick={(e) => clickTreeNode(e, node)}>
        <div 
          slot="label" 
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
      </TreeviewItem>
    {:else}
      <TreeviewItem selectable selected={node.highlight} onClick={(e) => clickTreeNode(e, node)}>
        <div 
          slot="label" 
          class:chosen={breadcrumbsEqual(chosenBreadcrumbsArray, getNewBreadcrumbsArray(parentBreadcrumbsArray, node))} 
        >
          {@html node.label}
        </div>
      </TreeviewItem>
    {/if}
  {/if}
{/each}

<style>
  .chosen {
    color: var(--blueprint-light-blue);
  }
</style>
