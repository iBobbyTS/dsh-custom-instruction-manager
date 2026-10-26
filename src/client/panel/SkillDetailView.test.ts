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

function render(sources: SourcesResponse | null, state: SkillDetailViewProps['tokenTable']['state'] = { status: 'idle' }): string {
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
    onInvocationChange: () => {},
    onBack: () => {},
    onCheck: () => {},
    onSync: () => {},
    onFollowDelete: () => {},
  }
  return renderToStaticMarkup(createElement(SkillDetailView, props))
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
