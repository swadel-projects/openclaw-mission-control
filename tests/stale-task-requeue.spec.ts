import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, createTestTask, deleteTestTask, createTestAgent, deleteTestAgent } from './helpers'

test.describe('Stale task requeue', () => {
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

  test('scheduler trigger for stale_task_requeue returns expected shape', async ({ request }) => {
    const res = await request.post('/api/scheduler', {
      headers: API_KEY_HEADER,
      data: { task_id: 'stale_task_requeue' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.message).toBe('string')
  })

  test('recently created in_progress task is not requeued', async ({ request }) => {
    // Create an agent for assignment
    const agent = await createTestAgent(request, { status: 'idle' })
    agentCleanup.push(agent.id)

    // Create a task and move it to in_progress
    const task = await createTestTask(request, {
      status: 'assigned',
      assigned_to: agent.name,
    })
    taskCleanup.push(task.id)

    // Move to in_progress via PUT
    const updateRes = await request.put(`/api/tasks/${task.id}`, {
      headers: API_KEY_HEADER,
      data: { status: 'in_progress' },
    })
    expect(updateRes.status()).toBe(200)

    // Trigger stale requeue
    await request.post('/api/scheduler', {
      headers: API_KEY_HEADER,
      data: { task_id: 'stale_task_requeue' },
    })

    // Task should still be in_progress (not stale — just created)
    const check = await request.get(`/api/tasks/${task.id}`, { headers: API_KEY_HEADER })
    const checkBody = await check.json()
    expect(checkBody.task.status).toBe('in_progress')
  })

  test('scheduler status endpoint includes stale_task_requeue job', async ({ request }) => {
    const res = await request.get('/api/scheduler', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    const requeueJob = body.tasks?.find((t: any) => t.id === 'stale_task_requeue')
    expect(requeueJob).toBeDefined()
    expect(requeueJob.name).toBe('Stale Task Requeue')
  })
})
