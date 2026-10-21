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

  it('leaves notes and octave buttons to the factory handler', () => {
    expect(script).toContain('setUseDefaultKeyHandler(true, false)')
    expect(script).not.toContain('handleButtonDown')
    expect(script).not.toContain('handleButtonUp')
    expect(script).not.toContain('setClusteringActive')
    expect(script).not.toContain('sendNoteOn(')
    expect(script).not.toContain('sendNoteOff(')
    expect(script).not.toContain('sendMIDI(')
    expect(script).not.toContain('touchStart')
    expect(script).not.toContain('onControlPress')
    expect(script).not.toContain('return -1')
  })

  it('lights this board from the DNA position and never stays dark', () => {
    expect(script).toContain('getHorizontalDistFromMaster()')
    expect(script).toContain('getClusterXpos()')
    expect(script).toContain('isMasterBlock()')
    expect(script).toContain('if (isMasterBlock()) return 0')
    expect(script).toContain('return 1')
    expect(script).toContain('raw / 6')
  })

  it('records a held key for lighting and keeps guide notes on top', () => {
    expect(script).toContain('void keyStrike')
    expect(script).toContain('void keyPress')
    expect(script).toContain('void keyLift')
    expect(script).toContain('downKey[keyIndex] = 1')
    expect(script).toContain('downKey[keyIndex] = 0')
    expect(script).toContain('guided == 1')
    expect(script).toContain('guided == 2')
    expect(script).toContain('guided != 0 && held == 1')
  })
})
