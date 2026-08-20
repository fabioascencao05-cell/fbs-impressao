import { useCallback, useRef, useState } from 'react'
import { LoaderCircle, UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { toast } from '@/hooks/use-toast'

export default function ImageUploadZone() {
  const addImages = useGangSheetStore((s) => s.addImages)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || isUploading) return
      const files = Array.from(fileList)
      setIsUploading(true)
      void addImages(files)
        .then(({ added, skipped }) => {
          if (skipped > 0) {
            toast({
              variant: 'destructive',
              title: 'Alguns arquivos foram ignorados',
              description: `${skipped} arquivo(s) inválido(s), acima de 50 MB ou fora dos formatos PNG, JPG e WebP.`,
            })
          }
          if (added > 0) {
            toast({
              title: 'Imagens adicionadas',
              description: `${added} imagem(ns) na fila. Defina o tamanho e gere o layout quando estiver pronto.`,
            })
          }
        })
        .catch(() => {
          toast({
            variant: 'destructive',
            title: 'Não foi possível adicionar as imagens',
            description: 'Verifique os arquivos e tente novamente.',
          })
        })
        .finally(() => setIsUploading(false))
    },
    [addImages, isUploading]
  )

  return (
    <div
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isDragging ? 'border-primary bg-accent ring-2 ring-primary/40' : 'border-input hover:bg-accent/50',
        isUploading && 'cursor-wait opacity-75'
      )}
      role="button"
      tabIndex={0}
      aria-label="Adicionar imagens à fila"
      aria-describedby="upload-description"
      aria-busy={isUploading}
      onClick={(event) => {
        if (event.target !== inputRef.current && !isUploading) inputRef.current?.click()
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !isUploading) {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="h-4 w-4" aria-hidden="true" />}
      </div>
      <p className="text-sm font-medium">{isUploading ? 'Preparando imagens...' : 'Arraste imagens aqui'}</p>
      <p id="upload-description" className="text-xs text-muted-foreground">
        {isUploading ? 'Aguarde antes de enviar novos arquivos.' : 'PNG, JPG ou WebP · clique ou pressione Enter para selecionar'}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
