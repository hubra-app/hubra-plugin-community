import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Center, Loader } from '@mantine/core'
import { IconPhoto } from '@tabler/icons-react'
import { useT, useToast } from '@hubra/plugin-sdk'
import { QK, errorText, photoUrl } from './api'

/** Runs an action with a busy flag and a toast for errors. */
export function useAction() {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) notify('success', ok)
      return true
    } catch (err) {
      notify('error', errorText(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

export function useLocale() {
  const { i18n } = useT()
  return i18n.language?.startsWith('de') ? 'de-CH' : 'en-GB'
}

/** A photo from the club's file store (it needs the session, so no plain src). */
export function Picture({
  id,
  size = 'thumb',
  fit = 'cover',
  height,
  alt = '',
}: {
  id: number | null
  size?: 'thumb' | 'full'
  fit?: 'cover' | 'contain'
  height?: number | string
  alt?: string
}) {
  const img = useQuery({
    queryKey: QK.image(id ?? 0, size),
    queryFn: () => photoUrl(id!, size),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })
  const frame = { width: '100%', height: height ?? '100%', background: 'var(--mantine-color-default-hover)' }
  if (!id || img.error)
    return (
      <Center style={frame}>
        <IconPhoto size={28} color="var(--mantine-color-dimmed)" />
      </Center>
    )
  if (!img.data)
    return (
      <Center style={frame}>
        <Loader size="sm" />
      </Center>
    )
  return (
    <Box
      component="img"
      src={img.data}
      alt={alt}
      style={{ ...frame, objectFit: fit, display: 'block', background: fit === 'contain' ? 'var(--mantine-color-dark-8)' : frame.background }}
    />
  )
}
