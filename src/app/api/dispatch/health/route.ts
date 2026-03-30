import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { checkGatewayReachable } from '@/lib/gateway-health'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)

    // Gateway status
    const gateway = checkGatewayReachable()
    const directApiConfigured = !!(process.env.ANTHROPIC_API_KEY || '').trim()

    // Agent counts
    const agentRows = db.prepare(
      "SELECT status, COUNT(*) as c FROM agents WHERE hidden = 0 GROUP BY status"
    ).all() as Array<{ status: string; c: number }>

    const agentCounts = { total: 0, online: 0, offline: 0 }
    for (const row of agentRows) {
      agentCounts.total += row.c
      if (row.status === 'offline' || row.status === 'error') {
        agentCounts.offline += row.c
      } else {
        agentCounts.online += row.c
      }
    }

    // Pipeline counts
    const pipelineCounts = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'inbox' AND assigned_to IS NULL THEN 1 ELSE 0 END) as inbox_unrouted,
        SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned_pending,
        SUM(CASE WHEN status = 'in_progress' AND updated_at < ? THEN 1 ELSE 0 END) as in_progress_stale,
        SUM(CASE WHEN status IN ('review', 'quality_review') THEN 1 ELSE 0 END) as review_pending,
        SUM(CASE WHEN error_message IS NOT NULL AND error_message != '' AND status NOT IN ('done') THEN 1 ELSE 0 END) as failed
      FROM tasks
    `).get(now - 600) as {
      inbox_unrouted: number
      assigned_pending: number
      in_progress_stale: number
      review_pending: number
      failed: number
    }

    // Build issues list
    const issues: string[] = []

    if (!gateway.available && !directApiConfigured) {
      issues.push('Gateway unavailable and no direct API key configured — dispatch is blocked')
    } else if (!gateway.available) {
      issues.push(`Gateway unavailable (${gateway.error || 'unknown reason'}) — using direct Claude API fallback`)
    }

    if (agentCounts.offline > 0 && agentCounts.online === 0) {
      issues.push(`All ${agentCounts.offline} agents offline — inbox routing using fallback`)
    } else if (agentCounts.offline > 0) {
      issues.push(`${agentCounts.offline} agent(s) offline`)
    }

    if ((pipelineCounts.in_progress_stale ?? 0) > 0) {
      issues.push(`${pipelineCounts.in_progress_stale} task(s) stale in in_progress (>10 min)`)
    }

    if ((pipelineCounts.inbox_unrouted ?? 0) > 5) {
      issues.push(`${pipelineCounts.inbox_unrouted} unrouted inbox tasks — check agent availability`)
    }

    if ((pipelineCounts.failed ?? 0) > 0) {
      issues.push(`${pipelineCounts.failed} task(s) have error messages`)
    }

    return NextResponse.json({
      gateway: {
        available: gateway.available,
        cached: gateway.cached,
        error: gateway.error,
      },
      directApi: { configured: directApiConfigured },
      agents: agentCounts,
      pipeline: {
        inbox_unrouted: pipelineCounts.inbox_unrouted ?? 0,
        assigned_pending: pipelineCounts.assigned_pending ?? 0,
        in_progress_stale: pipelineCounts.in_progress_stale ?? 0,
        review_pending: pipelineCounts.review_pending ?? 0,
        failed: pipelineCounts.failed ?? 0,
      },
      issues,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to get dispatch health' },
      { status: 500 }
    )
  }
}
