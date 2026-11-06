/**
 * routes 共享层 · 目录装配：已知工作区清单、完整目录响应（时间戳/interface
 * 元数据/重名诊断）与详情映射。从 helpers.ts 原样搬出，行为不变。
 */
import type { SkillDefinition } from '@deepseek-ai/dsh-skill';
import { type CatalogResponse, type SkillDetail } from '../protocol.ts';
import { type SkillInterface } from '../skillfs.ts';
import { type SkillHubRouteDeps } from './deps.ts';
/**
 * 目录中存在的技能名集合。只算启用的技能；旧版遗留的 `.disabled` 文件不属于
 * 目录，也不参与去重。
 */
export declare function knownSkillNames(deps: SkillHubRouteDeps): Promise<Set<string>>;
/** 已知工作区条目（dsh 的 workspace.json 表）。 */
export interface WorkspaceEntry {
    path: string;
    title: string;
}
/** 已知工作区条目（dsh 的 workspace.json 表 + 显示顺序）。 */
export interface WorkspaceEntry {
    /** Workspace 注册 id（workspace.json 的 tables 键）。 */
    id?: string;
    path: string;
    title: string;
}
/**
 * 读取 dsh 的已知工作区清单（~/.dsh/storages/workspace.json 的
 * tables.workspaces 表），**按侧面栏的显示顺序**返回：global.workspaceIds
 * 是注册表维护的有序 id 表（dsh-workspace 的 `workspaceRegistry.list()`），
 * 侧面栏就按它渲染；表键顺序只是插入顺序，会与界面顺序相反。没有
 * workspaceIds（旧文件/手写测试）时退回表键顺序。文件缺失/损坏时返回
 * 空清单（回退为仅用户级视图）。
 */
export declare function workspaceEntries(home: string): Promise<WorkspaceEntry[]>;
/**
 * Build the full catalog response (shared by catalog/create handlers).
 * 显式 cwd 只看该工作区；否则合并所有已知工作区（workspace.json）的项目技能
 * + 用户级技能，同名技能先到先得；没有任何工作区时回退为仅用户级视图。
 */
export declare function buildCatalog(deps: SkillHubRouteDeps, cwd?: string): Promise<CatalogResponse>;
/** agents/openai.yaml 的 interface 元数据 → 目录行/详情行（catalog 与详情共用）。 */
export declare function applyInterface<T extends SkillInterface>(row: T, iface: SkillInterface): void;
/** Map a loaded definition onto the wire shape. */
export declare function toDetail(skill: SkillDefinition, home?: string): SkillDetail;
//# sourceMappingURL=catalog-data.d.ts.map