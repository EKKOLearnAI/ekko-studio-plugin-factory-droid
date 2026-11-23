// Layout and interactions adapted from the MIT-licensed Ekko Studio Cline plugin.
const english = {
  title: 'Configuration', skillsTitle: 'Skills', mcpTitle: 'MCP servers',
  global: 'Personal · Global', total: 'Total', active: 'Enabled', disabled: 'Disabled', unavailable: 'Unavailable',
  refresh: 'Refresh', reload: 'Reload', management: 'Open Agent management', engine: 'Runtime', installed: 'Installed', missing: 'Not installed', managed: 'Studio-managed', external: 'External',
  install: 'Install or update the Droid CLI in Agent management. To sign in for Global mode, use Droid on the Studio host.',
  docs: 'Factory configuration docs', scopes: 'Sources and scope',
  scope: 'These files are shared with Droid on the Studio host and apply to Global. Scoped uses a private home and the Studio model. Droid can still load project Skills and MCP in the selected workspace.',
  project: 'Project, organization and linked files are managed outside this page. Global changes are loaded in a fresh Droid session.',
  limitations: 'This editor manages the supported preferences listed below. Manage Factory sign-in, custom model credentials and organization policies in Droid.',
  location: 'Configuration location', base: 'Personal defaults', local: 'Personal local overrides',
  configHelp: 'Supported keys are model, reasoningEffort, disabledSkills, blockOnMcpLoad and streamAssistantResponses. Omit a key to clear it from this file.',
  precedence: 'Local overrides take precedence for keys present here. Workspace and organization settings can also affect which values Droid uses.',
  save: 'Save', saved: 'Saved to Droid configuration.', removed: 'Removed from Droid configuration.',
  addSkill: 'Add Skill', addMcp: 'Add MCP server', view: 'View', edit: 'Edit', remove: 'Delete', enable: 'Enable', disable: 'Disable', cancel: 'Cancel', close: 'Close',
  skillList: 'Skill list', selectSkill: 'Select a Skill to view details', search: 'Search name or description',
  emptySkills: 'No personal Skills yet.', emptyMcp: 'No personal MCP servers yet.', noMatches: 'No matching items', loading: 'Loading…',
  name: 'Name', skillName: 'Use lowercase letters, numbers and hyphens.', mcpName: 'Use letters, numbers, hyphens, underscores or dots.',
  description: 'Description', descriptionHelp: 'Describe when Droid should use this Skill.',
  content: 'Skill content (Markdown)', contentHelp: 'Edit the SKILL.md body. The editor updates name and description in the YAML frontmatter.',
  mcpConfig: 'Server configuration (JSON)', mcpHelp: 'Use Droid’s native stdio, http or sse format. Keep null placeholders to retain private values.',
  mcpLimits: 'Connection tests and OAuth sign-in are performed in Droid. This page shows the personal file state.',
  masked: 'Endpoint hidden', enabledLabel: 'Enabled in personal configuration',
  readOnly: 'Read-only in Studio. Inspect the native file for links, invalid entries or unsupported configuration.',
  skillToggle: 'Personal Skill status. Project or frontmatter restrictions can also disable it.',
  skillBlocked: 'The switch is unavailable. A frontmatter restriction or an unreadable personal settings file can prevent this change.',
  discard: 'Discard unsaved edits?', duplicate: 'This name already exists. Edit the existing item.',
  stale: 'The file changed. Refresh it before editing.', jsonObject: 'Enter a JSON object.',
  deleteSkill: 'Delete SKILL.md? Supporting files will be kept.', deleteMcp: 'Delete this server from the personal MCP file?',
}

const simplified = {
  title: '配置编辑', skillsTitle: 'Skill 管理', mcpTitle: 'MCP 管理',
  global: '个人 · Global', total: '全部', active: '已启用', disabled: '已停用', unavailable: '状态不可用',
  refresh: '刷新', reload: '重新读取', management: '打开 Agent 管理', engine: '运行环境', installed: '已安装', missing: '未安装', managed: 'Studio 托管', external: '外部安装',
  install: '在 Agent 管理中安装或更新 Droid CLI。Global 模式的账号登录由 Studio 宿主上的 Droid 完成。',
  docs: 'Factory 配置文档', scopes: '来源与作用范围',
  scope: '这些个人文件与 Studio 宿主上的 Droid 共用，用于 Global。Scoped 使用临时主目录和 Studio 选择的模型，仍可读取所选工作区的项目 Skill 和 MCP。',
  project: '项目、组织及链接文件请在原生环境中管理。启动新的 Droid 会话后加载 Global 配置。',
  limitations: '本页只管理下列偏好。Factory 登录、自定义模型凭据和组织策略请在原生 Droid 中管理。',
  location: '配置位置', base: '个人默认设置', local: '个人本地覆盖',
  configHelp: '支持 model、reasoningEffort、disabledSkills、blockOnMcpLoad 和 streamAssistantResponses。省略某项即可从此文件清除该项。',
  precedence: '本地覆盖中的同名设置优先。项目和组织配置也可能影响 Droid 最终使用的值。',
  save: '保存', saved: '已保存到 Droid 配置。', removed: '已从 Droid 配置中移除。',
  addSkill: '添加 Skill', addMcp: '添加 MCP 服务', view: '查看', edit: '编辑', remove: '删除', enable: '启用', disable: '停用', cancel: '取消', close: '关闭',
  skillList: 'Skill 列表', selectSkill: '选择 Skill 查看详情', search: '搜索名称或描述',
  emptySkills: '还没有个人 Skill。', emptyMcp: '还没有个人 MCP 服务。', noMatches: '没有匹配的项目', loading: '正在读取…',
  name: '名称', skillName: '使用小写字母、数字和连字符。', mcpName: '使用字母、数字、连字符、下划线或点。',
  description: '描述', descriptionHelp: '说明 Droid 应在何时使用此 Skill。',
  content: 'Skill 内容（Markdown）', contentHelp: '编辑 SKILL.md 正文。编辑器会更新 YAML 文件头中的名称和描述。',
  mcpConfig: '服务配置（JSON）', mcpHelp: '使用 Droid 原生 stdio、http 或 sse 格式。保留 null 占位符即可保留隐藏值。',
  mcpLimits: '连接测试和 OAuth 登录由 Droid 完成。页面展示个人文件的配置状态。',
  masked: '端点已隐藏', enabledLabel: '在个人配置中启用',
  readOnly: '在 Studio 中只读。请在原生配置中检查链接、无效或不支持的条目。',
  skillToggle: '这是个人 Skill 的状态。项目或文件头中的限制也可使其停用。',
  skillBlocked: '当前无法使用开关。文件头限制或无法读取的个人设置可能阻止此操作。',
  discard: '放弃未保存的编辑？', duplicate: '此名称已存在，请编辑现有条目。',
  stale: '文件已有更改，刷新后再编辑。', jsonObject: '请输入 JSON 对象。',
  deleteSkill: '删除 SKILL.md？附属文件会保留。', deleteMcp: '从个人 MCP 文件中删除此服务？',
}

