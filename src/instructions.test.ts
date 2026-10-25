import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanInstructionGroups } from './instructions.ts'
import { SkillHubStore, statePath } from './store.ts'
import type { SkillHubRouteDeps } from './routes/deps.ts'
import type { InstructionGroup } from './protocol.ts'

/**
 * AGENTS.md 页扫描：契约里每条可见规则一个用例——用户级两行、分组顺序、
 * 副标题、空分组保留、内容/链接折叠、递归与剪枝、嵌套工作区。
 */
describe('AGENTS.md inventory scan', () => {
  let dir: string
  let home: string
  let agents: string
  let deps: SkillHubRouteDeps
  /** 按侧边栏顺序登记的 workspace.json 条目（path + title）。 */
  let workspaceOrder: Array<{ path: string; title: string }>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-agents-'))
    home = join(dir, 'dsh-home')
    agents = join(dir, 'agents-home')
    await mkdir(join(home, 'skills'), { recursive: true })
    await mkdir(join(home, 'storages'), { recursive: true })
    await mkdir(agents, { recursive: true })
    workspaceOrder = []
    deps = {
      skills: {
        snapshot: async () => ({ skills: [], complete: true }),
        get: async () => undefined,
      },
      store: new SkillHubStore(statePath(home)),
      home,
      agentsHome: agents,
    }
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  /** Register one workspace directory (creating it) in workspace.json, in order. */
  async function addWorkspace(name: string, title = name.split('/').pop() ?? name): Promise<string> {
    const path = join(dir, name)
    await mkdir(path, { recursive: true })
    workspaceOrder.push({ path, title })
    await writeFile(join(home, 'storages', 'workspace.json'), JSON.stringify({
      global: { workspaceIds: workspaceOrder.map((_, index) => 'ws' + index) },
      tables: { workspaces: Object.fromEntries(workspaceOrder.map((workspace, index) => ['ws' + index, { path: workspace.path, title: workspace.title }])) },
    }), 'utf8')
    return path
  }

  const userGroup = (groups: readonly InstructionGroup[]): InstructionGroup => groups[0]!
  const projectGroups = (groups: readonly InstructionGroup[]): InstructionGroup[] => groups.slice(1)

  it('always starts with the user-level group, even when both roots are empty', async () => {
    await addWorkspace('proj')
    const result = await scanInstructionGroups(deps)
    expect(result.groups[0]).toEqual({ kind: 'user', files: [] })
    expect(result.excludeDirs).toEqual(['.agent-work'])
  })

  it('lists each existing user-level AGENTS.md and collapses identical content', async () => {
    await writeFile(join(home, 'AGENTS.md'), 'same\n', 'utf8')
    await writeFile(join(agents, 'AGENTS.md'), 'same\n', 'utf8')
    const result = await scanInstructionGroups(deps)
    // 内容相同 → 只保留最早的一份（~/.dsh）。
    expect(userGroup(result.groups).files).toEqual([{ name: 'AGENTS.md', path: home }])

    await writeFile(join(agents, 'AGENTS.md'), 'different\n', 'utf8')
    const second = await scanInstructionGroups(deps)
    expect(userGroup(second.groups).files).toEqual([
      { name: 'AGENTS.md', path: home },
      { name: 'AGENTS.md', path: agents },
    ])
  })

  it('walks the whole project tree and renders the folder-relative subtitle', async () => {
    const proj = await addWorkspace('lmdo-website')
    await writeFile(join(proj, 'AGENTS.md'), 'root\n', 'utf8')
    await mkdir(join(proj, 'docs'), { recursive: true })
    await writeFile(join(proj, 'docs', 'AGENTS.md'), 'docs\n', 'utf8')
    const result = await scanInstructionGroups(deps)
    expect(projectGroups(result.groups)).toEqual([
      { kind: 'project', title: 'lmdo-website', files: [
        { name: 'AGENTS.md', path: 'lmdo-website' },
        { name: 'AGENTS.md', path: 'lmdo-website/docs' },
      ] },
    ])
  })

  it('keeps empty project groups so every registered workspace stays visible', async () => {
    await addWorkspace('empty-proj')
    const result = await scanInstructionGroups(deps)
    expect(projectGroups(result.groups)).toEqual([{ kind: 'project', title: 'empty-proj', files: [] }])
  })

  it('hides a symlink in favour of the original file, in both directions', async () => {
    const proj = await addWorkspace('proj')
    await writeFile(join(proj, 'AGENTS.md'), 'a\n', 'utf8')
    await symlink(join(proj, 'AGENTS.md'), join(proj, 'CLAUDE.md'))
    let result = await scanInstructionGroups(deps)
    expect(projectGroups(result.groups)[0]!.files).toEqual([{ name: 'AGENTS.md', path: 'proj' }])

    // 反方向：AGENTS.md 是链接、CLAUDE.md 是原始文件 → 只显示 CLAUDE.md。
    await rm(join(proj, 'AGENTS.md'))
    await rm(join(proj, 'CLAUDE.md'))
    await writeFile(join(proj, 'CLAUDE.md'), 'b\n', 'utf8')
    await symlink(join(proj, 'CLAUDE.md'), join(proj, 'AGENTS.md'))
    result = await scanInstructionGroups(deps)
    expect(projectGroups(result.groups)[0]!.files).toEqual([{ name: 'CLAUDE.md', path: 'proj' }])
  })

  it('collapses identical content inside one directory but keeps it across directories', async () => {
    const proj = await addWorkspace('proj')
    await writeFile(join(proj, 'AGENTS.md'), 'same\n', 'utf8')
    await writeFile(join(proj, 'CLAUDE.md'), '  same  \n', 'utf8')
    await mkdir(join(proj, 'docs'), { recursive: true })
    await writeFile(join(proj, 'docs', 'AGENTS.md'), 'same\n', 'utf8')
    const result = await scanInstructionGroups(deps)
    expect(projectGroups(result.groups)[0]!.files).toEqual([
      { name: 'AGENTS.md', path: 'proj' },
      { name: 'AGENTS.md', path: 'proj/docs' },
    ])
  })

  it('skips .git, node_modules and the configured exclude list, but still scans hidden dirs', async () => {
    const proj = await addWorkspace('proj')
    for (const skip of ['.git', 'node_modules', '.agent-work', '.cargo']) {
      await mkdir(join(proj, skip), { recursive: true })
      await writeFile(join(proj, skip, 'AGENTS.md'), skip + '\n', 'utf8')
    }
    await mkdir(join(proj, '.github'), { recursive: true })
    await writeFile(join(proj, '.github', 'AGENTS.md'), 'github\n', 'utf8')

    const defaults = await scanInstructionGroups(deps)
    expect(projectGroups(defaults.groups)[0]!.files).toEqual([
      { name: 'AGENTS.md', path: 'proj/.cargo' },
      { name: 'AGENTS.md', path: 'proj/.github' },
    ])

    // 显式清空排除清单 → 只剩硬剪枝的 .git / node_modules 不出现。
    deps.config = () => ({ enabled: true, announceToAgent: true, excludeDirs: [] })
    const none = await scanInstructionGroups(deps)
    expect(projectGroups(none.groups)[0]!.files.map((file) => file.path)).toEqual([
      'proj/.agent-work',
      'proj/.cargo',
      'proj/.github',
    ])
  })

  it('keeps a nested workspace out of its parent group, and drops missing workspaces', async () => {
    const parent = await addWorkspace('parent')
    const child = await addWorkspace('parent/child', 'child')
    await writeFile(join(parent, 'AGENTS.md'), 'parent\n', 'utf8')
    await mkdir(join(child, 'docs'), { recursive: true })
    await writeFile(join(child, 'docs', 'AGENTS.md'), 'child\n', 'utf8')
    await addWorkspace('gone')
    await rm(join(dir, 'gone'), { recursive: true, force: true })

    const result = await scanInstructionGroups(deps)
    expect(projectGroups(result.groups)).toEqual([
      { kind: 'project', title: 'parent', files: [{ name: 'AGENTS.md', path: 'parent' }] },
      { kind: 'project', title: 'child', files: [{ name: 'AGENTS.md', path: 'child/docs' }] },
    ])
  })
})
