import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearTrash, createSkill, disableSkill, editableSkillFile, enableSkill, fixDiagnosticFile, isBundledPath, parseFrontmatter, readFileSnapshot, replaceSkillBody, restoreSkill, rootOfPath, scanDiagnostics, setInvocationInText, setInvocationPolicy, splitSkillFile, systemTrashDir, trashSkill, trashSkillToSystem, writeTextAtomic } from './skillfs.ts'

describe('parseFrontmatter', () => {
  it('parses a healthy frontmatter', () => {
    const text = '---\nname: demo-skill\ndescription: Does demo things\n---\n\n# Body'
    expect(parseFrontmatter(text)).toEqual({
      value: {
        name: 'demo-skill',
        description: 'Does demo things',
        invocation: { modelInvocable: true, userInvocable: true },
        content: '# Body',
      },
    })
  })

  it('parses whenToUse and invocation overrides', () => {
    const text = [
      '---',
      'name: guarded-skill',
      'description: Guarded',
      'whenToUse: Only for guard checks',
      'disable-model-invocation: true',
      'user-invocable: false',
      '---',
      '',
      'Body text',
    ].join('\n')
    const parsed = parseFrontmatter(text)
    expect(parsed).toEqual({
      value: {
        name: 'guarded-skill',
        description: 'Guarded',
        whenToUse: 'Only for guard checks',
        invocation: { modelInvocable: false, userInvocable: false },
        content: 'Body text',
      },
    })
  })

  it('parses folded YAML descriptions', () => {
    const text = [
      '---',
      'name: folded-skill',
      'description: |',
      '  Line one.',
      '  Line two.',
      '---',
      '',
      'Body',
    ].join('\n')
    const parsed = parseFrontmatter(text)
    expect(parsed).toMatchObject({
      value: { name: 'folded-skill', description: 'Line one.\nLine two.' },
    })
  })

  it('rejects legacy invocation keys', () => {
    expect(parseFrontmatter('---\nname: x-skill\ndescription: x\ndisableModelInvocation: true\n---')).toEqual({
      error: 'frontmatter field "disableModelInvocation" is unsupported; use "disable-model-invocation"',
    })
  })

  it('rejects non-boolean invocation values', () => {
    expect(parseFrontmatter('---\nname: x-skill\ndescription: x\ndisable-model-invocation: maybe\n---')).toEqual({
      error: 'frontmatter field "disable-model-invocation" must be a boolean',
    })
  })

  it('rejects a missing block', () => {
    expect(parseFrontmatter('# no frontmatter')).toEqual({ error: 'missing YAML frontmatter (--- block)' })
  })

  it('rejects a missing name', () => {
    expect(parseFrontmatter('---\ndescription: x\n---')).toEqual({ error: 'frontmatter requires a name field' })
  })

  it('rejects a non-kebab-case name', () => {
    expect(parseFrontmatter('---\nname: Bad Name!\ndescription: x\n---')).toEqual({ error: 'invalid skill name "Bad Name!" (must be kebab-case)' })
  })

  it('rejects a missing description', () => {
    expect(parseFrontmatter('---\nname: ok-name\n---')).toEqual({ error: 'frontmatter requires a description field' })
  })

  it('ignores sets frontmatter (sets grouping was removed)', () => {
    const expected = { name: 'ok-name', description: 'x', invocation: { modelInvocable: true, userInvocable: true }, content: '' }
    expect(parseFrontmatter('---\nname: ok-name\ndescription: x\nsets: engineering\n---')).toEqual({ value: expected })
    expect(parseFrontmatter('---\nname: ok-name\ndescription: x\nsets: [engineering, " 3d ", ""]\n---')).toEqual({ value: expected })
  })
})

