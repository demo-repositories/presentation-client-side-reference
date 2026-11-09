import type {MouseEvent} from 'react'
import {
  getPublishedId,
  type PreparedSnapshot,
  useDocumentPreviewStore,
  useDocumentStore,
  usePerspective,
  useSchema,
  type ToolMenuProps,
} from 'sanity'
import type {DocumentLocationResolverObject, DocumentLocationsState} from 'sanity/presentation'
import {useRouter, useRouterState, type RouterState} from 'sanity/router'
import {resolve} from '../lib/resolve'

const PRESENTATION_TOOL = 'presentation'

// Minimal shape of an RxJS Observable — rxjs isn't a direct dependency.
type Subscribable<T> = {
  subscribe: (observer: {next: (value: T) => void; error: (err: unknown) => void}) => {
    unsubscribe: () => void
  }
}

function firstValue<T>(source: Subscribable<T>): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const subscription = source.subscribe({
      next: (value) => {
        resolvePromise(value)
        queueMicrotask(() => subscription.unsubscribe())
      },
      error: reject,
    })
  })
}

// The document open in the right-most Structure pane group, if any.
function openStructureDocument(state: RouterState) {
  if (state.tool !== 'structure') return undefined
  const panes = (state.structure as {panes?: {id: string; params?: {type?: string}}[][]})?.panes
  const pane = panes?.at(-1)?.[0]
  return pane ? {id: getPublishedId(pane.id), type: pane.params?.type} : undefined
}

function isResolverObject(
  resolver: DocumentLocationResolverObject | DocumentLocationsState,
): resolver is DocumentLocationResolverObject {
  return 'select' in resolver && 'resolve' in resolver
}

/**
 * Navbar tool menu that sends the Presentation button to the first "Used on"
 * location of the document open in Structure, instead of the tool's initial URL.
 */
export function PresentationAwareToolMenu(props: ToolMenuProps) {
  const router = useRouter()
  const routerState = useRouterState()
  const documentStore = useDocumentStore()
  const previewStore = useDocumentPreviewStore()
  const schema = useSchema()
  const {perspectiveStack} = usePerspective()

  async function previewHrefFor(doc: {id: string; type?: string}) {
    const locations = resolve?.locations
    if (!locations || typeof locations === 'function') return undefined

    const type =
      doc.type && doc.type !== '*'
        ? doc.type
        : await firstValue<string>(documentStore.resolveTypeForDocument(doc.id))
    const resolver = type ? locations[type] : undefined
    const schemaType = type ? schema.get(type) : undefined
    if (!resolver || !schemaType) return undefined

    const state = isResolverObject(resolver)
      ? resolver.resolve(
          (
            await firstValue<PreparedSnapshot>(
              previewStore.observeForPreview(
                {_type: 'reference', _ref: doc.id},
                {...schemaType, preview: {select: resolver.select}},
                {perspective: perspectiveStack},
              ),
            )
          ).snapshot ?? null,
        )
      : resolver
    const href = state?.locations?.[0]?.href
    return href ? {type, href} : undefined
  }

  function handleClickCapture(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    const doc = openStructureDocument(routerState)
    const anchor = (event.target as Element).closest('a')
    const presentationPath = router.resolvePathFromState({tool: PRESENTATION_TOOL})
    if (!doc || anchor?.getAttribute('href') !== presentationPath) return

    event.preventDefault()
    event.stopPropagation()
    previewHrefFor(doc)
      .catch(() => undefined)
      .then((target) => {
        if (!target) {
          router.navigate({tool: PRESENTATION_TOOL})
          return
        }
        router.navigateIntent('edit', {
          id: doc.id,
          type: target.type,
          mode: 'presentation',
          presentation: PRESENTATION_TOOL,
          preview: target.href,
        })
      })
  }

  // `display: contents` keeps the navbar's flex layout intact.
  return (
    <div style={{display: 'contents'}} onClickCapture={handleClickCapture}>
      {props.renderDefault(props)}
    </div>
  )
}
