/**
 * 文件原文的 token 计数（DeepSeek V4.1 Flash / GLM-5.3）。
 *
 * 为什么在宿主侧数：两个词表分别是 6 MB 与 19 MB 的 tokenizer.json，搬到
 * 浏览器里解析既慢又占内存，而且每次刷新页面都要重来；宿主加载一次后常驻
 * 内存，面板只发原文、只收数字。
 *
 * 为什么是 @huggingface/tokenizers 而不是 @huggingface/transformers：后者
 * 为了跑推理把 onnxruntime-node 和 sharp 一起拖进来（几十 MB，还有原生
 * 二进制），而这个功能只需要 tokenizer.json 的纯 JS 实现。同属 Hugging
 * Face 家族、零依赖、没有 N-API 构建，数字与 Rust 版 tokenizers 逐位一致
 * （tokens.test.ts 里有固定用例；开发时也用 Python tokenizers 对同一批
 * 文件做过交叉核对）。
 *
 * 词表怎么来：不随插件发布，也不打进构建产物。第一次计数时按协议层固定
 * 的 revision 从 Hugging Face 下载 tokenizer.json，落到插件数据目录
 * `$DSH_HOME/plugin/data/custom-instruction-manager/tokenizer/` 下，之后只读
 * 本地文件。缓存
 * 只有"有/没有"两种状态——不做过期、不做过期清理、不做手动管理，体积也
 * 就是两份词表。
 *
 * 计数结果本身**不**缓存：面板每次进详情页都重新数一遍，数字永远跟着当前
 * 文件内容走。这里缓存的只有"解析好的 tokenizer 对象"和磁盘上那份词表。
 *
 * 模型是可选的：协议层给出三个（DeepSeek V4.1 Flash、GLM-5.3 默认选中，
 * Kimi K3 需手动勾选）。勾选即下载，取消勾选即删掉那份词表并把它从内存里
 * 逐出——"管理模型"和磁盘内容是同一件事，不留下需要另外清理的中间态。
 */
import { type TokenCountEntry, type TokenModelSpec, type TokenModelState } from './protocol/tokens.ts';
/** 词表缓存目录（`$DSH_HOME/plugin/data/custom-instruction-manager/tokenizer`）。 */
export declare function tokenCacheDir(home?: string): string;
/** 下载 URL：`resolve/<revision>/tokenizer.json`（固定 revision，不吃 `main` 的漂移）。 */
export declare function tokenizerUrl(spec: TokenModelSpec): string;
/** 按 id 取模型定义；未知 id 返回 undefined（模型下线后的残留选择）。 */
export declare function modelOf(id: string): TokenModelSpec | undefined;
/**
 * 「管理模型」要显示的状态：协议层的全部模型 + 是否选中 + 词表是否已在本机。
 *
 * `installed` 看缓存文件而不是内存：面板刷新、宿主重启后内存里没有 tokenizer，
 * 但文件还在——那也算"已下载"（下次计数直接读盘）。
 */
export declare function modelStates(selection: readonly string[], dir?: string): TokenModelState[];
/** 计数可注入的依赖（测试用临时目录 + 假 fetch，不联网）。 */
export interface CountTokensOptions {
    /** 词表缓存目录；默认在插件数据目录下的 `tokenizer/`。 */
    dir?: string;
    /** 下载实现；默认全局 fetch。 */
    fetch?: typeof globalThis.fetch;
    /** 单次下载超时（默认 120s，19 MB 词表在慢网下也够）。 */
    timeoutMs?: number;
    /** 只数这些模型（id）；缺省 = 协议层默认集合。 */
    models?: readonly string[];
}
/**
 * 数一份原文在各模型词表下的 token 数。
 *
 * 每个模型独立成败：一个词表没下载下来，另一个照样返回数字（`entries` 里
 * 失败项带 `error`）。整族人一起失败只可能是 fetch 之外的编程错误。
 *
 * `add_special_tokens: false`：统计的是文件原文本身，不含 BOS/EOS 这类
 * 包装；面板的脚注也这么写。
 *
 * @param text - 文件原文，原样计数（不 trim、不合并空行）。
 * @param options - 缓存目录/下载实现/超时（测试注入）。
 * @returns 每个模型一条结果，顺序与 TOKEN_MODELS 一致。
 */
export declare function countTokens(text: string, options?: CountTokensOptions): Promise<TokenCountEntry[]>;
/**
 * 选中一个模型：把词表下载到本机（失败就抛，调用方决定要不要记下这次选择）。
 *
 * 下载完继续留在内存里——用户勾选它的目的就是马上要数，没必要再读一次盘。
 */
export declare function installModel(id: string, options?: CountTokensOptions): Promise<void>;
/**
 * 取消选中：删掉本机那份词表并把它从内存逐出。
 *
 * 先等在途加载落定再删文件，否则一个正在下载的 promise 会在我们删完之后把文件
 * 又写回去（用户看到的"取消勾选"就没生效）。
 */
export declare function removeModel(id: string, options?: CountTokensOptions): Promise<void>;
/** 丢掉内存里的 tokenizer（测试用；生产不需要）。 */
export declare function resetTokenizers(): void;
//# sourceMappingURL=tokens.d.ts.map