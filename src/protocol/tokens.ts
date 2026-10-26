/**
 * Token 计数契约：`POST /api/skill-hub/tokens` 数一份文件原文在各个模型
 * tokenizer 下的 token 数。
 *
 * 模型清单放在协议层、host 与面板共用同一份：面板据此在第一次计数回来
 * 之前就把表格画成完整的两行「待计数」，而不是先长出一行、再跳成两行；
 * host 据此决定加载哪几个词表。词表仓库与固定 revision 也写在这里，因为
 * 「这个数字是哪一版词表算的」属于这个数字本身的含义，而不是宿主实现
 * 细节——面板可以原样展示，换词表就是换一次 revision。
 *
 * 词表（tokenizer.json）不随插件发布，也不在这里：它们是运行期按需下载
 * 的资产，落到本机缓存目录后常驻，详见宿主侧 ../tokens.ts。
 */

/**
 * 一个参与计数的模型，以及它官方 tokenizer.json 的位置。
 *
 * `revision` 固定到某个 commit：同一份插件代码永远数同一版词表，不会
 * 因为上游 `main` 移动而让昨天的数字和今天的不一样（换了词表就换数字，
 * 那是另一件事，必须显式改这里）。
 */
export interface TokenModelSpec {
  /** 稳定键；请求/响应里的 `id` 就是它。 */
  id: string
  /** 表格「模型」列显示的文案。 */
  label: string
  /** Hugging Face 仓库（tokenizer.json 所在处）。 */
  repo: string
  /** 固定的词表 revision（40 位 commit sha）。 */
  revision: string
}

/**
 * 参与计数的模型（本步固定两个）。
 *
 * 数字来自真 tokenizer，不是字符数/字节数估算。DeepSeek 用官方
 * DeepSeek-V4.1-Flash 词表，GLM 用 zai-org/GLM-5.3 词表，两者都是
 * `tokenizer.json`（BPE），宿主用 @huggingface/tokenizers 解码运行，
 * 与 Rust 版 tokenizers 的结果逐位一致。
 */
export const TOKEN_MODELS: readonly TokenModelSpec[] = [
  {
    id: 'deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    repo: 'deepseek-ai/DeepSeek-V4.1-Flash',
    revision: '314113f8a7dadb388215396ba5fbee2c610a04d6',
  },
  {
    id: 'glm-5.3',
    label: 'GLM-5.3',
    repo: 'zai-org/GLM-5.3',
    revision: 'ba32f8c19c8738e2c57c71798c601d477a7bf844',
  },
]

/**
 * 一次计数受理的正文上限（8 MB，字节）。
 *
 * 典型的 AGENTS.md / SKILL.md 是几 KB 到几十 KB；上限只用来挡住「把整个
 * 仓库塞进一次请求」这类误用，不参与常规路径。超限按 400 拒绝，而不是
 * 静默截断——截断后的 token 数会是错的，错数字比报错更糟。
 */
export const TOKEN_COUNT_MAX_BYTES = 8 * 1024 * 1024

/** POST /api/skill-hub/tokens 的请求体。 */
export interface TokenCountRequest {
  /**
   * 文件原文。原样传：不 trim、不合并空行、不改换行符——计数要贴住磁盘
   * 上那份内容，任何「顺手清理」都会让数字和文件对不上。
   */
  text: string
}

/** 一个模型的计数结果（成功带 `tokens`，失败带 `error`）。 */
export interface TokenCountEntry {
  /** 对应 TOKEN_MODELS[].id。 */
  id: string
  /** 展示名，面板直接渲染（不在浏览器里写死模型清单）。 */
  label: string
  /** token 数；`error` 存在时缺省。 */
  tokens?: number
  /** 该模型这次没数出来的原因（词表下载失败 / 计数异常）；另一个模型不受影响。 */
  error?: string
}

/** POST /api/skill-hub/tokens 的响应：每个模型一条，顺序与 TOKEN_MODELS 一致。 */
export interface TokenCountResponse {
  ok: true
  entries: TokenCountEntry[]
}