const traditional = {
  ...simplified,
  title: '設定編輯', skillsTitle: 'Skill 管理', mcpTitle: 'MCP 管理', total: '全部', active: '已啟用', disabled: '已停用', unavailable: '狀態無法判定',
  refresh: '重新整理', reload: '重新讀取', management: '開啟 Agent 管理', engine: '執行環境', installed: '已安裝', missing: '未安裝', managed: 'Studio 管理', external: '外部安裝',
  install: '在 Agent 管理中安裝或更新 Droid CLI。Global 模式請在 Studio 主機上的 Droid 登入。',
  docs: 'Factory 設定文件', scopes: '來源與作用範圍',
  scope: 'Global 與 Studio 主機上的 Droid 共用這些個人檔案。Scoped 使用暫存主目錄和 Studio 選取的模型，仍可讀取所選工作區的專案 Skill 和 MCP。',
  project: '專案、組織及連結檔案請在原生環境中管理。開啟新的 Droid 工作階段後載入 Global 設定。',
  limitations: '此頁只管理下列偏好。Factory 登入、自訂模型憑證和組織原則由原生 Droid 管理。',
  location: '設定位置', base: '個人預設設定', local: '個人本機覆寫',
  configHelp: '支援 model、reasoningEffort、disabledSkills、blockOnMcpLoad 和 streamAssistantResponses。省略欄位即可從此檔案清除該項。',
  precedence: '本機覆寫中的同名設定優先。專案和組織設定也可能影響 Droid 最終使用的值。',
  save: '儲存', saved: '已儲存至 Droid 設定。', removed: '已從 Droid 設定中移除。',
  addSkill: '新增 Skill', addMcp: '新增 MCP 伺服器', view: '檢視', edit: '編輯', remove: '刪除', enable: '啟用', disable: '停用', cancel: '取消', close: '關閉',
  skillList: 'Skill 清單', selectSkill: '選擇 Skill 查看詳細資料', search: '搜尋名稱或說明',
  emptySkills: '還沒有個人 Skill。', emptyMcp: '還沒有個人 MCP 伺服器。', noMatches: '沒有相符的項目', loading: '正在讀取…',
  name: '名稱', skillName: '使用小寫字母、數字和連字號。', mcpName: '使用字母、數字、連字號、底線或點。',
  description: '說明', descriptionHelp: '說明 Droid 應在何時使用這個 Skill。',
  content: 'Skill 內容（Markdown）', contentHelp: '編輯 SKILL.md 正文。編輯器會更新 YAML 檔頭中的名稱和說明。',
  mcpConfig: '伺服器設定（JSON）', mcpHelp: '使用 Droid 原生 stdio、http 或 sse 格式。保留 null 即可保留隱藏的值。',
  mcpLimits: '連線測試和 OAuth 登入由 Droid 執行。此頁顯示個人檔案的設定狀態。',
  masked: '端點已隱藏', enabledLabel: '在個人設定中啟用',
  readOnly: '在 Studio 中唯讀。請在原生設定中檢查連結、無效或未支援的項目。',
  skillToggle: '此為個人 Skill 狀態。專案或檔頭限制也可能使其停用。',
  skillBlocked: '目前無法使用開關。檔頭限制或無法讀取的個人設定可能阻止此動作。',
  discard: '放棄尚未儲存的編輯？', duplicate: '此名稱已存在，請編輯現有項目。',
  stale: '檔案已有變更，請重新整理後再編輯。', jsonObject: '請輸入 JSON 物件。',
  deleteSkill: '刪除 SKILL.md？附屬檔案會保留。', deleteMcp: '從個人 MCP 檔案刪除此伺服器？',
}

