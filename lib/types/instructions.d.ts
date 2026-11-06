/**
 * AGENTS.md 页的磁盘清单（只读扫描）。
 *
 * 契约：只列「dsh 支持的文件名 ∩ 磁盘上真实存在」的文件，按用户级 + 每个
 * 已知工作区分组。dsh 的候选名是固定的（用户级只有 AGENTS.md；项目级
 * AGENTS.md / CLAUDE.md + AGENTS.local.md / CLAUDE.local.md），页面不改
 * dsh 的加载行为，只是把磁盘现状照出来。
 *
 * 扫描规则（与需求契约一一对应）：
 *   - 项目内递归整棵树，没有深度上限；硬剪 `.git` / `node_modules`，
 *     再剪用户配置的「排除目录」（默认 `.agent-work`，任意层级精确匹配）。
 *   - 隐藏目录照扫；嵌套 git 仓库照扫（它们可能就是你要看的内容）。
 *   - 工作区路径本身经过排除目录的整节跳过；目录已不存在的工作区跳过。
 *   - 父工作区扫描时跳过「本身是已注册工作区」的子目录，避免同一份文件在
 *     父子两个标题下各出现一次。
 *   - 符号链接隐藏链接、显示原始：realpath 落在项目内且仍是候选文件名时按
 *     原始路径计；链接到项目外 / 坏链则保留链接自身的名字。
 *   - 去重只发生在同一目录内（trim 后内容相同），与 dsh 的候选组一致；
 *     跨目录即使内容相同也各自显示。
 */
import { type EditSnapshot, type InstructionFileDetail, type InstructionFileRef, type InstructionGroup, type InstructionRoster } from './protocol.ts';
import { type SkillHubRouteDeps } from './routes/deps.ts';
/** dsh 在项目目录里认识的全部指令文件名，顺序即 dsh 的候选顺序。 */
export declare const PROJECT_INSTRUCTION_FILES: readonly ["AGENTS.md", "CLAUDE.md", "AGENTS.local.md", "CLAUDE.local.md"];
/** 用户级根目录唯一的候选文件名（dsh 不认 `.local`、也不认 CLAUDE.md）。 */
export declare const USER_INSTRUCTION_FILE = "AGENTS.md";
/**
 * 一次扫描的「计划」：先算出要扫哪些作用域，再逐个扫。
 *
 * 分步扫描靠它把工作切成 `1 + projects.length` 步（第 0 步用户级，其后每个
 * 工作区一步）。计划本身要 stat 每个工作区（realpath + 目录存在性），很便宜；
 * 真正贵的递归遍历留给各步。
 */
export interface InstructionScanPlan {
    /** 本次扫描实际生效的排除目录清单。 */
    excludeDirs: string[];
    /** 用户级分组（第 0 步的结果）。 */
    user: InstructionGroup;
    /** 每个已注册工作区一项，顺序即分组顺序。 */
    projects: Array<{
        title: string;
        /** 工作区根的 realpath（链接折叠后）。 */
        own: string;
        /** 嵌套在本工作区里的其他已注册工作区根：它们的子树归各自的组。 */
        nested: ReadonlySet<string>;
    }>;
}
/**
 * 算出一次扫描要覆盖的作用域。
 * @param deps - route dependencies (homes + hub config).
 * @returns 用户级分组、按侧边栏顺序的工作区清单，以及生效的排除目录。
 */
export declare function planInstructionScan(deps: SkillHubRouteDeps): Promise<InstructionScanPlan>;
/**
 * 扫一个已注册工作区，产出该组的行。
 * @param plan - the scan plan this project came from (exclude list).
 * @param project - one plan entry.
 * @returns that workspace's group.
 */
export declare function scanProjectGroup(plan: InstructionScanPlan, project: InstructionScanPlan['projects'][number]): Promise<InstructionGroup>;
/**
 * Scan every scope for supported instruction files in one go.
 * @param deps - route dependencies (home overrides for tests, hub config for the exclude list).
 * @returns the ordered groups plus the exclude list that produced them.
 */
export declare function scanInstructionGroups(deps: SkillHubRouteDeps): Promise<InstructionRoster>;
/** A refusal from the instruction-file detail reader, carrying its HTTP status. */
export declare class InstructionFileError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/**
 * The roster row behind one absolute path, or undefined when the path is not
 * one of this page's rows. Both readings (the GET detail and the save) go
 * through it, so the write entry accepts exactly the files the list shows.
 *
 * 清单里存的是 realpath（macOS 的 /var → /private/var 会让字面路径对不上），
 * 所以两边都过一遍 realpath，同时接受调用方原样回传的行值。
 */
export declare function instructionRefOf(deps: SkillHubRouteDeps, absolutePath: string, scan?: InstructionRoster): Promise<InstructionFileRef | undefined>;
/**
 * Read one instruction file that the current scan reports.
 *
 * The lookup is validated against the page's own rows (no arbitrary file reads
 * through the route) and reuses the same canonical/realpath rules the list
 * shows — the list it compares against is exactly what the user clicked.
 * @param deps - route dependencies (homes + config).
 * @param absolutePath - the row's `absolute`, as sent by the panel.
 * @param scan - an already-computed scan to validate against; omitted runs one
 *  (the route passes its cached list so a row click never re-walks the tree).
 * @returns the file body plus its on-disk metadata.
 * @throws {InstructionFileError} 404 when the path is not a current row,
 *  413 when the file is too large to display.
 */
export declare function readInstructionFile(deps: SkillHubRouteDeps, absolutePath: string, scan?: InstructionRoster): Promise<InstructionFileDetail>;
/**
 * 冲突：磁盘上的文件在编辑期间被改过（agent、别的编辑器、同步）。`latest`
 * 是刚读到的状态，路由把它原样回给客户端，让「复制并重新加载 / 继续编辑 /
 * 仍然覆盖」三选有据可依。
 */
export declare class StaleContentError extends Error {
    readonly latest: EditSnapshot;
    constructor(message: string, latest: EditSnapshot);
}
/**
 * 写回一份指令文件的整份原文。
 * @param deps - route dependencies.
 * @param absolutePath - the row's `absolute`, as sent by the panel.
 * @param content - 新的整份正文（不做 trim，原样落盘）。
 * @param expected - 载入时的 mtime/size；缺省表示不做冲突检查。
 * @param scan - the cached roster (same one the detail read used).
 * @returns 写回后的文件大小与 mtime。
 * @throws {InstructionFileError} 404 不在清单里 / 文件已消失；413 正文过大。
 * @throws {StaleContentError} 409 期间被外部改过（带最新内容）。
 */
export declare function saveInstructionFile(deps: SkillHubRouteDeps, absolutePath: string, content: string, expected?: {
    modifiedAt?: number;
    size?: number;
}, scan?: InstructionRoster): Promise<{
    path: string;
    size: number;
    modifiedAt: number;
}>;
//# sourceMappingURL=instructions.d.ts.map