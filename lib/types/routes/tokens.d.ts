/**
 * Token 计数域路由：数一份原始正文在**当前选中**的各模型词表下的 token 数，
 * 以及管理这个选中集合（哪些模型出现在表格里）。
 *
 * 为什么正文是 POST 而不是 GET：被判的就是文件正文本身，几十 KB 到几 MB，
 * 塞进 URL 既超长又会被各种代理截断；GET 也带不上"每次现算"的语义。
 *
 * 为什么正文由浏览器送来而不是给个路径让宿主自己读：面板已经有这段原文
 * （详情页就是这么显示的），送过来就保证"数的就是用户看到的"；换成路径
 * 还要再解析一遍技能名/工作区、再判一次可读边界，多一条路径就多一处裁决。
 * 代价是正文过一遍 loopback，几 KB 到几十 KB，可忽略。
 *
 * 请求体上限比本族其它路由（64 KB）宽松，因为正文本身就是载荷；上限见
 * protocol/tokens.ts 的 TOKEN_COUNT_MAX_BYTES。
 *
 * 选中集合是"要用哪些模型"的唯一来源：勾选即下载词表、取消即删掉那份词表，
 * 两者都在 /tokens/select 里一次做完，不存在需要另外清理的中间态。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** Token 计数域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function tokensRoutes(deps: SkillHubRouteDeps): RouteSpec[];
//# sourceMappingURL=tokens.d.ts.map