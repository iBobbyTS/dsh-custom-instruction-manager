/**
 * 「关于」页：这一页自己的身份信息 —— 插件名与仓库、版本、检查更新。
 * 版本与更新检查从标题行搬到这里：标题行只留页面标题与列表级动作，
 * 版本这类一次性信息收进单独的页签，日常浏览时不再占位。
 */

import type { JSX } from 'react'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

/** 本插件的仓库地址（package.json 的 repository/homepage）。 */
const REPO_URL = 'https://github.com/iBobbyTS/dsh-skill-hub'

export interface AboutViewProps {
  /** 插件版本；目录还没读到时为 null。 */
  version: string | null
  /** 更新状态的一句话（检查中 / 已是最新 / 有新版本 / 失败）；空闲时 undefined。 */
  status: string | undefined
  /** 是否有一次更新检查正在进行。 */
  checking: boolean
  /** 新版本发布页；仅「发现新版本」时非空。 */
  releaseUrl: string | null
  /** 新版本号；仅「发现新版本」时非空。 */
  latestVersion: string | null
  /** 触发一次更新检查。 */
  onCheck: () => void
}

export function AboutView(props: AboutViewProps): JSX.Element {
  const { version, status, checking, releaseUrl, latestVersion, onCheck } = props
  return (
    <section className={css.about} aria-labelledby='hub-about-title'>
      <h2 className={css.aboutTitle} id='hub-about-title'>{tt('about.title')}</h2>
      <p className={css.aboutLead}>{tt('about.lead')}</p>
      <div className={css.aboutCard}>
        <div className={css.aboutRow}>
          <span className={css.aboutRowText}>
            <span className={css.aboutRowTitle}>{tt('about.plugin')}</span>
          </span>
          <span className={css.aboutControl}>
            <span className={css.aboutValue}>dsh-skill-hub</span>
            <a className={css.aboutLink} href={REPO_URL} target='_blank' rel='noreferrer'>GitHub</a>
          </span>
        </div>
        <div className={css.aboutRow}>
          <span className={css.aboutRowText}>
            <span className={css.aboutRowTitle}>{tt('about.version')}</span>
          </span>
          <span className={css.aboutValue}>{version !== null ? 'v' + version : tt('about.unknownVersion')}</span>
        </div>
        <div className={css.aboutRow}>
          <span className={css.aboutRowText}>
            <span className={css.aboutRowTitle}>{tt('about.update')}</span>
            <span className={css.aboutRowDesc}>{status ?? tt('about.idle')}</span>
          </span>
          <span className={css.aboutControl}>
            {releaseUrl !== null && latestVersion !== null
              ? <a className={css.aboutLink} href={releaseUrl} target='_blank' rel='noreferrer'>{tt('update.newVersion', { version: latestVersion })}</a>
              : null}
            <button type='button' className={css.button} disabled={checking} onClick={onCheck}>{checking ? tt('update.checking') : tt('update.check')}</button>
          </span>
        </div>
      </div>
    </section>
  )
}