describe('setInvocationInText', () => {
  const body = '\n# Body\n\nKeep this byte-for-byte.\n'

  it('adds both keys when turning model and user invocation off', () => {
    const result = setInvocationInText('---\nname: demo\ndescription: Demo\n---' + body, { modelInvocable: false, userInvocable: false })
    if ('error' in result) throw new Error(result.error)
    expect(result.text).toBe('---\nname: demo\ndescription: Demo\ndisable-model-invocation: true\nuser-invocable: false\n---' + body)
    expect(parseFrontmatter(result.text)).toMatchObject({ value: { invocation: { modelInvocable: false, userInvocable: false } } })
  })

  it('removes the keys again so a permitted skill keeps a clean header', () => {
    const start = '---\nname: demo\ndescription: Demo\ndisable-model-invocation: true\nuser-invocable: false\n---' + body
    const result = setInvocationInText(start, { modelInvocable: true, userInvocable: true })
    if ('error' in result) throw new Error(result.error)
    expect(result.text).toBe('---\nname: demo\ndescription: Demo\n---' + body)
    expect(parseFrontmatter(result.text)).toMatchObject({ value: { invocation: { modelInvocable: true, userInvocable: true } } })
  })

  it('normalizes an explicit default value away and appends the non-default key', () => {
    const start = '---\nname: demo\nuser-invocable: true\ndescription: Demo\n---\nbody'
    const result = setInvocationInText(start, { modelInvocable: false, userInvocable: true })
    if ('error' in result) throw new Error(result.error)
    expect(result.text).toBe('---\nname: demo\ndescription: Demo\ndisable-model-invocation: true\n---\nbody')
    expect(parseFrontmatter(result.text)).toMatchObject({ value: { invocation: { modelInvocable: false, userInvocable: true } } })
  })

  it('collapses duplicate keys to one line', () => {
    const start = '---\nname: demo\ndescription: Demo\nuser-invocable: false\nuser-invocable: false\n---'
    const result = setInvocationInText(start, { modelInvocable: true, userInvocable: false })
    if ('error' in result) throw new Error(result.error)
    expect(result.text).toBe('---\nname: demo\ndescription: Demo\nuser-invocable: false\n---')
  })

  it('never touches an indented key inside a block scalar', () => {
    const start = '---\nname: demo\ndescription: |\n  user-invocable: false\n---\nbody'
    const result = setInvocationInText(start, { modelInvocable: true, userInvocable: true })
    if ('error' in result) throw new Error(result.error)
    expect(result.text).toBe(start)
    expect(parseFrontmatter(result.text)).toMatchObject({ value: { invocation: { modelInvocable: true, userInvocable: true } } })
  })

  it('preserves CRLF line endings', () => {
    const result = setInvocationInText('---\r\nname: demo\r\ndescription: Demo\r\n---\r\nbody', { modelInvocable: false, userInvocable: true })
    if ('error' in result) throw new Error(result.error)
    expect(result.text).toBe('---\r\nname: demo\r\ndescription: Demo\r\ndisable-model-invocation: true\r\n---\r\nbody')
  })

  it('refuses text without a frontmatter block', () => {
    expect(setInvocationInText('# no frontmatter', { modelInvocable: true, userInvocable: true })).toEqual({ error: 'missing YAML frontmatter (--- block)' })
  })
})

describe('setInvocationPolicy / editableSkillFile', () => {
  let dir: string
  let home: string
  let skills: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-invocation-'))
    home = join(dir, 'home')
    skills = join(home, 'skills')
    await mkdir(skills, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('rewrites the file atomically and round-trips through the parser', async () => {
    const path = join(skills, 'demo', 'SKILL.md')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '---\nname: demo\ndescription: Demo\n---\n\n# Body', 'utf8')
    expect(await setInvocationPolicy(path, { modelInvocable: false, userInvocable: true }, home)).toBe(path)
    const parsed = parseFrontmatter(await readFile(path, 'utf8'))
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.value.invocation).toEqual({ modelInvocable: false, userInvocable: true })
    expect(parsed.value.content).toBe('# Body')
    expect(await readdir(dirname(path))).toEqual(['SKILL.md'])
  })

  it('accepts flat files, .disabled files and project roots, but nothing else', async () => {
    expect(editableSkillFile(join(skills, 'flat-skill.md'), home)).toBe(true)
    expect(editableSkillFile(join(skills, 'off', 'SKILL.md.disabled'), home)).toBe(true)
    expect(editableSkillFile(join(dir, 'ws', '.dsh', 'skills', 'release', 'SKILL.md'), home)).toBe(true)
    expect(editableSkillFile(join(dir, 'ws', '.agents', 'skills', 'flat.md'), home)).toBe(true)
    // 发现范围之外：嵌套目录、任意 md、技能目录里的辅助文件。
    expect(editableSkillFile(join(skills, 'demo', 'deep', 'SKILL.md'), home)).toBe(false)
    expect(editableSkillFile(join(skills, 'demo', 'README.md'), home)).toBe(false)
    expect(editableSkillFile(join(dir, 'ws', 'docs', 'SKILL.md'), home)).toBe(false)
    expect(editableSkillFile('/etc/passwd', home)).toBe(false)
  })

  it('refuses to write outside the editable shapes', async () => {
    const stray = join(dir, 'outside', 'SKILL.md')
    await mkdir(dirname(stray), { recursive: true })
    await writeFile(stray, '---\nname: stray\ndescription: Stray\n---', 'utf8')
    await expect(setInvocationPolicy(stray, { modelInvocable: false, userInvocable: true }, home)).rejects.toThrow(/not an editable skill file/)
  })
})

