import { describe, it, expect } from 'vitest'
import {
  classifyTaskModel,
  classifyDirectModel,
  buildTaskPrompt,
  parseReviewVerdict,
  scoreAgentForTask,
  isAgentRoutable,
  shouldRequeueStaleTask,
  ROLE_AFFINITY,
  type TaskForClassification,
  type AgentForScoring,
} from '../task-dispatch-utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskForClassification> = {}): TaskForClassification {
  return {
    id: 1,
    title: 'Test task',
    description: null,
    priority: 'medium',
    agent_config: null,
    ticket_prefix: null,
    project_ticket_no: null,
    metadata: null,
    ...overrides,
  }
}

function makeAgent(overrides: Partial<AgentForScoring> = {}): AgentForScoring {
  return {
    name: 'test-agent',
    role: 'agent',
    status: 'idle',
    config: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// classifyTaskModel
// ---------------------------------------------------------------------------

describe('classifyTaskModel', () => {
  it('returns opus for critical priority', () => {
    const result = classifyTaskModel(makeTask({ priority: 'critical' }))
    expect(result).toContain('opus')
  })

  it('returns opus for complex signal keywords', () => {
    const result = classifyTaskModel(makeTask({ title: 'Debug login failure' }))
    expect(result).toContain('opus')
  })

  it('returns haiku for routine + low priority', () => {
    const result = classifyTaskModel(makeTask({ title: 'Summarize report', priority: 'low' }))
    expect(result).toContain('haiku')
  })

  it('returns haiku for routine signals with medium priority', () => {
    const result = classifyTaskModel(makeTask({ title: 'Format the document', priority: 'medium' }))
    expect(result).toContain('haiku')
  })

  it('returns null for moderate tasks (no override)', () => {
    const result = classifyTaskModel(makeTask({ title: 'Write unit tests for auth' }))
    expect(result).toBeNull()
  })

  it('respects dispatchModel config override', () => {
    const result = classifyTaskModel(makeTask({
      agent_config: JSON.stringify({ dispatchModel: 'custom-model-v1' }),
    }))
    expect(result).toBe('custom-model-v1')
  })
})

// ---------------------------------------------------------------------------
// classifyDirectModel
// ---------------------------------------------------------------------------

describe('classifyDirectModel', () => {
  it('returns opus for critical priority', () => {
    expect(classifyDirectModel(makeTask({ priority: 'critical' }))).toBe('claude-opus-4-6')
  })

  it('returns haiku for routine signals', () => {
    expect(classifyDirectModel(makeTask({ title: 'Summarize the notes' }))).toBe('claude-haiku-4-5-20251001')
  })

  it('returns sonnet as default', () => {
    expect(classifyDirectModel(makeTask({ title: 'Write unit tests for auth' }))).toBe('claude-sonnet-4-6')
  })

  it('strips gateway prefix from config override', () => {
    const result = classifyDirectModel(makeTask({
      agent_config: JSON.stringify({ dispatchModel: '9router/cc/claude-opus-4-6' }),
    }))
    expect(result).toBe('claude-opus-4-6')
  })
})

// ---------------------------------------------------------------------------
// buildTaskPrompt
// ---------------------------------------------------------------------------

describe('buildTaskPrompt', () => {
  it('includes task title and priority', () => {
    const prompt = buildTaskPrompt(makeTask({ title: 'Fix the bug', priority: 'high' }))
    expect(prompt).toContain('Fix the bug')
    expect(prompt).toContain('high')
  })

  it('includes ticket reference from prefix', () => {
    const prompt = buildTaskPrompt(makeTask({
      ticket_prefix: 'PROJ',
      project_ticket_no: 42,
    }))
    expect(prompt).toContain('PROJ-042')
  })

  it('falls back to TASK-id when no prefix', () => {
    const prompt = buildTaskPrompt(makeTask({ id: 99 }))
    expect(prompt).toContain('TASK-99')
  })

  it('includes description', () => {
    const prompt = buildTaskPrompt(makeTask({ description: 'Detailed instructions here' }))
    expect(prompt).toContain('Detailed instructions here')
  })

  it('uses dispatch_prompt from metadata when available', () => {
    const prompt = buildTaskPrompt(makeTask({
      description: 'Original description',
      metadata: JSON.stringify({ dispatch_prompt: 'Custom dispatch instruction' }),
    }))
    expect(prompt).toContain('Custom dispatch instruction')
    expect(prompt).toContain('Original description')
  })

  it('includes rejection feedback', () => {
    const prompt = buildTaskPrompt(makeTask(), 'Please fix the formatting')
    expect(prompt).toContain('Previous Review Feedback')
    expect(prompt).toContain('Please fix the formatting')
  })

  it('includes tags', () => {
    const prompt = buildTaskPrompt(makeTask({ tags: ['urgent', 'backend'] }))
    expect(prompt).toContain('urgent')
    expect(prompt).toContain('backend')
  })
})

// ---------------------------------------------------------------------------
// parseReviewVerdict
// ---------------------------------------------------------------------------

describe('parseReviewVerdict', () => {
  it('parses APPROVED verdict', () => {
    const result = parseReviewVerdict('VERDICT: APPROVED\nNOTES: Looks good')
    expect(result.status).toBe('approved')
    expect(result.notes).toBe('Looks good')
  })

  it('parses REJECTED verdict', () => {
    const result = parseReviewVerdict('VERDICT: REJECTED\nNOTES: Missing error handling')
    expect(result.status).toBe('rejected')
    expect(result.notes).toBe('Missing error handling')
  })

  it('defaults to rejected when verdict unclear', () => {
    const result = parseReviewVerdict('I think this needs more work')
    expect(result.status).toBe('rejected')
    expect(result.notes).toBe('Quality check failed')
  })

  it('defaults notes for approved without NOTES line', () => {
    const result = parseReviewVerdict('VERDICT: APPROVED')
    expect(result.status).toBe('approved')
    expect(result.notes).toBe('Quality check passed')
  })
})

// ---------------------------------------------------------------------------
// scoreAgentForTask
// ---------------------------------------------------------------------------

describe('scoreAgentForTask', () => {
  it('returns -1 for offline agents', () => {
    expect(scoreAgentForTask(makeAgent({ status: 'offline' }), 'some task')).toBe(-1)
  })

  it('returns -1 for error agents', () => {
    expect(scoreAgentForTask(makeAgent({ status: 'error' }), 'some task')).toBe(-1)
  })

  it('returns -1 for sleeping agents', () => {
    expect(scoreAgentForTask(makeAgent({ status: 'sleeping' }), 'some task')).toBe(-1)
  })

  it('returns positive score for idle agent', () => {
    const score = scoreAgentForTask(makeAgent({ status: 'idle' }), 'some task')
    expect(score).toBeGreaterThan(0)
  })

  it('boosts score for role keyword match', () => {
    const coderAgent = makeAgent({ role: 'coder', status: 'idle' })
    const scoreWithKeyword = scoreAgentForTask(coderAgent, 'fix the bug in auth')
    const scoreWithout = scoreAgentForTask(coderAgent, 'write a blog post')
    expect(scoreWithKeyword).toBeGreaterThan(scoreWithout)
  })

  it('gives idle agents a bonus over active agents', () => {
    const idleScore = scoreAgentForTask(makeAgent({ status: 'idle' }), 'generic task')
    const activeScore = scoreAgentForTask(makeAgent({ status: 'active' }), 'generic task')
    expect(idleScore).toBeGreaterThan(activeScore)
  })

  it('adds capability bonus from agent config', () => {
    const agentWithCaps = makeAgent({
      status: 'idle',
      config: JSON.stringify({ capabilities: ['kubernetes', 'docker'] }),
    })
    const scoreWithCap = scoreAgentForTask(agentWithCaps, 'deploy to kubernetes cluster')
    const scoreWithout = scoreAgentForTask(agentWithCaps, 'write documentation')
    expect(scoreWithCap).toBeGreaterThan(scoreWithout)
  })

  it('returns low positive score for offline agent with offlinePenalty', () => {
    const score = scoreAgentForTask(
      makeAgent({ status: 'offline', role: 'coder' }),
      'fix the bug',
      { offlinePenalty: true },
    )
    expect(score).toBeGreaterThan(0)
  })

  it('offline+offlinePenalty scores lower than idle agent', () => {
    const offlineScore = scoreAgentForTask(
      makeAgent({ status: 'offline', role: 'coder' }),
      'fix the bug',
      { offlinePenalty: true },
    )
    const idleScore = scoreAgentForTask(
      makeAgent({ status: 'idle', role: 'coder' }),
      'fix the bug',
    )
    expect(offlineScore).toBeLessThan(idleScore)
  })

  it('always returns -1 for error agents even with offlinePenalty', () => {
    const score = scoreAgentForTask(
      makeAgent({ status: 'error' }),
      'some task',
      { offlinePenalty: true },
    )
    expect(score).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// isAgentRoutable
// ---------------------------------------------------------------------------

describe('isAgentRoutable', () => {
  it('returns true for idle agents', () => {
    expect(isAgentRoutable('idle', false)).toBe(true)
  })

  it('returns true for active agents', () => {
    expect(isAgentRoutable('active', false)).toBe(true)
  })

  it('returns false for offline agents without allowOffline', () => {
    expect(isAgentRoutable('offline', false)).toBe(false)
  })

  it('returns true for offline agents with allowOffline', () => {
    expect(isAgentRoutable('offline', true)).toBe(true)
  })

  it('returns false for error agents even with allowOffline', () => {
    expect(isAgentRoutable('error', true)).toBe(false)
  })

  it('returns false for sleeping agents without allowOffline', () => {
    expect(isAgentRoutable('sleeping', false)).toBe(false)
  })

  it('returns true for sleeping agents with allowOffline', () => {
    expect(isAgentRoutable('sleeping', true)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// shouldRequeueStaleTask
// ---------------------------------------------------------------------------

describe('shouldRequeueStaleTask', () => {
  it('requeues offline agent after 10 min', () => {
    const result = shouldRequeueStaleTask('offline', 12)
    expect(result.requeue).toBe(true)
    expect(result.reason).toContain('offline')
  })

  it('does not requeue offline agent before 10 min', () => {
    const result = shouldRequeueStaleTask('offline', 8)
    expect(result.requeue).toBe(false)
  })

  it('requeues null/unknown agent after 10 min', () => {
    const result = shouldRequeueStaleTask(null, 12)
    expect(result.requeue).toBe(true)
  })

  it('does not requeue null agent before 10 min', () => {
    const result = shouldRequeueStaleTask(null, 5)
    expect(result.requeue).toBe(false)
  })

  it('requeues idle agent after 20 min', () => {
    const result = shouldRequeueStaleTask('idle', 22)
    expect(result.requeue).toBe(true)
  })

  it('does not requeue idle agent before 20 min', () => {
    const result = shouldRequeueStaleTask('idle', 15)
    expect(result.requeue).toBe(false)
  })

  it('requeues active agent after 30 min', () => {
    const result = shouldRequeueStaleTask('active', 35)
    expect(result.requeue).toBe(true)
    expect(result.reason).toContain('active')
  })

  it('does not requeue active agent before 30 min', () => {
    const result = shouldRequeueStaleTask('active', 25)
    expect(result.requeue).toBe(false)
  })

  it('requeues busy agent after 30 min', () => {
    const result = shouldRequeueStaleTask('busy', 35)
    expect(result.requeue).toBe(true)
  })

  it('uses 10 min default for unknown status strings', () => {
    const result = shouldRequeueStaleTask('weird_status', 12)
    expect(result.requeue).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ROLE_AFFINITY
// ---------------------------------------------------------------------------

describe('ROLE_AFFINITY', () => {
  it('has coder role with code-related keywords', () => {
    expect(ROLE_AFFINITY.coder).toContain('code')
    expect(ROLE_AFFINITY.coder).toContain('fix')
    expect(ROLE_AFFINITY.coder).toContain('bug')
  })

  it('has researcher role with research keywords', () => {
    expect(ROLE_AFFINITY.researcher).toContain('research')
    expect(ROLE_AFFINITY.researcher).toContain('analyze')
  })

  it('has agent as generic fallback with empty keywords', () => {
    expect(ROLE_AFFINITY.agent).toEqual([])
  })
})
