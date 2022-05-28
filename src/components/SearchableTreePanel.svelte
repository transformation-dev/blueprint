
<script>
  
  export let tree
  // export let handleNodeChosen  // Using a callback because the event approach was ugly with the recursion TODO: Consider switching this to a store now that this contains both expanded and collapsed modes
  export let chosenBreadcrumbsArrayStore

  import RecursiveTreeNode from './RecursiveTreeNode.svelte'
  import BreadcrumbsPanel from './BreadcrumbsPanel.svelte'

  // @ts-ignore
  import structuredClone from '@ungap/structured-clone'  // TODO: Remove this polyfill when it'll pass tests in GitHub Actions
  import chevronLeft from 'svelte-awesome/icons/chevron-left'
  import close from 'svelte-awesome/icons/close'
  import Icon from 'svelte-awesome'
  import { tick } from 'svelte'

  function highlightSearchText(node, searchString) {
    if (searchString.length === 0 || node.alreadyHighlighted) return
    node.labelHighlighted = node.label.replace(new RegExp(searchString, 'gi'), '<strong>$&</strong>')
    node.alreadyHighlighted = true
  }
  
  function showNodeAndAncestors(node) {
    if (node) {
      node.show = true
      if (node.parents) {
        for (let parent of node.parents) {
          showNodeAndAncestors(parent)
        }
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

  let minimumPanelHeight = 500
  function updatePanelHeight() {
    minimumPanelHeight = Math.max(500, document.getElementById('hidden-breadcrumbs-box')?.getBoundingClientRect()?.width + 40)
  }

  function collapseAllNodes(tree) {
    for (const node of tree) {
      node.show = false
      if (node.children) collapseAllNodes(node.children)
    }  
  }

  let panelCollapsed = false
  async function collapsePanel() {
    searchString = ''
    panelCollapsed = true
    await tick()
    updatePanelHeight()
  }

  function expandPanel() {
    collapseAllNodes(preparedTree)
    showNodeAndAncestors($chosenBreadcrumbsArrayStore[$chosenBreadcrumbsArrayStore.length - 1])
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
  <div class='breadcrumbs-panel' style="min-height: {minimumPanelHeight}px;" on:click={expandPanel} >
    <BreadcrumbsPanel handleNodeChosen={handleNodeChosen} chosenBreadcrumbsArray={$chosenBreadcrumbsArrayStore} hidden />
    <BreadcrumbsPanel handleNodeChosen={handleNodeChosen} chosenBreadcrumbsArray={$chosenBreadcrumbsArrayStore} />
  </div>

{:else}

  <!-- Tree panel -->
  <div class='flex flex-column tree-panel' style="min-height: {minimumPanelHeight}px;">

    <!-- Search bar -->
    <div id="search-bar" class="flex flex-row items-center">
      <div id="search-bubble" class="mis8 mbs8 mbe8 flex flex-fill items-center">
        <input id="search-input" type="text" class="flex-fill p4 pis8" placeholder="Search" bind:value={searchString} />
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
    cursor: pointer;
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
