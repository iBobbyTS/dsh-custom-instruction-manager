/**
 * 「管理模型」展开后的多选列表：原生 checkbox + 名称 + 状态（已下载 / 大小 /
 * 下载中 / 删除中）。
 *
 * dsh 没有给插件用的多选组件（schema-form 那套没有在 profile 里安装，也不属于
 * 客户端模块表），所以就用三个 checkbox：勾选下载、取消删除，语义和浏览器的
 * 表单控件完全一致，键盘与读屏器都能直接用。
 *
 * 一个模型都不选是合法状态（表格只剩「管理模型」一行），所以这里没有"至少选
 * 一个"的约束，也不禁用最后一个勾。
 */

import type { JSX } from 'react'
import type { TokenModelState } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

export interface TokenModelPickerProps {
  models: TokenModelState[]
  /** 正在下载/删除的模型 id。 */
  busyModel: string | null
  onSelect: (id: string, selected: boolean) => void
  /** 最近一次改选失败的原因。 */
  error?: string
}

export function TokenModelPicker(props: TokenModelPickerProps): JSX.Element {
  const { models, busyModel, onSelect, error } = props
  return (
    <div className={css.tokenPicker}>
      <ul className={css.tokenModelList}>
        {models.map((model) => (
          <li key={model.id}>
            <label className={css.tokenModelRow}>
              <input
                type='checkbox'
                checked={model.selected}
                disabled={busyModel !== null}
                onChange={(event) => { onSelect(model.id, event.target.checked) }}
              />
              <span className={css.tokenModelName}>{model.label}</span>
              <span className={css.tokenModelMeta}>
                {busyModel === model.id
                  // 请求在途时 model.selected 还是旧值：本来选中→正在删，本来没选→正在下。
                  ? tt(model.selected ? 'tokens.removing' : 'tokens.downloading')
                  : model.installed
                    ? tt('tokens.downloaded')
                    : tt('tokens.sizeMb', { mb: model.vocabMb })}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error !== undefined ? <div className={css.tokenManageError}>{error}</div> : null}
    </div>
  )
}
