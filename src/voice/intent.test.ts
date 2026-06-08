import { describe, it, expect } from 'vitest'
import { parseIntent } from './intent'

describe('parseIntent', () => {
  it('parses play with a title', () => {
    expect(parseIntent('play despacito')).toEqual({ type: 'play', query: 'despacito' })
    expect(parseIntent('put on bohemian rhapsody')).toEqual({
      type: 'play',
      query: 'bohemian rhapsody'
    })
  })

  it('strips filler words from queries', () => {
    expect(parseIntent('play the song bohemian rhapsody')).toEqual({
      type: 'play',
      query: 'bohemian rhapsody'
    })
    expect(parseIntent('can you play yellow please')).toEqual({ type: 'play', query: 'yellow' })
  })

  it('treats a bare phrase as a play query', () => {
    expect(parseIntent('the weeknd blinding lights')).toEqual({
      type: 'play',
      query: 'the weeknd blinding lights'
    })
  })

  it('detects queue intents', () => {
    expect(parseIntent('play yellow next')).toEqual({ type: 'queue', query: 'yellow' })
    expect(parseIntent('queue coldplay')).toEqual({ type: 'queue', query: 'coldplay' })
  })

  it('handles transport commands', () => {
    expect(parseIntent('pause').type).toBe('pause')
    expect(parseIntent('skip').type).toBe('next')
    expect(parseIntent('next song').type).toBe('next')
    expect(parseIntent('go back').type).toBe('previous')
    expect(parseIntent('stop').type).toBe('stop')
    expect(parseIntent('turn it up').type).toBe('volumeUp')
  })

  it('handles transport commands with trailing objects / variants (STT noise)', () => {
    expect(parseIntent('Pause.').type).toBe('pause')
    expect(parseIntent('pause the music').type).toBe('pause')
    expect(parseIntent('skip this').type).toBe('next')
    expect(parseIntent('skip this track').type).toBe('next')
    expect(parseIntent('stop the music').type).toBe('stop')
    expect(parseIntent('turn it down please').type).toBe('volumeDown')
    expect(parseIntent('go back').type).toBe('previous')
  })

  it('bare "play" resumes', () => {
    expect(parseIntent('play').type).toBe('resume')
  })

  it('routes conversational requests to the Smart DJ', () => {
    expect(parseIntent('play something chill').type).toBe('dj')
    expect(parseIntent('play some 90s grunge').type).toBe('dj')
    expect(parseIntent('more like this').type).toBe('dj')
    expect(parseIntent('surprise me').type).toBe('dj')
  })

  it('keeps specific titles as literal play', () => {
    expect(parseIntent('play bohemian rhapsody').type).toBe('play')
    expect(parseIntent('play livin on a prayer by bon jovi').type).toBe('play')
  })

  it('empty input is unknown', () => {
    expect(parseIntent('').type).toBe('unknown')
  })
})
