/**
 * The skill hub panel: catalog grouped by source collections, search and
 * filter in one row, per-group tri-state switches with conflict dialogs,
 * upstream source tracking (check / sync / follow upstream deletion into a
 * restorable trash), market sources, disabled re-enable, detail inspection,
 * and the new-skill scaffold form.
 *
 * Thin shell: state and flows live in useSkillHub, the tab contents live in
 * SourcesView / MarketView, the dialog family lives in dialogs.tsx, and their
 * wiring lives in PanelDialogs.tsx. This component owns only the shared chrome
 * (header, banners, filter bar, shared sections), the view routing and the
 * scroll position across list ↔ detail; every hook runs above the detail early
 * return, so that return stays safe.
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { WritableRoot } from '../../protocol.ts'
import type { HubKey } from '../locales.ts'
import type { SkillHubApi } from '../api.ts'
import { tt } from '../helpers.ts'
import { PRIVATE_SOURCE, type SortKey } from '../grouping.ts'
import { dotStyle, relativeTimeText } from './format.ts'
import { PanelWidthControls } from './PanelWidthControls.tsx'
import { AboutView } from './AboutView.tsx'
import { SkillDetailView } from './SkillDetailView.tsx'
import { SourcesView } from './SourcesView.tsx'
import { MarketView } from './MarketView.tsx'
import { PanelDialogs } from './PanelDialogs.tsx'
import { useSkillHub } from './useSkillHub.ts'
import css from './panel.module.css'

export interface SkillHubPanelProps {
  api: SkillHubApi
}

/**
 * 顶层内容分类：这一页是「其他插件」的管理入口，四类内容共用一条导航。
 * 只有 Skill 接入了数据；AGENTS.md / MCP / Hook 目前是占位页。
 */
type Category = 'agents' | 'skills' | 'mcp' | 'hooks' | 'about'

/** 分类顺序与标签键（内容分类在前，用户指定的 AGENTS.md → Skill → MCP → Hook；「关于」收尾）。 */
const CATEGORY_ORDER: readonly Category[] = ['agents', 'skills', 'mcp', 'hooks', 'about']
const CATEGORY_LABEL: Record<Category, HubKey> = {
  agents: 'category.agents',
  skills: 'category.skills',
  mcp: 'category.mcp',
  hooks: 'category.hooks',
  about: 'category.about',
}

