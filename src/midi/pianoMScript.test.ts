import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readScript(name: string): string {
  return readFileSync(resolve(import.meta.dirname, `../../public/${name}`), 'utf8')
}

const files = {
  left: readScript('piano-m-lights-left.littlefoot'),
  right: readScript('piano-m-lights-right.littlefoot'),
  third: readScript('piano-m-lights-board-3.littlefoot'),
  legacy: readScript('piano-m-theme-lights.littlefoot'),
}

describe('Piano M littlefoot scripts', () => {
  it('keeps hand colours, a shared lowest note, and the factory key handler', () => {
    for (const script of Object.values(files)) {
      expect(script).toContain('const int keysPerBlock = 24')
      expect(script).toContain('channel == 11')
      expect(script).toContain('channel == 12')
      expect(script).toContain('byte1 == 23')
      expect(script).toContain('setUseDefaultKeyHandler(true, false)')
      expect(script).toContain('int origin = baseNote + boardIndex * keysPerBlock')
      expect(script).toContain('int note = origin + key')
      expect(script).not.toContain('handleButtonDown')
      expect(script).not.toContain('handleButtonUp')
      expect(script).not.toContain('setClusteringActive')
      expect(script).not.toContain('sendNoteOn(')
      expect(script).not.toContain('sendNoteOff(')
      expect(script).not.toContain('sendMIDI(')
      expect(script).not.toContain('touchStart')
      expect(script).not.toContain('onControlPress')
      expect(script).not.toContain('return -1')
      expect(script).not.toContain('getHorizontalDistFromMaster')
      expect(script).not.toContain('getClusterXpos')
      expect(script).not.toContain('isMasterBlock')
      expect(script).toContain('void keyStrike')
      expect(script).toContain('downKey[keyIndex] = 1')
      expect(script).toContain('downKey[keyIndex] = 0')
    }
  })

  it('hardcodes the board and raises the octave only on the right and third files', () => {
    expect(files.left).toContain('const int boardIndex = 0')
    expect(files.legacy).toContain('const int boardIndex = 0')
    expect(files.right).toContain('const int boardIndex = 1')
    expect(files.third).toContain('const int boardIndex = 2')
    expect(files.left).not.toContain('setLocalConfig')
    expect(files.left).not.toContain('getLocalConfig')
    expect(files.legacy).not.toContain('setLocalConfig')
    expect(files.right).toContain('getLocalConfig(configTopology)')
    expect(files.right).toContain('setLocalConfig(configOctave, boardIndex * 2)')
    expect(files.third).toContain('setLocalConfig(configOctave, boardIndex * 2)')
  })
})
