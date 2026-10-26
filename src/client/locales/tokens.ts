/** Token 统计表（详情页）。从 locales.ts 按前缀拆出，键集合与文件无关。 */
export const zhTokens = {
  'tokens.title': 'Token 统计',
  'tokens.subtitle': '当前文件内容 · 本地计数',
  'tokens.model': '模型',
  'tokens.tokens': 'Tokens',
  'tokens.status': '状态',
  'tokens.pending': '待计数',
  'tokens.counting': '计数中',
  'tokens.done': '完成',
  'tokens.failed': '失败',
  'tokens.footnote': '仅文件原文，不含提示词包装开销',
  'tokens.empty': '未提供文件内容',
  'tokens.downloading': '首次计数需下载词表，之后读本地缓存',
} as const

export const enTokens: Record<keyof typeof zhTokens, string> = {
  'tokens.title': 'Token counts',
  'tokens.subtitle': 'Current file · counted locally',
  'tokens.model': 'Model',
  'tokens.tokens': 'Tokens',
  'tokens.status': 'Status',
  'tokens.pending': 'Pending',
  'tokens.counting': 'Counting',
  'tokens.done': 'Done',
  'tokens.failed': 'Failed',
  'tokens.footnote': 'File text only, no prompt-wrapper overhead',
  'tokens.empty': 'No file content',
  'tokens.downloading': 'First count downloads the vocabularies; later counts read the local cache',
}
