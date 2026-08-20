import { describe, expect, it } from 'vitest'
import { calculateFilmCost } from './pricing'

describe('calculateFilmCost', () => {
  it('charges the used linear height in meters', () => {
    expect(calculateFilmCost(125, 40)).toBe(50)
  })

  it('never returns a negative or invalid cost', () => {
    expect(calculateFilmCost(-10, 40)).toBe(0)
    expect(calculateFilmCost(100, Number.NaN)).toBe(0)
  })
})
