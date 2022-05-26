
<script>
  
  export let tree
  // export let handleNodeChosen  // Using a callback because the event approach was ugly with the recursion TODO: Consider switching this to a store now that this contains both expanded and collapsed modes
  export let chosenBreadcrumbsArrayStore

  import RecursiveTreeNode from './RecursiveTreeNode.svelte'

  // @ts-ignore
  import structuredClone from '@ungap/structured-clone'  // TODO: Remove this polyfill when it'll pass tests in GitHub Actions
  import chevronLeft from 'svelte-awesome/icons/chevron-left'
  import chevronRight from 'svelte-awesome/icons/chevron-right'
  import close from 'svelte-awesome/icons/close'
  import Icon from 'svelte-awesome'

  function highlightSearchText(node, searchString) {
    if (searchString.length === 0 || node.alreadyHighlighted) return
    node.label = node.label.replace(new RegExp(searchString, 'gi'), '<strong>$&</strong>')
    node.alreadyHighlighted = true
  }
  
  function showNodeAndAncestors(node) {
    node.show = true
    if (node.parents) {
      for (let parent of node.parents) {
        showNodeAndAncestors(parent)
      }
    }
  }

  function highlightNode(node) {
    foundCount++
    node.highlight = true
    highlightSearchText(node, searchString)
    showNodeAndAncestors(node)
  }

  function markTree(tree, searchString) {
    for (const node of tree) {
      if (searchString?.length > 0 && node.label.toLowerCase().includes(searchString)) highlightNode(node)  // TODO: Allow specification of multiple fields to search
      if (node.children && node.children.length > 0) {
        markTree(node.children, searchString)
      }
    }
  }

  function stitchParents(tree, parent = null) { // TODO: Upgrade this to work with a DAG
    for (const node of tree) {
      if (parent) {
        if (node.parents) {
          node.parents.push(parent)
        } else {
          node.parents = [parent]
        }
      }
      if (node.children) stitchParents(node.children, node)
    }    
  }

  let panelCollapsed = false
  function collapsePanel() {
    panelCollapsed = true
  }
  function expandPanel() {
    panelCollapsed = false
  }

  let searchString = ''
  function clearSearch() {
    searchString = ''
  }

  let treeCopy
  let preparedTree
  let showAll = true
  let openAllShown = true
  let foundCount = 0
  $: {
    searchString = searchString.toLowerCase()
    foundCount = 0
    showAll = (! searchString || searchString.length === 0)
    // @ts-ignore
    treeCopy = structuredClone(tree)  // Works with circular references which means it should also work with a DAG
    stitchParents(treeCopy, null)  // TODO: Store it with parents already stitched
    markTree(treeCopy, searchString)
    openAllShown = foundCount < 40
    preparedTree = treeCopy
    
  }

  function handleNodeChosen(breadcrumbsArray) {
    $chosenBreadcrumbsArrayStore = breadcrumbsArray
    collapsePanel()
  }

</script>


{#if panelCollapsed}

  <!-- Breadcrumbs panel -->
  <div class='breadcrumbs-panel' on:click={expandPanel}>
    <div class="rotated">
      <div class="breadcrumbs">
        {#each $chosenBreadcrumbsArrayStore as node}
          {#if $chosenBreadcrumbsArrayStore.indexOf(node) < $chosenBreadcrumbsArrayStore.length - 1}
            <span on:click={(e) => {
              handleNodeChosen($chosenBreadcrumbsArrayStore.slice(0, $chosenBreadcrumbsArrayStore.indexOf(node) + 1))
            }}>
              {node.label}
            </span>
            <!-- <Icon scale={0.7} data={chevronRight} /> -->
            <span class="breadcrumb-separator"> > </span>
          {:else}
            &nbsp;
          {/if}
        {/each}
      </div>
      <div class="breadcrumb-name">
        {$chosenBreadcrumbsArrayStore.length > 0 ? $chosenBreadcrumbsArrayStore[$chosenBreadcrumbsArrayStore.length - 1].label : ''}
      </div>

    </div>
  </div>

{:else}

  <!-- Tree panel -->
  <div class='flex flex-column tree-panel'>

    <!-- Search bar -->
    <div id="search-bar" class="flex flex-row items-center">
      <div id="search-bubble" class="mis8 mbs8 mbe8 flex flex-fill items-center">
        <input id="search-input" type="text" class="input input-rounded dark flex-fill p4 pis8" placeholder="Search" bind:value={searchString} />
        <button id="collapse-tree" on:click={clearSearch} class="flex inherit-colors">
          <Icon data={close} class="m8" />
        </button>
      </div>
      <button id="collapse-tree" on:click={(e) => collapsePanel()} class="flex inherit-colors">
        <Icon scale={1.0} data={chevronLeft} class="m8" />
      </button>
    </div>

    <!-- Tree -->
    <!-- Using a callback because an event is ugly with the recursion, and a store only updates if the user selects a different node  -->
    <div class="m8">
      <RecursiveTreeNode
        tree={preparedTree}
        showAll={showAll}
        openAllShown={openAllShown}
        handleNodeChosen={handleNodeChosen}
        chosenBreadcrumbsArray={$chosenBreadcrumbsArrayStore}
      />
    </div>

  </div>

{/if}


<style>

  .tree-panel {
    /* padding: 0px; */
    background-color: var(--agnostic-dark);
    color: var(--agnostic-primary-light);
    min-width: 400px;
  }

  .breadcrumbs-panel {
    background-color: var(--agnostic-dark);
    color: var(--agnostic-primary-light);
    width: 56px; 
  }

  .rotated { 
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    width: 100%;
    min-width: 500px;
    transform: rotate(90deg) translate(-20px, 0px);
    transform-origin: 8px 100%;
  }

  .breadcrumb-name {
    font-size: 1.1rem;
  }

  .breadcrumbs {
    font-size: .7rem;
  }

  .breadcrumb-separator {
    font-weight: 800;
    margin-left: 6px;
    margin-right: 6px;
  }

  #search-bar {
    background-color: var(--agnostic-gray-dark);
  }

  #search-bubble {
    background-color:var(--agnostic-gray-mid-dark);
  }

  #search-input {
    margin-top: 0px;
    background-color:var(--agnostic-gray-mid-dark);
    border-radius: 4px;
    color: var(--agnostic-primary-light);
  }

  #collapse-tree {
    color: var(--agnostic-primary-light);
    background-color: inherit;
    border: 0px;
  }

</style>
