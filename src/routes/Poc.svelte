
<script>

  import SearchableTreePanel from '../components/SearchableTreePanel.svelte'
  import { authorizedTreeStore, chosenOrgBreadcrumbsArrayStore } from '../stores'

  function handleOrgChosen(newBreadcrumbsArray) {
    // Fetch org if different from before
    $chosenOrgBreadcrumbsArrayStore = newBreadcrumbsArray
    console.log("in handleOrgChosen. newBreadcrumbsArray: ", newBreadcrumbsArray)

    // setTimeout(() => {
    //   if ($chosenOrgBreadcrumbsArrayStore.length > 0) {
    //     openBreadcrumbs()
    //   } else {
    //     openTree()
    //   }
    // }, 100)  // Simulates delay to do $authenticated and $connected checks
  }

</script>

<h1>POC</h1>


<SearchableTreePanel tree={$authorizedTreeStore} handleNodeChosen={handleOrgChosen} chosenBreadcrumbsArray={$chosenOrgBreadcrumbsArrayStore} />
