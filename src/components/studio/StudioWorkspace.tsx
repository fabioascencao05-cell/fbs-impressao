import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  Scissors,
  Sparkles,
  PenTool,
  Download,
  FileCode2,
  SendHorizonal,
  Loader2,
  Eye,
  X,
  ImagePlus,
  CheckCircle2,
  Layers3,
  WandSparkles,
  CircleDot,
  Palette,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { removeBackground, type BackgroundQuality } from '@/lib/imageTools/removeBackground'
import { enhanceImage, type EnhanceProfile } from '@/lib/imageTools/enhanceImage'
import { vectorizeToSvg, svgToPngBlob, type VectorizeFidelity, type VectorizePreset } from '@/lib/imageTools/vectorize'
import { createHalftone, type HalftoneMode } from '@/lib/imageTools/halftone'
import { downloadBlob, downloadText, rasterBlobToPng, withExtension } from '@/lib/imageTools/imageUtils'
import { EXPORT_PX_PER_CM } from '@/lib/constants'
import type { StudioAsset } from './studioTypes'

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

// Checkerboard so transparency (removed background) is obvious in the preview.
const CHECKER =
  'conic-gradient(#c9ccd4 0deg 90deg, #f4f5f7 90deg 180deg, #c9ccd4 180deg 270deg, #f4f5f7 270deg 360deg)'

function loadDims(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

function yieldToPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function fileFromAsset(asset: StudioAsset): File {
  if (asset.svg) {
    return new File([asset.svg], withExtension(asset.name, 'svg'), { type: 'image/svg+xml' })
  }
  const type = asset.resultBlob.type || 'image/png'
  const extension = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png'
  return new File([asset.resultBlob], withExtension(asset.name, extension), { type })
}

function vectorFilename(asset: StudioAsset): string {
  const base = asset.name.replace(/\.[^./\\]+$/, '')
  return `${base}${asset.vectorSource === 'traced' ? '-vetor' : ''}.svg`
}

function halftoneFilename(asset: StudioAsset): string {
  return `${asset.name.replace(/\.[^./\\]+$/, '')}-halftone.svg`
}

function printablePreviewWidth(width: number) {
  return Math.max(2400, Math.min(6000, width * 3))
}

interface RangeControlProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  disabled?: boolean
  onChange: (value: number) => void
}

function RangeControl({ id, label, value, min, max, step = 1, suffix = '', disabled = false, onChange }: RangeControlProps) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
        {label}
        <output htmlFor={id} className="rounded-md border border-primary/15 bg-primary/5 px-1.5 py-0.5 font-semibold tabular-nums text-primary">
          {value}{suffix}
        </output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="fbs-range w-full"
      />
    </label>
  )
}

