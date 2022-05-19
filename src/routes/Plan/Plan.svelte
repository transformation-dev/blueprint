
<script>

  import Debug from "debug"
  const debug = Debug("blueprint:Plan")  // Don't forget to set environment variable with 'DEBUG=blueprint:*' and localStorage with debug='blueprint:*'
  
  // Import packages
  import {ViewstateStore} from '@transformation-dev/svelte-viewstate-store' 
  import {fly} from 'svelte/transition'
  import Icon from 'svelte-awesome'
  import arrowCircleLeft from 'svelte-awesome/icons/arrow-circle-left'
  import arrowCircleRight from 'svelte-awesome/icons/arrow-circle-right'
  import spinner from 'svelte-awesome/icons/spinner'

  // Import local code
  import {addDragster} from '../../stores'
  import {dropPan, dragOver} from './plan-helpers'
  import FormulationGrid from './FormulationGrid.svelte'
  import DoingKanban from './DoingKanban.svelte'
  import PracticeEditor from './PracticeEditor.svelte'

  const slides = [
    {label: 'Todo'},
    {label: 'Doing'},
    {label: 'Done'},
  ]

  const NUMBER_OF_SLIDES = slides.length
  const startOn = new ViewstateStore({
    identifier: 'startOn', 
    type: 'Int', 
    defaultValue: 0
  })
  const slidesToDisplay = new ViewstateStore({
    identifier: 'slidesToDisplay', 
    type: 'Int', 
    defaultValue: 1, 
    updateLocalStorageOnURLChange: true
  })
  let endOn
  $: {
    $startOn = Math.min($startOn, NUMBER_OF_SLIDES - $slidesToDisplay)
    endOn = $startOn + $slidesToDisplay - 1
  }

  let panTimer = null
  let inX = 1000
  let outX = -1000
  const duration = 125

  function panLeft() {
    startOn.update((value) => {  // Leaving as an update to exercise ViewstateStore.update
      debug('panLeft update. value: %O', value)
      const newValue = Math.max(0, value - 1)
      debug('panLeft update. newValue: %O', newValue)
      return newValue
    })
    panTimer = null
    inX = -1000
    outX = 1000
  }

  function panRight() {
    // startOn.update((value) => {  // More readable version below
    //   debug('panRight update. value: %O', value)
    //   const newValue = Math.min(NUMBER_OF_SLIDES - 1, value + 1)
    //   debug('panRight update. newValue: %O', newValue)
    //   return newValue
    // })
    $startOn = Math.min(NUMBER_OF_SLIDES - 1, $startOn + 1)  // More readable version
    panTimer = null
    inX = 1000
    outX = -1000
  }

  function startPanTimer(event) {
    event.target.classList.add('has-background-grey-lighter')
    if (event.target.id === "pan-right") {
      panTimer = setTimeout(panRight, 1000)
    } else if (event.target.id === "pan-left") {
      panTimer = setTimeout(panLeft, 1000)
    }
  }

  function clearPanTimer(event) {
    event.target.classList.remove('has-background-grey-lighter')
    clearTimeout(panTimer)
    panTimer = null
  }

  function dropLeft(event) {
    clearPanTimer(event)
    dropPan(event, slides[$startOn - 1].label)
  }

  function dropRight(event) {
    clearPanTimer(event)
    dropPan(event, slides[$startOn + 1].label)
  }

</script>


<div class="columns has-background-primary">
  {#if $startOn > 0}
    <div id="pan-left" use:addDragster in:fly={{x: inX, duration}} out:fly={{x: outX, duration}} class="column drop-zone is-narrow has-text-centered" on:click={panLeft} on:drop={dropLeft} on:dragster-enter={startPanTimer} on:dragster-leave={clearPanTimer} on:dragover={dragOver}>
      {#if panTimer}
        <Icon data={spinner} pulse scale="1.75" style="fill: white; padding: 5px"/>
      {:else}
        <Icon data={arrowCircleLeft} scale="1.75" style="fill: white; padding: 5px"/>
      {/if}
      <div class="rotate-left has-text-centered has-text-white">{slides[$startOn - 1].label}&nbsp;&nbsp;&nbsp;</div>
    </div>
  {/if}

  {#if $startOn <= 0 &&  endOn >= 0}
    <div id="todo-formulation-grid" in:fly={{x: inX, duration}} out:fly={{x: outX, duration}} class="column has-text-centered has-background-info">
      <FormulationGrid slideLabel={slides[0].label} />
    </div>
  {/if}

  {#if $startOn <= 1 && endOn >= 1}
    <div in:fly={{x: inX, duration}} out:fly={{x: outX, duration}} class="column has-text-centered has-background-primary">
      <DoingKanban />
    </div>
  {/if}

  {#if $startOn <= 2 &&  endOn >= 2}
    <div in:fly={{x: inX, duration}} out:fly={{x: outX, duration}} class="column has-text-centered has-background-info">
      <FormulationGrid slideLabel={slides[2].label} />
    </div>
  {/if}

  {#if endOn < NUMBER_OF_SLIDES - 1}
    <div id="pan-right" use:addDragster in:fly={{x: inX, duration}} out:fly={{x: outX, duration}} on:click={panRight} on:drop={dropRight} on:dragster-enter={startPanTimer} on:dragster-leave={clearPanTimer} on:dragover={dragOver} class="column drop-zone is-narrow has-text-centered">
      {#if panTimer}
        <Icon data={spinner} pulse scale="1.75" style="fill: white; padding: 5px"/>
      {:else}
        <Icon data={arrowCircleRight} scale="1.75" style="fill: white; padding: 5px"/>
      {/if}
      <div class="rotate-right has-text-centered has-text-white">&nbsp;&nbsp;&nbsp;{slides[$startOn + 1].label}</div>
    </div>
  {/if}
</div>

<PracticeEditor />


<style>
  .rotate-left {
    transform: rotate(-90deg);
  }
  .rotate-right {
    transform: rotate(90deg);
  }
</style>