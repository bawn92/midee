import { beforeEach, describe, expect, it } from 'vitest'
import {
  getPianoMPortPrefs,
  pianoMDisplayOrder,
  pianoMPortsShareName,
  reloadPianoMPorts,
  rememberPianoMPorts,
  resetPianoMPortsForTests,
  swapPianoMPorts,
} from './pianoMPorts'

beforeEach(() => {
  localStorage.clear()
  resetPianoMPortsForTests()
})

describe('Piano M output order', () => {
  it('keeps Web MIDI order until the player swaps, then remembers the swap', () => {
    expect(rememberPianoMPorts(['usb', 'right'])).toEqual(['usb', 'right'])
    expect(swapPianoMPorts(['usb', 'right'])).toEqual(['right', 'usb'])
    reloadPianoMPorts()
    expect(pianoMDisplayOrder(['usb', 'right'])).toEqual(['right', 'usb'])
    expect(getPianoMPortPrefs().choseOutput).toBe(false)
    rememberPianoMPorts(['usb'])
    expect(pianoMDisplayOrder(['usb', 'right'])).toEqual(['right', 'usb'])
  })

  it('appends a newly enumerated board after the saved order', () => {
    rememberPianoMPorts(['usb', 'right'])
    expect(rememberPianoMPorts(['usb', 'right', 'far'])).toEqual(['usb', 'right', 'far'])
  })

  it('numbers only Piano M ports that share a name', () => {
    const lumi = { id: 'a', name: 'LUMI Keys BLOCK', manufacturer: 'ROLI' }
    const ports = [lumi, { id: 'b', name: 'LUMI Keys BLOCK', manufacturer: 'ROLI' }]
    expect(pianoMPortsShareName(lumi, ports)).toBe(true)
    expect(
      pianoMPortsShareName({ id: 'roland', name: 'Roland FANTOM', manufacturer: 'Roland' }, [
        { id: 'roland', name: 'Roland FANTOM', manufacturer: 'Roland' },
        { id: 'roland-2', name: 'Roland FANTOM', manufacturer: 'Roland' },
      ]),
    ).toBe(false)
  })
})
