/**
 * 调用方式圆点组：Agent 可调 → 蓝点，用户可调 → 绿点，两者互不排斥、可同时出现；
 * 都不可调时整组不渲染（列表图例：无圆点 = 不可被调用）。行与详情头部共用。
 */
import type { JSX } from 'react';
import type { CatalogSkill, HubConfig } from '../../protocol.ts';
export declare function InvocationDots(props: {
    invocation: CatalogSkill['invocation'];
    /** Effective hub config; null while it has not loaded (falls back to defaults). */
    hubConfig: HubConfig | null;
}): JSX.Element | null;
//# sourceMappingURL=InvocationDots.d.ts.map