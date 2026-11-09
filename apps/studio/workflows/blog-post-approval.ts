import {
  defineAction,
  defineActivity,
  defineField,
  defineGuard,
  defineOp,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

/** Project roles allowed to approve or send back a submitted post. */
export const APPROVER_ROLES = ['administrator']

/**
 * Blocks Publish on the post while the instance sits in the stage. Guard names
 * must be unique per definition, so each stage gets its own.
 */
const holdPublishing = (stage: string) =>
  defineGuard({
    name: `hold-publishing-${stage}`,
    title: 'Waiting for administrator approval',
    match: {
      idRefs: [{type: 'fieldRead', field: 'subject'}],
      actions: ['publish'],
    },
  })

/**
 * Draft → submit for review → an administrator either approves or sends it back
 * with comments. Sending back loops to drafting; approval is terminal.
 *
 * Publishing is held until approval. The hold is advisory (Studio disables
 * Publish); Contributors are additionally unable to publish at the Content
 * Lake level, which is the real enforcement boundary.
 */
export const blogPostApproval = defineWorkflow({
  name: 'blog-post-approval',
  title: 'Editor approval',
  description:
    'Writers draft and submit a blog post; an administrator approves it or sends it back.',
  initialStage: 'drafting',
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Blog post',
      types: ['blogPost'],
      required: true,
      initialValue: {type: 'input'},
    }),
    defineField({type: 'actor', name: 'submittedBy', title: 'Submitted by'}),
    defineField({type: 'actor', name: 'reviewedBy', title: 'Reviewed by'}),
    defineField({type: 'string', name: 'reviewComments', title: 'Review comments'}),
  ],
  start: {
    requirements: [
      {
        type: 'singleSubject',
        name: 'one-open-approval',
        title: 'An approval is already in progress for this post',
      },
    ],
  },
  stages: [
    defineStage({
      name: 'drafting',
      title: 'Drafting',
      description: 'The writer works on the post. Review comments, if any, are shown here.',
      guards: [holdPublishing('drafting')],
      activities: [
        defineActivity({
          name: 'write',
          title: 'Write the post',
          actions: [
            defineAction({
              name: 'submit',
              title: 'Submit for review',
              status: 'done',
              ops: [
                defineOp({
                  type: 'field.set',
                  target: {field: 'submittedBy'},
                  value: {type: 'actor'},
                }),
              ],
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'to-review', title: 'Send to review', to: 'review'})],
    }),
    defineStage({
      name: 'review',
      title: 'In review',
      description: 'An administrator approves the post or sends it back with comments.',
      guards: [holdPublishing('review')],
      // Stage-scoped, so each review visit starts without a decision.
      fields: [defineField({type: 'string', name: 'decision', title: 'Decision'})],
      activities: [
        defineActivity({
          name: 'review',
          title: 'Review the post',
          actions: [
            defineAction({
              name: 'approve',
              title: 'Approve',
              roles: APPROVER_ROLES,
              status: 'done',
              ops: [
                defineOp({
                  type: 'field.set',
                  target: {field: 'decision'},
                  value: {type: 'literal', value: 'approved'},
                }),
                defineOp({
                  type: 'field.set',
                  target: {field: 'reviewedBy'},
                  value: {type: 'actor'},
                }),
              ],
            }),
            defineAction({
              name: 'send-back',
              title: 'Send back with comments',
              roles: APPROVER_ROLES,
              status: 'done',
              params: [{type: 'string', name: 'comments', title: 'Comments', required: true}],
              ops: [
                defineOp({
                  type: 'field.set',
                  target: {field: 'decision'},
                  value: {type: 'literal', value: 'changes-requested'},
                }),
                defineOp({
                  type: 'field.set',
                  target: {field: 'reviewComments'},
                  value: {type: 'param', param: 'comments'},
                }),
                defineOp({
                  type: 'field.set',
                  target: {field: 'reviewedBy'},
                  value: {type: 'actor'},
                }),
              ],
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({
          name: 'back-to-drafting',
          title: 'Return for changes',
          to: 'drafting',
          when: "$fields.decision == 'changes-requested'",
        }),
        defineTransition({
          name: 'to-approved',
          title: 'Approve',
          to: 'approved',
          when: "$fields.decision == 'approved'",
        }),
      ],
    }),
    defineStage({
      name: 'approved',
      title: 'Approved',
      description: 'The post is approved and can be published.',
    }),
  ],
})
