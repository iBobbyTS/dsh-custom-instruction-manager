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
export type Category = 'agents' | 'skills' | 'mcp' | 'hooks' | 'about';
/** Skill 页的两个 tab。 */
export type SkillTab = 'sources' | 'market';
/** 分类顺序与标签键（内容分类在前，用户指定的 AGENTS.md → Skill → MCP → Hook；「关于」收尾）。 */
export declare const CATEGORY_ORDER: readonly Category[];
/** 上次离开时停留的页面。 */
export interface LastView {
    category: Category;
    /** 只在 category 为 skills 时生效。 */
    tab: SkillTab;
}
/** 没有记录时的默认页：Skill / 来源。 */
export declare const DEFAULT_VIEW: LastView;
/** localStorage key of the last visited page (per browser, survives sessions). */
export declare const LAST_VIEW_KEY = "skill-hub.last-view";
/**
 * 读取上次离开的页面。字段分别校验：分类坏了整条作废（回到默认分类），
 * tab 坏了只回到「来源」——一个字段的损坏不该连累另一个。
 */
export declare function readLastView(): LastView;
/** 记录离开时停留的页面。 */
export declare function rememberView(view: LastView): void;
//# sourceMappingURL=last-view.d.ts.map