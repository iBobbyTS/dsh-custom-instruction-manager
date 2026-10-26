/**
 * AGENTS.md 页的线上形状：dsh 支持的指令文件名与磁盘上真实存在者的交集，
 * 按「用户级 + 每个工作区」分组；点开一行再读该文件的正文。
 *
 * 三个入口：GET /api/skill-hub/agents（清单）、GET /api/skill-hub/agents/file
 * （正文）与 POST /api/skill-hub/agents/file/save（写回整份原文）。写入口只
 * 受理清单里真实存在的文件——不新建、不删除。
 */

import type { EditConflictResponse } from './catalog.ts'

/** 一行：大标题是磁盘上的真实文件名，副标题是从项目文件夹父目录算起的路径。 */
export interface InstructionFileRef {
  /** 真实文件的 basename（符号链接折叠后保留原始文件名）。 */
  name: string
  /**
   * 用户级：`~/.dsh` / `~/.agents`；项目级：`<工作区文件夹名>[/<内部路径>]`。
   * 空字符串表示扫描到了但无法算出相对路径（不应出现，客户端照常渲染）。
   */
  path: string
  /**
   * 磁盘上的真实绝对路径（符号链接已折叠到原始文件）。详情页按它读取正文，
   * 也是「复制路径」复制的内容。
   */
  absolute: string
}

/** 一个分组：kind='user' 是用户级（标题由客户端本地化），kind='project' 是工作区。 */
export interface InstructionGroup {
  kind: 'user' | 'project'
  /** 工作区标题（workspace.json 的 title）；kind='user' 时缺省。 */
  title?: string
  /** 组内文件，按 dsh 的发现顺序（目录浅→深，目录内基础层→叠加层）。 */
  files: InstructionFileRef[]
}

/** GET /api/skill-hub/agents */
export interface AgentsResponse {
  ok: true
  /** 用户级固定第一组，其后按侧边栏顺序排列的每个工作区一组。 */
  groups: InstructionGroup[]
  /** 本次扫描实际生效的排除目录清单（默认 `['.agent-work']`）。 */
  excludeDirs: string[]
}

/** 一个指令文件的正文与磁盘元数据（详情页）。 */
export interface InstructionFileDetail extends InstructionFileRef {
  /** 文件字节大小。 */
  size: number
  /** 最后修改时间（epoch ms）。 */
  modifiedAt: number
  /** UTF-8 正文（原样返回，不渲染 Markdown）。 */
  content: string
}

/** GET /api/skill-hub/agents/file?path=<绝对路径> */
export interface InstructionFileResponse {
  ok: true
  file: InstructionFileDetail
}

/**
 * POST /api/skill-hub/agents/file/save — 写回一份指令文件的整份原文。
 *
 * 受理范围是清单里已经在列的文件（用户级 `~/.dsh|~/.agents/AGENTS.md` 与
 * 任一已注册工作区里的指令文件）；不在清单里的路径一律 404，不新建文件。
 */
export interface InstructionFileSaveRequest {
  /** 清单行的 `absolute`，原样回传。 */
  path: string
  /** 新的整份正文。 */
  content: string
  /** 载入时的 mtime/size；与磁盘不一致 = 期间被改过，409 并回最新内容。 */
  expectedMtime?: number
  expectedSize?: number
}

export interface InstructionFileSaveResponse {
  ok: true
  path: string
  /** 写回后的文件大小与 mtime（客户端据此继续编辑，不必重读）。 */
  size: number
  modifiedAt: number
}

/** 保存失败时的响应体：正常错误只有 `error`，冲突多一个 `code: 'stale'`。 */
export type InstructionFileSaveFailure = EditConflictResponse | { error: string }
