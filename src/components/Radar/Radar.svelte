<script>

  export let teams
  export let levelConfig
  export let assessmentData
  export let disciplines

  export let _logoBackgroundColor = "#FFFFFF"
  export let identifyingData = null
  export let title = null
  export let subTitle = null
  export let titleHeight = 10
  export let showLogo = true
  export let innerRadius = 10
  export let radarSize = 100  // height and width
  export let sidebarWidth = 60
  export let descriptionsInLegend = true
  export let showSummaryStats = true
  export let practiceStroke = "#999999"
  export let disciplineStroke = "#555555"
  export let strokeWidth = 0.15
  export let baseColor = "#2E8468"
  export let fontColor = "#22644E"
  export let practiceFontSize = 1
  export let disciplineFontSize = 1
  export let highlightedTeamID = null
  export let lockHighlight = false
  export let legendFontColor = "#FFFFFF"
  export let diciplineFontColor = "#184738"

  import sortOn from "sort-on"
  import { onMount } from 'svelte'

  import { nanoid } from "nanoid"
  import { getBackgroundAndTextColor } from "./color-utils"
  import Slice from './Slice.svelte'
  import Arc from './Arc.svelte'
  import Sidebar from './Sidebar.svelte'

  function clearHighlight() {
    lockHighlight = false
    highlightedTeamID = null
    titleAsShown = title
    subTitleAsShown = subTitle
    const event = new CustomEvent('clear-highlight', {
      detail: {identifyingData},
      bubbles: true,
      cancelable: true,
      composed: true, // makes the event jump shadow DOM boundary
    })
    // this.options.target.dispatchEvent(event)
    document.dispatchEvent(event)  // TODO: Figure out how to dispatch to the actual Radar. Line above works in testing but not for Comcast
  }

  function teamHighlight(teamID) {
    titleAsShown = lookupTeamByID[teamID].label
    subTitleAsShown = title
    highlightedTeamID = teamID
    const event = new CustomEvent('team-highlight', {
      detail: {teamID, identifyingData},
      bubbles: true,
      cancelable: true,
      composed: true, // makes the event jump shadow DOM boundary
    })
    // this.options.target.dispatchEvent(event)
    document.dispatchEvent(event)  // TODO: Figure out how to dispatch to the actual Radar. Line above works in testing but not for Comcast
  }

  function assessmentMouseover(e) {
    if (! lockHighlight) {
      teamHighlight(e.detail.assessment.teamID)
    }
  }

  function assessmentMouseout(e) {
    if (! lockHighlight) {
      clearHighlight()
    }
  }

  function assessmentClick(e) {
    // e.detail.originalEvent.stopPropagation()
    const clickedTeamID = e.detail.assessment.teamID
    if (clickedTeamID == highlightedTeamID) {
      lockHighlight = true
    } else {
      clearHighlight()
      teamHighlight(clickedTeamID)
      lockHighlight = true
    }
    const event = new CustomEvent('team-lock', {
      detail: {assessment: e.detail.assessment, identifyingData},
      bubbles: true,
      cancelable: true,
      composed: true, // makes the event jump shadow DOM boundary
    })
    // this.options.target.dispatchEvent(event)
    document.dispatchEvent(event)  // TODO: Figure out how to dispatch to the actual Radar. Line above works in testing but not for Comcast
  }

  function assessmentDblclick(e) {
    e.detail.originalEvent.stopPropagation()
    const event = new CustomEvent('team-practice-drilldown', {
      detail: {assessment: e.detail.assessment, identifyingData},
      bubbles: true,
      cancelable: true,
      composed: true, // makes the event jump shadow DOM boundary
    })
    // this.options.target.dispatchEvent(event)
    document.dispatchEvent(event)  // TODO: Figure out how to dispatch to the actual Radar. Line above works in testing but not for Comcast
  }

  let titleAsShown = title
  let subTitleAsShown = subTitle

  // @ts-ignore
  let viewBoxStartY = (title?.length > 0 || subTitle?.length > 0) ? -1 * titleHeight : 0
  // @ts-ignore
  let viewBoxHeight = (title?.length > 0 || subTitle?.length > 0) ? radarSize + titleHeight : radarSize
  let centerXViewBox = (radarSize + sidebarWidth) / 2
  let centerX = radarSize / 2
  let centerY = radarSize / 2
  let outerRadius = radarSize / 2 - 0.5

  let disciplineBandHeight = 0.07 * radarSize
  let practiceBandHeight = 0.06 * radarSize

  let practiceCount
  let sliceWidth
  let disciplineMaxWidth 
  let practiceMaxWidth
  $: {
    let temp = 0
    for (let discipline of disciplines) {
      for (let practice of discipline.practices) {  // TODO: Couldn't this just be `practiceCount += dicsipline.practices.length`
        temp++
      }
    }
    practiceCount = temp
    sliceWidth = Math.PI * 2 / practiceCount
    disciplineMaxWidth = 0.95 * sliceWidth * (outerRadius - disciplineBandHeight / 2)
    practiceMaxWidth = 0.95 * sliceWidth * (outerRadius - disciplineBandHeight - practiceBandHeight / 2)
  }

  let teamArcStrokeWidth = (teams.length < 15) ? strokeWidth : strokeWidth / (teams.length / 15)

  let disciplineMaxHeight = 0.80 * disciplineBandHeight
  let practiceMaxHeight = 0.80 * practiceBandHeight

  let levelConfigAnnotated
  $: {
    let temp = []
    let baseColorCount = 0
    for (let level of levelConfig) {
      if (! level.color)
        baseColorCount++
    }
    let i = 0
    for (let level of levelConfig) {
      let rawColor = level.color || baseColor
      let alpha = 1
      if (! level.color) {
        alpha = (baseColorCount - i - 1) / (baseColorCount - 1)
      }
      if (! level.description || ! descriptionsInLegend) {
        level.description = ""
      }
      level.color = getBackgroundAndTextColor(rawColor, alpha).bgColor
      level.textColor = getBackgroundAndTextColor(rawColor, alpha).textColor
      level.labelID = nanoid()
      level.descriptionID = nanoid()
      level.levelIndex = i
      temp.push(level)
      i++
    }
    levelConfigAnnotated = temp
  }

  let lookupLevelByID
  $: {
    let lookup = {}
    for (let level of levelConfigAnnotated) {
      lookup[level["_entityID"]] = level
    }
    lookupLevelByID = lookup
  }

  let lookupTeamByID
  $: {
    let lookup = {}
    let i = 0
    for (let team of teams) {
      team.assessmentData = []
      team.teamIndex = i
      lookup[team["_entityID"]] = team
      i++
    }
    lookupTeamByID = lookup
  }

  let lookupPracticeByID
  $: {
    let lookup = {}
    for (let discipline of disciplines) {
      for (let practice of discipline.practices) {
        lookup[practice["_entityID"]] = practice
      }
    }
    lookupPracticeByID = lookup
  }

  let disciplinesAnnotated
  $: {
    let temp = disciplines  // TODO: Maybe I should make a deep copy because this actually modifies the disciplines
    let currentAngle = 0

    for (let discipline of disciplines) {
      discipline.id = nanoid()
      discipline.startRadians = currentAngle
      for (let practice of discipline.practices) {
        practice.assessmentData = []
        lookupPracticeByID[practice["_entityID"]] = practice
        practice.id = nanoid()
        practice.startRadians = currentAngle
        currentAngle += sliceWidth
        practice.endRadians = currentAngle
      }
      discipline.endRadians = currentAngle
    }

    // Populate assessmentData inside each practice and team
    for (let row of assessmentData) {
      let level = lookupLevelByID[row.levelID]
      row.levelIndex = level.levelIndex
      if (! highlightedTeamID || row.teamID === highlightedTeamID) {
        row.color = level.color
      } else {
        row.color = "#333333"
      }
      row.opacity = 1
      let team = lookupTeamByID[row.teamID]
      row.teamIndex = team.teamIndex
      let practice = lookupPracticeByID[row.practiceID]
      if (practice) {
        practice.assessmentData.push(row)
        team.assessmentData.push(row)
      }
    }
    // Sort the assessmentData levelIndex and then teamIndex. Calculate inner and outer radius for each assessmentData row.
    for (let practiceID in lookupPracticeByID) {
      let practice = lookupPracticeByID[practiceID]
      practice.assessmentData = sortOn(practice.assessmentData, ['levelIndex', 'teamIndex'])
      let r = innerRadius
      let arcHeight = (outerRadius - practiceBandHeight - disciplineBandHeight - innerRadius) / practice.assessmentData.length
      for (let row of practice.assessmentData) {
        row.innerRadius = r
        row.outerRadius = r + arcHeight
        r += arcHeight
      }

    }
    disciplinesAnnotated = temp
  }

  let percentages
  $: {
    let temp = {}
    for (let levelID in lookupLevelByID) {
      temp[levelID] = {count: 0}
    }
    let data
    if (highlightedTeamID) {
      data = assessmentData.filter((row) => (row.teamID == highlightedTeamID) ? true : false)
    } else {
      data = assessmentData
    }
    let total = 0
    for (let row of data) {
      if (lookupPracticeByID[row.practiceID]) {
        temp[row.levelID].count++
        total++
      }
    }
    for (let levelID in temp) {
      temp[levelID].percentage = Math.round(100 * temp[levelID].count / total)
    }
    percentages = temp
  }

  let stats
  $: {
    let notAssessedCount = 0
    let partiallyAsssessedCount = 0
    let fullyAssessedCount = 0

    for (let team of teams) {
      let assessedCount = 0
      for (let row of team.assessmentData) {
        if (! lookupLevelByID[row.levelID].considerNotAssessed) {
          assessedCount++
        }
      }
      team.assessedCount = assessedCount
      if (assessedCount == 0) {
        notAssessedCount++
      } else if (assessedCount < practiceCount) {
        partiallyAsssessedCount++
      } else {
        fullyAssessedCount++
      }
    }
    stats = [ 
      {label: `${teams.length} teams identified`, id: "stat1"},
      {label: `${fullyAssessedCount} (${Math.round(100*fullyAssessedCount/teams.length)}%) fully assessed`, id: "stat2"},
      {label: `${partiallyAsssessedCount} (${Math.round(100*partiallyAsssessedCount/teams.length)}%) partially assessed`, id: "stat3"},
      {label: `${notAssessedCount} (${Math.round(100*notAssessedCount/teams.length)}%) not assessed`, id: "stat4"},
    ]
  }

  onMount(() => {
    let maxPracticeWidth = 0
    let maxPracticeHeight = 0
    let maxDisciplineWidth = 0
    let maxDisciplineHeight = 0

    for (let discipline of disciplinesAnnotated) {
      // @ts-ignore
      maxDisciplineWidth = Math.max(maxDisciplineWidth, document.getElementById(discipline.id).getBBox().width)
      // @ts-ignore
      maxDisciplineHeight = Math.max(maxDisciplineHeight, document.getElementById(discipline.id).getBBox().height)
      for (let practice of discipline.practices) {
        // @ts-ignore
        maxPracticeWidth = Math.max(maxPracticeWidth, document.getElementById(practice.id).getBBox().width)
        // @ts-ignore
        maxPracticeHeight = Math.max(maxPracticeHeight, document.getElementById(practice.id).getBBox().height)
      }
    }

    const margin = 0.05  // Leave this much of the space unused
    const multiplier = 1 + margin
    maxPracticeWidth *= multiplier
    maxPracticeHeight *= multiplier
    maxDisciplineWidth *= multiplier
    maxDisciplineHeight *= multiplier

    disciplineFontSize = Math.min(disciplineMaxWidth / maxDisciplineWidth, disciplineMaxHeight / maxDisciplineHeight)  
    practiceFontSize = Math.min(disciplineFontSize, practiceMaxWidth / maxPracticeWidth, practiceMaxHeight / maxPracticeHeight)

  })

