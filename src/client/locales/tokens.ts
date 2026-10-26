/** Token 统计表（详情页）。从 locales.ts 按前缀拆出，键集合与文件无关。 */
export const zhTokens = {
  'tokens.title': 'Token 统计',
  'tokens.model': '模型',
  'tokens.tokens': 'Tokens',
  'tokens.manage': '管理模型',
  'tokens.none': '未选择模型',
  'tokens.downloaded': '已下载',
  'tokens.sizeMb': '{mb} MB · 未下载',
  'tokens.downloading': '下载中…',
  'tokens.removing': '删除中…',
  'tokens.loadingModels': '读取模型列表…',
} as const

export const enTokens: Record<keyof typeof zhTokens, string> = {
  'tokens.title': 'Token counts',
  'tokens.model': 'Model',
  'tokens.tokens': 'Tokens',
  'tokens.manage': 'Manage models',
  'tokens.none': 'No model selected',
  'tokens.downloaded': 'Downloaded',
  'tokens.sizeMb': '{mb} MB · not downloaded',
  'tokens.downloading': 'Downloading…',
  'tokens.removing': 'Removing…',
  'tokens.loadingModels': 'Loading models…',
}
