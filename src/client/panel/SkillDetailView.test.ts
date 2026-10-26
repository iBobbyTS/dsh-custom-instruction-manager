/**
 * Detail-page upstream block: update information exists only for skills
 * recorded against an upstream repo. Everything else — built-in,
 * plugin-provided, hand-placed, project — must render no update UI at all,
 * not even a "no update checks" note (that note used to call every skill a
 * personal skill).
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SkillDetailView, type SkillDetailViewProps } from './SkillDetailView.tsx'
import type { SkillDetail, SourcesResponse } from '../../protocol.ts'

const detail: SkillDetail = {
  name: 'demo',
  description: 'demo skill',
  invocation: { modelInvocable: true, userInvocable: false },
  provider: 'p',
  source: 'user-dsh',
  path: '/tmp/demo/SKILL.md',
  content: '# Demo body',
}

function render(sources: SourcesResponse | null, state: SkillDetailViewProps['tokenTable']['state'] = { status: 'idle' }, extra: Partial<SkillDetailViewProps> = {}): string {
  const props: SkillDetailViewProps = {
    detail,
    hubConfig: null,
    uses: new Map(),
    sourcesState: sources,
    sourceCheck: {},
    checkingSource: null,
    syncingSource: null,
    invocationBusy: false,
    tokenTable: { state, models: null, busyModel: null, onSelectModel: () => {} },
    edit: { editable: false, draft: '', busy: false, dirty: false, onDraft: () => {}, onSave: () => {}, onDiscard: () => {} },
    onInvocationChange: () => {},
    onBack: () => {},
    onCheck: () => {},
    onSync: () => {},
    onFollowDelete: () => {},
    ...extra,
  }
  return renderToStaticMarkup(createElement(SkillDetailView, props))
}

/** 一个可写技能（用户根/项目根的文件）——正文框在它上面才可编辑。 */
const WRITABLE = { editable: true } as const

/** 可写文件的可编辑正文框：草稿与磁盘内容一致时按钮是灰的。 */
function renderEditable(edit: Partial<SkillDetailViewProps['edit']> = {}): string {
  return render(null, undefined, {
    ...WRITABLE,
    edit: {
      editable: true,
      draft: '# Demo body',
      busy: false,
      dirty: false,
      onDraft: () => {},
      onSave: () => {},
      onDiscard: () => {},
      ...edit,
    },
  })
}

/** 取一个精确匹配文字的按钮标签（断言 disabled 状态用）。 */
function buttonTag(html: string, label: string): string {
  const match = new RegExp('<button[^>]*>' + label + '</button>').exec(html)
  if (match === null) throw new Error('button not found: ' + label)
  return match[0]
}

const tracked: SourcesResponse = {
  ok: true,
  sources: [{ repo: 'acme/skills', ref: 'main', root: 'skills', commitSha: 'abcdef1234567890', skills: ['demo'] }],
  origins: { demo: 'acme/skills' },
  collections: [],
  trash: [],
}

describe('SkillDetailView upstream block', () => {
  it('renders the source card with update actions for a tracked skill', () => {
    const html = render(tracked)
    expect(html).toContain('github.com/acme/skills')
    expect(html).toContain('main')
    expect(html).toContain('abcdef1')
    expect(html).toContain('检查更新')
    expect(html).not.toContain('未绑定上游')
    expect(html).not.toContain('个人技能')
  })

  it('carries the token table with the counts it was given', () => {
    const html = render({ ok: true, sources: [], origins: {}, collections: [], trash: [] }, {
      status: 'ready',
      entries: [{ id: 'glm-5.3', label: 'GLM-5.3', tokens: 987 }],
    })
    expect(html).toContain('GLM-5.3')
    expect(html).toContain('987')
  })

  it('renders no update UI at all for an untracked skill', () => {
    const html = render({ ok: true, sources: [], origins: {}, collections: [], trash: [] })
    expect(html).not.toContain('github.com')
    expect(html).not.toContain('未绑定上游')
    expect(html).not.toContain('个人技能')
    expect(html).not.toContain('检查更新')
    expect(html).toContain('# Demo body')
  })
})

describe('SkillDetailView body editing', () => {
  it('makes the body editable in place only when the skill file is writable', () => {
    const writable = renderEditable()
    expect(writable).toContain('<textarea')
    // 没有单独的「编辑」按钮：正文框本身就是可写的。
    expect(writable).not.toContain('>编辑<')
    // editable 缺省 = 内置/插件 provider（或旧宿主）：只读 <pre>，没有保存/放弃。
    const readonly = render(null)
    expect(readonly).not.toContain('<textarea')
    expect(readonly).toContain('<pre')
    expect(readonly).not.toContain('放弃所有编辑')
  })

  it('keeps the same textarea style and disables save/discard until something changes', () => {
    const clean = renderEditable()
    expect(clean).toContain('保存')
    expect(clean).toContain('放弃所有编辑')
    expect(buttonTag(clean, '保存')).toContain('disabled')
    expect(buttonTag(clean, '放弃所有编辑')).toContain('disabled')

    const dirty = renderEditable({ draft: '# Changed body', dirty: true })
    expect(dirty).toContain('# Changed body')
    expect(dirty).not.toContain('# Demo body')
    expect(buttonTag(dirty, '保存')).not.toContain('disabled')
    expect(buttonTag(dirty, '放弃所有编辑')).not.toContain('disabled')
    expect(dirty).toContain('⌘S 保存')
  })

  it('says 保存中 and keeps both buttons disabled while a save is in flight', () => {
    const html = renderEditable({ busy: true, draft: '# Changed body', dirty: true })
    expect(html).toContain('保存中')
    expect(buttonTag(html, '保存中…')).toContain('disabled')
    expect(buttonTag(html, '放弃所有编辑')).toContain('disabled')
  })

  it('shows the save failure and the post-save notice', () => {
    const failed = renderEditable({ error: 'file is read-only: /tmp/demo/SKILL.md', draft: '# Changed body', dirty: true })
    expect(failed).toContain('file is read-only')
    expect(failed).toContain('role="alert"')
    const saved = render(null, undefined, { ...WRITABLE, notice: '已保存。此技能跟随 acme/skills，同步会用上游版本覆盖本地修改。' })
    expect(saved).toContain('acme/skills')
  })
})
