/** 来源跟踪与回收站（含删除确认）。从 locales.ts 按前缀拆出，键集合不变。 */
export declare const zhSources: {
    readonly 'delete.confirmTitle': "删除技能？";
    readonly 'delete.confirmText': "确定把「{name}」移入废纸篓吗？文件会移到 ~/.Trash（重名时追加时间戳），可在 Finder 中恢复。";
    readonly 'delete.confirm': "移入废纸篓";
    readonly 'source.commit': "已同步版本";
    readonly 'source.unverified': "尚未核对上游";
    readonly 'source.check': "检查更新";
    readonly 'source.checkHint': "点击检查上游更新";
    readonly 'source.checking': "检查中…";
    readonly 'source.upToDate': "已是最新";
    readonly 'source.updated': "有更新 {count} 个";
    readonly 'source.deleted': "上游已删除 {count} 个";
    readonly 'source.error': "检查失败";
    readonly 'source.throttled': "刚刚检查过";
    readonly 'source.sync': "同步";
    readonly 'source.syncing': "同步中…";
    readonly 'source.syncConfirmTitle': "同步技能？";
    readonly 'source.syncConfirmText': "将用上游最新版本覆盖本地对以下技能的所有修改：";
    readonly 'source.followDelete': "跟进删除";
    readonly 'source.deleteConfirmTitle': "跟进上游删除？";
    readonly 'source.deleteConfirmText': "以下技能已从上游仓库移除，本地目录将移入回收站（可恢复）：";
    readonly 'source.trash': "回收站";
    readonly 'source.restore': "恢复";
    readonly 'source.clearTrash': "清空回收站";
    readonly 'source.clearTrashConfirmTitle': "清空回收站？";
    readonly 'source.clearTrashConfirmText': "回收站里的技能会被永久删除，无法恢复。此操作不可撤销。";
    readonly 'source.clearTrashConfirm': "永久删除";
};
export declare const enSources: Record<keyof typeof zhSources, string>;
//# sourceMappingURL=sources.d.ts.map