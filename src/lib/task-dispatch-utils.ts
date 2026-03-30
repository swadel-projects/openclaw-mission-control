// ---------------------------------------------------------------------------
// Pure, testable helpers extracted from task-dispatch.ts
// ---------------------------------------------------------------------------

/** Minimal task shape needed by classification/prompt helpers. */
export interface TaskForClassification {
  id: number
  title: string
  description: string | null
  priority: string
  agent_config: string | null
  ticket_prefix: string | null
  project_ticket_no: number | null
  tags?: string[]
  metadata: string | null
}

/** Minimal agent shape needed by scoring helpers. */
export interface AgentForScoring {
  name: string
  role: string
  status: string
  config: string | null
}

// ---------------------------------------------------------------------------
// Model routing
// ---------------------------------------------------------------------------

const COMPLEX_SIGNALS = [
  'debug', 'diagnos', 'architect', 'design system', 'security audit',
  'root cause', 'investigate', 'incident', 'failure', 'broken', 'not working',
  'refactor', 'migration', 'performance optim', 'why is',
]

const ROUTINE_SIGNALS = [
  'status check', 'health check', 'ping', 'list ', 'fetch ', 'format',
  'rename', 'move file', 'read file', 'update readme', 'bump version',
  'send message', 'post to', 'notify', 'summarize', 'translate',
  'quick ', 'simple ', 'routine ', 'minor ',
]

/**
 * Classify a task's complexity and return the appropriate model ID to pass
 * to the OpenClaw gateway. Returns null to use the agent's own default model.
 */
export function classifyTaskModel(task: TaskForClassification): string | null {
  if (task.agent_config) {
    try {
      const cfg = JSON.parse(task.agent_config)
      if (typeof cfg.dispatchModel === 'string' && cfg.dispatchModel) return cfg.dispatchModel
    } catch { /* ignore */ }
  }

  const text = `${task.title} ${task.description ?? ''}`.toLowerCase()
  const priority = task.priority?.toLowerCase() ?? ''

  if (priority === 'critical' || COMPLEX_SIGNALS.some(s => text.includes(s))) {
    return '9router/cc/claude-opus-4-6'
  }

  if (priority === 'low' && ROUTINE_SIGNALS.some(s => text.includes(s))) {
    return '9router/cc/claude-haiku-4-5-20251001'
  }
  if (ROUTINE_SIGNALS.some(s => text.includes(s)) && priority !== 'high' && priority !== 'critical') {
    return '9router/cc/claude-haiku-4-5-20251001'
  }

  return null
}

/**
 * Classify model for direct Claude API dispatch (no gateway prefix).
 */
