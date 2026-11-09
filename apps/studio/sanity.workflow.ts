import type {WorkflowDeploymentInput} from '@sanity/workflow-engine'
import {defineWorkflowConfig} from '@sanity/workflow-engine/define'
import {blogPostApproval} from './workflows/blog-post-approval'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? '1rkupi9j'
const dataset = process.env.SANITY_STUDIO_DATASET ?? 'production'

// No `partition`: this deployment is alone on its dataset, so it and the
// Studio plugin both resolve to `default`. Set both together if that changes.
export const production = {
  name: 'production',
  // Required `subject` field needs reader model 10.
  expectedMinReaderModel: 10,
  workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`},
  definitions: [blogPostApproval],
} satisfies WorkflowDeploymentInput

export default defineWorkflowConfig({deployments: [production]})
