/**
 * 「上次离开的页面」：顶层分类（AGENTS.md / Skill / MCP / Hook / 关于）加上
 * Skill 页里的 tab（来源 / 市场）。
 *
 * 存 localStorage —— 和面板宽度、每日自动检查同一类本机偏好：浏览位置属于
 * 这台机器的这个浏览器，不该写进插件配置（那份配置会跟着账号/机器同步，
 * 把一台机器的位置推到另一台）。
 *
 * 读取一律容错：没有 localStorage（隐私模式）、坏 JSON、旧版本里已删掉的
 * 分类，全部回落到默认页（Skill / 来源），绝不让面板因为一条坏记录打不开。
 */

/** 顶层内容分类：这一页是「其他插件」的管理入口，五类内容共用一条导航。 */
export type Category = 'agents' | 'skills' | 'mcp' | 'hooks' | 'about'

/** Skill 页的两个 tab。 */
export type SkillTab = 'sources' | 'market'

/** 分类顺序与标签键（内容分类在前，用户指定的 AGENTS.md → Skill → MCP → Hook；「关于」收尾）。 */
export const CATEGORY_ORDER: readonly Category[] = ['agents', 'skills', 'mcp', 'hooks', 'about']

/** 上次离开时停留的页面。 */
export interface LastView {
  category: Category
  /** 只在 category 为 skills 时生效。 */
  tab: SkillTab
}

/** 没有记录时的默认页：Skill / 来源。 */
export const DEFAULT_VIEW: LastView = { category: 'skills', tab: 'sources' }

/** localStorage key of the last visited page (per browser, survives sessions). */
export const LAST_VIEW_KEY = 'skill-hub.last-view'

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORY_ORDER as readonly string[]).includes(value)
}

function isTab(value: unknown): value is SkillTab {
  return value === 'sources' || value === 'market'
}

/**
 * 读取上次离开的页面。字段分别校验：分类坏了整条作废（回到默认分类），
 * tab 坏了只回到「来源」——一个字段的损坏不该连累另一个。
 */
export function readLastView(): LastView {
  try {
    const raw = localStorage.getItem(LAST_VIEW_KEY)
    if (raw === null) return { ...DEFAULT_VIEW }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_VIEW }
    const record = parsed as { category?: unknown; tab?: unknown }
    return {
      category: isCategory(record.category) ? record.category : DEFAULT_VIEW.category,
      tab: isTab(record.tab) ? record.tab : DEFAULT_VIEW.tab,
    }
  } catch {
    return { ...DEFAULT_VIEW }
  }
}

/** 记录离开时停留的页面。 */
export function rememberView(view: LastView): void {
  try {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify({ category: view.category, tab: view.tab }))
  } catch {
    // 无 localStorage（隐私模式等）：不记录，下次仍回默认页。
  }
}
