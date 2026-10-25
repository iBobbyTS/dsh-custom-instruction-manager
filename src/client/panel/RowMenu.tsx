/**
 * RowMenu — 技能行右侧的「…」操作菜单，与 dsh 工作区/会话行同款：
 * 16px 的三点图标按钮随行悬停出现（dsh 的 .rowActions / .iconButton），
 * 点击弹出 4px 内边距、12px 圆角、34px 行高的半透明卡片菜单
 * （dsh-client-ui-primitives 的 Menu：--dsw-menu-surface-fill +
 * backdrop blur + --dsw-elevation-prominent）。
 *
 * 菜单用 fixed 定位挂到 body：面板本身在滚动容器里，绝对定位会被裁掉。
 */

import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconEllipsisOutline16 } from '../icons.tsx'
import css from './panel.module.css'

/** One menu row: id reported to onSelect, visible label, optional leading icon. */
export interface RowMenuItem {
  id: string
  label: string
  icon?: ReactNode
  /** Destructive row: error text + danger hover fill. */
  danger?: boolean
  disabled?: boolean
  /** 不可用时的说明（禁用项的原生 title）。 */
  disabledHint?: string
}

/** Card metrics of the dsh Menu (34px row + 4px card padding). */
const MENU_ITEM_HEIGHT = 34
const MENU_PADDING = 4
const MENU_GAP = 4
const VIEWPORT_MARGIN = 12
/** 菜单卡片宽度：比 dsh 的 144px 下限宽一点，容纳「在 Finder 中显示」。 */
const MENU_WIDTH = 176

export interface RowMenuProps {
  /** aria-label of the trigger, e.g. "adaptive-debugging 的更多操作". */
  label: string
  items: readonly RowMenuItem[]
  onSelect: (id: string) => void
  disabled?: boolean
}

export function RowMenu({ label, items, onSelect, disabled = false }: RowMenuProps): JSX.Element {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback((): void => { setPosition(null) }, [])

  const open = (): void => {
    const anchor = triggerRef.current?.getBoundingClientRect()
    if (anchor === undefined) return
    const height = items.length * MENU_ITEM_HEIGHT + MENU_PADDING * 2
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
    )
    let top = anchor.bottom + MENU_GAP
    // 下方放不下就翻到上方（与 dsh Menu 的 side 解析一致）。
    if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, anchor.top - MENU_GAP - height)
    }
    setPosition({ left, top })
  }

  // 关闭时机：点击菜单外、Escape、滚动/缩放（fixed 定位的锚点会漂移）。
  useEffect(() => {
    if (position === null) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (triggerRef.current?.contains(target) === true || cardRef.current?.contains(target) === true) return
      close()
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [position, close])

  // 打开后把焦点送进菜单第一项（dsh Menu 的 autoFocus 行为），键盘可直接选。
  useEffect(() => {
    if (position === null) return
    const first = cardRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
    first?.focus()
  }, [position])

  /** 菜单内上下键循环移动焦点。 */
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const rows = [...(cardRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    if (rows.length === 0) return
    const index = rows.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown'
      ? (index + 1) % rows.length
      : (index - 1 + rows.length) % rows.length
    rows[next]?.focus()
  }

  const select = (item: RowMenuItem): void => {
    close()
    triggerRef.current?.focus()
    if (item.disabled === true) return
    onSelect(item.id)
  }

  return (
    <span className={css.rowMenu + (position !== null ? ' ' + css.rowMenuOpen : '')}>
      <button
        ref={triggerRef}
        type='button'
        className={css.menuTrigger + (position !== null ? ' ' + css.menuTriggerOpen : '')}
        aria-label={label}
        aria-haspopup='menu'
        aria-expanded={position !== null}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          if (position === null) open()
          else close()
        }}
      >
        <IconEllipsisOutline16 size={16} />
      </button>
      {position !== null ? createPortal(
        <div
          ref={cardRef}
          className={css.menuCard}
          style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
          role='menu'
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => { event.stopPropagation() }}
          onBlur={(event) => {
            // 焦点移出卡片（Tab 走开）就收起，避免菜单留在页面上。
            const next = event.relatedTarget as Node | null
            if (next === null || !event.currentTarget.contains(next)) close()
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type='button'
              role='menuitem'
              className={css.menuItem + (item.danger === true ? ' ' + css.menuItemDanger : '')}
              disabled={item.disabled}
              title={item.disabled === true ? item.disabledHint : undefined}
              onClick={() => { select(item) }}
            >
              {item.icon !== undefined ? <span className={css.menuIcon}>{item.icon}</span> : null}
              <span className={css.menuLabel}>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </span>
  )
}
