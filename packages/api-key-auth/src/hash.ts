import { createHash, timingSafeEqual } from 'node:crypto'

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