export function classifyDirectModel(task: TaskForClassification): string {
  if (task.agent_config) {
    try {
      const cfg = JSON.parse(task.agent_config)
      if (typeof cfg.dispatchModel === 'string' && cfg.dispatchModel) {
        return cfg.dispatchModel.replace(/^.*\//, '')
      }
    } catch { /* ignore */ }
  }

  const text = `${task.title} ${task.description ?? ''}`.toLowerCase()
  const priority = task.priority?.toLowerCase() ?? ''

  const complexSignals = [
    'debug', 'diagnos', 'architect', 'design system', 'security audit',
    'root cause', 'investigate', 'incident', 'refactor', 'migration',
  ]
  if (priority === 'critical' || complexSignals.some(s => text.includes(s))) {
    return 'claude-opus-4-6'
  }

  const routineSignals = [
    'status check', 'health check', 'format', 'rename', 'summarize',
    'translate', 'quick ', 'simple ', 'routine ', 'minor ',
  ]
  if (routineSignals.some(s => text.includes(s)) && priority !== 'high' && priority !== 'critical') {
    return 'claude-haiku-4-5-20251001'
  }

  return 'claude-sonnet-4-6'
}

// ---------------------------------------------------------------------------
// Task prompt building
// ---------------------------------------------------------------------------

export function buildTaskPrompt(task: TaskForClassification, rejectionFeedback?: string | null): string {
  const ticket = task.ticket_prefix && task.project_ticket_no
    ? `${task.ticket_prefix}-${String(task.project_ticket_no).padStart(3, '0')}`
    : `TASK-${task.id}`

  let dispatchPrompt: string | null = null
  if (task.metadata) {
    try {
      const meta = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata
      if (typeof meta?.dispatch_prompt === 'string' && meta.dispatch_prompt) {
        dispatchPrompt = meta.dispatch_prompt
      }
    } catch { /* ignore parse errors */ }
  }

  const lines = [
    'You have been assigned a task in Mission Control.',
    '',
    `**[${ticket}] ${task.title}**`,
    `Priority: ${task.priority}`,
  ]

  if (task.tags && task.tags.length > 0) {
    lines.push(`Tags: ${task.tags.join(', ')}`)
  }

  if (dispatchPrompt) {
    lines.push('', dispatchPrompt)
    if (task.description && task.description !== dispatchPrompt) {
      lines.push('', '## Additional Context', task.description)
    }
  } else if (task.description) {
    lines.push('', task.description)
  }

  if (rejectionFeedback) {
    lines.push('', '## Previous Review Feedback', rejectionFeedback, '', 'Please address this feedback in your response.')
  }

  lines.push('', 'Complete this task and provide your response. Be concise and actionable.')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Review verdict parsing
// ---------------------------------------------------------------------------

export function parseReviewVerdict(text: string): { status: 'approved' | 'rejected'; notes: string } {
  const upper = text.toUpperCase()
  const status = upper.includes('VERDICT: APPROVED') ? 'approved' as const : 'rejected' as const
  const notesMatch = text.match(/NOTES:\s*(.+)/i)
  const notes = notesMatch?.[1]?.trim().substring(0, 2000) || (status === 'approved' ? 'Quality check passed' : 'Quality check failed')
  return { status, notes }
}

// ---------------------------------------------------------------------------
// Agent scoring & routing
// ---------------------------------------------------------------------------

/** Role affinity mapping — which task keywords match which agent roles. */
export const ROLE_AFFINITY: Record<string, string[]> = {
  coder: ['code', 'implement', 'build', 'fix', 'bug', 'test', 'unit test', 'refactor', 'feature', 'api', 'endpoint', 'function', 'class', 'module', 'component', 'deploy', 'ci', 'pipeline'],
  researcher: ['research', 'investigate', 'analyze', 'compare', 'find', 'discover', 'audit', 'review', 'survey', 'benchmark', 'evaluate', 'assess', 'competitor', 'market', 'trend'],
  'market researcher': ['research', 'market', 'opportunity', 'competitor', 'trend', 'analyze', 'app', 'saas', 'indie', 'product', 'niche', 'revenue', 'evaluate', 'scan', 'landscape'],
  reviewer: ['review', 'audit', 'check', 'verify', 'validate', 'quality', 'security', 'compliance', 'approve'],
  tester: ['test', 'qa', 'e2e', 'integration test', 'regression', 'coverage', 'verify', 'validate'],
  devops: ['deploy', 'infrastructure', 'ci', 'cd', 'docker', 'kubernetes', 'monitoring', 'pipeline', 'server', 'nginx', 'ssl'],
  assistant: ['write', 'draft', 'summarize', 'translate', 'format', 'document', 'docs', 'readme', 'email', 'message', 'report'],
  agent: [], // generic fallback
}

export interface ScoreOptions {
  /** Apply a penalty to offline agents instead of rejecting them outright. */
  offlinePenalty?: boolean
}

/**
 * Score how well an agent matches a task based on role affinity, capabilities,
 * and current status. Returns -1 if the agent should not receive work.
 */
export function scoreAgentForTask(
  agent: AgentForScoring,
  taskText: string,
  options: ScoreOptions = {},
): number {
  // These roles should not receive work tasks via the task board
  const NON_ROUTABLE_ROLES = ['orchestrator', 'ops runner', 'personal assistant', 'counselor']
  if (NON_ROUTABLE_ROLES.includes(agent.role)) return -1

  const isOffline = agent.status === 'offline' || agent.status === 'error' || agent.status === 'sleeping'

  if (isOffline && !options.offlinePenalty) return -1
  if (agent.status === 'error') return -1 // error agents are never routable

  const text = taskText.toLowerCase()
  const keywords = ROLE_AFFINITY[agent.role] || []

  let score = 0
  for (const kw of keywords) {
    if (text.includes(kw)) score += 10
  }

  if (agent.status === 'idle') score += 5

  if (agent.config) {
    try {
      const cfg = JSON.parse(agent.config)
      const caps = Array.isArray(cfg.capabilities) ? cfg.capabilities : []
      for (const cap of caps) {
        if (typeof cap === 'string' && text.includes(cap.toLowerCase())) score += 15
      }
    } catch { /* ignore */ }
  }

  // Non-offline agents always get at least 1
  score = Math.max(score, 1)

  // Offline agents in fallback mode get a deprioritized but positive score
  if (isOffline && options.offlinePenalty) {
    return Math.max(score - 50, 1)
  }

  return score
}

/**
 * Check whether an agent is eligible for task routing.
 * In fallback mode, offline agents are allowed (but deprioritized by scoreAgentForTask).
 */
export function isAgentRoutable(status: string, allowOffline: boolean): boolean {
  if (status === 'error') return false
  if (status === 'offline' || status === 'sleeping') return allowOffline
  return true
}

// ---------------------------------------------------------------------------
// Stale task requeue decision
// ---------------------------------------------------------------------------

/** Tiered staleness thresholds (minutes) by agent status. */
const STALE_THRESHOLDS: Record<string, number> = {
  offline: 10,
  error: 10,
  sleeping: 10,
  idle: 20,
  active: 30,
  busy: 30,
}
const DEFAULT_STALE_THRESHOLD = 10

/**
 * Decide whether a task stuck in `in_progress` should be requeued, based on
 * the assigned agent's current status and how long the task has been stale.
 */
export function shouldRequeueStaleTask(
  agentStatus: string | null,
  staleMinutes: number,
): { requeue: boolean; reason: string } {
  const normalizedStatus = (agentStatus || 'offline').toLowerCase()
  const threshold = STALE_THRESHOLDS[normalizedStatus] ?? DEFAULT_STALE_THRESHOLD

  if (staleMinutes < threshold) {
    return { requeue: false, reason: `Stale ${staleMinutes}m < ${threshold}m threshold for ${normalizedStatus} agent` }
  }

  const reason = normalizedStatus === 'offline' || !agentStatus
    ? `Agent offline/unknown for ${staleMinutes}m (threshold: ${threshold}m)`
    : `Agent ${normalizedStatus} but task stale for ${staleMinutes}m (threshold: ${threshold}m for ${normalizedStatus} agents)`

  return { requeue: true, reason }
}
