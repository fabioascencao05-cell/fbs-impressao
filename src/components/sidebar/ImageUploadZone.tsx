import { useCallback, useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { toast } from '@/hooks/use-toast'

export default function ImageUploadZone() {
  const addImages = useGangSheetStore((s) => s.addImages)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return
      const files = Array.from(fileList)
      void addImages(files).then(({ added, skipped }) => {
        if (skipped > 0) {
          toast({
            variant: 'destructive',
            title: 'Alguns arquivos foram ignorados',
            description: `${skipped} arquivo(s) não são PNG. Apenas .PNG é aceito.`,
          })
        }
        if (added > 0) {
          toast({
            title: 'Imagens adicionadas',
            description: `${added} imagem(ns) na fila.`,
          })
        }
      })
    },
    [addImages]
  )

  return (
    <div
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
        isDragging ? 'border-primary bg-accent' : 'border-input hover:bg-accent/50'
      )}
      onClick={() => inputRef.current?.click()}
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
      <UploadCloud className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">Arraste imagens .PNG aqui</p>
      <p className="text-xs text-muted-foreground">ou clique para selecionar</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
