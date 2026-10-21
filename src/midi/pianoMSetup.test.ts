import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyPianoMInputPitch,
  decideInputOffset,
  lightResultFor,
  orderAfterLightAnswer,
  pianoMDeviceKey,
  resetPianoMSetupForTests,
  savePianoMSetup,
} from './pianoMSetup'

beforeEach(() => {
  localStorage.clear()
  resetPianoMSetupForTests()
})

describe('Piano M board setup', () => {
  it('adds 24 when two ports play the same notes', () => {
    const decision = decideInputOffset(
      { portId: 'in-a', portName: 'LUMI Keys BLOCK', note: 62 },
      { portId: 'in-b', portName: 'LUMI Keys BLOCK', note: 64 },
    )
    expect(decision).toMatchObject({
      samePort: false,
      inputOffset: 24,
      alreadyOffset: false,
      clusteredWithoutOffset: false,
    })
  })

  it('leaves the offset alone when the right port is already two octaves up', () => {
    expect(
      decideInputOffset(
        { portId: 'in-a', portName: 'L', note: 60 },
        { portId: 'in-b', portName: 'R', note: 84 },
      ).inputOffset,
    ).toBe(0)
  })

  it('explains a cluster when one port sends the same notes', () => {
    expect(
      decideInputOffset(
        { portId: 'in-a', portName: 'LUMI Keys BLOCK', note: 60 },
        { portId: 'in-a', portName: 'LUMI Keys BLOCK', note: 67 },
      ),
    ).toMatchObject({ samePort: true, inputOffset: 0, clusteredWithoutOffset: true })
  })

  it('remembers a +24 map for the right port of a device', () => {
    const key = pianoMDeviceKey(['in-b', 'in-a'])
    savePianoMSetup({
      deviceKey: key,
      leftInputId: 'in-a',
      rightInputId: 'in-b',
      leftOutputId: 'out-a',
      rightOutputId: 'out-b',
      leftNote: 60,
      rightNote: 60,
      confirmLeft: 60,
      confirmRight: 84,
      samePort: false,
      inputOffset: 24,
      leftLight: 'yes',
      rightLight: 'yes',
      lightResult: 'ports',
      completed: true,
    })
    expect(applyPianoMInputPitch('in-b', 60)).toBe(84)
    expect(applyPianoMInputPitch('in-a', 60)).toBe(60)
    expect(applyPianoMInputPitch('in-b', 110)).toBe(127)
  })

  it('moves the port that lit the other board', () => {
    expect(orderAfterLightAnswer(['out-a', 'out-b'], 'out-a', 'swapped', 'left')).toEqual([
      'out-b',
      'out-a',
    ])
    expect(orderAfterLightAnswer(['out-b', 'out-a'], 'out-b', 'swapped', 'right')).toEqual([
      'out-b',
      'out-a',
    ])
    expect(orderAfterLightAnswer(['out-a', 'out-b'], 'out-a', 'both', 'left')).toEqual([
      'out-a',
      'out-b',
    ])
    expect(lightResultFor(['yes', 'both'])).toBe('files')
    expect(lightResultFor(['yes', 'yes'])).toBe('ports')
    expect(lightResultFor(['none', 'yes'])).toBe('files')
  })
})
