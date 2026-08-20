import {
  DEFAULT_CANVAS_WIDTH_CM,
  DEFAULT_ITEM_GAP_CM,
  DEFAULT_MAX_HEIGHT_CM,
  MAX_IMAGE_FILE_BYTES,
} from '@/lib/constants'
import { rotatedAabbCm } from '@/lib/geometry'
import { useGangSheetStore, type GangSheetState } from '@/store/useGangSheetStore'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

const DB_NAME = 'fbs-impressao-projects'
const STORE_NAME = 'projects'
const DB_VERSION = 1
const RECORD_VERSION = 1
const SAVE_DELAY_MS = 500

type PersistedImage = Omit<GangImage, 'file' | 'previewUrl'> & {
  fileBlob: Blob
  fileName: string
  fileType: string
  fileLastModified: number
}

type PersistedPage = Omit<PackedPage, 'items'> & {
  items: Array<Omit<PlacedItem, 'previewUrl'>>
}

export type PersistableProjectState = Pick<
  GangSheetState,
  | 'images'
  | 'maxHeightCm'
  | 'canvasWidthCm'
  | 'itemGapCm'
  | 'pages'
  | 'zoom'
  | 'sheetBackgroundColor'
  | 'pricePerMeter'
>

export interface PersistedProjectRecord {
  userId: string
  version: typeof RECORD_VERSION
  savedAt: number
  images: PersistedImage[]
  maxHeightCm: number
  canvasWidthCm: number
  itemGapCm: number
  pages: PersistedPage[]
  zoom: number
  sheetBackgroundColor: string
  pricePerMeter: number
}

export function createPersistedProjectRecord(
  userId: string,
  state: PersistableProjectState
): PersistedProjectRecord {
  return {
    userId,
    version: RECORD_VERSION,
    savedAt: Date.now(),
    images: state.images.map((image) => {
      const stored = { ...image } as Partial<GangImage>
      delete stored.file
      delete stored.previewUrl
      return {
        ...stored,
        fileBlob: image.file,
        fileName: image.file.name,
        fileType: image.file.type,
        fileLastModified: image.file.lastModified,
      } as PersistedImage
    }),
    maxHeightCm: state.maxHeightCm,
    canvasWidthCm: state.canvasWidthCm,
    itemGapCm: state.itemGapCm,
    pages: state.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => {
        const stored = { ...item } as Partial<PlacedItem>
        delete stored.previewUrl
        return stored as Omit<PlacedItem, 'previewUrl'>
      }),
    })),
    zoom: state.zoom,
    sheetBackgroundColor: state.sheetBackgroundColor,
    pricePerMeter: state.pricePerMeter,
  }
}

function finiteOr(value: unknown, fallback: number, minimum = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : fallback
}

function blankProject() {
  return {
    images: [] as GangImage[],
    maxHeightCm: DEFAULT_MAX_HEIGHT_CM,
    canvasWidthCm: DEFAULT_CANVAS_WIDTH_CM,
    itemGapCm: DEFAULT_ITEM_GAP_CM,
    pages: [] as PackedPage[],
    packingError: null,
    zoom: 1,
    sheetBackgroundColor: '#ffffff',
    pricePerMeter: 0,
  }
}