const themeStyles = `
  :root{--mc-space:var(--spacing-scale,1);--mc-border:var(--border-width,1px) solid var(--border-color);color-scheme:var(--studio-color-scheme,normal)}
  html,body,#root{height:100%;min-height:0;margin:0}#root{padding:0}
  .mc-settings *,.mc-manager *{box-sizing:border-box}
  @media(max-width:768px){.mc-manager .mc-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .mc-settings,.mc-manager{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;min-width:0;color:var(--text-primary);font:var(--font-size-base,14px)/var(--line-height,1.6) var(--font-family,system-ui);letter-spacing:var(--letter-spacing,normal)}
  .mc-settings button,.mc-manager button{display:inline-flex;align-items:center;justify-content:center;gap:calc(6px * var(--mc-space));min-height:var(--control-height,28px);padding:4px 10px;border:var(--mc-border);border-radius:var(--radius-component,6px);background:transparent;line-height:1.4;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
  .mc-settings button:hover,.mc-manager button:hover{background:var(--bg-secondary)}
  .mc-settings button.primary,.mc-manager button.primary{background:var(--accent-primary);border-color:var(--accent-primary);color:var(--mc-on-accent)}
  .mc-settings button.quiet,.mc-manager button.quiet{border-color:transparent}
  .mc-manager button.danger{color:var(--error,var(--text-secondary))}
  .mc-settings button:disabled,.mc-manager button:disabled{opacity:.5;cursor:default}
  .mc-settings input,.mc-settings textarea,.mc-manager input:not([type=checkbox]),.mc-manager textarea{padding:5px 10px;border:var(--mc-border);border-radius:var(--radius-component,6px);background:var(--theme-input-bg,var(--bg-input,var(--bg-secondary)));color:var(--text-primary);font:inherit;min-width:0;max-width:100%}
  .mc-settings input:disabled,.mc-settings textarea:disabled,.mc-manager input:disabled,.mc-manager textarea:disabled{cursor:default;opacity:.5}
  .mc-settings textarea,.mc-manager textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:calc(var(--font-size-base,14px) * 13 / 14);line-height:1.6;resize:vertical}
  .mc-settings :focus-visible,.mc-manager :focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
  .mc-page-header{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;gap:calc(12px * var(--mc-space));flex-wrap:wrap;padding:calc(12px * var(--mc-space)) calc(20px * var(--mc-space));border-bottom:var(--mc-border)}
  .mc-page-header h1{font-size:calc(var(--font-size-base,14px) * 16 / 14);font-weight:600;line-height:1.5;margin:0}
  .mc-page-header .mc-buttons{margin-inline-start:auto}
  .mc-page-content{flex:1;min-height:0;overflow:auto;padding:calc(20px * var(--mc-space));display:flex;flex-direction:column;gap:calc(16px * var(--mc-space));min-width:0}
  .mc-manager p,.mc-settings p{margin:0;color:var(--text-secondary);overflow-wrap:anywhere}
  .mc-source-path{display:block;font:calc(var(--font-size-base,14px) * 12 / 14)/1.6 ui-monospace,monospace;color:var(--text-muted,var(--text-secondary));overflow-wrap:anywhere}
  .mc-source-info{font-size:calc(var(--font-size-base,14px) * 12 / 14);color:var(--text-secondary)}
  .mc-source-info summary{cursor:pointer}.mc-source-info p,.mc-source-info code{margin-top:8px}
  .mc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:calc(12px * var(--mc-space))}
  .mc-stat{padding:calc(14px * var(--mc-space));border:var(--mc-border);border-radius:var(--radius-component,8px);background:var(--theme-card-bg,var(--bg-card));display:flex;flex-direction:column;gap:6px}
  .mc-stat span{font-size:calc(var(--font-size-base,14px) * 11 / 14);color:var(--text-muted,var(--text-secondary))}.mc-stat strong{font-size:calc(var(--font-size-base,14px) * 24 / 14);font-weight:600;line-height:1}.mc-stat.active strong{color:var(--success,var(--accent-primary))}
  .mc-toolbar,.mc-buttons{display:flex;align-items:center;gap:calc(8px * var(--mc-space));flex-wrap:wrap}
  .mc-toolbar .mc-buttons{margin-inline-start:auto}
  .mc-manager .mc-toolbar input{flex:1;max-width:360px;min-width:0}
  .mc-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:calc(14px * var(--mc-space))}
  .mc-row{display:flex;flex-direction:column;gap:calc(12px * var(--mc-space));padding:calc(16px * var(--mc-space));border:var(--mc-border);border-radius:var(--radius-component,8px);background:var(--theme-card-bg,var(--bg-card));min-width:0}
  .mc-summary{flex:1;min-width:0;overflow-wrap:anywhere}.mc-summary strong{font-size:calc(var(--font-size-base,14px) * 15 / 14);font-weight:600}.mc-summary p{font-size:calc(var(--font-size-base,14px) * 13 / 14);margin-top:8px}
  .mc-row-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .mc-row-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:var(--mc-border);padding-top:10px}
  .mc-badges{display:flex;gap:6px;flex-wrap:wrap}
  .mc-badge{display:inline-flex;padding:1px 7px;border:var(--mc-border);border-radius:var(--radius-component,4px);font-size:calc(var(--font-size-base,14px) * 11 / 14);color:var(--text-secondary)}
  .mc-badge.active{color:var(--success,var(--accent-primary));border-color:currentColor}
  .mc-manager button.mc-switch{flex-shrink:0;min-height:18px;width:32px;height:18px;padding:2px;justify-content:flex-start;border:0;border-radius:12px;background:var(--text-muted)}
  .mc-manager button.mc-switch[aria-checked=true]{background:var(--accent-primary)}
  .mc-switch::after{content:'';width:14px;height:14px;border-radius:50%;background:var(--mc-on-accent);transition:transform .15s}
  .mc-switch[aria-checked=true]::after{transform:translateX(14px)}
  .mc-empty{grid-column:1/-1;text-align:center;padding:48px 16px}
  .mc-dialog{width:min(600px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;border:var(--mc-border);border-radius:var(--radius-component,12px);background:var(--theme-overlay-bg,var(--bg-card));color:var(--text-primary)}
  .mc-dialog::backdrop{background:color-mix(in srgb,var(--text-primary) 30%,transparent)}
  .mc-editor{display:flex;flex-direction:column;gap:calc(16px * var(--mc-space));padding:calc(24px * var(--mc-space));min-width:0}.mc-editor[hidden]{display:none}
  .mc-editor h2{font-size:18px;margin:0;font-weight:600}.mc-editor fieldset{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:16px;min-width:0}
  .mc-editor label{display:flex;flex-direction:column;gap:6px}.mc-editor label strong{font-size:14px;font-weight:500}.mc-editor label p{font-size:12px}
  .mc-editor textarea{min-height:220px;width:100%}.mc-editor .mc-check{flex-direction:row;align-items:center;gap:8px}
  .mc-editor>.mc-buttons{justify-content:flex-end;border-top:var(--mc-border);padding-top:16px}
  .mc-message{white-space:pre-wrap;overflow-wrap:anywhere}.mc-message:empty{display:none}.mc-message[role=alert]{border-inline-start:3px solid var(--accent-primary);padding-inline-start:12px}
  .mc-settings [data-theme-surface=card],.mc-manager [data-theme-surface=card]{--mc-border:var(--border-width,1px) solid var(--theme-card-border,var(--border-color));border-radius:var(--theme-card-radius,var(--radius-component,8px));box-shadow:var(--theme-card-shadow,none)}
  .mc-settings [data-theme-surface=input],.mc-manager [data-theme-surface=input]{--mc-border:var(--border-width,1px) solid var(--theme-input-border,var(--border-color));border-radius:var(--theme-input-radius,var(--radius-component,6px));box-shadow:var(--theme-input-shadow,none)}
  .mc-dialog{--mc-border:var(--border-width,1px) solid var(--theme-overlay-border,var(--border-color));border-radius:var(--theme-overlay-radius,var(--radius-component,12px));box-shadow:var(--theme-overlay-shadow,none)}
  .mc-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(16px * var(--mc-space));min-width:0}
  .mc-section{display:flex;flex-direction:column;gap:12px;min-width:0;border:var(--mc-border);border-radius:var(--radius-component,10px);padding:calc(16px * var(--mc-space));background:var(--theme-card-bg,var(--bg-card))}
  .mc-section h2{font-size:calc(var(--font-size-base,14px) * 14 / 14);font-weight:600;margin:0}.mc-runtime{grid-column:1/-1}
  .mc-runtime-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.mc-runtime-heading p{font-size:12px}.mc-runtime-heading button{margin-inline-start:auto}.mc-runtime>p{font-size:12px}
  .mc-runtime .mc-field{display:grid;grid-template-columns:minmax(160px,1fr) minmax(200px,1fr);align-items:center;gap:4px 24px;margin:0}.mc-runtime .mc-field p{grid-column:1;font-size:12px}.mc-runtime .mc-field input{grid-column:2;grid-row:1/3}
  .mc-field{display:flex;flex-direction:column;gap:6px;margin:0}.mc-field strong{font-size:13px;font-weight:500}.mc-field input,.mc-field textarea{width:100%}.mc-field p{font-size:12px}
  .mc-section .mc-field:has(textarea){flex:1}.mc-field textarea{flex:1;min-height:260px}
  .mc-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mc-settings a{color:var(--accent-primary)}.mc-settings summary{cursor:pointer;color:var(--text-secondary)}.mc-settings pre{white-space:pre-wrap;overflow-wrap:anywhere}
  .mc-skills .mc-page-content{padding:0;overflow:hidden;gap:0}
  .mc-skills-layout{display:flex;flex:1;min-width:0;min-height:0}
  .mc-skills-sidebar{display:flex;flex-direction:column;width:280px;flex-shrink:0;min-height:0;border-inline-end:var(--mc-border);overflow:auto}
  .mc-skills-sidebar .mc-source-info{padding:12px;border-top:var(--mc-border);margin-top:auto}
  .mc-skills-sidebar .mc-message{padding:12px}
  .mc-skills .mc-items{display:flex;flex-direction:column;gap:2px;padding:8px}
  .mc-skill-group{margin:8px 4px 4px;font-size:12px;font-weight:500;color:var(--text-muted)}
  .mc-manager .mc-skill-select{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;text-align:start;padding:8px 12px;border-color:transparent;background:transparent;white-space:normal}
  .mc-manager .mc-skill-select[aria-pressed=true]{background:color-mix(in srgb,var(--accent-primary) 10%,transparent);color:var(--text-primary)}
  .mc-skill-select strong,.mc-skill-select small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mc-skill-select strong{font-size:13px;font-weight:500}.mc-skill-select small{font-size:11px;color:var(--text-muted,var(--text-secondary))}.mc-skill-select .mc-summary{overflow:hidden}
  .mc-skill-dot{width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--text-muted)}.mc-skill-dot.active{background:var(--success,var(--accent-primary))}
  .mc-skill-detail{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:auto;padding:calc(16px * var(--mc-space)) calc(20px * var(--mc-space));gap:12px}
  .mc-detail-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:12px;border-bottom:var(--mc-border)}.mc-detail-heading h2{margin:0;font-size:15px;font-weight:600;overflow-wrap:anywhere}
  .mc-file-heading{padding:8px 0;border-bottom:var(--mc-border);font:12px ui-monospace,monospace;color:var(--text-muted)}
  .mc-skill-content{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace}
  .mc-skills .mc-toolbar input{max-width:200px}.mc-manager .mc-back{display:none}
  @media(max-width:768px){.mc-page-header{padding:12px;gap:10px}.mc-page-content{padding:12px}.mc-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.mc-items,.mc-settings-grid{grid-template-columns:1fr}.mc-dialog{width:calc(100vw - 24px)}.mc-editor{padding:16px}.mc-manager .mc-toolbar input{max-width:none}.mc-runtime .mc-field{display:flex;align-items:stretch;gap:6px}.mc-skills-sidebar{width:100%;border:0}.mc-skill-detail{display:none;padding:12px}.mc-show-detail .mc-skills-sidebar{display:none}.mc-show-detail .mc-skill-detail{display:flex}.mc-manager .mc-back{display:inline-flex}.mc-skills .mc-toolbar{flex:1;justify-content:flex-end}.mc-skills .mc-toolbar input{width:100%;max-width:180px;flex-basis:120px}}
`

