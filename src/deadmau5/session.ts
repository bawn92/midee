import { createSignal } from 'solid-js'
import { type PracticePick, practiceTimes } from './sections'

const [practicePick, setPracticePick] = createSignal<PracticePick | null>(null)
const [practicePasses, setPracticePasses] = createSignal(1)
const [practicePhase, setPracticePhase] = createSignal<'idle' | 'count-in' | 'playing'>('idle')

let countInArmed = false

export { practicePasses, practicePhase, practicePick }

export function setPractice(pick: PracticePick | null): void {
  setPracticePick(pick)
}

export function setPasses(n: number): void {
  setPracticePasses(Math.max(1, n))
}

export function bumpPracticePass(): void {
  setPracticePasses(practicePasses() + 1)
}

export function setPhase(phase: 'idle' | 'count-in' | 'playing'): void {
  setPracticePhase(phase)
}

export function armCountIn(): void {
  countInArmed = true
}

export function disarmCountIn(): void {
  countInArmed = false
}

export function takeCountIn(): boolean {
  const armed = countInArmed
  countInArmed = false
  return armed
}

export function activeSpan(): { start: number; end: number } | null {
  const pick = practicePick()
  if (!pick?.active) return null
  return practiceTimes(pick)
}

export interface Deadmau5Actions {
  openPicker: () => void
  playIds: (ids: string[]) => void
  toggleId: (id: string) => void
  setBars: (startBar: number, endBar: number) => void
  enterLearn: () => void
}

let actions: Deadmau5Actions | null = null

export function bindDeadmau5(next: Deadmau5Actions | null): void {
  actions = next
}

export function deadmau5Actions(): Deadmau5Actions | null {
  return actions
}

export function notifyRoute(): void {
  window.dispatchEvent(new Event('midee-route'))
}