export function SkillHubPanel(props: SkillHubPanelProps): React.JSX.Element {
  const hub = useSkillHub(props.api)
  /** 工作区输入草稿：回车才应用，避免每次按键都触发目录重拉。 */
  const [workspaceDraft, setWorkspaceDraft] = useState('')
  /** 「筛选」面板开合（来源 + 调用方式收进这里；搜索/排序/视图切换始终可见）。 */
  const [filtersOpen, setFiltersOpen] = useState(false)
  /** 页壳元素（宽度手柄的挂载目标与 ResizeObserver 观察对象）。 */
  const [shell, setShell] = useState<HTMLDivElement | null>(null)
  /** 顶层分类（默认 Skill：其余三类还没有数据）。 */
  const [category, setCategory] = useState<Category>('skills')
  const refShell = useCallback((node: HTMLDivElement | null): void => { setShell(node) }, [])
  /** 列表/详情共用的滚动容器（两种视图结构相同，React 会复用同一个 DOM 节点）。 */
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /** 进入详情前列表的滚动位置；返回时原样恢复。 */
  const listScrollTop = useRef(0)
  const {
    catalog, loading, loadError, successBanner, updateState, detail, detailLoading, showForm, formName, formDesc,
    formRoot, formBusy, formMessage, hubConfig, tab, skillView, sourceFilter, sortKey, search,
    workspace, setWorkspace,
    sourcesState, groupsState, listBusy, batchBusy, sourceOptions, filtered,
    conflictDialog, confirmDialog, deleteSkillDialog, deleteGroupDialog, confirmClearTrash, branchChoice, branchBusy, marketSyncDialog,
    syncBusy, uses, sourceCheck, checkingSource, syncingSource,
    editMode,
    setLoadError, setSuccessBanner, setDetail, setShowForm, setFormName, setFormDesc, setFormRoot, setFormMessage, setTab,
    setSkillView, setSourceFilter, setSortKey, setSearch, setConflictDialog, setConfirmDialog, setDeleteSkillDialog, setDeleteGroupDialog,
    setConfirmClearTrash, setBranchChoice, setMarketSyncDialog, setEditMode,
    checkUpdate, loadMarket, checkSources, requestSync, requestDelete, restoreTrash, clearTrash, runDeleteSkill, runDeleteGroup,
    runConfirmed, resolveConflict, confirmBranchChoice, confirmMarketSync, create, enableDisabled,
  } = hub
  const { shortenedCount, fixingPaths, clearListFilters } = hub

  // 视图切换的滚动位置：进详情一律回到顶部，返回列表恢复进入前的位置。
  // 两种视图的外壳结构相同，React 复用同一个滚动容器，必须显式改 scrollTop。
  const detailOpen = detail !== null
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (scroll === null) return
    scroll.scrollTop = detailOpen ? 0 : listScrollTop.current
  }, [detailOpen])

  // -------------------------------------------------------------- detail

  if (detail !== null) {
    const disabledRecord = catalog?.disabled.find((record) => record.name === detail.name)
    return (
      <div className={css.pageShell} ref={refShell}>
        <div className={css.scrollArea} data-hub-scroll="" ref={scrollRef}>
          <SkillDetailView
            detail={detail}
            hubConfig={hubConfig}
            uses={uses}
            sourcesState={sourcesState}
            sourceCheck={sourceCheck}
            checkingSource={checkingSource}
            syncingSource={syncingSource}
            disabled={disabledRecord !== undefined}
            editable={detail.editable}
            invocationBusy={hub.invocationBusy}
            onInvocationChange={(modelInvocable, userInvocable) => { void hub.setInvocation(detail.name, modelInvocable, userInvocable) }}
            onEnable={disabledRecord !== undefined ? () => { void enableDisabled(disabledRecord).then(() => { setDetail(null) }) } : undefined}
            onBack={() => { setDetail(null) }}
            onCheck={(repo) => { void checkSources(repo) }}
            onSync={requestSync}
            onFollowDelete={requestDelete}
          />
        </div>
        <PanelWidthControls container={shell} />
      </div>
    )
  }

  /** 生效中的筛选条件数（来源 + 调用方式），显示在「筛选」按钮上。 */
  const activeFilterCount = (sourceFilter !== 'all' ? 1 : 0) + (hub.invocationFilter !== 'all' ? 1 : 0)

  /** 检查结果的悬停提示：收敛到「检查更新」按钮上，不再占面板顶部横幅。 */
  const updateTitle = ((): string | undefined => {
    if (updateState.status === 'checking') return tt('update.checking')
    if (updateState.status === 'error') return tt('update.error', { error: updateState.message })
    if (updateState.status === 'ready') {
      const data = updateState.data
      if (data.error !== undefined) return tt('update.error', { error: data.error })
      if (data.updateAvailable) return tt('update.available', { version: data.latestVersion ?? '', current: data.currentVersion })
      if (data.latestVersion === null) return tt('update.unavailable')
      return tt('update.upToDate', { version: data.latestVersion })
    }
    return undefined
  })()

  return (
    <div className={css.pageShell} ref={refShell}>
      <div
        className={css.scrollArea}
        data-hub-scroll=""
        ref={scrollRef}
        onScroll={(event) => {
          // 取详情时的「加载中」占位会插在列表上方，浏览器的滚动锚定会把
          // scrollTop 顶高一段；那段位移不是用户的浏览位置，不能覆盖存档。
          // 市场 tab 复用同一个滚动容器，它的位置也不属于技能列表。
          if (detailLoading || detail !== null || tab !== 'sources') return
          listScrollTop.current = event.currentTarget.scrollTop
        }}
      >
        <div className={css.panel} aria-busy={batchBusy || listBusy}>
      {/* 标题行：官方一级页面的标题条（ui-schedule TaskManagerPage 的
          .pageHeading）——一段 20px/28px/500 的无图标标题；列表级动作
          （编辑 / 新建技能）下移到视图切换那一行的右端。 */}
      <div className={css.pageHeading}>
        <h1 className={css.title}>{tt('panel.title')}</h1>
        {/* 目录计数与诊断提示只属于 Skill 页；标题本身保持官方那样的纯文字行盒。 */}
        {category === 'skills'
          ? <span className={css.headingMeta}>
              {catalog !== null
                ? <span className={css.headerCount}>
                    {tt('panel.count', { count: catalog.skills.length + catalog.disabled.length })}
                    {catalog.disabled.length > 0 ? ' · ' + tt('panel.disabledCount', { count: catalog.disabled.length }) : null}
                  </span>
                : null}
              {catalog !== null && !catalog.complete ? <span className={css.hint}>{tt('panel.incomplete')}</span> : null}
              {catalog !== null && (catalog.duplicateNames?.length ?? 0) > 0 ? <button type='button' className={css.opBtn} title={tt('row.duplicateHint')} onClick={() => { clearListFilters() }}>⚠ {tt('row.duplicate')}×{(catalog.duplicateNames ?? []).length}</button> : null}
            </span>
          : null}
      </div>

      {/* 分类导航：官方自动化任务页的分段筛选项（TaskManagerPage 的
          .filterTabs / .filterTab）——28px 胶囊、10px 内边距、14px 圆角、
          14px/22px 文字；未选中三级墨色，选中取 hover 底 + 一级墨色。 */}
      <nav className={css.filterTabs} role='group' aria-label={tt('category.label')}>
        {CATEGORY_ORDER.map((id) => (
          <button
            key={id}
            type='button'
            className={css.filterTab + (category === id ? ' ' + css.filterTabActive : '')}
            aria-pressed={category === id}
            onClick={() => { setCategory(id) }}
          >{tt(CATEGORY_LABEL[id])}</button>
        ))}
      </nav>

      {category === 'about' ? (
        /* 「关于」页：版本与检查更新收在这里，标题行只留页面标题与列表级动作。 */
        <AboutView
          version={catalog?.pluginVersion ?? null}
          status={updateTitle}
          checking={updateState.status === 'checking'}
          releaseUrl={updateState.status === 'ready' && updateState.data.updateAvailable ? updateState.data.url : null}
          latestVersion={updateState.status === 'ready' && updateState.data.updateAvailable ? updateState.data.latestVersion ?? null : null}
          onCheck={() => { void checkUpdate() }}
        />
      ) : category !== 'skills' ? (
        /* 尚未接入数据的分类：说明这里将来装什么，而不是假装列表为空。 */
        <div className={css.placeholder}>
          <h2 className={css.placeholderTitle}>{tt(CATEGORY_LABEL[category])}</h2>
          <p className={css.placeholderBody}>{tt('category.pending', { name: tt(CATEGORY_LABEL[category]) })}</p>
        </div>
      ) : (
        <>
      <div className={css.subbar}>
        <span className={css.segmented}>
          <button type='button' className={css.segBtn + (tab === 'sources' ? ' ' + css.segBtnActive : '')} onClick={() => { setTab('sources') }}>{tt('view.sources')}</button>
          <button type='button' className={css.segBtn + (tab === 'market' ? ' ' + css.segBtnActive : '')} onClick={() => { setTab('market'); void loadMarket() }}>{tt('view.market')}</button>
        </span>
        <span className={css.workspaceBox}>
          <input
            className={css.search + ' ' + css.workspaceInput}
            value={workspaceDraft}
            placeholder={workspace !== '' ? workspace : tt('panel.workspacePlaceholder')}
            title={tt('panel.workspaceHint')}
            onChange={(event) => { setWorkspaceDraft(event.target.value) }}
            onKeyDown={(event) => { if (event.key === 'Enter') setWorkspace((event.target as HTMLInputElement).value.trim()) }}
          />
          {workspace !== ''
            ? <button type='button' className={css.opBtn} title={tt('panel.workspaceClear')} onClick={() => { setWorkspace(''); setWorkspaceDraft('') }}>✕</button>
            : null}
        </span>
        {/* 列表级动作贴这一行的右端（.actions 自带 margin-left:auto）。 */}
        <span className={css.actions}>
          <button
            type='button'
            className={css.button + (editMode ? ' ' + css.primary : '')}
            aria-pressed={editMode}
            title={tt('edit.hint')}
            onClick={() => { setEditMode((value) => !value) }}
          >{tt(editMode ? 'edit.done' : 'edit.start')}</button>
          <button type='button' className={css.button + ' ' + css.primary} onClick={() => { setShowForm((value) => !value) }}>{tt('panel.new')}</button>
        </span>
      </div>

      {showForm ? (
        <form className={css.form} onSubmit={(event) => { void create(event) }}>
          <p className={css.hintLine}>{tt('form.capabilityHint')}</p>
          <div className={css.formRow}>
            <label className={css.formLabel}>{tt('form.name')}</label>
            <input className={css.input} value={formName} onChange={(event) => { setFormName(event.target.value) }} placeholder='code-review' />
          </div>
          <div className={css.formRow}>
            <label className={css.formLabel}>{tt('form.desc')}</label>
            <input className={css.input} value={formDesc} onChange={(event) => { setFormDesc(event.target.value) }} placeholder={tt('form.descPlaceholder')} />
          </div>
          <div className={css.formRow}>
            <label className={css.formLabel}>{tt('form.root')}</label>
            <select className={css.select} value={formRoot} onChange={(event) => { setFormRoot(event.target.value as WritableRoot) }}>
              <option value='user-dsh'>~/.dsh/skills</option>
              <option value='user-agents'>~/.agents/skills</option>
            </select>
          </div>
          {formMessage !== null ? <div className={formMessage.kind === 'error' ? css.formError : css.formSuccess}>{formMessage.text}</div> : null}
          <div className={css.buttons}>
            <button type='submit' className={css.button + ' ' + css.primary} disabled={formBusy}>{formBusy ? tt('form.busy') : tt('form.submit')}</button>
            <button type='button' className={css.button} onClick={() => { setShowForm(false); setFormMessage(null) }}>{tt('form.cancel')}</button>
          </div>
        </form>
      ) : null}

      {loadError !== null ? (
        <div className={css.errorBanner} role='alert'>
          <span>{loadError}</span>
          <button type='button' className={css.button} aria-label={tt('err.dismiss')} onClick={() => { setLoadError(null) }}>{tt('err.dismiss')}</button>
        </div>
      ) : null}

      {successBanner !== null ? (
        <div className={css.successBanner} role='status'>
          <span>{successBanner}</span>
          <button type='button' className={css.button} aria-label={tt('err.dismiss')} onClick={() => { setSuccessBanner(null) }}>{tt('err.dismiss')}</button>
        </div>
      ) : null}

      {/* 圆点图例常驻（比藏在问号按钮后面更容易发现）；每个列表视图共用一套。 */}
      <div className={css.legend}>
        <span className={css.legendItem}><span className={css.dot + ' ' + css.dotModel} style={dotStyle(hubConfig?.dotModelColor)} />{tt('legend.model')}</span>
        <span className={css.legendItem}><span className={css.dot + ' ' + css.dotUser} style={dotStyle(hubConfig?.dotUserColor)} />{tt('legend.user')}</span>
        <span className={css.legendHint}>{tt('legend.hint')}</span>
      </div>

      {loading ? (
        <div className={css.skeleton} role='status' aria-label={tt('panel.loading')}>
          <div className={css.skeletonRow} />
          <div className={css.skeletonRow} />
          <div className={css.skeletonRow} />
        </div>
      ) : null}

      {detailLoading ? <div className={css.empty}>{tt('detail.loading')}</div> : null}

      {tab === 'market' ? (
        <MarketView hub={hub} />
      ) : catalog !== null ? (
        <>
          <div className={css.filterBar}>
            <span className={css.segmented}>
              <button type='button' className={css.segBtn + (skillView === 'flat' ? ' ' + css.segBtnActive : '')} onClick={() => { setSkillView('flat') }}>{tt('view.flat')}</button>
              <button type='button' className={css.segBtn + (skillView === 'groups' ? ' ' + css.segBtnActive : '')} onClick={() => { setSkillView('groups') }}>{tt('view.grouped')}</button>
            </span>
            <select className={css.select} value={sortKey} onChange={(event) => { setSortKey(event.target.value as SortKey) }}>
              <option value='name'>{tt('sort.name')}</option>
              <option value='added'>{tt('sort.added')}</option>
              <option value='uses'>{tt('sort.uses')}</option>
            </select>
            <input className={css.search} value={search} onChange={(event) => { setSearch(event.target.value) }} placeholder={tt('panel.search')} />
            <button
              type='button'
              className={css.button + (filtersOpen || activeFilterCount > 0 ? ' ' + css.primary : '')}
              aria-expanded={filtersOpen}
              aria-controls='skill-hub-filter-panel'
              onClick={() => { setFiltersOpen((value) => !value) }}
            >{tt('filter.title')}{activeFilterCount > 0 ? ' (' + activeFilterCount + ')' : ''}</button>
          </div>
          {filtersOpen ? (
            <div className={css.filterPanel} id='skill-hub-filter-panel'>
              <label className={css.filterField}>
                <span className={css.formLabel}>{tt('filter.source')}</span>
                <select className={css.select} value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value) }}>
                  <option value='all'>{tt('filter.allSources')}</option>
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>{source === PRIVATE_SOURCE ? tt('filter.private') : source}</option>
                  ))}
                </select>
              </label>
              <label className={css.filterField}>
                <span className={css.formLabel}>{tt('filter.invocation')}</span>
                <select className={css.select} value={hub.invocationFilter} onChange={(event) => { hub.setInvocationFilter(event.target.value as 'all' | 'model' | 'user') }}>
                  <option value='all'>{tt('filter.invocationAll')}</option>
                  <option value='model'>{tt('filter.modelOnly')}</option>
                  <option value='user'>{tt('filter.userOnly')}</option>
                </select>
              </label>
              {activeFilterCount > 0 ? (
                <button type='button' className={css.opBtn} onClick={() => { setSourceFilter('all'); hub.setInvocationFilter('all') }}>{tt('filter.clear')}</button>
              ) : null}
            </div>
          ) : null}
          {catalog !== null && (filtered.length !== catalog.skills.length || hub.invocationFilter !== 'all' || sourceFilter !== 'all') ? (
            <div className={css.hintLine} style={{ margin: '2px 2px 0', display:'flex', gap:8, flexWrap:'wrap' }}>
              <span>{tt('filter.showing', { shown: filtered.length, total: catalog.skills.length, filtered: hub.invocationFilter !== 'all' || sourceFilter !== 'all' ? tt('filter.filteredSuffix') : '' })}</span>
              {shortenedCount > 0 ? <span title={tt('filter.shortened', { count: shortenedCount })}>{tt('filter.shortened', { count: shortenedCount })}</span> : null}
            </div>
          ) : null}

          {filtered.length === 0 && search.trim() !== '' ? <div className={css.empty}>{tt('panel.empty')}</div> : null}
          {filtered.length === 0 && search.trim() === '' && catalog.skills.length === 0 && catalog.disabled.length === 0 && catalog.diagnostics.length === 0
            ? <div className={css.empty}>{tt('panel.emptyAll')}</div>
            : null}

          <SourcesView hub={hub} />

          {sourcesState !== null && sourcesState.trash.length > 0 ? (
            <section className={css.section}>
              <div className={css.sectionTitle + ' ' + css.sectionHeadRow}>
                <span className={css.sectionTitleFill}>{tt('source.trash')}</span>
                <button type='button' className={css.opBtn + ' ' + css.opDanger} disabled={listBusy} onClick={() => { setConfirmClearTrash(true) }}>{tt('source.clearTrash')}</button>
              </div>
              <div className={css.list}>
                {sourcesState.trash.map((entry) => (
                  <div key={entry.name} className={css.row + ' ' + css.rowStatic}>
                    <div className={css.rowMain}>
                      <div className={css.rowName}>{entry.name}</div>
                      <div className={css.rowDesc}>{relativeTimeText(entry.movedAt)}</div>
                    </div>
                    <button type='button' className={css.opBtn} disabled={listBusy} onClick={() => { void restoreTrash(entry.name) }}>{tt('source.restore')}</button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {catalog.diagnostics.length > 0 ? (
            <section className={css.section}>
              <div className={css.sectionTitle}>{tt('panel.diagnostics')}</div>
              {catalog.diagnostics.map((entry) => (
                <div key={entry.path} className={css.diagRow} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className={css.diagPath}>{entry.path}</div>
                    <div className={css.diagReason}>{entry.reason}</div>
                  </div>
                  {entry.fixable === true ? (
                    <button
                      type='button'
                      className={css.opBtn}
                      disabled={fixingPaths.has(entry.path)}
                      onClick={() => { void hub.fixDiagnostic(entry.path) }}
                      style={{ flex:'none', alignSelf:'center' }}
                    >{fixingPaths.has(entry.path) ? tt('diag.fixing') : tt('diag.fix')}</button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
        </>
      )}

      <PanelDialogs
        conflictDialog={conflictDialog}
        collections={groupsState?.collections ?? []}
        setConflictDialog={setConflictDialog}
        resolveConflict={resolveConflict}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
        runConfirmed={runConfirmed}
        branchChoice={branchChoice}
        branchBusy={branchBusy}
        setBranchChoice={setBranchChoice}
        confirmBranchChoice={confirmBranchChoice}
        versionDialog={hub.versionDialog}
        versionBusy={hub.versionBusy}
        setVersionDialog={hub.setVersionDialog}
        confirmVersionDialog={hub.confirmVersionDialog}
        marketSyncDialog={marketSyncDialog}
        syncBusy={syncBusy}
        setMarketSyncDialog={setMarketSyncDialog}
        confirmMarketSync={confirmMarketSync}
        deleteSkillDialog={deleteSkillDialog}
        setDeleteSkillDialog={setDeleteSkillDialog}
        runDeleteSkill={runDeleteSkill}
        deleteGroupDialog={deleteGroupDialog}
        setDeleteGroupDialog={setDeleteGroupDialog}
        runDeleteGroup={runDeleteGroup}
        confirmClearTrash={confirmClearTrash}
        setConfirmClearTrash={setConfirmClearTrash}
        clearTrash={clearTrash}
      />
        </div>
      </div>
      <PanelWidthControls container={shell} />
    </div>
  )
}
