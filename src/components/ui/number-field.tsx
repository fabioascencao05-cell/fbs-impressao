import * as React from 'react'
import { Input } from './input'

type NumberFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: number
  onCommit: (value: number) => void
}

/**
 * Numeric input that keeps a local text draft while editing, so the field can
 * be cleared and retyped without the bound store value snapping it back to a
 * minimum on every keystroke. Valid numbers are committed as they are typed;
 * an empty/invalid field simply waits, and reverts to the last good value on
 * blur. Callers keep whatever clamping they already do in `onCommit`.
 */
export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  ({ value, onCommit, onBlur, ...props }, ref) => {
    const [draft, setDraft] = React.useState(String(value))

    // Sync the draft whenever the committed value actually changes (e.g. after
    // clamping, or a programmatic update), but not while the user is typing an
    // equivalent value — that keeps the caret and partial input intact.
    React.useEffect(() => {
      setDraft((prev) => (Number(prev) === value ? prev : String(value)))
    }, [value])

    return (
      <Input
        {...props}
        ref={ref}
        type="number"
        value={draft}
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          const n = Number(raw)
          if (raw !== '' && !Number.isNaN(n)) onCommit(n)
        }}
        onBlur={(e) => {
          const n = Number(draft)
          if (draft === '' || Number.isNaN(n)) setDraft(String(value))
          else onCommit(n)
          onBlur?.(e)
        }}
      />
    )
  }
)
NumberField.displayName = 'NumberField'