</script>


<svelte:options namespace="svg"/>
<svg version="1.1" on:click={clearHighlight} viewBox="0 {viewBoxStartY} {radarSize+sidebarWidth} {viewBoxHeight}" preserveAspectRatio="xMinYMin meet">

  <!-- Transformation.dev Blueprint logo -->
  {#if showLogo}
    <circle cx={centerX} cy={centerY} r={innerRadius} fill={_logoBackgroundColor} />
    <image 
      href="/transformation-logo-large-black-for-on-white.png"
      height={innerRadius * 1.8} width={innerRadius * 1.8} 
      x={centerX} y={centerY}
      transform="translate({innerRadius * -0.9}, {innerRadius * -0.9})"
    />
  {/if}

  {#if titleAsShown}
    <text text-anchor="middle" x={centerXViewBox} y={-2*titleHeight/4} font-size=5>
      {titleAsShown}
    </text>
  {/if}
  {#if subTitleAsShown}
    <text text-anchor="middle" x={centerXViewBox} y={-1*titleHeight/8} font-size=3>
      {subTitleAsShown}
    </text>
  {/if}

  {#each disciplinesAnnotated as discipline}
    <!-- Discipline labels for measuring scale -->
    <text dy="-100" id={discipline.id} font-size={disciplineFontSize}>
      {discipline.label}
    </text>

    {#each discipline.practices as practice}
      <!-- Practice labels for measuring scale -->
      <text dy="-100" id={practice.id} font-size={practiceFontSize}>
        {practice.label}
      </text>

      <!-- Slices -->
      <Slice
        on:assessment-mouseover={assessmentMouseover}
        on:assessment-mouseout={assessmentMouseout}
        on:assessment-click={assessmentClick}
        on:assessment-dblclick={assessmentDblclick}
        centerX={centerX}
        centerY={centerY}
        startRadians={practice.startRadians}
        endRadians={practice.endRadians}
        innerRadius={innerRadius}
        outerRadius={outerRadius-disciplineBandHeight}
        assessmentData={practice.assessmentData}
        label={practice.label}
        description={practice.description}
        labelBandHeight={practiceBandHeight}
        stroke={practiceStroke}
        strokeWidth={strokeWidth}
        teamArcStrokeWidth={teamArcStrokeWidth}
        fontColor={fontColor}
        fontSize={practiceFontSize}
      />
    {/each}

    <!-- Discipline Label -->
    <Arc
      centerX={centerX}
      centerY={centerY}
      startRadians={discipline.startRadians}
      endRadians={discipline.endRadians}
      innerRadius={outerRadius-disciplineBandHeight}
      outerRadius={outerRadius}
      fill="#FFFFFF"
      strokeWidth={strokeWidth}
      stroke={disciplineStroke}
      label={discipline.label}
      description={discipline.description}
      fontColor={diciplineFontColor}
      fontSize={disciplineFontSize}
    />

    <!-- Dicipline Area Arc -->
    <Arc
      centerX={centerX}
      centerY={centerY}
      startRadians={discipline.startRadians}
      endRadians={discipline.endRadians}
      outerRadius={outerRadius} {innerRadius}
      fill="none"
      strokeWidth={strokeWidth * 2}
      stroke={disciplineStroke}
    />

  {/each}

  <Sidebar
    levelConfigAnnotated={levelConfigAnnotated}
    percentages={percentages}
    maxFontSize={disciplineFontSize}
    legendFontColor={legendFontColor}
    sidebarWidth={sidebarWidth}
    radarSize={radarSize}
    descriptionsInLegend={descriptionsInLegend}
    stats={stats}
    showSummaryStats={showSummaryStats}
  />

</svg>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@300&display=swap');

  text {
    font-family: 'Roboto Condensed', sans-serif;
    font-weight: 300;
    letter-spacing: 0;
  }
</style>
