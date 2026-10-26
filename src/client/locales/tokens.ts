/** Token 统计表（详情页）。从 locales.ts 按前缀拆出，键集合与文件无关。 */
export const zhTokens = {
  'tokens.title': 'Token 统计',
  'tokens.model': '模型',
  'tokens.tokens': 'Tokens',
} as const

export const enTokens: Record<keyof typeof zhTokens, string> = {
  'tokens.title': 'Token counts',
  'tokens.model': 'Model',
  'tokens.tokens': 'Tokens',
}
