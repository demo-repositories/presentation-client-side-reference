import {createClient} from '@sanity/client'

/** Mise Media Library — https://www.sanity.io/@ofsMxPwd5/media/mlZKouJfXE8F */
export const MISE_MEDIA_LIBRARY = {
  organizationId: 'ofsMxPwd5',
  mediaLibraryId: 'mlZKouJfXE8F',
  folderId: '3FguS2SUEa1KvNeHWh59arlqdXt',
} as const

const API_VERSION = '2025-02-19'

type MediaLibraryAsset = {
  _id: string
  currentVersion: {_ref: string}
}

type LinkResponse = {
  document: {
    _id: string
    media: {_ref: string}
  }
}

export type HeroImageValue = {
  _type: 'image'
  asset: {_type: 'reference'; _ref: string}
  media: {_type: 'globalDocumentReference'; _ref: string; _weak: true}
}

function createMediaLibraryClient(token: string) {
  return createClient({
    apiVersion: API_VERSION,
    token,
    useCdn: false,
    resource: {
      type: 'media-library',
      id: MISE_MEDIA_LIBRARY.mediaLibraryId,
    },
  })
}

export function buildHeroImageField(linkedAsset: LinkResponse['document']): HeroImageValue {
  return {
    _type: 'image',
    asset: {_type: 'reference', _ref: linkedAsset._id},
    media: {
      _type: 'globalDocumentReference',
      _ref: linkedAsset.media._ref,
      _weak: true,
    },
  }
}

async function resolveAssetContainer(
  client: ReturnType<typeof createMediaLibraryClient>,
  instanceId: string,
) {
  return client.fetch<MediaLibraryAsset | null>(
    `*[_type == "sanity.asset" && currentVersion._ref == $instanceId][0]{
      _id,
      currentVersion
    }`,
    {instanceId},
  )
}

async function assignAssetToFolder(
  client: ReturnType<typeof createMediaLibraryClient>,
  assetId: string,
  title: string,
) {
  await client
    .patch(assetId)
    .set({
      parent: {_type: 'reference', _ref: MISE_MEDIA_LIBRARY.folderId},
      title,
    })
    .commit()
}

export async function uploadImageToMediaLibrary({
  token,
  buffer,
  filename,
  title,
}: {
  token: string
  buffer: Buffer
  filename: string
  title: string
}) {
  const client = createMediaLibraryClient(token)

  let instanceId: string | undefined

  try {
    await client.assets.upload('image', buffer, {filename, title})
  } catch (error) {
    const existingAssetId =
      typeof error === 'object' &&
      error !== null &&
      'details' in error &&
      typeof (error as {details?: {existingAssetId?: string}}).details?.existingAssetId === 'string'
        ? (error as {details: {existingAssetId: string}}).details.existingAssetId
        : undefined

    if (!existingAssetId) throw error
    instanceId = existingAssetId
  }

  const container = instanceId
    ? await resolveAssetContainer(client, instanceId)
    : await client.fetch<MediaLibraryAsset | null>(
        `*[_type == "sanity.asset" && title == $title] | order(_updatedAt desc)[0]{
          _id,
          currentVersion
        }`,
        {title},
      )
  if (!container?._id || !container.currentVersion?._ref) {
    throw new Error(`Could not resolve Media Library container for ${instanceId}`)
  }

  await assignAssetToFolder(client, container._id, title)

  return container
}

export async function linkMediaLibraryAssetToDataset({
  token,
  projectId,
  dataset,
  assetId,
  assetInstanceId,
}: {
  token: string
  projectId: string
  dataset: string
  assetId: string
  assetInstanceId: string
}) {
  const response = await fetch(
    `https://${projectId}.api.sanity.io/v2024-06-24/assets/media-library-link/${dataset}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mediaLibraryId: MISE_MEDIA_LIBRARY.mediaLibraryId,
        assetId,
        assetInstanceId,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Media Library link failed (${response.status}): ${await response.text()}`)
  }

  return (await response.json()) as LinkResponse
}

export async function migrateImageUrlToMediaLibrary({
  token,
  projectId,
  dataset,
  imageUrl,
  filename,
  title,
}: {
  token: string
  projectId: string
  dataset: string
  imageUrl: string
  filename: string
  title: string
}) {
  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) {
    throw new Error(`Failed to download ${imageUrl}: ${imageResponse.status}`)
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer())
  const container = await uploadImageToMediaLibrary({token, buffer, filename, title})
  const linked = await linkMediaLibraryAssetToDataset({
    token,
    projectId,
    dataset,
    assetId: container._id,
    assetInstanceId: container.currentVersion._ref,
  })

  return {
    heroImage: buildHeroImageField(linked.document),
    linkedAssetId: linked.document._id,
    mediaLibraryAssetId: container._id,
  }
}

export async function deleteMediaLibraryAsset(token: string, assetId: string) {
  const client = createMediaLibraryClient(token)
  await client.transaction().delete(assetId).delete(`drafts.${assetId}`).commit()
}
