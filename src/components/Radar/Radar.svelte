<script>

  export let teams
  export let levelConfig
  export let assessmentData
  export let disciplines

  export let _logoBackgroundColor = "#FFFFFF"
  export let _logoMainColor = "#808080"
  export let identifyingData = null
  export let title = "MatrX DevSecOps Radar"
  export let subTitle = null
  export let showTitle = true
  export let showSubTitle = true
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
    subTitle = null
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
    subTitle = lookupTeamByID[teamID].label
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

  let viewBoxStartY = (title && showTitle) ? -1 * titleHeight : 0
  let viewBoxHeight = (title && showTitle) ? radarSize + titleHeight : radarSize
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
        row.color = "#666666"
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

    disciplineFontSize = Math.min(disciplineMaxWidth / maxDisciplineWidth, disciplineMaxHeight / maxDisciplineHeight)  
    practiceFontSize = Math.min(disciplineFontSize, practiceMaxWidth / maxPracticeWidth, practiceMaxHeight / maxPracticeHeight)

  })

  function topLevelClick(e) {
    clearHighlight()
  }

</script>


<svelte:options namespace="svg"/>
<!-- <svg version="1.1" on:click="{clearHighlight(event)}" viewBox="0 {viewBoxStartY} {radarSize+sidebarWidth} {viewBoxHeight}" preserveAspectRatio="xMinYMin meet"> -->
<svg version="1.1" on:click={topLevelClick} viewBox="0 {viewBoxStartY} {radarSize+sidebarWidth} {viewBoxHeight}" preserveAspectRatio="xMinYMin meet">

  <!-- Center. Defaults to Transformation.dev Blueprint logo -->
  {#if showLogo}
    <circle cx={centerX} cy={centerY} r={innerRadius} fill={_logoBackgroundColor} />
    <image href="/transformation-logo-large-black-for-on-white.png" height="18" width="18" x={centerX} y={centerY} transform="translate(-9, -9)" />
    <!-- <svg xmlns="http://www.w3.org/2000/svg" x={centerX-innerRadius} y={centerY-innerRadius} width={innerRadius*2} height={innerRadius*2} viewBox="0 0 {innerRadius*2} {innerRadius*2}">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="-50, -50, 398, 215">
        <g id="Layer_1" transform="translate(-156, -244)">
          <path d="M156,291 L156,244 L166,244 L182,266 L197,244 L207,244 L207,292 L197,292 L197,261 L185,277 L178,277 L166,261 L166,292 L156,292 z" fill={_logoMainColor} />
          <path d="M253.871,270 L246.742,270 L250.307,262.094 L253.871,254.188 L257.435,262.094 L261,270 z M257,244 L250,244 L230,292 L238,292 L244,276 L263,276 L270,292 L278,292 z" fill={_logoMainColor}/>
          <path d="M363,265 L363,250 L376,250 C376,250 382,251 382,258 C382,265 377,265 377,265 z M379,270 C379,270 389,270 389,258 C389,246 378,244 378,244 L356,244 L356,292 L363,292 L363,272 L372,272 L386,292 L395,292 z" fill={_logoMainColor}/>
          <path d="M311,292 L318,292 L318,250 L331,250 L331,244 L298,244 L298,250 L311,250 z" fill={_logoMainColor}/>
          <path d="M420,244 L432,244 L440,257 L442,257 L450,244 L462,244 L447,265 L447,267 L464,292 L453,292 L442,275 L440,275 L429,292 L418,292 L435,267 L435,265 z" fill="#298567"/>
          <path d="M225.215,352.083 L207.7,368.998 L190.785,351.482 L208.3,334.567 z" fill="#B8FFE6"/>
          <path d="M402.715,352.083 L385.2,368.998 L368.285,351.482 L385.8,334.567 z" fill="#1F664F"/>
          <path d="M260.715,352.083 L243.2,368.998 L226.285,351.482 L243.8,334.567 z" fill="#86E4C2"/>
          <path d="M296.215,352.083 L278.7,368.998 L261.785,351.482 L279.3,334.567 z" fill="#3DCC9E"/>
          <path d="M331.715,352.083 L314.2,368.998 L297.285,351.482 L314.8,334.567 z" fill="#31A27D"/>
          <path d="M438.215,352.083 L420.7,368.998 L403.785,351.482 L421.3,334.567 z" fill="#154738"/>
          <path d="M367.215,352.083 L349.7,368.998 L332.785,351.482 L350.3,334.567 z" fill="#298567"/>
        </g>
      </svg>
    </svg> -->
  {/if}

  {#if title && showTitle}
    <text text-anchor="middle" x={centerXViewBox} y={-2*titleHeight/4} font-size=5>
      {title}
    </text>
    {#if subTitle && showSubTitle}
      <text text-anchor="middle" x={centerXViewBox} y={-1*titleHeight/8} font-size=3>
        {subTitle}
      </text>
    {/if}
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
      <!--
      on:assessment-mouseover="set({highlightedTeamID: event.assessment.teamID, subTitle: lookupTeamByID[event.assessment.teamID].label})"
      on:assessment-mouseout="set({highlightedTeamID: null, subTitle: null})"
      -->
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
      strokeWidth={strokeWidth * 2}
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