function element(tag, value, className) {
  const node = document.createElement(tag)
  if (value) node.textContent = value
  if (className) node.className = className
  return node
}

function button(label, click, className) {
  const control = element('button', label, className)
  control.type = 'button'
  control.onclick = click
  return control
}

function field(parent, label, help, area = false) {
  const wrapper = element('label', '', 'mc-field')
  const input = element(area ? 'textarea' : 'input')
  input.setAttribute('aria-label', label)
  input.spellcheck = false
  input.dataset.themeSurface = 'input'
  wrapper.append(element('strong', label), input, element('p', help))
  parent.append(wrapper)
  return input
}

function card(className) {
  const section = element('section', '', 'mc-section' + (className ? ' ' + className : ''))
  section.dataset.themeSurface = 'card'
  return section
}

function jsonObject(value, label) {
  let parsed
  try { parsed = JSON.parse(value) } catch { throw new Error(label) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(label)
  return parsed
}

export async function mount(root, ctx) {
  const locale = (ctx.locale || navigator.language).toLowerCase()
  const t = /^(zh-tw|zh-hk|zh-hant)/.test(locale) ? traditional : locale.startsWith('zh') ? simplified : english
  root.append(element('style', themeStyles))
  // The Studio theme supplies the accent but no foreground for text over it.
  const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const updateContrast = () => {
    canvas.fillStyle = getComputedStyle(root).getPropertyValue('--accent-primary').trim() || 'CanvasText'
    canvas.fillRect(0, 0, 1, 1)
    const [r, g, b] = Array.from(canvas.getImageData(0, 0, 1, 1).data.slice(0, 3), value => {
      const channel = value / 255
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
    })
    root.style.setProperty('--mc-on-accent', .2126 * r + .7152 * g + .0722 * b >= .179 ? '#000' : '#fff')
  }
  updateContrast()
  const appearance = new MutationObserver(updateContrast)
  appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
  ctx.lifecycle.add(() => appearance.disconnect())
  if (ctx.view === 'skills' || ctx.view === 'mcp') await mountResources(root, ctx, t)
  else await mountSettings(root, ctx, t)
}

async function mountSettings(root, ctx, t) {
  let disposed = false
  let busy = false
  ctx.lifecycle.add(() => { disposed = true })

  const container = element('section', '', 'mc-settings')
  const header = element('header', '', 'mc-page-header')
  const globalActions = element('div', '', 'mc-buttons')
  const status = element('p', t.loading, 'mc-message')
  status.setAttribute('role', 'status')
  const reload = button(t.reload, async () => {
    if (sections.some(({ input, current }) => current && input.value !== current.text) && !await ctx.ui.confirm(t.discard)) return
    await run(load)
  }, 'quiet')
  globalActions.append(reload)
  header.append(element('h1', t.title), globalActions)
  const body = element('div', '', 'mc-page-content')
  const runtime = card('mc-runtime')
  const runtimeHeader = element('div', '', 'mc-runtime-heading')
  const version = element('p', t.loading)
  const agentManagement = button(t.management, () => ctx.ui.navigate('/studio/agents'))
  runtimeHeader.append(element('h2', t.engine), version, agentManagement)
  const docs = element('a', t.docs)
  docs.href = 'https://docs.factory.com/droid-cli/settings'
  docs.target = '_blank'
  docs.rel = 'noopener noreferrer'
  runtime.append(runtimeHeader, element('p', t.install), element('p', t.scope), element('p', t.limitations), docs)
  const grid = element('div', '', 'mc-settings-grid')
  grid.append(runtime)
  body.append(status, grid)
  container.append(header, body)
  root.append(container)

  const sections = [
    { resource: 'settings', label: t.base, file: 'settings.json', help: t.configHelp },
    { resource: 'settings-local', label: t.local, file: 'settings.local.json', help: t.precedence },
  ].map(({ resource, label, file, help }) => {
    const section = card()
    section.append(element('h2', label))
    const input = field(section, file, help, true)
    const path = element('code', '', 'mc-source-path')
    const error = element('p', '', 'mc-message')
    error.setAttribute('role', 'alert')
    const entry = { key: { resource }, input, path, error }
    const save = button(t.save, () => run(async () => {
      const text = JSON.stringify(jsonObject(input.value, t.jsonObject))
      await ctx.rpc.call('save-native-config', { ...entry.key, revision: entry.current.revision, text })
      await read(entry)
      if (!disposed) ctx.ui.notify(t.saved, 'success')
    }, t.saved, error), 'primary')
    save.setAttribute('aria-label', t.save + ' ' + file)
    input.oninput = () => setBusy(busy)
    const actions = element('div', '', 'mc-actions')
    actions.append(save)
    section.append(path, error, actions)
    grid.append(section)
    entry.save = save
    return entry
  })
  // Save closures and reloads share the actual loaded document object.
  function setBusy(value) {
    busy = value
    container.setAttribute('aria-busy', String(value))
    reload.disabled = value
    for (const entry of sections) {
      entry.input.disabled = value || !entry.current
      entry.save.disabled = value || !entry.current || entry.input.value === entry.current.text
    }
  }

  async function read(entry) {
    const value = await ctx.rpc.call('read-native-config', entry.key)
    if (disposed) return
    entry.current = value
    entry.input.value = value.text
    entry.path.textContent = value.path
    entry.error.textContent = ''
  }

  async function load() {
    await Promise.all([
      ctx.rpc.call('native-engine-status', {}).then(value => {
        if (disposed) return
        const source = value.source === 'managed' ? t.managed : value.source === 'external' ? t.external : ''
        version.textContent = value.installed ? [t.installed + ' ' + value.version, source].filter(Boolean).join(' · ') : t.missing
      }, () => { if (!disposed) version.textContent = t.unavailable }),
      ...sections.map(entry => read(entry).catch(error => {
        if (disposed) return
        entry.current = null
        entry.error.textContent = error.message
      })),
    ])
  }

  async function run(action, success = '', errorTarget = status) {
    if (busy || disposed) return
    setBusy(true)
    status.textContent = ''
    errorTarget.textContent = ''
    try {
      await action()
      if (!disposed) status.textContent = success
    } catch (error) {
      if (!disposed) errorTarget.textContent = error.message
    } finally {
      if (!disposed) setBusy(false)
    }
  }

  await run(load)
}

function skillBody(markdown) {
  const header = /^(?:\uFEFF)?---\r?\n[\s\S]*?^---[ \t]*(?:\r?\n|$)/m.exec(markdown)
  return header?.index === 0 ? markdown.slice(header[0].length).replace(/^\r?\n/, '') : markdown
}

async function mountResources(root, ctx, t) {
  const skills = ctx.view === 'skills'
  const resource = skills ? 'skill' : 'mcp'
  const title = skills ? t.skillsTitle : t.mcpTitle
  let disposed = false
  let busy = false
  let inventory
  let selected = ''
  let detailRequest = 0
  let editing
  let baseline
  let viewing = false
  let focusAfterOperation

  const container = element('section', '', skills ? 'mc-manager mc-skills' : 'mc-manager')
  const header = element('header', '', 'mc-page-header')
  const toolbar = element('div', '', 'mc-toolbar')
  const search = element('input')
  search.type = 'search'
  search.placeholder = t.search
  search.setAttribute('aria-label', t.search)
  search.dataset.themeSurface = 'input'
  search.oninput = () => render()
  const add = button(skills ? t.addSkill : t.addMcp, () => operation(() => showEditor()), 'primary')
  const refresh = button(t.refresh, () => operation(load), 'quiet')
  toolbar.append(search)
  const headerActions = element('div', '', 'mc-buttons')
  headerActions.append(refresh)
  if (skills) {
    headerActions.append(add)
    header.append(element('h1', title), toolbar, headerActions)
  } else {
    toolbar.append(add)
    header.append(element('h1', title), headerActions)
  }
  const body = element('div', '', 'mc-page-content')
  const list = element('div', '', 'mc-items')
  const detail = element('div', '', 'mc-skill-detail')
  detail.setAttribute('aria-label', t.content)
  const message = element('p', t.loading, 'mc-message')
  message.setAttribute('role', 'status')
  const path = element('code', '', 'mc-source-path')
  path.setAttribute('aria-label', t.location)
  const sourceInfo = element('details', '', 'mc-source-info')
  sourceInfo.append(element('summary', t.scopes), element('p', t.scope), path, element('p', t.project))
  const stats = element('div', '', 'mc-stats')
  const counts = [t.total, t.active, t.disabled].map((label, index) => {
    const stat = element('div', '', index === 1 ? 'mc-stat active' : 'mc-stat')
    stat.dataset.themeSurface = 'card'
    const number = element('strong', '0')
    stat.append(element('span', label), number)
    stats.append(stat)
    return number
  })
  if (skills) {
    const layout = element('div', '', 'mc-skills-layout')
    const sidebar = element('aside', '', 'mc-skills-sidebar')
    sidebar.setAttribute('aria-label', t.skillList)
    sidebar.append(message, list, sourceInfo)
    layout.append(sidebar, detail)
    body.append(layout)
  } else {
    body.append(message, stats, toolbar, element('p', t.mcpLimits), sourceInfo, list)
  }

  const dialog = element('dialog', '', 'mc-dialog')
  const form = element('form', '', 'mc-editor')
  const heading = element('h2')
  const fields = element('fieldset')
  const name = field(fields, t.name, skills ? t.skillName : t.mcpName)
  name.required = true
  name.maxLength = skills ? 64 : 96
  // HTML patterns use Unicode sets, which require escaped literal hyphens.
  name.pattern = skills ? '[a-z0-9]+(?:\\-[a-z0-9]+)*' : '[A-Za-z0-9][A-Za-z0-9_.\\-]{0,95}'
  const description = skills ? field(fields, t.description, t.descriptionHelp) : null
  if (description) {
    description.required = true
    description.maxLength = 2000
  }
  const content = field(fields, skills ? t.content : t.mcpConfig, skills ? t.contentHelp : t.mcpHelp, true)
  content.required = true
  content.maxLength = 256000
  const enabled = element('input')
  enabled.type = 'checkbox'
  enabled.setAttribute('aria-label', t.enabledLabel)
  if (!skills) {
    const check = element('label', '', 'mc-check')
    check.append(enabled, element('span', t.enabledLabel))
    fields.append(check)
  }
  const warning = element('p', '', 'mc-message')
  warning.setAttribute('role', 'alert')
  const buttons = element('div', '', 'mc-buttons')
  const save = button(t.save, saveEditor, 'primary')
  const cancel = button(t.cancel, cancelEditor)
  buttons.append(cancel, save)
  dialog.setAttribute('aria-label', title)
  dialog.oncancel = event => {
    event.preventDefault()
    if (!busy) void cancelEditor()
  }
  form.onsubmit = event => {
    event.preventDefault()
    saveEditor()
  }
  form.onkeydown = event => {
    if (event.key === 'Enter' && !event.isComposing && event.target.tagName === 'INPUT' && event.target.type !== 'checkbox') {
      event.preventDefault()
      if (!viewing && !busy) saveEditor()
    }
  }
  form.append(heading, fields, warning, buttons)
  dialog.append(form)
  ctx.lifecycle.add(() => {
    disposed = true
    dialog.close()
  })
  container.append(header, body, dialog)
  root.append(container)

  function setBusy(value) {
    busy = value
    container.setAttribute('aria-busy', String(value))
    search.disabled = add.disabled = value || !inventory
    refresh.disabled = fields.disabled = save.disabled = cancel.disabled = value
    enabled.disabled = viewing
    for (const control of container.querySelectorAll('.mc-items button,.mc-skill-detail button')) {
      control.disabled = value || control.dataset.readOnly === 'true'
    }
  }

  async function operation(action, success = '') {
    if (busy || disposed) return
    setBusy(true)
    message.textContent = inventory ? '' : t.loading
    message.setAttribute('role', 'status')
    warning.textContent = ''
    try {
      await action()
      if (!disposed) message.textContent = success
    } catch (error) {
      if (disposed) return
      const target = dialog.open ? warning : message
      target.setAttribute('role', 'alert')
      target.textContent = error.message
    } finally {
      if (!disposed) {
        setBusy(false)
        focusAfterOperation?.focus()
        focusAfterOperation = undefined
      }
    }
  }

  async function load() {
    const value = await ctx.rpc.call('overview-native-config', { resource })
    if (disposed) return
    inventory = value
    path.textContent = value.path
    const values = [value.items.length, value.items.filter(item => item.state === 'enabled').length,
      value.items.filter(item => item.state === 'disabled').length]
    counts.forEach((count, index) => { count.textContent = String(values[index]) })
    render()
  }

  function renderedState(item) {
    return item.state === 'enabled' ? t.active : item.state === 'disabled' ? t.disabled : t.unavailable
  }

  function badges(item) {
    const status = element('div', '', 'mc-badges')
    if (item.transport) status.append(element('span', item.transport, 'mc-badge'))
    status.append(element('span', t.global, 'mc-badge'), element('span', renderedState(item),
      item.state === 'enabled' ? 'mc-badge active' : 'mc-badge'))
    return status
  }

  function resourceActions(item) {
    const actions = element('div', '', 'mc-buttons')
    const edit = button(t.edit, () => operation(() => showEditor(item)), 'quiet')
    const remove = button(t.remove, () => operation(async () => {
      if (!await ctx.ui.confirm((skills ? t.deleteSkill : t.deleteMcp) + ' (' + item.name + ')') || disposed) return
      await ctx.rpc.call('remove-native-config', { resource, name: item.name, revision: item.revision })
      await load()
      if (!disposed) ctx.ui.notify(t.removed, 'success')
    }), 'quiet danger')
    edit.setAttribute('aria-label', t.edit + ' ' + item.name)
    remove.setAttribute('aria-label', t.remove + ' ' + item.name)
    if (!skills) {
      const view = button(t.view, () => operation(() => showEditor(item, true)), 'quiet')
      view.setAttribute('aria-label', t.view + ' ' + item.name)
      if (item.readOnly) view.dataset.readOnly = 'true'
      actions.append(view)
    }
    actions.append(edit, remove)
    if (item.readOnly) edit.dataset.readOnly = remove.dataset.readOnly = 'true'
    const current = item.state === 'enabled'
    const toggle = button('', () => operation(async () => {
      if (skills) {
        await ctx.rpc.call('toggle-native-skill', { name: item.name, enabled: !current, revision: item.revision,
          ledgerRevision: inventory.ledgerRevision })
      } else {
        const saved = await currentDocument(item)
        const configuration = jsonObject(saved.text, t.jsonObject)
        configuration.disabled = current
        await ctx.rpc.call('save-native-config', { resource, name: item.name, revision: saved.revision, text: JSON.stringify(configuration) })
      }
      await load()
      if (!disposed) ctx.ui.notify(t.saved, 'success')
    }), 'mc-switch')
    toggle.setAttribute('role', 'switch')
    toggle.setAttribute('aria-checked', String(current))
    toggle.setAttribute('aria-label', (current ? t.disable : t.enable) + ' ' + item.name)
    if (!item.canToggle) {
      toggle.dataset.readOnly = 'true'
      toggle.title = skills ? t.skillBlocked : t.readOnly
    }
    for (const control of [...actions.children, toggle]) control.disabled = control.dataset.readOnly === 'true'
    return { actions, toggle }
  }

  async function currentDocument(item) {
    const value = await ctx.rpc.call('read-native-config', { resource, name: item.name })
    if (!value.exists || value.revision !== item.revision) throw new Error(t.stale)
    return value
  }

  function renderDetail(item) {
    const request = ++detailRequest
    detail.replaceChildren()
    if (!item) {
      detail.append(element('p', t.selectSkill, 'mc-empty'))
      return
    }
    const titleRow = element('div', '', 'mc-detail-heading')
    const back = button(t.skillList, () => {
      container.classList.remove('mc-show-detail')
      list.querySelector('[aria-pressed=true]')?.focus()
    }, 'mc-back quiet')
    const { actions, toggle } = resourceActions(item)
    const tools = element('div', '', 'mc-buttons')
    tools.append(actions, toggle)
    titleRow.append(back, element('h2', item.name), tools)
    detail.append(titleRow, badges(item), element('p', item.description), element('code', item.path, 'mc-source-path'))
    if (item.readOnly) {
      detail.append(element('p', t.readOnly))
      return
    }
    detail.append(element('p', item.canToggle ? t.skillToggle : t.skillBlocked))
    const preview = element('pre', t.loading, 'mc-skill-content')
    detail.append(element('div', 'SKILL.md', 'mc-file-heading'), preview)
    void currentDocument(item).then(saved => {
      if (!disposed && request === detailRequest) preview.textContent = skillBody(saved.text)
    }, error => {
      if (!disposed && request === detailRequest) preview.textContent = error.message
    })
  }

  function render() {
    list.replaceChildren()
    const items = inventory?.items ?? []
    const query = search.value.trim().toLocaleLowerCase()
    const visible = items.filter(item => [item.name, item.description, item.transport].some(value => value?.toLocaleLowerCase().includes(query)))
    if (!visible.length) {
      list.append(element('p', items.length ? t.noMatches : skills ? t.emptySkills : t.emptyMcp, 'mc-empty'))
      if (skills) {
        container.classList.remove('mc-show-detail')
        renderDetail(null)
      }
      return
    }
    if (skills) {
      const selectedItem = visible.find(item => item.name === selected) ?? visible[0]
      selected = selectedItem.name
      list.append(element('h2', t.global + ' · ' + visible.length, 'mc-skill-group'))
      for (const item of visible) {
        const summary = element('span', '', 'mc-summary')
        summary.append(element('strong', item.name), element('small', item.description))
        const select = button('', () => {
          selected = item.name
          container.classList.add('mc-show-detail')
          render()
          const focus = matchMedia('(max-width: 768px)').matches ? detail.querySelector('.mc-back') : list.querySelector('[aria-pressed=true]')
          focus?.focus()
        }, 'mc-skill-select')
        select.setAttribute('aria-label', item.name + ' · ' + t.global)
        select.setAttribute('aria-pressed', String(item.name === selected))
        select.title = renderedState(item)
        select.append(summary, element('span', '', item.state === 'enabled' ? 'mc-skill-dot active' : 'mc-skill-dot'))
        const row = element('article')
        row.append(select)
        list.append(row)
      }
      renderDetail(selectedItem)
      return
    }
    for (const item of visible) {
      const row = element('article', '', 'mc-row')
      row.dataset.themeSurface = 'card'
      const heading = element('div', '', 'mc-row-heading')
      heading.append(element('strong', item.name), badges(item))
      const summary = element('div', '', 'mc-summary')
      summary.append(heading, element('p', item.readOnly ? t.readOnly : item.description || t.masked))
      const { actions, toggle } = resourceActions(item)
      const footer = element('div', '', 'mc-row-footer')
      footer.append(actions, toggle)
      row.append(summary, footer)
      list.append(row)
    }
  }

  function values() {
    return JSON.stringify([name.value, description?.value, content.value, enabled.checked])
  }

  async function showEditor(item, readOnly = false) {
    const saved = item ? await currentDocument(item) : null
    if (disposed) return
    editing = item
    viewing = readOnly
    heading.textContent = (item ? readOnly ? t.view : t.edit : skills ? t.addSkill : t.addMcp) +
      ' · ' + (item?.name ?? t.global)
    name.value = item?.name ?? ''
    name.readOnly = Boolean(item)
    if (description) description.value = item?.description ?? ''
    if (skills) {
      content.value = skillBody(saved?.text ?? '')
    } else {
      const configuration = saved ? jsonObject(saved.text, t.jsonObject) : { type: 'stdio', command: '', args: [] }
      enabled.checked = configuration.disabled !== true
      delete configuration.disabled
      content.value = JSON.stringify(configuration, null, 2)
    }
    content.readOnly = readOnly
    save.hidden = readOnly
    cancel.textContent = readOnly ? t.close : t.cancel
    baseline = values()
    dialog.showModal()
    focusAfterOperation = item ? content : name
  }

  function closeEditor() {
    dialog.close()
    editing = null
    viewing = false
    if (busy) focusAfterOperation = add
    else add.focus()
  }

  async function cancelEditor() {
    if (busy || disposed) return
    try {
      if (!viewing && baseline !== values() && !await ctx.ui.confirm(t.discard)) return
      if (!disposed) closeEditor()
    } catch (error) {
      if (!disposed) warning.textContent = error.message
    }
  }

  function saveEditor() {
    if (busy || viewing || !form.reportValidity()) return
    void operation(async () => {
      const itemName = name.value.trim()
      const lookup = { resource, name: itemName }
      const saved = editing ? null : await ctx.rpc.call('read-native-config', lookup)
      if (saved?.exists) throw new Error(t.duplicate)
      const revision = editing?.revision ?? saved.revision
      if (skills) {
        await ctx.rpc.call('edit-native-skill', { name: itemName, revision, description: description.value, content: content.value })
        selected = itemName
      } else {
        const configuration = jsonObject(content.value, t.jsonObject)
        configuration.disabled = !enabled.checked
        await ctx.rpc.call('save-native-config', { ...lookup, revision, text: JSON.stringify(configuration) })
      }
      if (disposed) return
      closeEditor()
      await load()
      if (!disposed) ctx.ui.notify(t.saved, 'success')
    }, t.saved)
  }

  await operation(load)
}
