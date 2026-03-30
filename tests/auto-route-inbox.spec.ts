import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestTask, deleteTestTask, createTestAgent, deleteTestAgent } from './helpers'

test.describe('Auto-route inbox tasks', () => {
  const taskCleanup: number[] = []
  const agentCleanup: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of taskCleanup) {
      await deleteTestTask(request, id).catch(() => {})
    }
    taskCleanup.length = 0
    for (const id of agentCleanup) {
      await deleteTestAgent(request, id).catch(() => {})
    }
    agentCleanup.length = 0
  })

  test('scheduler trigger for task_dispatch returns expected shape', async ({ request }) => {
    const res = await request.post('/api/scheduler', {
      headers: API_KEY_HEADER,
      data: { task_id: 'task_dispatch' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.message).toBe('string')
  })

  test('inbox task gets routed to an idle agent', async ({ request }) => {
    // Create an idle agent
    const agent = await createTestAgent(request, { status: 'idle' })
    agentCleanup.push(agent.id)

    // Create an inbox task
    const task = await createTestTask(request, { status: 'inbox' })
    taskCleanup.push(task.id)

    // Trigger task dispatch
    await request.post('/api/scheduler', {
      headers: API_KEY_HEADER,
      data: { task_id: 'task_dispatch' },
    })

    // Verify task was assigned
    const check = await request.get(`/api/tasks/${task.id}`, { headers: API_KEY_HEADER })
    const checkBody = await check.json()
    expect(['assigned', 'in_progress']).toContain(checkBody.task.status)
  })

  test('inbox task routes to offline agent when no online agents exist', async ({ request }) => {
    // Create only an offline agent
    const agent = await createTestAgent(request, { status: 'offline' })
    agentCleanup.push(agent.id)

    // Create an inbox task
    const task = await createTestTask(request, { status: 'inbox' })
    taskCleanup.push(task.id)

    // Trigger task dispatch
    await request.post('/api/scheduler', {
      headers: API_KEY_HEADER,
      data: { task_id: 'task_dispatch' },
    })

    // Verify task was assigned (fallback routing)
    const check = await request.get(`/api/tasks/${task.id}`, { headers: API_KEY_HEADER })
    const checkBody = await check.json()
    expect(['assigned', 'in_progress']).toContain(checkBody.task.status)
    expect(checkBody.task.assigned_to).toBe(agent.name)
  })

  test('scheduler status endpoint includes task_dispatch job', async ({ request }) => {
    const res = await request.get('/api/scheduler', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    const dispatchJob = body.tasks?.find((t: any) => t.id === 'task_dispatch')
    expect(dispatchJob).toBeDefined()
  })
})
