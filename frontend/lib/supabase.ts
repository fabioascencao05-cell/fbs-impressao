import { createClient } from '@supabase/supabase-js'

const limpar = (v?: string) => (v || '').replace(/[﻿​‌‍]/g, '').trim()

export const supabase = createClient(
  limpar(process.env.NEXT_PUBLIC_SUPABASE_URL),
  limpar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
)

export const BUCKET_ENTRADA = 'bucket-entrada'
export const BUCKET_SAIDA   = 'bucket-saida'
