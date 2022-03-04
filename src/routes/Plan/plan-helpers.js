import { Dragster } from '@transformation-dev/dragster'
import { plan, queueSwimlanes } from '../../stores'

function findDropZoneParent(target) {
  return target.classList.contains('drop-zone') ? target : findDropZoneParent(target.parentNode)
}

function findPracticeParent(target) {
  return target.classList.contains('practice') ? target : findPracticeParent(target.parentNode)
}

let practiceBeingDragged = null

export function dragStart(event) {
  const practiceParent = findPracticeParent(event.target)
  practiceBeingDragged = practiceParent.id
  event.target.style.opacity = 0.5
}

export function dragEnd(event) {
  event.target.style.opacity = ''
}

export function dragEnter(event) {
  // event.preventDefault()
  event.target.classList.add('has-background-grey-lighter')
}

export function dragOver(event) {
  event.preventDefault()
}

export function dragLeave(event) {
  event.target.classList.remove('has-background-grey-lighter')
}

export function drop(event) {
  const dropZoneParent = findDropZoneParent(event.target)
  dropZoneParent.classList.remove('has-background-grey-lighter')
  const queueSwimlaneID = dropZoneParent.getAttribute('queueSwimlaneID')
  const assessedLevel = dropZoneParent.getAttribute('assessedLevel')
  if (queueSwimlaneID && assessedLevel) {
    plan.update((value) => {
      value[practiceBeingDragged].queueSwimlaneID = queueSwimlaneID
      value[practiceBeingDragged].assessedLevel = assessedLevel
      value[practiceBeingDragged].status = 'Doing'
      return value
    })
    Dragster.reset(dropZoneParent)
  }
}

export function dropPan(event, newStatus) {
  const dropZoneParent = findDropZoneParent(event.target)
  let queueSwimlanesCached
  queueSwimlanes.update((value) => {
    queueSwimlanesCached = value
    return value
  })
  dropZoneParent.classList.remove('has-background-grey-lighter')
  plan.update((value) => {
    if (newStatus === 'Doing') {
      value[practiceBeingDragged].queueSwimlaneID = Object.keys(queueSwimlanesCached)[0]
      value[practiceBeingDragged].assessedLevel = 'Words'
    } else {
      value[practiceBeingDragged].queueSwimlaneID = null
      value[practiceBeingDragged].assessedLevel = null
    }
    value[practiceBeingDragged].status = newStatus
    return value
  })
  Dragster.reset(dropZoneParent)
}
