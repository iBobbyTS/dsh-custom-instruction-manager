/**
 * 编辑保存路由：把技能正文写回 SKILL.md。
 *
 * 边界（与需求契约一致）：
 *  - 只替换 frontmatter 之后的那段正文，frontmatter 逐字节保留
 *    （name / description / 调用键都归详情页的其他控件管）；
 *  - 可写范围沿用调用方式那条线：用户根与项目根的发现文件，禁用态写
 *    `.disabled` 文件，内置/插件 provider 没有文件可写；
 *  - 载入时的 mtime/size 与磁盘不一致 → 409 + 最新内容，客户端弹
 *    「复制并重新加载 / 继续编辑 / 仍然覆盖」；
 *  - 同目录临时文件 + rename 原子落盘，保留原权限位。
 */

import { isSkillName } from '@deepseek-ai/dsh-skill'
import { MAX_EDIT_BODY_BYTES, SKILL_HUB_API, type EditConflictResponse, type SkillContentResponse } from '../protocol.ts'
import { editableSkillFile, parseFrontmatter, readFileSnapshot, replaceSkillBody, writeTextAtomic } from '../skillfs.ts'
import { findSkill } from './catalog.ts'
import { homeOf, readNumber, readString, writeError, writeFileFailure, writeJson, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** 技能正文写回的全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function editRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // --------------------------------------------------------- skill/content
    {
      path: SKILL_HUB_API.skillContent,
      methods: ['POST'],
      jsonBody: true,
      bodyLimit: MAX_EDIT_BODY_BYTES,
      handler: async ({ res, body }) => {
        const name = readString(body, 'name').trim()
        if (!isSkillName(name)) { writeError(res, 400, 'skill name must be kebab-case (lowercase letters, digits, dashes)'); return }
        if (typeof body.content !== 'string') { writeError(res, 400, 'content must be a string'); return }
        const content = body.content
        const cwd = readString(body, 'cwd')
        // 与详情页同一条解析顺序：显式 cwd → 已知工作区 → 用户根；禁用技能
        // 不在注册表里，回落到 sidecar 记录里的 .disabled 文件。
        const skill = await findSkill(deps, name, cwd)
        let path: string
        if (skill === undefined) {
          const record = await deps.store.getDisabled(name)
          if (record === undefined) { writeError(res, 404, 'skill not found: ' + name); return }
          path = record.path
        } else {
          if (skill.path === undefined) {
            writeError(res, 409, 'skill "' + name + '" is registered by provider "' + skill.provider + '" and has no file to edit')
            return
          }
          path = skill.path
        }
        if (!editableSkillFile(path, homeOf(deps))) {
          writeError(res, 409, 'skill "' + name + '" is managed by provider "' + (skill?.provider ?? 'unknown') + '"; only skill files under a user or project root can be edited')
          return
        }
        const snapshot = await readFileSnapshot(path)
        if (snapshot === undefined) { writeError(res, 409, 'skill file is missing on disk: ' + path); return }
        const expectedMtime = readNumber(body, 'expectedMtime')
        const expectedSize = readNumber(body, 'expectedSize')
        if (expectedMtime !== undefined && expectedSize !== undefined
          && (expectedMtime !== snapshot.modifiedAt || expectedSize !== snapshot.size)) {
          // 正文仍按详情页的语义给：frontmatter 之后的 trim 段。frontmatter 坏了
          // 就只回状态，客户端重新打开详情会看到真正的解析报错。
          const parsed = parseFrontmatter(snapshot.text)
          writeJson(res, 409, {
            error: 'file changed on disk since it was loaded',
            code: 'stale',
            latest: {
              content: 'error' in parsed ? '' : parsed.value.content,
              modifiedAt: snapshot.modifiedAt,
              size: snapshot.size,
            },
          } satisfies EditConflictResponse)
          return
        }
        const replaced = replaceSkillBody(snapshot.text, content)
        if ('error' in replaced) { writeError(res, 409, replaced.error); return }
        let written: { size: number; modifiedAt: number }
        try {
          written = await writeTextAtomic(path, replaced.text, snapshot.mode)
        } catch (error) {
          if (writeFileFailure(res, error, path)) return
          throw error
        }
        // 注册表缓存里还是旧正文：下一次 /catalog、/skill 必须读新的。
        deps.invalidate?.()
        writeJson(res, 200, {
          ok: true,
          name,
          path,
          content: replaced.body,
          modifiedAt: written.modifiedAt,
          size: written.size,
        } satisfies SkillContentResponse)
      },
    },
  ]
}
