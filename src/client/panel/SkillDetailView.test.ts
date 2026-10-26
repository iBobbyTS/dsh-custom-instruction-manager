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
    edit: { active: false, draft: '', busy: false, onDraft: () => {}, onSave: () => {}, onCancel: () => {} },
    onEditStart: () => {},
    onInvocationChange: () => {},
    onBack: () => {},
    onCheck: () => {},
    onSync: () => {},
    onFollowDelete: () => {},
    ...extra,
  }
  return renderToStaticMarkup(createElement(SkillDetailView, props))
}

/** 一个可写技能（用户根/项目根的文件）——只有它能出现「编辑」。 */
const WRITABLE = { editable: true } as const

/** 编辑态：文本域 + 保存/取消，只读的 <pre> 不再渲染。 */
function renderEditing(extra: Partial<SkillDetailViewProps> = {}): string {
  return render(null, undefined, {
    ...WRITABLE,
    edit: { active: true, draft: '# Draft body', busy: false, onDraft: () => {}, onSave: () => {}, onCancel: () => {} },
    ...extra,
  })
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
  it('offers 编辑 only when the skill file is writable', () => {
    expect(render(null, undefined, WRITABLE)).toContain('>编辑<')
    // editable 缺省 = 内置/插件 provider（或旧宿主）：没有任何写入口。
    expect(render(null)).not.toContain('>编辑<')
    expect(render(null, undefined, { editable: false })).not.toContain('>编辑<')
  })

  it('swaps the read-only body for a textarea holding the draft', () => {
    const html = renderEditing()
    expect(html).toContain('<textarea')
    expect(html).toContain('# Draft body')
    expect(html).not.toContain('# Demo body')
    expect(html).toContain('保存')
    expect(html).toContain('取消')
    expect(html).toContain('⌘S 保存')
    // 编辑态里编辑入口让位给保存/取消。
    expect(html).not.toContain('>编辑<')
  })

  it('disables the buttons and says 保存中 while a save is in flight', () => {
    const html = renderEditing({ edit: { active: true, draft: '# Draft body', busy: true, onDraft: () => {}, onSave: () => {}, onCancel: () => {} } })
    expect(html).toContain('保存中')
    expect(html).toContain('disabled')
  })

  it('shows the save failure and the post-save notice', () => {
    const failed = renderEditing({
      edit: { active: true, draft: '# Draft body', busy: false, error: 'file is read-only: /tmp/demo/SKILL.md', onDraft: () => {}, onSave: () => {}, onCancel: () => {} },
    })
    expect(failed).toContain('file is read-only')
    expect(failed).toContain('role="alert"')
    const saved = render(null, undefined, { ...WRITABLE, notice: '已保存。此技能跟随 acme/skills，同步会用上游版本覆盖本地修改。' })
    expect(saved).toContain('acme/skills')
  })
})