function restoreProject(record: PersistedProjectRecord) {
  const urls: string[] = []
  try {
    const images = record.images.flatMap((stored): GangImage[] => {
      if (!(stored.fileBlob instanceof Blob) || stored.fileBlob.size < 1 || stored.fileBlob.size > MAX_IMAGE_FILE_BYTES) {
        return []
      }
      const file = new File([stored.fileBlob], stored.fileName || 'arte.png', {
        type: stored.fileType || stored.fileBlob.type,
        lastModified: finiteOr(stored.fileLastModified, Date.now()),
      })
      const previewUrl = URL.createObjectURL(file)
      urls.push(previewUrl)
      const image = { ...stored } as Partial<PersistedImage>
      delete image.fileBlob
      delete image.fileName
      delete image.fileType
      delete image.fileLastModified
      return [{ ...image, file, previewUrl } as GangImage]
    })
    const previewByImageId = new Map(images.map((image) => [image.id, image.previewUrl]))
    const pages = record.pages.map((page) => {
      const items = page.items.flatMap((item): PlacedItem[] => {
        const previewUrl = previewByImageId.get(item.sourceImageId)
        return previewUrl ? [{ ...item, previewUrl }] : []
      })
      const usedHeightCm = items.reduce((max, item) => {
        const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle ?? 0)
        return Math.max(max, item.yCm + box.hCm)
      }, 0)
      return { ...page, items, usedHeightCm }
    })

    return {
      images,
      maxHeightCm: finiteOr(record.maxHeightCm, DEFAULT_MAX_HEIGHT_CM, 1),
      canvasWidthCm: finiteOr(record.canvasWidthCm, DEFAULT_CANVAS_WIDTH_CM, 1),
      itemGapCm: finiteOr(record.itemGapCm, DEFAULT_ITEM_GAP_CM),
      pages,
      packingError: null,
      zoom: finiteOr(record.zoom, 1, 0.1),
      sheetBackgroundColor:
        typeof record.sheetBackgroundColor === 'string' ? record.sheetBackgroundColor : '#ffffff',
      pricePerMeter: finiteOr(record.pricePerMeter, 0),
    }
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url))
    throw error
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB não está disponível neste navegador.'))
      return
    }
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o armazenamento local.'))
  })
}

let databasePromise: Promise<IDBDatabase> | null = null
function database() {
  databasePromise ??= openDatabase()
  return databasePromise
}

async function readProject(userId: string): Promise<PersistedProjectRecord | null> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(userId)
    request.onsuccess = () => {
      const record = request.result as PersistedProjectRecord | undefined
      resolve(record?.version === RECORD_VERSION && record.userId === userId ? record : null)
    }
    request.onerror = () => reject(request.error ?? new Error('Falha ao restaurar o projeto local.'))
  })
}

async function writeProject(record: PersistedProjectRecord): Promise<void> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record, record.userId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar o projeto local.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('O salvamento local foi cancelado.'))
  })
}

let activeUserId: string | null = null
let persistenceReady = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let switchQueue: Promise<void> = Promise.resolve()
let writeQueue: Promise<void> = Promise.resolve()
let subscribed = false
let warned = false

function warnOnce(error: unknown) {
  if (warned) return
  warned = true
  // Persistence failure must not block access to the editor.
  console.warn('O salvamento local automático não está disponível.', error)
}

function queueWrite(record: PersistedProjectRecord) {
  const result = writeQueue.then(() => writeProject(record))
  writeQueue = result.catch(warnOnce)
  return result
}

function persistCurrentProject() {
  if (!activeUserId || !persistenceReady) return Promise.resolve()
  return queueWrite(createPersistedProjectRecord(activeUserId, useGangSheetStore.getState()))
}

function ensureSubscription() {
  if (subscribed) return
  subscribed = true
  useGangSheetStore.subscribe(() => {
    if (!activeUserId || !persistenceReady) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persistCurrentProject().catch(warnOnce)
    }, SAVE_DELAY_MS)
  })
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void persistCurrentProject().catch(warnOnce)
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void persistCurrentProject().catch(warnOnce))
  }
}

async function performSwitch(userId: string | null) {
  ensureSubscription()
  if (activeUserId === userId && persistenceReady) return

  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    await persistCurrentProject()
  } catch (error) {
    warnOnce(error)
  }

  persistenceReady = false
  useGangSheetStore.getState().reset()
  activeUserId = userId

  let nextProject = blankProject()
  if (userId) {
    try {
      const record = await readProject(userId)
      if (record) nextProject = restoreProject(record)
    } catch (error) {
      warnOnce(error)
    }
  }
  useGangSheetStore.setState(nextProject)
  persistenceReady = true
}

/** Saves the previous user's project, clears object URLs, and restores the next scope. */
export function switchPersistedProject(userId: string | null): Promise<void> {
  const result = switchQueue.then(() => performSwitch(userId))
  switchQueue = result.catch(warnOnce)
  return result
}