describe('createSkill / disableSkill / enableSkill', () => {
  let dir: string
  let home: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-fs-'))
    home = join(dir, 'home')
    await mkdir(join(home, 'skills'), { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('scaffolds a directory-bundle skill with frontmatter', async () => {
    const path = await createSkill('user-dsh', 'demo-skill', 'Does demo things', home)
    const text = await readFile(path, 'utf8')
    expect(text).toContain('name: demo-skill')
    expect(text).toContain('description: Does demo things')
    expect(parseFrontmatter(text)).toMatchObject({ value: { name: 'demo-skill', description: 'Does demo things' } })
  })

  it('scaffolds numeric-looking names as YAML strings', async () => {
    const path = await createSkill('user-dsh', '1312', '1231', home)
    const text = await readFile(path, 'utf8')
    expect(text).toContain("name: '1312'")
    expect(text).toContain("description: '1231'")
    expect(parseFrontmatter(text)).toMatchObject({ value: { name: '1312', description: '1231' } })
  })

  it('escapes YAML-significant description text', async () => {
    const path = await createSkill('user-dsh', 'review-skill', 'Reviews: code #1', home)
    expect(parseFrontmatter(await readFile(path, 'utf8'))).toMatchObject({
      value: { name: 'review-skill', description: 'Reviews: code #1' },
    })
  })

  it('refuses non-kebab-case names', async () => {
    await expect(createSkill('user-dsh', 'Not Valid', '', home)).rejects.toThrow(/kebab-case/)
  })

  it('toggles a directory bundle off and back on', async () => {
    const original = await createSkill('user-dsh', 'toggle-skill', 'Toggle me', home)
    const disabled = await disableSkill(original)
    expect(disabled.endsWith('.disabled')).toBe(true)
    await expect(access(original)).rejects.toThrow()
    const restored = await enableSkill(disabled)
    expect(restored).toBe(original)
    await expect(access(original)).resolves.toBeUndefined()
  })

  it('toggles a flat skill file off and back on', async () => {
    const flat = join(home, 'skills', 'flat-skill.md')
    await writeFile(flat, '---\nname: flat-skill\ndescription: Flat\n---\n\nBody', 'utf8')
    const disabled = await disableSkill(flat)
    expect(disabled).toBe(flat + '.disabled')
    const restored = await enableSkill(disabled)
    expect(restored).toBe(flat)
  })

  it('refuses to disable a non-skill file', async () => {
    await expect(disableSkill(join(home, 'skills', 'notes.txt'))).rejects.toThrow(/not a discoverable skill file/)
  })
})

describe('trashSkill / restoreSkill', () => {
  let dir: string
  let home: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-trash-'))
    home = join(dir, 'home')
    await mkdir(join(home, 'skills'), { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('trashes and restores a directory bundle', async () => {
    const file = await createSkill('user-dsh', 'trash-dir', 'Trash me', home)
    const { path, source } = await trashSkill(file)
    expect(source).toBe(join(home, 'skills', 'trash-dir'))
    expect(path.startsWith(join(home, 'skills', '.trash', 'trash-dir-'))).toBe(true)
    await expect(access(file)).rejects.toThrow()
    const restored = await restoreSkill({ name: 'trash-dir', path, movedAt: 1, sourcePath: source }, home)
    expect(restored).toBe(source)
    await expect(access(file)).resolves.toBeUndefined()
  })

  it('trashes and restores a flat skill file', async () => {
    const flat = join(home, 'skills', 'flat-trash.md')
    await writeFile(flat, '---\nname: flat-trash\ndescription: Flat\n---\n\nbody', 'utf8')
    const { path, source } = await trashSkill(flat)
    expect(source).toBe(flat)
    await expect(access(flat)).rejects.toThrow()
    const restored = await restoreSkill({ name: 'flat-trash', path, movedAt: 1, sourcePath: source }, home)
    expect(restored).toBe(flat)
    await expect(access(flat)).resolves.toBeUndefined()
  })

  it('restores a legacy directory entry without a source path', async () => {
    const file = await createSkill('user-dsh', 'legacy-dir', 'Legacy', home)
    const { path } = await trashSkill(file)
    const target = await restoreSkill({ name: 'legacy-dir', path, movedAt: 1 }, home)
    expect(target).toBe(join(home, 'skills', 'legacy-dir'))
    await expect(access(join(target, 'SKILL.md'))).resolves.toBeUndefined()
  })

  it('refuses to restore an entry whose source path is outside the hub roots', async () => {
    await expect(restoreSkill({ name: 'x', path: join(home, 'skills', '.trash', 'x-1'), movedAt: 1, sourcePath: '/outside/x' }, home))
      .rejects.toThrow(/writable skill path/)
  })

  it('permanently clears a trashed skill', async () => {
    const trashDir = join(home, 'skills', '.trash', 'gone-1')
    await mkdir(trashDir, { recursive: true })
    await writeFile(join(trashDir, 'SKILL.md'), '---\nname: gone\ndescription: x\n---', 'utf8')
    await clearTrash({ name: 'gone', path: trashDir, movedAt: 1, sourcePath: join(home, 'skills', 'gone') }, home)
    await expect(access(trashDir)).rejects.toThrow()
  })

  it('refuses to clear a path outside the hub trash roots', async () => {
    await expect(clearTrash({ name: 'x', path: '/tmp/.trash/x-1', movedAt: 1 }, home)).rejects.toThrow(/not a hub trashed skill path/)
  })
})

describe('trashSkillToSystem', () => {
  let dir: string
  let systemTrash: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-systrash-'))
    systemTrash = join(dir, 'Trash')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps the plain name when the trash has no clash', async () => {
    const bundle = join(dir, 'skills', 'plain')
    await mkdir(bundle, { recursive: true })
    await writeFile(join(bundle, 'SKILL.md'), 'body', 'utf8')
    const moved = await trashSkillToSystem(bundle, systemTrash)
    expect(moved).toBe(join(systemTrash, 'plain'))
    await expect(access(join(moved, 'SKILL.md'))).resolves.toBeUndefined()
    await expect(access(bundle)).rejects.toThrow()
  })

  it('timestamps a clashing entry and never overwrites the older one', async () => {
    await mkdir(systemTrash, { recursive: true })
    await writeFile(join(systemTrash, 'clash.md'), 'older', 'utf8')
    const flat = join(dir, 'skills', 'clash.md')
    await mkdir(join(dir, 'skills'), { recursive: true })
    await writeFile(flat, 'newer', 'utf8')
    const moved = await trashSkillToSystem(flat, systemTrash)
    expect(moved.startsWith(join(systemTrash, 'clash.md-'))).toBe(true)
    await expect(readFile(join(systemTrash, 'clash.md'), 'utf8')).resolves.toBe('older')
    await expect(readFile(moved, 'utf8')).resolves.toBe('newer')
  })

  it('recognizes asar-bundled paths as unreachable for Finder', () => {
    expect(isBundledPath('/Applications/X.app/Contents/Resources/app.asar/dsh/skill/SKILL.md')).toBe(true)
    expect(isBundledPath('/Applications/X.app/Contents/Resources/app.asar.unpacked/x/SKILL.md')).toBe(false)
    expect(isBundledPath('/Users/me/.dsh/skills/x/SKILL.md')).toBe(false)
  })

  it('resolves the platform trash dir (macOS this run)', () => {
    const trash = systemTrashDir('/Users/me')
    expect(trash).toBe(process.platform === 'darwin' ? '/Users/me/.Trash' : process.platform === 'win32' ? join('/Users/me', '.Trash') : '/Users/me/.local/share/Trash/files')
  })
})

describe('scanDiagnostics', () => {
  let dir: string
  let home: string
  let skills: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-diag-'))
    home = join(dir, 'home')
    skills = join(home, 'skills')
    await mkdir(skills, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns an empty list for a healthy root', async () => {
    await createSkill('user-dsh', 'good-skill', 'Does good things well', home)
    expect(await scanDiagnostics('user-dsh', home)).toEqual([])
  })

  it('reports skipped files with reasons', async () => {
    await writeFile(join(skills, 'no-frontmatter.md'), '# nothing', 'utf8')
    await mkdir(join(skills, 'bad-name'))
    await writeFile(join(skills, 'bad-name', 'SKILL.md'), '---\nname: Bad Name\ndescription: x\n---', 'utf8')
    const entries = await scanDiagnostics('user-dsh', home)
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.reason)).toContain('missing YAML frontmatter (--- block)')
    expect(entries.map((entry) => entry.reason)).toContain('invalid skill name "Bad Name" (must be kebab-case)')
  })

  it('skips hub-disabled files', async () => {
    await writeFile(join(skills, 'paused.md.disabled'), '---\nname: paused\ndescription: x\n---', 'utf8')
    expect(await scanDiagnostics('user-dsh', home)).toEqual([])
  })

  it('returns an empty list when the root does not exist', async () => {
    expect(await scanDiagnostics('user-dsh', join(dir, 'missing'))).toEqual([])
  })

  // 并发化（读盘 + 解析从串行改为有界并发）不得让输出变得不确定：
  // 诊断顺序必须仍然等于发现顺序（按路径排序）。
  it('keeps diagnostics in discovery order now that the scan is concurrent', async () => {
    await writeFile(join(skills, 'b-bad.md'), '# nope', 'utf8')
    await writeFile(join(skills, 'a-bad.md'), '# nope', 'utf8')
    await writeFile(join(skills, 'c-bad.md'), '# nope', 'utf8')
    const entries = await scanDiagnostics('user-dsh', home)
    expect(entries.map((entry) => entry.path)).toEqual([
      join(skills, 'a-bad.md'),
      join(skills, 'b-bad.md'),
      join(skills, 'c-bad.md'),
    ])
  })

  it('flags a frontmatter name that diverges from the discovery path', async () => {
    await mkdir(join(skills, 'folder-name'))
    await writeFile(join(skills, 'folder-name', 'SKILL.md'), '---\nname: other-name\ndescription: A decent longer description\n---', 'utf8')
    const entries = await scanDiagnostics('user-dsh', home)
    expect(entries).toHaveLength(1)
    expect(entries[0].reason).toContain('does not match the discovery path "folder-name"')
  })

  it('flags a too-short description', async () => {
    await mkdir(join(skills, 'short-desc'))
    await writeFile(join(skills, 'short-desc', 'SKILL.md'), '---\nname: short-desc\ndescription: x\n---', 'utf8')
    const entries = await scanDiagnostics('user-dsh', home)
    expect(entries).toHaveLength(1)
    expect(entries[0].reason).toContain('description is only 1 chars')
  })
})

