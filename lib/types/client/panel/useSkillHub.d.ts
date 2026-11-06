/**
 * useSkillHub — 面板的状态聚合根：只持有跨域共享的通知状态与纯视图状态，
 * 各域状态与动作分散在 ./hooks/*，这里按依赖顺序组装（meta → 目录 →
 * 分组 → 来源 → 市场），轮询与派生组装在此。返回形状与拆分前完全一致，
 * 所有视图无需改动。All hooks run unconditionally at the top, so the panel
 * may early-return for the detail view without violating the rules of hooks.
 */
import type { SkillHubApi } from '../api.ts';
import type { SkillTab } from './last-view.ts';
/** The hook's result: the panel's complete state + action surface. */
export type SkillHubState = ReturnType<typeof useSkillHub>;
export declare function useSkillHub(api: SkillHubApi, initialTab?: SkillTab): {
    catalog: import("../../protocol.ts").CatalogResponse | null;
    loading: boolean;
    loadError: string | null;
    successBanner: string | null;
    updateState: import("./hooks/shared.ts").UpdateState;
    repoDiscoverState: import("./hooks/shared.ts").RepoDiscoverState;
    scanningRepo: string | null;
    repoSelected: ReadonlySet<string>;
    repoImporting: boolean;
    repoResult: import("../../protocol.ts").RepoImportProgressResponse | null;
    search: string;
    workspace: string;
    detail: import("../../protocol.ts").SkillDetail | null;
    detailLoading: boolean;
    busyNames: ReadonlySet<string>;
    batchBusy: boolean;
    showForm: boolean;
    formName: string;
    formDesc: string;
    formRoot: import("../../protocol.ts").WritableRoot;
    formBusy: boolean;
    formMessage: {
        kind: "error" | "success";
        text: string;
    } | null;
    uses: ReadonlyMap<string, {
        count: number;
        lastUsed?: number;
    }>;
    hubConfig: import("../../protocol.ts").HubConfig | null;
    tab: SkillTab;
    skillView: "flat" | "groups";
    sourceFilter: string;
    invocationFilter: "user" | "model" | "all";
    sortKey: import("../grouping.ts").SortKey;
    marketState: import("./hooks/shared.ts").MarketState;
    marketCheck: Readonly<Record<string, {
        repo: string;
        ref?: string;
        latestTag?: string;
        updateAvailable: boolean;
        commitSha: string;
        throttled?: boolean;
        error?: string;
    }>>;
    marketStats: Readonly<Record<string, {
        stars: number;
        downloads: number;
    }>>;
    branchChoice: import("./dialogs.tsx").BranchChoiceState | null;
    branchBusy: boolean;
    marketSyncDialog: import("./dialogs.tsx").MarketSyncDialogState | null;
    syncingMarket: string | null;
    syncBusy: boolean;
    newSourceName: string;
    groupsState: import("../../protocol.ts").GroupsResponse | null;
    sourcesState: import("../../protocol.ts").SourcesResponse | null;
    sourceCheck: Readonly<Record<string, import("../../protocol.ts").SourceCheckResult>>;
    checkingSource: string | null;
    syncingSource: string | null;
    confirmDialog: import("./dialogs.tsx").ConfirmDialogState | null;
    deleteSkillDialog: string | null;
    confirmClearTrash: boolean;
    updateAllDialog: boolean;
    listBusy: boolean;
    collapsedGroups: ReadonlySet<string>;
    subdividedProjects: ReadonlySet<string>;
    versionDialog: import("./dialogs.tsx").VersionChoiceState | null;
    versionBusy: boolean;
    agents: import("../../protocol.ts").AgentsResponse | null;
    agentsScan: import("./hooks/useAgentsFlow.ts").AgentsScanProgress | null;
    agentsError: string | null;
    excludeSaving: boolean;
    loadAgents: (fresh?: boolean) => Promise<void>;
    saveExcludeDirs: (dirs: string[] | null) => Promise<void>;
    agentsFile: import("./hooks/useAgentsFlow.ts").AgentsFileState | null;
    openAgentsFile: (ref: import("../../protocol.ts").InstructionFileRef, scope: string) => Promise<void>;
    closeAgentsFile: () => void;
    patchAgentsFile: (next: {
        content: string;
        size: number;
        modifiedAt: number;
    }) => void;
    mcp: import("./hooks/useMcpFlow.ts").McpFlow;
    normalized: string;
    origins: Record<string, string>;
    sourceOptions: string[];
    filtered: import("../../protocol.ts").CatalogSkill[];
    sorted: import("../../protocol.ts").CatalogSkill[];
    shortenedCount: number;
    setLoadError: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    setSuccessBanner: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    setSearch: import("react").Dispatch<import("react").SetStateAction<string>>;
    setWorkspace: import("react").Dispatch<import("react").SetStateAction<string>>;
    setDetail: import("react").Dispatch<import("react").SetStateAction<import("../../protocol.ts").SkillDetail | null>>;
    setShowForm: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    setFormName: import("react").Dispatch<import("react").SetStateAction<string>>;
    setFormDesc: import("react").Dispatch<import("react").SetStateAction<string>>;
    setFormRoot: import("react").Dispatch<import("react").SetStateAction<import("../../protocol.ts").WritableRoot>>;
    setFormMessage: import("react").Dispatch<import("react").SetStateAction<{
        kind: "error" | "success";
        text: string;
    } | null>>;
    setRepoSelected: import("react").Dispatch<import("react").SetStateAction<ReadonlySet<string>>>;
    setTab: import("react").Dispatch<import("react").SetStateAction<SkillTab>>;
    setSkillView: import("react").Dispatch<import("react").SetStateAction<"flat" | "groups">>;
    setSourceFilter: import("react").Dispatch<import("react").SetStateAction<string>>;
    setInvocationFilter: import("react").Dispatch<import("react").SetStateAction<"user" | "model" | "all">>;
    setSortKey: import("react").Dispatch<import("react").SetStateAction<import("../grouping.ts").SortKey>>;
    setBranchChoice: import("react").Dispatch<import("react").SetStateAction<import("./dialogs.tsx").BranchChoiceState | null>>;
    setMarketSyncDialog: import("react").Dispatch<import("react").SetStateAction<import("./dialogs.tsx").MarketSyncDialogState | null>>;
    setNewSourceName: import("react").Dispatch<import("react").SetStateAction<string>>;
    setConfirmDialog: import("react").Dispatch<import("react").SetStateAction<import("./dialogs.tsx").ConfirmDialogState | null>>;
    setDeleteSkillDialog: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    setConfirmClearTrash: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    setUpdateAllDialog: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    setVersionDialog: import("react").Dispatch<import("react").SetStateAction<import("./dialogs.tsx").VersionChoiceState | null>>;
    toggleGroupCollapse: (key: string) => void;
    toggleSubdivide: (key: string) => void;
    setAllGroupsCollapsed: (keys: readonly string[] | null) => void;
    checkUpdate: () => Promise<void>;
    loadMarket: () => Promise<void>;
    openDetail: (name: string) => Promise<void>;
    reveal: (name: string, cwd?: string) => void;
    runConfirmed: () => Promise<void>;
    checkSources: (repo?: string) => Promise<void>;
    requestSync: (repo: string, skills: string[]) => void;
    requestDelete: (repo: string, skills: string[]) => void;
    restoreTrash: (name: string) => Promise<void>;
    clearTrash: () => Promise<void>;
    fixingPaths: ReadonlySet<string>;
    fixDiagnostic: (path: string) => Promise<void>;
    invocationBusy: boolean;
    setInvocation: (name: string, modelInvocable: boolean, userInvocable: boolean) => Promise<void>;
    clearListFilters: () => void;
    openVersionDialog: (repo: string) => Promise<void>;
    confirmVersionDialog: () => Promise<void>;
    requestDeleteSkill: (name: string) => void;
    runDeleteSkill: () => Promise<void>;
    addSource: (input: string) => Promise<void>;
    addMarketSource: () => Promise<void>;
    removeMarketSource: (repo: string) => Promise<void>;
    scanRepo: (input: string) => Promise<void>;
    confirmBranchChoice: () => Promise<void>;
    toggleRepoSelected: (path: string, checked: boolean) => void;
    importRepo: () => Promise<void>;
    cancelImport: () => Promise<void>;
    clearScan: () => void;
    checkMarket: () => Promise<void>;
    loadMarketStats: () => Promise<void>;
    syncMarketSource: (repo: string) => Promise<void>;
    confirmMarketSync: () => Promise<void>;
    updateAll: () => Promise<void>;
    create: (event: import("react").FormEvent) => Promise<void>;
};
//# sourceMappingURL=useSkillHub.d.ts.map