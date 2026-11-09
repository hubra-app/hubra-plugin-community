import { apiFetch, apiFetchRaw } from '@hubra/plugin-sdk'

export interface Options {
  memberId: number
  can: { galleries: boolean; ideas: boolean; welcome: boolean; honours: boolean }
  photosOfMe: boolean
}

export interface Album {
  id: number
  title: string
  description: string | null
  takenOn: string | null
  membersUpload: boolean
  coverPhotoId: number | null
  photos: number
  canUpload: boolean
  canEdit: boolean
  createdAt: string | null
}

export interface Tag {
  memberId: number
  name: string
}

export interface Photo {
  id: number
  albumId: number
  caption: string | null
  width: number
  height: number
  uploadedBy: string | null
  mine: boolean
  canEdit: boolean
  tags: Tag[]
  createdAt: string | null
}

export interface AlbumDetail extends Album {
  items: Photo[]
}

export type IdeaStatus = 'open' | 'planned' | 'done' | 'declined'

export interface Idea {
  id: number
  title: string
  body: string | null
  anonymous: boolean
  author: string | null
  mine: boolean
  status: IdeaStatus
  answer: string | null
  answeredBy: string | null
  answeredAt: string | null
  pollId: number | null
  votes: number
  voted: boolean
  canDelete: boolean
  createdAt: string | null
}

export interface HonourMember {
  memberId: number
  name: string
  since: string | null
}

export interface LegacyHonour {
  id: number
  memberId: number
  name: string
  title: string
  awardedOn: string | null
  note: string | null
}

export interface Honours {
  tier: { id: number; name: string } | null
  members: HonourMember[]
  /** Only for whoever keeps honours. */
  tiers?: { id: number; name: string; members: number }[]
  legacy?: LegacyHonour[]
}

export interface Jubilee {
  memberId: number
  name: string
  kind: 'member' | 'birthday'
  years: number
  date: string
}

export interface Step {
  id: number
  title: string
  description: string | null
  link: string | null
  auto: 'fee' | 'photo' | null
  position: number
  active: boolean
}

export interface MyWelcome {
  steps: (Step & { done: boolean })[]
  show: boolean
}

export interface Progress {
  steps: Step[]
  members: { memberId: number; name: string; joined: string | null; done: number; total: number; missing: string[] }[]
}

export const QK = {
  all: ['community'] as const,
  options: ['community', 'options'] as const,
  albums: ['community', 'albums'] as const,
  album: (id: number) => ['community', 'albums', id] as const,
  ideas: (status: string) => ['community', 'ideas', status] as const,
  honours: ['community', 'honours'] as const,
  jubilees: ['community', 'jubilees'] as const,
  welcome: ['community', 'welcome'] as const,
  steps: ['community', 'steps'] as const,
  progress: ['community', 'progress'] as const,
  image: (id: number, size: 'thumb' | 'full') => ['community', 'image', id, size] as const,
}

const BASE = '/app/community'
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})
const del = { method: 'DELETE' }

export const getOptions = () => apiFetch<Options>(`${BASE}/options`)
export const setConsent = (allowed: boolean) => apiFetch<{ photosOfMe: boolean }>(`${BASE}/consent`, json('PUT', { allowed }))

export const listAlbums = () => apiFetch<Album[]>(`${BASE}/albums`)
export const getAlbum = (id: number) => apiFetch<AlbumDetail>(`${BASE}/albums/${id}`)
export const saveAlbum = (body: Record<string, unknown>, id?: number) =>
  apiFetch<Album>(id ? `${BASE}/albums/${id}` : `${BASE}/albums`, json(id ? 'PATCH' : 'POST', body))
export const deleteAlbum = (id: number) => apiFetch<void>(`${BASE}/albums/${id}`, del)
export const updatePhoto = (id: number, body: { caption?: string | null; tags?: number[] }) =>
  apiFetch<AlbumDetail>(`${BASE}/photos/${id}`, json('PATCH', body))
export const deletePhoto = (id: number) => apiFetch<void>(`${BASE}/photos/${id}`, del)
export const untagMe = (id: number) => apiFetch<void>(`${BASE}/photos/${id}/tags/me`, del)

export interface UploadResult {
  added: Photo[]
  failed: { name: string; reason: string }[]
}

/** Sends the files as one multipart request; a refusal still lists why. */
export async function uploadPhotos(albumId: number, files: File[]): Promise<UploadResult> {
  const form = new FormData()
  files.forEach((f) => form.append('photos', f, f.name))
  const res = await apiFetchRaw(`${BASE}/albums/${albumId}/photos`, { method: 'POST', body: form })
  const body = await res.json().catch(() => ({}))
  if (res.ok || (res.status === 400 && Array.isArray(body.failed))) return body as UploadResult
  throw new Error(body.message || `HTTP ${res.status}`)
}

export async function photoUrl(id: number, size: 'thumb' | 'full'): Promise<string> {
  const res = await apiFetchRaw(`${BASE}/photos/${id}/file${size === 'thumb' ? '?size=thumb' : ''}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return URL.createObjectURL(await res.blob())
}

export const listIdeas = (status: string) => apiFetch<Idea[]>(`${BASE}/ideas?status=${status}`)
export const createIdea = (body: Record<string, unknown>) => apiFetch<Idea>(`${BASE}/ideas`, json('POST', body))
export const deleteIdea = (id: number) => apiFetch<void>(`${BASE}/ideas/${id}`, del)
export const voteIdea = (id: number) => apiFetch<Idea>(`${BASE}/ideas/${id}/vote`, json('POST', {}))
export const answerIdea = (id: number, body: { status: IdeaStatus; answer: string | null }) =>
  apiFetch<Idea>(`${BASE}/ideas/${id}/answer`, json('POST', body))
export const pollIdea = (id: number, body: Record<string, unknown>) => apiFetch<Idea>(`${BASE}/ideas/${id}/poll`, json('POST', body))

export const listHonours = () => apiFetch<Honours>(`${BASE}/honours`)
export const setHonourTier = (tierId: number | null) => apiFetch<Honours>(`${BASE}/honours/tier`, json('PUT', { tierId }))
export const settleLegacyHonours = (action: 'move' | 'discard') =>
  apiFetch<Honours>(`${BASE}/honours/legacy`, json('POST', { action }))
export const listJubilees = (days = 60) => apiFetch<Jubilee[]>(`${BASE}/jubilees?days=${days}`)

export const getWelcome = () => apiFetch<MyWelcome>(`${BASE}/welcome`)
export const tickStep = (id: number, done: boolean) => apiFetch<MyWelcome>(`${BASE}/welcome/${id}`, json('PUT', { done }))
export const listSteps = () => apiFetch<Step[]>(`${BASE}/welcome/steps`)
export const saveStep = (body: Record<string, unknown>, id?: number) =>
  apiFetch<Step>(id ? `${BASE}/welcome/steps/${id}` : `${BASE}/welcome/steps`, json(id ? 'PATCH' : 'POST', body))
export const deleteStep = (id: number) => apiFetch<void>(`${BASE}/welcome/steps/${id}`, del)
export const getProgress = () => apiFetch<Progress>(`${BASE}/welcome/progress`)

export function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

export function fmtDate(value: string | null, locale: string, withYear = true) {
  if (!value) return ''
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, withYear ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' })
}
