// Type shims for image libraries that ship without their own declarations.

declare module 'imagetracerjs' {
  interface ImageTracerOptions {
    // A subset of ImageTracer's tuning knobs (all optional).
    numberofcolors?: number
    colorquantcycles?: number
    pathomit?: number
    ltres?: number
    qtres?: number
    scale?: number
    strokewidth?: number
    linefilter?: boolean
    blurradius?: number
    [key: string]: unknown
  }
  interface ImageTracer {
    imagedataToSVG(imageData: ImageData, options?: ImageTracerOptions | string): string
    imageToSVG(url: string, callback: (svg: string) => void, options?: ImageTracerOptions | string): void
  }
  const ImageTracer: ImageTracer
  export default ImageTracer
}

declare module 'changedpi' {
  export function changeDpiDataUrl(dataUrl: string, dpi: number): string
  export function changeDpiBlob(blob: Blob, dpi: number): Promise<Blob>
}
