// Adapted from shadcn/ui's toast hook.
import * as React from 'react'
import type { ToastProps } from '@/components/ui/toast'

const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 5000

type ToasterToast = Omit<ToastProps, 'title'> & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
}

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type State = { toasts: ToasterToast[] }

const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

const removeTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function dispatch(next: State) {
  memoryState = next
  listeners.forEach((l) => l(memoryState))
}

function scheduleRemoval(id: string) {
  if (removeTimeouts.has(id)) return
  const timeout = setTimeout(() => {
    removeTimeouts.delete(id)
    dispatch({ toasts: memoryState.toasts.filter((t) => t.id !== id) })
  }, TOAST_REMOVE_DELAY)
  removeTimeouts.set(id, timeout)
}

interface ToastInput {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: ToastProps['variant']
  duration?: number
}

function toast(input: ToastInput) {
  const id = genId()

  const dismiss = () =>
    dispatch({
      toasts: memoryState.toasts.map((t) => (t.id === id ? { ...t, open: false } : t)),
    })

  const newToast: ToasterToast = {
    ...input,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) {
        dismiss()
        scheduleRemoval(id)
      }
    },
  }

  dispatch({ toasts: [newToast, ...memoryState.toasts].slice(0, TOAST_LIMIT) })
  scheduleRemoval(id)

  return { id, dismiss }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return { ...state, toast }
}

export { useToast, toast }
