import { describe, it, expect } from 'vitest'

describe('Simple Test', () => {
  it('should work', async () => {
    const res = await fetch('http://localhost:3000/health')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
  })
})
