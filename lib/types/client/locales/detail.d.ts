/** 技能详情。从 locales.ts 按前缀拆出，键集合不变。 */
export declare const zhDetail: {
    readonly 'detail.copyMention': "复制 $mention";
    readonly 'detail.copyPath': "复制路径";
    readonly 'detail.copied': "已复制";
    readonly 'detail.back': "返回列表";
    readonly 'detail.managedBy': "管理方";
    readonly 'detail.addedAt': "添加时间";
    readonly 'detail.updatedAt': "更新时间";
    readonly 'detail.path': "路径";
    readonly 'detail.whenToUse': "适用场景";
    readonly 'detail.uses': "调用次数";
    readonly 'detail.loading': "读取技能正文…";
    readonly 'detail.invocation': "调用方式";
    readonly 'detail.modelInvocable': "模型可调";
    readonly 'detail.modelInvocableHint': "Agent 可自动调用；取消勾选写入 disable-model-invocation: true";
    readonly 'detail.userInvocable': "用户可调";
    readonly 'detail.userInvocableHint': "仅显式点名时触发；取消勾选写入 user-invocable: false";
    readonly 'detail.invocationReadonly': "该技能由内置或插件提供者注册，没有可写的技能文件，调用方式只读。";
    readonly 'detail.invocationSaved': "调用方式已写入";
    readonly 'detail.editSave': "保存";
    readonly 'detail.editSaving': "保存中…";
    readonly 'detail.editDiscardAll': "放弃所有编辑";
    readonly 'detail.editShortcut': "⌘S 保存";
    readonly 'detail.editSkillBody': "技能正文";
    readonly 'detail.editAgentFile': "指令文件正文";
    readonly 'detail.editDiscard': "放弃所有编辑？未保存的修改会丢失。";
    readonly 'detail.editSaved': "已保存到磁盘";
    readonly 'detail.editUpstream': "已保存。此技能跟随 {repo}，同步会用上游版本覆盖本地修改。";
    readonly 'detail.editConflictTitle': "文件已被修改";
    readonly 'detail.editConflictText': "这个文件在你编辑期间被别处改过（例如 dsh 会话里的 agent）。你的草稿还没写进磁盘。";
    readonly 'detail.editConflictCopyReload': "复制并重新加载";
    readonly 'detail.editConflictContinue': "继续编辑";
    readonly 'detail.editConflictOverwrite': "仍然覆盖";
};
export declare const enDetail: Record<keyof typeof zhDetail, string>;
//# sourceMappingURL=detail.d.ts.map