describe('fixDiagnosticFile', () => {
  let dir: string
  let home: string
  let skills: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-fixdiag-'))
    home = join(dir, 'home')
    skills = join(home, 'skills')
    await mkdir(skills, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('persists the repair atomically and leaves no temp file behind', async () => {
    const path = join(skills, 'needs-fix', 'SKILL.md')
    await mkdir(dirname(path), { recursive: true })
    // Unquoted colon in the description: parseable only after an in-memory
    // repair, which is exactly what the "Fix" action persists.
    await writeFile(path, '---\nname: needs-fix\ndescription: Build for AWS: ECS\n---\nbody', 'utf8')
    const before = await scanDiagnostics('user-dsh', home)
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ path, fixable: true })

    expect(await fixDiagnosticFile(path, home)).toBe(path)

    const parsed = parseFrontmatter(await readFile(path, 'utf8'))
    if ('error' in parsed) throw new Error('repaired file should parse: ' + parsed.error)
    expect(parsed.value.description).toBe('Build for AWS: ECS')
    expect(await scanDiagnostics('user-dsh', home)).toEqual([])
    // Atomic write = sibling temp file + rename, so no .tmp may survive.
    expect(await readdir(dirname(path))).toEqual(['SKILL.md'])
  })

  it('refuses paths outside the writable roots and files that need no repair', async () => {
    await expect(fixDiagnosticFile(join(dir, 'outside', 'SKILL.md'), home)).rejects.toThrow(/not a hub writable skill path/)

    const healthy = join(skills, 'fine', 'SKILL.md')
    await mkdir(dirname(healthy), { recursive: true })
    await writeFile(healthy, '---\nname: fine\ndescription: A perfectly fine description\n---\nbody', 'utf8')
    await expect(fixDiagnosticFile(healthy, home)).rejects.toThrow(/not auto-fixable/)
    expect(await readdir(dirname(healthy))).toEqual(['SKILL.md'])
  })
})

