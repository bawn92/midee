import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = readFileSync(
  resolve(import.meta.dirname, '../../public/piano-m-theme-lights.littlefoot'),
  'utf8',
)

describe('Piano M littlefoot script', () => {
  it('keeps hand colours on channels 12 and 13 and one shared lowest note', () => {
    expect(script).toContain('const int keysPerBlock = 24')
    expect(script).toContain('channel == 11')
    expect(script).toContain('channel == 12')
    expect(script).toContain('byte1 == 23')
  })

  it('derives the board index from the DNA grid and stays dark when that index is unknown', () => {
    expect(script).toContain('setClusteringActive(true)')
    expect(script).toContain('getClusterXpos()')
    expect(script).toContain('getClusterWidth()')
    expect(script).toContain('getHorizontalDistFromMaster()')
    expect(script).toContain('isMasterBlock()')
    expect(script).toContain('return -1')
    expect(script).toContain('xpos / unit')
  })

  it('saves a manual board index and the light mode on the board', () => {
    expect(script).toContain('setLocalConfig(configIndex, savedIndex)')
    expect(script).toContain('setLocalConfig(configMode, lightMode)')
    expect(script).toContain('setLocalConfigActiveState(configManual, true, true)')
    expect(script).toContain('toggleIndex')
    expect(script).toContain('index == 2')
  })

  it('lights a held key from the key callbacks and keeps guide notes on top', () => {
    expect(script).toContain('void keyStrike')
    expect(script).toContain('void keyPress')
    expect(script).toContain('void keyLift')
    expect(script).toContain('downKey[keyIndex] = 1')
    expect(script).toContain('downKey[keyIndex] = 0')
    expect(script).toContain('guided == 1')
    expect(script).toContain('guided == 2')
  })

  it('cycles stock light modes from Power/Mode without taking the octave arrows', () => {
    expect(script).toContain('index == 0')
    expect(script).toContain('cycleMode(1)')
    expect(script).toContain('cycleMode(-1)')
    expect(script).toContain('setUseDefaultKeyHandler(true, false)')
    expect(script).toContain('if (lightMode == 1)')
    expect(script).toContain('if (lightMode == 2)')
    expect(script).toContain('lightMode != 4')
  })
})
