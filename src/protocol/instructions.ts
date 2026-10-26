/**
 * AGENTS.md 页的线上形状：dsh 支持的指令文件名与磁盘上真实存在者的交集，
 * 按「用户级 + 每个工作区」分组；点开一行再读该文件的正文。
 *
 * 四个入口：GET /api/skill-hub/agents（上一次完成的索引缓存）、
 * GET /api/skill-hub/agents/scan（分批扫描的一步）、GET /api/skill-hub/agents/file
 * （正文）与 POST /api/skill-hub/agents/file/save（写回整份原文）。写入口只
 * 受理清单里真实存在的文件——不新建、不删除。
 *
 * 索引的缓存是 host 进程内的一份「上一次完整扫描」：面板打开页面先拿它铺满
 * 列表，再按步重扫、逐步替换，扫描完把新的一份提升为缓存。分步扫描同时给出
 * 进度，按钮据此显示百分比。
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

/** 一次扫描的完整结果：分组 + 产生它的排除目录清单（客户端持有的索引形状）。 */
export interface InstructionRoster {
  /** 用户级固定第一组，其后按侧边栏顺序排列的每个工作区一组。 */
  groups: InstructionGroup[]
  /** 本次扫描实际生效的排除目录清单（默认 `['.agent-work']`）。 */
  excludeDirs: string[]
}

/** 面板里持有的索引（GET /agents 的缓存与分步扫描拼出来的都是这个形状）。 */
export interface AgentsResponse extends InstructionRoster {
  ok: true
}

/**
 * GET /api/skill-hub/agents — 上一次完成的索引缓存。
 *
 * 只读缓存、不触发扫描：没有缓存时 `cached=false` 且 `groups` 为空数组，
 * 面板据此跳过「先铺缓存」这一步，直接把第一轮分步扫描的结果往上画。
 */
export interface AgentsCacheResponse extends InstructionRoster {
  ok: true
  /** 这个 host 进程是否已经完成过一次扫描。 */
  cached: boolean
  /** 缓存完成时间（epoch ms）；`cached=false` 时为 0。 */
  scannedAt: number
}

/**
 * GET /api/skill-hub/agents/scan?step=<n>&scan=<id> — 分批扫描的一步。
 *
 * 一次扫描切成 `total` 步：第 0 步是用户级，其后每个工作区一步。每个请求
 * 只扫一个作用域并立刻返回，面板每收到一步就把它并进列表（百分比 = done/total），
 * 所以扫描期间看到的是「缓存打底 + 已扫到的实时替换」。最后一步返回时 host
 * 已经把这一轮的完整结果提升为新的缓存。
 */
export interface AgentsScanStep {
  ok: true
  /** 本轮扫描的 id（第 0 步生成，后续步骤原样回传）。 */
  scanId: string
  /** 本步序号（0 = 用户级，其后按侧边栏顺序每个工作区一步）。 */
  step: number
  /** 已完成步数，= step + 1。 */
  done: number
  /** 本轮扫描的总步数（第 0 步时确定，扫描期间不变）。 */
  total: number
  /** 还有下一步；`false` 表示这一步就是最后一步。 */
  more: boolean
  /** 本步扫到的分组。 */
  group: InstructionGroup
  /** 本次扫描生效的排除目录清单。 */
  excludeDirs: string[]
}

/** 分步扫描的失败体：`code='expired'` = 这一轮已经不在 host 里了，从第 0 步重来。 */
export interface AgentsScanFailure {
  error: string
  code?: 'expired'
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
