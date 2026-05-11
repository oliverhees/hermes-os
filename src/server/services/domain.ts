import { promises as dns } from 'node:dns'

export async function verifyDomainDns(domain: string, expectedIp: string): Promise<
  { ok: true } | { ok: false; actual: string[] }
> {
  try {
    const addresses = await dns.resolve4(domain)
    if (addresses.includes(expectedIp)) return { ok: true }
    return { ok: false, actual: addresses }
  } catch (err) {
    return { ok: false, actual: [] }
  }
}

export function isValidDomain(domain: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)
}
