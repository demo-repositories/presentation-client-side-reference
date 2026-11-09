import {ActionDisabledError, StartNotAllowedError, type Actor} from '@sanity/workflow-engine'
import {createBench, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, test} from 'vitest'
import {blogPostApproval} from './blog-post-approval'

const writer: Actor = {kind: 'person', id: 'gWriter01', roles: ['contributor']}
const editor: Actor = {kind: 'person', id: 'gEditor01', roles: ['editor']}
const admin: Actor = {kind: 'person', id: 'gAdmin001', roles: ['administrator']}

const post = {_id: 'blog-1', _type: 'blogPost', title: 'Knife skills'}
const subject = () => subjectField('blog-1', {type: 'blogPost'})

async function start() {
  const bench = createBench({
    now: '2026-11-09T09:00:00.000Z',
    documents: [post, {...post, _id: 'drafts.blog-1'}],
  })
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [blogPostApproval]})
  const {instance} = await bench.startInstance({
    definition: 'blog-post-approval',
    initialFields: [subject()],
  })
  const id = instance._id
  const submit = (actor: Actor = writer) =>
    bench.fireAction({instanceId: id, activity: 'write', action: 'submit', actor})
  const review = (action: 'approve' | 'send-back', actor: Actor, params?: {comments: string}) =>
    bench.fireAction({instanceId: id, activity: 'review', action, actor, params})
  return {bench, id, instance, submit, review}
}

type Instance = Awaited<ReturnType<typeof start>>['instance']
const fieldValue = (instance: Instance, name: string) =>
  instance.fields?.find((field) => field.name === name)?.value

describe('blog-post-approval', () => {
  test('starts in drafting', async () => {
    const {instance} = await start()
    expect(instance.currentStage).toBe('drafting')
  })

  test('submit moves to review; an administrator approves', async () => {
    const {bench, id, submit, review} = await start()
    await submit()
    expect(await bench.currentStage(id)).toBe('review')

    const {instance} = await review('approve', admin)
    expect(instance.currentStage).toBe('approved')
  })

  test('send back returns to drafting with the comments, then a resubmit can be approved', async () => {
    const {bench, id, submit, review} = await start()
    await submit()

    const {instance} = await review('send-back', admin, {comments: 'Tighten the intro'})
    expect(instance.currentStage).toBe('drafting')
    expect(await bench.activityStatus(id, 'write')).toBe('active')
    expect(fieldValue(instance, 'reviewComments')).toBe('Tighten the intro')
    expect(fieldValue(instance, 'reviewedBy')).toMatchObject({id: admin.id})

    // Second visit starts with no decision, so it waits in review.
    await submit()
    expect(await bench.currentStage(id)).toBe('review')

    const {instance: done} = await review('approve', admin)
    expect(done.currentStage).toBe('approved')
  })

  test('send back requires comments', async () => {
    const {bench, id, submit, review} = await start()
    await submit()
    await expect(review('send-back', admin)).rejects.toThrow()
    expect(await bench.currentStage(id)).toBe('review')
  })

  test.each([
    ['a contributor', writer],
    ['an editor', editor],
  ])('%s cannot approve or send back', async (_label, actor) => {
    const {bench, id, submit, review} = await start()
    await submit()

    const evaluation = await bench.evaluate({instanceId: id, actor})
    const actions = evaluation.currentStage.activities.flatMap((a) => a.actions)
    for (const name of ['approve', 'send-back']) {
      expect(actions.find((a) => a.action.name === name)).toMatchObject({
        allowed: false,
        disabledReason: {kind: 'filter-failed'},
      })
    }

    await expect(review('approve', actor)).rejects.toBeInstanceOf(ActionDisabledError)
    await expect(review('send-back', actor, {comments: 'x'})).rejects.toBeInstanceOf(
      ActionDisabledError,
    )
    expect(await bench.currentStage(id)).toBe('review')
  })

  test('publishing is held until approval', async () => {
    const {bench, submit, review} = await start()
    const guardNames = async () =>
      (await bench.activeGuardsForDocument('blog-1')).map((guard) => guard.name)

    expect(await guardNames()).toEqual(['hold-publishing-drafting'])
    await submit()
    expect(await guardNames()).toEqual(['hold-publishing-review'])
    await review('approve', admin)
    expect(await guardNames()).toEqual([])
  })

  test('only one approval can run per post', async () => {
    const {bench} = await start()
    await expect(
      bench.startInstance({definition: 'blog-post-approval', initialFields: [subject()]}),
    ).rejects.toBeInstanceOf(StartNotAllowedError)
  })
})