describe('rootOfPath', () => {
  it('recognizes the writable roots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-root-'))
    try {
      expect(rootOfPath(join(dir, 'skills', 'a', 'SKILL.md'), dir)).toBe('user-dsh')
      expect(rootOfPath(join(dir, 'other', 'b.md'), dir)).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('skill body write-back', () => {
  const skillFile = '---\nname: demo-skill\ndescription: Does demo things\nuser-invocable: true\n---\n\n# Old body\n\nOld line.\n'

  it('splits the file at the end of the frontmatter block', () => {
    const parts = splitSkillFile(skillFile)
    expect(parts?.head).toBe('---\nname: demo-skill\ndescription: Does demo things\nuser-invocable: true\n---')
    expect(parts?.rest).toBe('\n\n# Old body\n\nOld line.\n')
    expect(splitSkillFile('# no frontmatter')).toBeUndefined()
  })

  it('replaces only the body and keeps the frontmatter byte for byte', () => {
    const next = replaceSkillBody(skillFile, '# New body\n\n- item')
    if ('error' in next) throw new Error(next.error)
    expect(next.text).toBe('---\nname: demo-skill\ndescription: Does demo things\nuser-invocable: true\n---\n\n# New body\n\n- item\n')
    expect(next.body).toBe('# New body\n\n- item')
    // frontmatter 仍在，且解析结果与原来完全一致。
    const parsed = parseFrontmatter(next.text)
    expect('error' in parsed).toBe(false)
    if (!('error' in parsed)) {
      expect(parsed.value.name).toBe('demo-skill')
      expect(parsed.value.invocation).toEqual({ modelInvocable: true, userInvocable: true })
      expect(parsed.value.content).toBe('# New body\n\n- item')
    }
  })

  it('keeps CRLF files on CRLF', () => {
    const crlf = '---\r\nname: demo-skill\r\ndescription: Demo\r\n---\r\n\r\nOld\r\n'
    const next = replaceSkillBody(crlf, 'line one\nline two\n')
    if ('error' in next) throw new Error(next.error)
    expect(next.text).toBe('---\r\nname: demo-skill\r\ndescription: Demo\r\n---\r\n\r\nline one\r\nline two\r\n')
  })

  it('writes an empty body as frontmatter only', () => {
    const next = replaceSkillBody(skillFile, '   \n\n')
    if ('error' in next) throw new Error(next.error)
    expect(next.text.endsWith('---\n')).toBe(true)
    expect(next.body).toBe('')
    const parsed = parseFrontmatter(next.text)
    if (!('error' in parsed)) expect(parsed.value.content).toBe('')
  })

  it('refuses a file without frontmatter instead of rewriting the whole file', () => {
    expect(replaceSkillBody('# just markdown', 'x')).toEqual({ error: 'skill file has no YAML frontmatter to preserve' })
  })

  it('reads a snapshot and writes it back atomically, keeping the file mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-write-'))
    try {
      const file = join(dir, 'SKILL.md')
      await writeFile(file, skillFile, 'utf8')
      const before = await readFileSnapshot(file)
      expect(before?.text).toBe(skillFile)
      expect(before?.size).toBe(Buffer.byteLength(skillFile, 'utf8'))
      expect(typeof before?.modifiedAt).toBe('number')
      if (before === undefined) throw new Error('missing snapshot')
      const written = await writeTextAtomic(file, 'next', before.mode)
      expect(await readFile(file, 'utf8')).toBe('next')
      expect(written.size).toBe(4)
      // 写回后目录里只剩目标文件：临时文件已经 rename 掉。
      expect(await readdir(dir)).toEqual(['SKILL.md'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports a missing file instead of a snapshot', async () => {
    expect(await readFileSnapshot(join(tmpdir(), 'dsh-skill-hub-nope', 'SKILL.md'))).toBeUndefined()
  })
})
