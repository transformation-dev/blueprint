
<script>

import Radar from '../components/Radar/Radar.svelte'

const radarProps = {
    identifyingData: {you: 'can put anything here to be returned on events'},
    // baseColor: "#AA0000",  // Default is MatrX green
    // goalColor: "#AA0000",
    // showLogo: false,
    title: "Radar for <my sample org>",
    // radarSize: 150,
    // sidebarWidth: 40,
    showSummaryStats: false,
    // descriptionsInLegend: false,  // Default is true
    levelConfig: [
      // levelConfig[0]  is the "best" level, closest to center, and baseColor
      {_entityID: "level0", label: "Culture", description: "We have fully adopted this practice"},
      // Other levels without a color will be a gradient of the baseColor
      {_entityID: "level1", label: "Actions", description: "We’re in the process of adopting this practice"},
      {_entityID: "level2", label: "Words", description: "We’re making plans to adopt this practice"},
      // The last index without a color will be white
      {_entityID: "level3", label: "Thoughts", description: "We do not have plans for this practice"},
      // You can specify a color for any of the levels, useful for NA or the like. Must come after baseColor-derived levels
      {_entityID: "level4", considerNotAssessed: true, label: "Unknown", description: "Unassessed or Needs follow up", color: "#A0C5DA"},
      // excludeFromGoal values must all be at the end
      {_entityID: "level5", excludeFromGoal: true, label: "Trade-off", description: "This practice is not worth it in this context", color: "#CCCCCC"},
    ],
    teams: [
      {_entityID: "Team0", label: "The Seven Dwarves"},
      {_entityID: "Team1", label: "The Smurfs"},
      {_entityID: "Team2", label: "3 Blind Mice"},
      {_entityID: "Team3", label: "Jedi council"},
    ],
    assessmentData: [
      {teamID: "Team0", practiceID: "practice0", levelID: "level0"},
      {teamID: "Team0", practiceID: "practice1", levelID: "level1"},
      {teamID: "Team0", practiceID: "practice2", levelID: "level2"},
      {teamID: "Team0", practiceID: "practice3", levelID: "level3"},
      {teamID: "Team0", practiceID: "practice4", levelID: "level5"},
      {teamID: "Team0", practiceID: "notInFormulation", levelID: "level0"},
      {teamID: "Team1", practiceID: "practice0", levelID: "level1"},
      {teamID: "Team1", practiceID: "practice1", levelID: "level0"},
      {teamID: "Team1", practiceID: "practice2", levelID: "level2"},
      {teamID: "Team1", practiceID: "practice3", levelID: "level3"},
      {teamID: "Team1", practiceID: "practice4", levelID: "level4"},
      {teamID: "Team1", practiceID: "notInFormulation", levelID: "level0"},
      {teamID: "Team2", practiceID: "practice0", levelID: "level1"},
      {teamID: "Team2", practiceID: "practice1", levelID: "level0"},
      {teamID: "Team2", practiceID: "practice2", levelID: "level0"},
      {teamID: "Team2", practiceID: "practice3", levelID: "level2"},
      {teamID: "Team2", practiceID: "practice4", levelID: "level4"},
      {teamID: "Team2", practiceID: "notInFormulation", levelID: "level0"},
      {teamID: "Team3", practiceID: "practice0", levelID: "level4"},
      {teamID: "Team3", practiceID: "practice1", levelID: "level4"},
      {teamID: "Team3", practiceID: "practice2", levelID: "level4"},
      {teamID: "Team3", practiceID: "practice3", levelID: "level4"},
      {teamID: "Team3", practiceID: "practice4", levelID: "level4"},
    ],
    disciplines: [
      {
        label: "Artisanship",
        description: "(aka Training)",
        practices: [
          {
            _entityID: "practice0",
            label: "Yellow Belt",
            description: "100% of group members... Yellow Belt training",
            goal: {
              label: "2018Q1",
            },
          },
        ]
      },
      {
        label: "Independent Security Assessment",
        practices: [
          {
            _entityID: "practice1",
            label: "Pen Testing",
            description: "blah blah\nsecond line",
            goal: {
              label: "2019Q2",
            },
          },
        ]
      },
      {
        label: "Architecture & Design",
        practices: [
          {
            _entityID: "practice2",
            label: "Threat Modeling or SAR",
            description: "blah blah",
          },
        ]
      },
      {
        label: "DevSecOps Tools",
        practices: [
          {
            _entityID: "practice3",
            label: "Analysis for Code Included",
            description: "blah, blah",
            goal: {
              percentage: 0.666667,  // Example of showing an 80% goal. However, this is rarely used now that we can set excludeFromGoal in levelConfig
              label: "2019Q4",
            },
          },
          {
            _entityID: "practice4",
            label: "Analysis for Code Written",
            description: "blah, blah",
            goal: {
              label: "2019Q4",
            },
          },
        ]
      },
    ]
  }

</script>

<Radar {...radarProps} />

