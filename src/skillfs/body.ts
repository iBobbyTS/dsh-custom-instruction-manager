/**
 * 技能正文的拆分与写回：SKILL.md = frontmatter + 正文。
 *
 * 面板只编辑正文——frontmatter（name / description / 调用键）原样留在文件里，
 * 由详情页的调用方式 checkbox 与新建模板负责。这里的两个纯函数就是那条边界
 * 的全部实现：保存时把文件切成 head + rest，写回 head + 新正文。
 *
 * 换行风格跟随原文件：CRLF 文件写回 CRLF，LF 文件写回 LF；正文按行尾 trim，
 * 末尾统一收一个换行（原文是「正文 + 换行」的常规形态）。
 */

/** closing `---` 行的结束位置（不含其后的换行）。 */
const FRONTMATTER_END = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/

export interface SkillFileParts {
  /** frontmatter 块本身：含开闭 `---` 行，不含其后的换行。 */
  head: string
  /** head 之后的原文（含开头的那个换行）。 */
  rest: string
}

/** 把 SKILL.md 切成 frontmatter 与它后面的正文；没有 frontmatter 时 undefined。 */
export function splitSkillFile(text: string): SkillFileParts | undefined {
  const match = FRONTMATTER_END.exec(text)
  if (match === null) return undefined
  return { head: match[0], rest: text.slice(match[0].length) }
}

/**
 * 用新正文替换 SKILL.md 的正文，frontmatter 逐字节保留。
 * @param text - 磁盘上的原文件内容。
 * @param body - 编辑器里的正文（允许带尾部换行）。
 * @returns 写回用的整份文本 + 实际落盘的正文（已按行尾 trim、换行统一）；
 *  原文件没有 frontmatter 时返回错误（不猜、不整份重写）。
 *
 * frontmatter 与正文之间的空行跟随原文件：原来隔一个空行就还隔一个空行，
 * 原来紧贴就还紧贴——保存不该顺手改掉用户没碰的排版。
 */
export function replaceSkillBody(text: string, body: string): { text: string; body: string } | { error: string } {
  const parts = splitSkillFile(text)
  if (parts === undefined) return { error: 'skill file has no YAML frontmatter to preserve' }
  const eol = parts.head.includes('\r\n') ? '\r\n' : '\n'
  const gap = parts.rest.startsWith(eol + eol) ? eol + eol : eol
  const trimmed = body
    .replace(/\r\n/g, '\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '')
  const next = trimmed === ''
    ? parts.head + eol
    : parts.head + gap + trimmed.split('\n').join(eol) + eol
  return { text: next, body: trimmed }
}
