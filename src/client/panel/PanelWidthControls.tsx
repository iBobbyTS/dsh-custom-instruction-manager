/**
 * PanelWidthControls — reusable transcript-width mechanism for the skill-hub
 * panel, adapted from dsh's official ConversationWidthControls
 * (packages/client/ui-conversation/src/client/skeleton/
 * ConversationWidthControls.tsx, MIT License, Copyright (c) 2026 DeepSeek —
 * see THIRD_PARTY_NOTICES.md).
 *
 * Differences from the original:
 *  - no factory-slot coupling: plain props (container ref + always active);
 *  - its own localStorage key, so the chat page's preference is untouched;
 *  - the wheel-forward target is our own [data-hub-scroll] scroller;
 *  - the min width is 480 (denser panel content than the chat column).
 *
 * Mechanism (mirrors the original): two invisible absolute strips flanking
 * the centered content column; pointer capture + rAF-throttled drag reports
 * outward dx * 2 (drag one side, the centered column widens on both), the
 * resolved width is published as --hub-user-width on the shell, persisted to
 * localStorage on commit, and a ResizeObserver re-publishes on window
 * resizes. A hover/drag glow bar follows the pointer's Y.
 */

import { useCallback, useLayoutEffect, useRef, type ReactElement } from 'react'
import css from './panel.module.css'

/** localStorage key for the dragged panel width preference (px). */
const WIDTH_PREF_KEY = 'dsh.skill-hub.panelWidth'
/** Floor for a dragged content width; the panel stays readable below the chat column's 640. */
const CONTENT_MIN = 480
/** Default content width: the built-in pages' 960px column (ui-plugin-manager / ui-schedule). */
const CONTENT_DEFAULT = 960
/** Horizontal room reserved for both handles and their safe edge zones. */
const CONTENT_EDGE_BUDGET = 176
const WHEEL_DELTA_LINE = 1
const WHEEL_DELTA_PAGE = 2
const FALLBACK_WHEEL_LINE_PX = 16

/** Read a valid persisted width preference, or null when absent or corrupt. */
function readWidthPreference(): number | null {
  const raw = localStorage.getItem(WIDTH_PREF_KEY)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Resolve the width displayed for one measured shell width. */
function resolveContentWidth(shellWidth: number, preference: number | null): number {
  const max = Math.max(CONTENT_MIN, shellWidth - CONTENT_EDGE_BUDGET)
  if (preference !== null) return Math.min(Math.max(preference, CONTENT_MIN), max)
  return Math.min(CONTENT_DEFAULT, max)
}

/** Convert a wheel event's vertical delta to scrollport pixels. */
function wheelDeltaY(event: React.WheelEvent, scrollport: HTMLElement): number {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    const lineHeight = Number.parseFloat(getComputedStyle(scrollport).lineHeight)
    return event.deltaY * (Number.isFinite(lineHeight) ? lineHeight : FALLBACK_WHEEL_LINE_PX)
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) return event.deltaY * scrollport.clientHeight
  return event.deltaY
}

/** One pointer-captured panel width handle. */
function WidthHandle(props: {
  side: 'left' | 'right'
  onStart: () => number
  onDrag: (width: number) => void
  onCommit: (width: number) => void
  onEnd: () => void
}): ReactElement {
  const dragging = useRef(false)
  const base = useRef(0)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props

  const outwardWidth = () => {
    const dx = latest.current - origin.current
    const outward = callbacks.current.side === 'right' ? dx : -dx
    return base.current + outward * 2
  }
  const cancelFrame = () => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
  }
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = event.clientX
    latest.current = event.clientX
    base.current = callbacks.current.onStart()
    dragging.current = true
    event.currentTarget.toggleAttribute('data-dragging', true)
  }, [])
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const box = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--hub-width-handle-pointer-y', `${event.clientY - box.top}px`)
    latest.current = event.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(outwardWidth())
    })
  }, [])
  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    dragging.current = false
    event.currentTarget.toggleAttribute('data-dragging', false)
    event.currentTarget.releasePointerCapture(event.pointerId)
    cancelFrame()
    latest.current = event.clientX
    // A press-only gesture must not overwrite a wider preference with its window-clamped display value.
    if (latest.current !== origin.current) callbacks.current.onCommit(outwardWidth())
    callbacks.current.onEnd()
  }, [])
  const onPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    event.currentTarget.toggleAttribute('data-dragging', false)
    // Cancellation abandons persistence and restores the saved width through onEnd.
    cancelFrame()
    callbacks.current.onEnd()
  }, [])
  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const shell = event.currentTarget.parentElement
    if (shell === null) return
    const scrollport = shell.querySelector<HTMLElement>(':scope > [data-hub-scroll]')
    if (scrollport === null) return
    if (event.ctrlKey || event.deltaY === 0) return
    scrollport.scrollBy({ top: wheelDeltaY(event, scrollport) })
  }, [])

  return (
    <div
      className={css.widthHandle}
      data-side={props.side}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onWheel={onWheel}
    />
  )
}

/**
 * Install the panel width axis and render its drag handles.
 * @param props - Mounted shell element (the scroll container's parent).
 * @returns two width handles.
 */
export function PanelWidthControls(props: { container: HTMLDivElement | null }): ReactElement[] | null {
  const { container } = props
  const publishWidths = useCallback((shell: HTMLDivElement): void => {
    const target = shell.parentElement ?? shell
    const width = shell.offsetWidth
    target.style.setProperty('--hub-column-width', `${width}px`)
    const preference = readWidthPreference()
    if (preference === null) target.style.removeProperty('--hub-user-width')
    else target.style.setProperty('--hub-user-width', `${resolveContentWidth(width, preference)}px`)
  }, [])

  useLayoutEffect(() => {
    if (container === null) return
    const observer = new ResizeObserver(() => { publishWidths(container) })
    observer.observe(container)
    publishWidths(container)
    return () => { observer.disconnect() }
  }, [container, publishWidths])

  const onStart = useCallback((): number => {
    if (container === null) return CONTENT_DEFAULT
    return resolveContentWidth(container.offsetWidth, readWidthPreference())
  }, [container])
  const onDrag = useCallback((width: number): void => {
    if (container === null) return
    const target = container.parentElement ?? container
    target.style.setProperty('--hub-user-width', `${resolveContentWidth(container.offsetWidth, width)}px`)
  }, [container])
  const onCommit = useCallback((width: number): void => {
    if (container === null) return
    localStorage.setItem(WIDTH_PREF_KEY, `${resolveContentWidth(container.offsetWidth, width)}`)
  }, [container])
  const onEnd = useCallback((): void => {
    if (container !== null) publishWidths(container)
  }, [container, publishWidths])

  if (container === null) return null
  return (['left', 'right'] as const).map(side => (
    <WidthHandle
      key={side}
      side={side}
      onStart={onStart}
      onDrag={onDrag}
      onCommit={onCommit}
      onEnd={onEnd}
    />
  ))
}
