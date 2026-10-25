/**
 * AGENTS.md 页的线上形状：dsh 支持的指令文件名与磁盘上真实存在者的交集，
 * 按「用户级 + 每个工作区」分组。
 *
 * 只在两个地方产生：host 的 GET /api/skill-hub/agents（扫描结果）与面板的
 * 只读渲染。没有任何写入口——这一页不新建、不编辑、不删除文件。
 */

/** 一行：大标题是磁盘上的真实文件名，副标题是从项目文件夹父目录算起的路径。 */
export interface InstructionFileRef {
  /** 真实文件的 basename（符号链接折叠后保留原始文件名）。 */
  name: string
  /**
   * 用户级：`~/.dsh` / `~/.agents`；项目级：`<工作区文件夹名>[/<内部路径>]`。
   * 空字符串表示扫描到了但无法算出相对路径（不应出现，客户端照常渲染）。
   */
  path: string
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
