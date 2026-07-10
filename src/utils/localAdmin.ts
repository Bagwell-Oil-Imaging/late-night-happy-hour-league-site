/** Local-only bridge for admin writes made while Firebase Auth is bypassed. */

export const isLocalAdminBypass = () =>
  import.meta.env.DEV
  && import.meta.env.VITE_LOCAL_ADMIN_BYPASS === 'true'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname)

export async function localAdminWrite(payload: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/local-admin-write', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-local-admin-bypass': 'true',
    },
    body: JSON.stringify(payload),
  })

  if (response.ok) return

  const body = await response.json().catch(() => null) as { error?: string } | null
  throw new Error(body?.error ?? `Local admin write failed (${response.status}).`)
}
