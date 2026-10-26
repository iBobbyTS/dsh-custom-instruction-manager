/**
 * Token 统计表：模型 / Tokens，最后一行是「管理模型」。
 *
 * 行的来源是宿主的选中集合（`models`），不是协议常量的全集：Kimi K3 默认不选，
 * 勾上才会出现在表格里。服务器列表还没回来时先按协议层的默认集合画行，避免
 * 打开详情页先空一下再跳。
 *
 * 没有状态列：没数出来就是 `-`；失败的那一行用红色，原因由 title 带出。
 * 「管理模型」展开后是原生 checkbox 列表（dsh 没有给插件用的多选组件），
 * 勾选即下载、取消即删除词表——由宿主执行，这里只发起与回填。
 *
 * 纯展示：数据与动作都由 useTokenCount / useTokenModels 给。
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import { TOKEN_MODELS, type TokenModelState } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { IconChevronDownOutline14 } from '../icons.tsx'
import css from './panel.module.css'
import type { TokenCountState } from './hooks/useTokenCount.ts'
import { TokenModelPicker } from './TokenModelPicker.tsx'

export interface TokenTableProps {
  state: TokenCountState
  /** 宿主返回的可选模型（含选中状态）；`null` = 还没拿到。 */
  models: TokenModelState[] | null
  /** 正在下载/删除的模型 id。 */
  busyModel: string | null
  /** 勾选/取消一个模型。 */
  onSelectModel: (id: string, selected: boolean) => void
  /** 「管理模型」最近一次失败的原因。 */
  modelError?: string
}

/** 一行的 Tokens 格：数字，或没数出来时的 `-`。 */
interface Cell {
  text: string
  /** 失败原因（悬停可见）；另一个模型可能正常。 */
  error?: string
}

/** 默认集合（协议层标记 preset 的模型），用于模型列表到达之前的占位行。 */
const DEFAULT_ROWS = TOKEN_MODELS.filter((model) => model.preset).map((model) => ({ id: model.id, label: model.label }))

export function TokenTable(props: TokenTableProps): JSX.Element {
  const { state, models, busyModel, onSelectModel, modelError } = props
  const [open, setOpen] = useState(false)
  /** 展开后的多选容器：用来把第一个模型滚到视口中间。 */
  const pickerRef = useRef<HTMLDivElement | null>(null)
  /** 每次展开只居中一次；之后选择变化引起的重渲染不该再拽动滚动位置。 */
  const centered = useRef(false)

  useEffect(() => {
    if (!open) {
      centered.current = false
      return
    }
    if (centered.current) return
    const first = pickerRef.current?.querySelector('li')
    if (first === null || first === undefined) return
    centered.current = true
    // 面板的滚动容器是 [data-hub-scroll]；直接算 scrollTop 而不是用
    // scrollIntoView，后者会连带滚动外层容器，也可能把整页顶出去。
    const scroller = first.closest('[data-hub-scroll]')
    if (!(scroller instanceof HTMLElement)) {
      first.scrollIntoView({ block: 'center' })
      return
    }
    const offset = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const top = Math.max(0, offset - scroller.clientHeight / 2 + first.clientHeight / 2)
    scroller.scrollTo({ top, behavior: 'smooth' })
  }, [open, models])

  const cellOf = (modelId: string): Cell => {
    if (state.status !== 'ready') {
      // idle / loading / 整个请求失败：这个模型的数字都还没有。
      return { text: '-', error: state.status === 'failed' ? state.error : undefined }
    }
    const entry = state.entries.find((item) => item.id === modelId)
    if (entry?.tokens === undefined) return { text: '-', error: entry?.error }
    return { text: entry.tokens.toLocaleString() }
  }

  const rows = models === null
    ? DEFAULT_ROWS
    : models.filter((model) => model.selected).map((model) => ({ id: model.id, label: model.label }))

  return (
    <section className={css.tokenBlock} aria-label={tt('tokens.title')} aria-busy={state.status === 'loading'}>
      <div className={css.tokenHead}>
        <span className={css.tokenTitle}>{tt('tokens.title')}</span>
      </div>
      <table className={css.tokenTable}>
        <thead>
          <tr>
            <th scope='col'>{tt('tokens.model')}</th>
            <th scope='col' className={css.tokenNum}>{tt('tokens.tokens')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? (
              <tr>
                <td colSpan={2} className={css.tokenEmpty}>{tt('tokens.none')}</td>
              </tr>
            )
            : rows.map((row) => {
              const cell = cellOf(row.id)
              return (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td
                    className={css.tokenNum + (cell.error !== undefined ? ' ' + css.tokenFailed : '')}
                    title={cell.error}
                  >
                    {cell.text}
                  </td>
                </tr>
              )
            })}
          <tr className={css.tokenManageRow}>
            <td colSpan={2}>
              <button
                type='button'
                className={css.tokenManageButton}
                aria-expanded={open}
                onClick={() => { setOpen((value) => !value) }}
              >
                {tt('tokens.manage')}
                <IconChevronDownOutline14
                  size={12}
                  className={css.tokenManageChevron + (open ? ' ' + css.tokenManageChevronOpen : '')}
                />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      {/* 展开后的多选放在表格外面：塞进单元格会把整张表的列宽撑开，
          点一下表头就跳。放在下面既贴着「管理模型」那一行，又不影响列宽。 */}
      <div ref={pickerRef}>
        {open && models !== null
          ? <TokenModelPicker models={models} busyModel={busyModel} onSelect={onSelectModel} error={modelError} />
          : null}
        {open && models === null ? <div className={css.tokenModelMeta}>{tt('tokens.loadingModels')}</div> : null}
      </div>
      {/* 表格在页面最底部时，光靠滚动条没有空间把第一个模型推到视口中间（会被
          内容末尾卡住）。展开期间垫一段空白，收起即消失；它只影响可滚动范围，
          不是内容。 */}
      {open ? <div className={css.tokenCenterSpacer} aria-hidden='true' /> : null}
    </section>
  )
}
