import {
  useFloating, useHover, useInteractions, useFocus,
  offset, flip, shift, arrow, FloatingArrow,
} from '@floating-ui/react'
import { type ReactNode, useRef, useState } from 'react'

interface Props {
  content: ReactNode
  children: ReactNode
  delay?: number
}

export default function MatrixTooltip({ content, children, delay = 80 }: Props) {
  const [open, setOpen] = useState(false)
  const arrowRef = useRef(null)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
  })

  const hover = useHover(context, { delay: { open: delay, close: 50 } })
  const focus = useFocus(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus])

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()}>
        {children}
      </span>

      {open && (
        <div
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            zIndex: 9000,
            background: 'var(--bg-card)',
            border: '1px solid var(--green-dim)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
            maxWidth: 280,
            pointerEvents: 'none',
          }}
          {...getFloatingProps()}
        >
          <FloatingArrow
            ref={arrowRef}
            context={context}
            fill="var(--bg-card)"
            stroke="var(--green-dim)"
            strokeWidth={1}
          />
          {content}
        </div>
      )}
    </>
  )
}