export default function StudioWorkspace() {
  const navigate = useNavigate()
  const addImages = useGangSheetStore((s) => s.addImages)

  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [enhanceScale, setEnhanceScale] = useState(4)
  const [enhanceProfile, setEnhanceProfile] = useState<EnhanceProfile>('balanced')
  const [vectorPreset, setVectorPreset] = useState<VectorizePreset>('logo')
  const [vectorFidelity, setVectorFidelity] = useState<VectorizeFidelity>('high')
  const [backgroundQuality, setBackgroundQuality] = useState<BackgroundQuality>('quality')
  const [halftoneMode, setHalftoneMode] = useState<HalftoneMode>('mono')
  const [halftoneDotSize, setHalftoneDotSize] = useState(12)
  const [halftoneSpacing, setHalftoneSpacing] = useState(18)
  const [halftoneAngle, setHalftoneAngle] = useState(45)
  const [halftoneIntensity, setHalftoneIntensity] = useState(100)
  const [halftoneColor, setHalftoneColor] = useState('#111111')
  const [showOriginal, setShowOriginal] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [batchBusy, setBatchBusy] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selected = assets.find((a) => a.id === selectedId) ?? null
  const busy = selected?.busy ?? null
  const anyBusy = Boolean(batchBusy) || assets.some((asset) => asset.busy)

  // Revoke every object URL on unmount to avoid leaks.
  const assetsRef = useRef<StudioAsset[]>([])
  assetsRef.current = assets
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => {
      mountedRef.current = false
      for (const a of assetsRef.current) {
        URL.revokeObjectURL(a.originalUrl)
        if (a.resultUrl !== a.originalUrl) URL.revokeObjectURL(a.resultUrl)
      }
    }
  }, [])

  const addFiles = useCallback(async (files: File[]) => {
    const accepted = files.filter((f) => ACCEPTED.has(f.type))
    const skipped = files.length - accepted.length
    const created = await Promise.all(accepted.map(async (file) => {
      const url = URL.createObjectURL(file)
      const { width, height } = await loadDims(file)
      // Keep a genuine SVG untouched. Re-tracing an already-vector file would
      // rasterize it first and reduce its quality, exactly what we want to avoid.
      const originalSvg = file.type === 'image/svg+xml' ? await file.text() : null
      return {
        id: crypto.randomUUID(),
        name: file.name,
        originalUrl: url,
        resultBlob: file,
        resultUrl: url,
        svg: originalSvg,
        vectorSource: originalSvg ? 'original' : null,
        vectorPathCount: originalSvg ? (originalSvg.match(/<path\b/gi) ?? []).length : null,
        halftoneSvg: null,
        width,
        height,
        busy: null,
        progress: null,
      } satisfies StudioAsset
    }))
    if (created.length) {
      startTransition(() => {
        setAssets((prev) => [...prev, ...created])
        setSelectedId((cur) => cur ?? created[0].id)
      })
    }
    if (skipped > 0) {
      toast({ variant: 'destructive', title: 'Alguns arquivos foram ignorados', description: `${skipped} arquivo(s) não são PNG, JPG, WebP ou SVG.` })
    }
  }, [])

  const patchAsset = useCallback((id: string, patch: Partial<StudioAsset>) => {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }, [])

  // Replaces an asset's result with a new blob (revoking the stale URL) and
  // refreshes its dimensions.
  const setResult = useCallback(
    async (id: string, blob: Blob, extra?: Partial<StudioAsset>) => {
      const dims = await loadDims(blob)
      // If the view unmounted while processing (e.g. user navigated to the
      // sheet), drop the result instead of creating an orphan object URL.
      if (!mountedRef.current) return
      const url = URL.createObjectURL(blob)
      setAssets((prev) => {
        // Asset was removed mid-operation — revoke the fresh URL, keep state.
        if (!prev.some((a) => a.id === id)) {
          URL.revokeObjectURL(url)
          return prev
        }
        return prev.map((a) => {
          if (a.id !== id) return a
          if (a.resultUrl !== a.originalUrl) URL.revokeObjectURL(a.resultUrl)
          return { ...a, resultBlob: blob, resultUrl: url, width: dims.width, height: dims.height, ...extra }
        })
      })
    },
    []
  )

  const runRemoveBg = useCallback(
    async (asset: StudioAsset, silent = false): Promise<boolean> => {
      patchAsset(asset.id, { busy: 'Preparando remoção de fundo…', progress: null })
      try {
        await yieldToPaint()
        const out = await removeBackground(asset.resultBlob, {
          quality: backgroundQuality,
          onProgress: (p) => patchAsset(asset.id, { busy: p.stage, progress: p.ratio ?? null }),
        })
        await setResult(asset.id, out, { svg: null, vectorSource: null, vectorPathCount: null, halftoneSvg: null })
        if (!silent) toast({ title: 'Fundo removido', description: 'Fundo transparente pronto para download ou para a folha.' })
        return true
      } catch (err) {
        if (!silent) toast({ variant: 'destructive', title: 'Falha ao remover o fundo', description: err instanceof Error ? err.message : 'Erro desconhecido.' })
        return false
      } finally {
        patchAsset(asset.id, { busy: null, progress: null })
      }
    },
    [backgroundQuality, patchAsset, setResult]
  )

  const runAllRemoveBg = useCallback(async () => {
    if (assets.length === 0 || anyBusy) return
    setBatchBusy('Removendo fundos em lote…')
    let completed = 0
    let failed = 0
    for (const asset of assets) {
      const success = await runRemoveBg(asset, true)
      if (success) completed++
      else failed++
    }
    setBatchBusy(null)
    toast({
      variant: failed ? 'destructive' : 'default',
      title: failed ? 'Lote concluído com pendências' : 'Fundos removidos',
      description: failed ? `${completed} concluída(s) e ${failed} com falha. Selecione a arte para tentar de novo.` : `${completed} arte(s) prontas com fundo transparente.`,
    })
  }, [anyBusy, assets, runRemoveBg])

  const runEnhance = useCallback(
    async (asset: StudioAsset) => {
      patchAsset(asset.id, { busy: `Melhorando (${enhanceScale}×) e gravando 300 DPI…`, progress: null })
      try {
        await yieldToPaint()
        const out = await enhanceImage(asset.resultBlob, { scale: enhanceScale, profile: enhanceProfile })
        await setResult(asset.id, out.blob, { svg: null, vectorSource: null, vectorPathCount: null, halftoneSvg: null })
        const scale = Number.isInteger(out.appliedScale) ? String(out.appliedScale) : out.appliedScale.toFixed(1)
        toast({
          title: 'Imagem melhorada',
          description: `${out.width}×${out.height}px · ${scale}× · 300 DPI${out.capped ? ' (limite seguro do navegador aplicado)' : ''}.`,
        })
      } catch (err) {
        toast({ variant: 'destructive', title: 'Falha ao melhorar', description: err instanceof Error ? err.message : 'Erro desconhecido.' })
      } finally {
        patchAsset(asset.id, { busy: null, progress: null })
      }
    },
    [enhanceProfile, enhanceScale, patchAsset, setResult]
  )

  const runVectorize = useCallback(
    async (asset: StudioAsset) => {
      if (asset.vectorSource === 'original' && asset.svg) {
        toast({ title: 'Este arquivo já é vetor', description: 'O SVG original será preservado. Você já pode baixá-lo ou usá-lo na folha.' })
        return
      }
      patchAsset(asset.id, { busy: 'Vetorizando…', progress: null })
      try {
        await yieldToPaint()
        const vector = await vectorizeToSvg(asset.resultBlob, { preset: vectorPreset, fidelity: vectorFidelity })
        // Rasterize only for a sharp in-app PNG preview. The SVG itself stays
        // intact and is the file sent to the gang sheet and offered for download.
        const previewWidth = printablePreviewWidth(Math.max(asset.width, vector.tracePlan.sourceWidth))
        const png = await svgToPngBlob(vector.svg, previewWidth)
        await setResult(asset.id, png, { svg: vector.svg, vectorSource: 'traced', vectorPathCount: vector.pathCount, halftoneSvg: null })
        toast({
          title: 'Vetor fiel pronto',
          description: `${vector.pathCount} forma(s) vetoriais · SVG pronto para Corel e para a folha DTF. Para fotos e degradês, prefira PNG.`,
        })
      } catch (err) {
        toast({ variant: 'destructive', title: 'Falha ao vetorizar', description: err instanceof Error ? err.message : 'Erro desconhecido.' })
      } finally {
        patchAsset(asset.id, { busy: null, progress: null })
      }
    },
    [vectorFidelity, vectorPreset, patchAsset, setResult]
  )

  const runHalftone = useCallback(
    async (asset: StudioAsset) => {
      patchAsset(asset.id, { busy: 'Criando retícula…', progress: null })
      try {
        await yieldToPaint()
        const result = await createHalftone(asset.resultBlob, {
          mode: halftoneMode,
          dotSize: halftoneDotSize,
          spacing: halftoneSpacing,
          angle: halftoneAngle,
          intensity: halftoneIntensity,
          color: halftoneColor,
        })
        await setResult(asset.id, result.blob, {
          svg: null,
          vectorSource: null,
          vectorPathCount: null,
          halftoneSvg: result.svg,
        })
        toast({
          title: 'Halftone pronto',
          description: `${result.dotCount.toLocaleString('pt-BR')} ponto(s) · PNG transparente${result.svg ? ' e SVG de pontos editável' : ''}${result.capped ? ' · limite seguro aplicado' : ''}.`,
        })
      } catch (err) {
        toast({ variant: 'destructive', title: 'Falha ao criar halftone', description: err instanceof Error ? err.message : 'Erro desconhecido.' })
      } finally {
        patchAsset(asset.id, { busy: null, progress: null })
      }
    },
    [halftoneAngle, halftoneColor, halftoneDotSize, halftoneIntensity, halftoneMode, halftoneSpacing, patchAsset, setResult]
  )

  const downloadPng = useCallback(
    async (asset: StudioAsset) => {
      try {
        // An uploaded SVG is already perfect as vector, but a button labelled
        // PNG must still download a real 300 DPI PNG — never SVG bytes with a
        // misleading .png extension.
        if (asset.resultBlob.type === 'image/svg+xml' && asset.svg) {
          patchAsset(asset.id, { busy: 'Gerando PNG a 300 DPI…', progress: null })
          const png = await svgToPngBlob(asset.svg, printablePreviewWidth(asset.width))
          downloadBlob(png, withExtension(asset.name, 'png'))
        } else if (asset.resultBlob.type !== 'image/png') {
          patchAsset(asset.id, { busy: 'Gerando PNG a 300 DPI…', progress: null })
          const { changeDpiBlob } = await import('changedpi')
          const png = await changeDpiBlob(await rasterBlobToPng(asset.resultBlob), 300)
          downloadBlob(png, withExtension(asset.name, 'png'))
        } else {
          downloadBlob(asset.resultBlob, withExtension(asset.name, 'png'))
        }
      } catch (err) {
        toast({ variant: 'destructive', title: 'Falha ao exportar PNG', description: err instanceof Error ? err.message : 'Erro desconhecido.' })
      } finally {
        patchAsset(asset.id, { busy: null, progress: null })
      }
    },
    [patchAsset]
  )

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target) {
        URL.revokeObjectURL(target.originalUrl)
        if (target.resultUrl !== target.originalUrl) URL.revokeObjectURL(target.resultUrl)
      }
      const next = prev.filter((a) => a.id !== id)
      setSelectedId((cur) => (cur === id ? next[0]?.id ?? null : cur))
      return next
    })
  }, [])

  const sendToSheet = useCallback(
    async (list: StudioAsset[]) => {
      const files = list.map(fileFromAsset)
      const { added } = await addImages(files)
      const vectors = list.filter((asset) => asset.svg).length
      toast({ title: 'Enviado para a folha', description: `${added} arte(s) na fila do montador.${vectors ? ` ${vectors} em vetor, sem perder definição.` : ''}` })
      navigate('/montar')
    },
    [addImages, navigate]
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files))
  }

  const maxPrintWidthCm = selected ? selected.width / EXPORT_PX_PER_CM : 0

  return (
    <div className="fbs-studio flex h-full flex-col overflow-hidden md:flex-row">
      {/* ── Left: upload + queue ─────────────────────────────────────── */}
      <aside className="glass-panel fbs-side-panel flex w-full shrink-0 flex-col border-b md:h-full md:w-80 md:border-b-0 md:border-r">
        <div className="border-b px-4 py-4">
          <p className="fbs-kicker mb-1">FBS DTF LAB</p>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Sparkles className="h-4 w-4 text-primary" />
            Studio de Imagem
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Remova o fundo, prepare para 300 DPI e gere SVG fiel para logos e escritas.
          </p>
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              'fbs-upload-zone flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-all',
              dragOver ? 'border-primary bg-primary/10 shadow-[0_0_32px_-10px_hsl(var(--primary)/0.85)]' : 'border-border hover:border-primary/60 hover:bg-muted/40'
            )}
          >
            <div className="glow-primary flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">Arraste imagens aqui</span>
            <span className="text-[11px] text-muted-foreground">PNG, JPG, WebP ou SVG · ou clique para selecionar</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }}
          />
        </div>

        <div className="flex items-center justify-between px-4 pb-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Artes {assets.length > 0 && <Badge variant="secondary">{assets.length}</Badge>}
          </span>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {assets.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card/30 px-3 py-6 text-center text-[11px] text-muted-foreground">
              Nenhuma arte ainda
            </p>
          ) : (
            assets.map((a) => (
              <div
                key={a.id}
                className={cn(
                  'fbs-queue-item group flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-all',
                  a.id === selectedId ? 'border-primary/70 bg-primary/5 shadow-[0_8px_22px_-16px_hsl(var(--primary)/0.8)]' : 'hover:border-primary/30 hover:bg-muted/50'
                )}
              >
                <button type="button" onClick={() => setSelectedId(a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <div
                    className="h-10 w-10 shrink-0 rounded-md bg-cover bg-center"
                    style={{ backgroundImage: `url(${a.resultUrl}), ${CHECKER}`, backgroundSize: 'contain, 10px 10px', backgroundRepeat: 'no-repeat, repeat', backgroundPosition: 'center' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{a.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {a.busy
                        ? a.busy
                        : `${a.width}×${a.height}px${a.svg ? a.vectorSource === 'original' ? ' · SVG original' : ` · Vetor: ${a.vectorPathCount ?? 0} formas` : ''}${a.halftoneSvg ? ' · SVG de pontos' : ''}`}
                    </p>
                  </div>
                </button>
                {a.busy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <button
                    type="button"
                    onClick={() => removeAsset(a.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    title="Remover"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {assets.length > 0 && (
          <div className="space-y-2 border-t p-4">
            {batchBusy && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/10 px-3 py-2 text-[11px] font-medium text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {batchBusy}
              </div>
            )}
            <Button variant="outline" className="w-full" disabled={anyBusy} onClick={runAllRemoveBg}>
              <Layers3 className="h-4 w-4" />
              Tirar fundo de todas
            </Button>
            <Button className="glow-primary w-full" disabled={anyBusy} onClick={() => sendToSheet(assets)}>
              <SendHorizonal className="h-4 w-4" />
              Enviar todas pra folha
            </Button>
          </div>
        )}
      </aside>

      {/* ── Right: preview + tools ───────────────────────────────────── */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="fbs-empty-state flex max-w-sm flex-col items-center gap-4 rounded-3xl border border-dashed bg-card/40 px-8 py-12 text-center">
              <div className="glow-primary flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <ImagePlus className="h-7 w-7" />
              </div>
              <p className="text-base font-semibold">Envie uma arte para começar</p>
              <p className="text-xs text-muted-foreground">
                Aqui você tira o fundo, melhora a qualidade e cria SVG para logos — e manda direto pra folha DTF.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Preview */}
            <section className="fbs-preview-panel flex min-h-[320px] flex-col overflow-hidden rounded-2xl border bg-card/70 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{selected.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    Até {maxPrintWidthCm.toFixed(1)} cm de largura a 300 DPI
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{selected.width}×{selected.height}px</Badge>
                  {selected.svg && (
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      {selected.vectorSource === 'original' ? 'SVG original' : 'Vetor pronto'}
                    </Badge>
                  )}
                  {selected.halftoneSvg && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                      <CircleDot className="mr-1 h-3 w-3" /> SVG pontos
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onMouseDown={() => setShowOriginal(true)}
                    onMouseUp={() => setShowOriginal(false)}
                    onMouseLeave={() => setShowOriginal(false)}
                    onTouchStart={() => setShowOriginal(true)}
                    onTouchEnd={() => setShowOriginal(false)}
                    title="Segure para ver a imagem original"
                  >
                    <Eye className="h-4 w-4" />
                    {showOriginal ? 'Original' : 'Resultado'}
                  </Button>
                </div>
              </div>
              <div
                className="relative flex flex-1 items-center justify-center p-6"
                style={{ background: CHECKER, backgroundSize: '20px 20px' }}
              >
                <img
                  src={showOriginal ? selected.originalUrl : selected.resultUrl}
                  alt={selected.name}
                  className="max-h-[60vh] max-w-full object-contain drop-shadow-xl"
                />
                {busy && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-sm font-medium">{busy}</p>
                    {selected.progress != null && (
                      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(selected.progress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Tools */}
            <section className="flex flex-col gap-3">
              {/* Remover fundo */}
              <div className="fbs-tool-card rounded-2xl border bg-card/70 p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Scissors className="h-4 w-4 text-primary" /> Remover fundo
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">Processa no navegador. O modelo é baixado uma vez e depois fica em cache.</p>
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
                  {(['quality', 'fast'] as BackgroundQuality[]).map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      disabled={anyBusy}
                      onClick={() => setBackgroundQuality(quality)}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                        backgroundQuality === quality ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {quality === 'quality' ? 'Melhor recorte' : 'Mais rápido'}
                    </button>
                  ))}
                </div>
                <Button className="w-full" variant="secondary" disabled={anyBusy} onClick={() => runRemoveBg(selected)}>
                  Tirar o fundo
                </Button>
              </div>

              {/* Melhorar / 300 DPI */}
              <div className="fbs-tool-card rounded-2xl border bg-card/70 p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <WandSparkles className="h-4 w-4 text-primary" /> Preparar para impressão
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">Amplia com filtro de impressão sem deformar nem inventar detalhes. O PNG sai identificado como 300 DPI.</p>
                <div className="mb-2 flex gap-1">
                  {[2, 4].map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={anyBusy}
                      onClick={() => setEnhanceScale(s)}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                        enhanceScale === s ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
                  {(['balanced', 'crisp'] as EnhanceProfile[]).map((profile) => (
                    <button
                      key={profile}
                      type="button"
                      disabled={anyBusy}
                      onClick={() => setEnhanceProfile(profile)}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                        enhanceProfile === profile ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {profile === 'balanced' ? 'Mais fiel' : 'Letras e logos'}
                    </button>
                  ))}
                </div>
                <Button className="w-full" variant="secondary" disabled={anyBusy} onClick={() => runEnhance(selected)}>
                  Melhorar qualidade
                </Button>
              </div>

              {/* Vetorizar */}
              <div className="fbs-tool-card rounded-2xl border bg-card/70 p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <PenTool className="h-4 w-4 text-primary" /> Vetorizar
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">Para logos, letras e desenhos chapados. O SVG preserva a proporção; fotos, texturas e degradês devem ficar em PNG.</p>
                <div className="mb-2 grid grid-cols-3 gap-1">
                  {(['logo', 'detailed', 'mono'] as VectorizePreset[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={anyBusy}
                      onClick={() => setVectorPreset(p)}
                      className={cn(
                        'rounded-md border px-1 py-1 text-[11px] font-medium capitalize transition-colors',
                        vectorPreset === p ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      {p === 'logo' ? 'Logo' : p === 'detailed' ? 'Detalhe' : 'Traço'}
                    </button>
                  ))}
                </div>
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
                  {(['high', 'balanced'] as VectorizeFidelity[]).map((fidelity) => (
                    <button
                      key={fidelity}
                      type="button"
                      disabled={anyBusy || selected.vectorSource === 'original'}
                      onClick={() => setVectorFidelity(fidelity)}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                        vectorFidelity === fidelity ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {fidelity === 'high' ? 'Mais fiel' : 'Mais leve'}
                    </button>
                  ))}
                </div>
                <Button className="w-full" variant="secondary" disabled={anyBusy || selected.vectorSource === 'original'} onClick={() => runVectorize(selected)}>
                  {selected.vectorSource === 'original' ? 'SVG original preservado' : 'Gerar vetor fiel (SVG)'}
                </Button>
              </div>

              {/* Halftone */}
              <div className="fbs-tool-card rounded-2xl border bg-card/70 p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <CircleDot className="h-4 w-4 text-primary" /> Halftone
                </div>
                <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                  Cria pontos com fundo transparente para efeitos de estampa, sem reduzir o tamanho da arte.
                </p>
                <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
                  {(['mono', 'cmyk'] as HalftoneMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={anyBusy}
                      onClick={() => setHalftoneMode(mode)}
                      className={cn(
                        'rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all',
                        halftoneMode === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                      )}
                    >
                      {mode === 'mono' ? '1 cor + SVG' : 'CMYK visual'}
                    </button>
                  ))}
                </div>
                <div className="space-y-2.5">
                  <RangeControl id="halftone-dot" label="Tamanho do ponto" value={halftoneDotSize} min={2} max={48} suffix=" px" disabled={anyBusy} onChange={setHalftoneDotSize} />
                  <RangeControl id="halftone-spacing" label="Espaçamento" value={halftoneSpacing} min={4} max={64} suffix=" px" disabled={anyBusy} onChange={setHalftoneSpacing} />
                  <RangeControl id="halftone-intensity" label="Intensidade" value={halftoneIntensity} min={20} max={180} suffix="%" disabled={anyBusy} onChange={setHalftoneIntensity} />
                </div>
                <div className="mt-3">
                  <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Ângulo da retícula</span>
                  <div className="grid grid-cols-5 gap-1">
                    {[0, 15, 30, 45, 60, 75, 90].map((angle) => (
                      <button
                        key={angle}
                        type="button"
                        disabled={anyBusy}
                        onClick={() => setHalftoneAngle(angle)}
                        className={cn(
                          'rounded-md border px-1 py-1 text-[10px] font-semibold tabular-nums transition-colors',
                          halftoneAngle === angle ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                        )}
                      >
                        {angle}°
                      </button>
                    ))}
                  </div>
                </div>
                {halftoneMode === 'mono' ? (
                  <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-2.5 py-2 text-[11px] font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5 text-primary" /> Cor dos pontos</span>
                    <input
                      type="color"
                      value={halftoneColor}
                      disabled={anyBusy}
                      onChange={(event) => setHalftoneColor(event.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5 disabled:cursor-not-allowed"
                      aria-label="Cor dos pontos do halftone"
                    />
                  </label>
                ) : (
                  <p className="mt-3 rounded-xl border border-primary/15 bg-primary/5 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
                    CMYK é um efeito visual em PNG RGB. A separação de tinta e o perfil final continuam no RIP da impressão.
                  </p>
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">SVG de pontos é gerado no modo 1 cor quando o arquivo ficar leve para editar.</p>
                <Button className="mt-3 w-full" variant="secondary" disabled={anyBusy} onClick={() => runHalftone(selected)}>
                  <CircleDot className="h-4 w-4" /> Criar halftone
                </Button>
              </div>

              {/* Export / use */}
              <div className="fbs-tool-card mt-auto space-y-2 rounded-2xl border bg-card/70 p-3 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" disabled={anyBusy} onClick={() => void downloadPng(selected)}>
                    <Download className="h-4 w-4" /> PNG
                  </Button>
                  <Button variant="outline" size="sm" disabled={anyBusy || !selected.svg} onClick={() => selected.svg && downloadText(selected.svg, vectorFilename(selected))} title={selected.svg ? 'Baixar SVG vetorial para o Corel' : 'Vetorize primeiro para habilitar o SVG'}>
                    <FileCode2 className="h-4 w-4" /> Baixar SVG
                  </Button>
                </div>
                {selected.halftoneSvg && (
                  <Button variant="outline" size="sm" className="w-full" disabled={anyBusy} onClick={() => downloadText(selected.halftoneSvg!, halftoneFilename(selected))} title="Baixar os pontos do halftone em SVG editável">
                    <CircleDot className="h-4 w-4" /> Baixar SVG do halftone
                  </Button>
                )}
                <Button className="glow-primary w-full" disabled={anyBusy} onClick={() => sendToSheet([selected])}>
                  <SendHorizonal className="h-4 w-4" /> Usar na folha
                </Button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
