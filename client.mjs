const english = {
  scope: 'Global uses these personal files. Scoped uses a temporary home and reads project configuration separately.',
  skills: 'Edit SKILL.md frontmatter and Markdown. Removal keeps supporting files. Use disabledSkills in Settings to turn a personal skill off.',
  mcp: 'Edit one server as JSON. Use null to keep hidden endpoints, arguments or credentials. Use disabled to control whether Droid loads it.',
  settings: 'Edit the supported preferences. Other keys stay in the native file. Local overrides and workspace settings can take precedence.',
  choose: 'Select an entry', entry: 'Existing entry', name: 'New name', add: 'Create', file: 'Settings file', body: 'Configuration source',
  reload: 'Reload', save: 'Save', remove: 'Remove', saved: 'Saved to Droid configuration.', removed: 'Removed from Droid configuration.',
  discard: 'Discard unsaved changes?', confirmRemove: name => `Remove ${name} from the personal configuration?`,
}

const simplified = {
  scope: 'Global 使用这些个人配置文件。Scoped 使用临时主目录，项目配置由 Droid 另行读取。',
  skills: '编辑 SKILL.md 的文件头和正文。移除入口时保留附属文件。可在设置中用 disabledSkills 停用个人技能。',
  mcp: '以 JSON 编辑单个服务器。null 保留隐藏的端点、参数或凭据。用 disabled 控制 Droid 是否加载。',
  settings: '编辑受支持的偏好。其余键保留在原生文件中。本地覆盖和工作区设置可能有更高优先级。',
  choose: '选择条目', entry: '已有条目', name: '新名称', add: '新建', file: '设置文件', body: '配置内容',
  reload: '重新加载', save: '保存', remove: '移除', saved: '已保存到 Droid 配置。', removed: '已从 Droid 配置中移除。',
  discard: '放弃未保存的更改？', confirmRemove: name => `从个人配置中移除 ${name}？`,
}

const traditional = {
  scope: 'Global 使用這些個人設定檔。Scoped 使用暫存主目錄，專案設定由 Droid 另行讀取。',
  skills: '編輯 SKILL.md 的檔頭及正文。移除入口時保留附屬檔案。可在設定中用 disabledSkills 停用個人技能。',
  mcp: '以 JSON 編輯單一伺服器。null 保留隱藏的端點、參數或憑證。用 disabled 控制 Droid 是否載入。',
  settings: '編輯支援的偏好。其餘欄位保留在原生檔案中。本機覆寫和工作區設定可能有更高優先順序。',
  choose: '選擇項目', entry: '現有項目', name: '新名稱', add: '新增', file: '設定檔', body: '設定內容',
  reload: '重新載入', save: '儲存', remove: '移除', saved: '已儲存至 Droid 設定。', removed: '已從 Droid 設定中移除。',
  discard: '放棄尚未儲存的變更？', confirmRemove: name => `從個人設定中移除 ${name}？`,
}

const stylesheet = `
.droid-config {
  display: grid;
  gap: 16px;
  padding: 20px;
  max-width: 940px;
  color: var(--text-color, #202124);
  font-family: var(--font-family, system-ui);
  font-size: var(--font-size-base, 14px);
}
.droid-config, .droid-config * { box-sizing: border-box; }
.droid-config p { margin: 0; line-height: 1.55; }
.droid-config form {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: var(--border-width, 1px) solid var(--theme-card-border, #c8cbd1);
  border-radius: var(--theme-card-radius, var(--radius-component, 8px));
  background: var(--theme-card-bg, transparent);
}
.droid-config .config-row {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
}
.droid-config label { display: grid; gap: 5px; }
.droid-config .config-row label { flex: 1 1 160px; }
.droid-config input, .droid-config select, .droid-config textarea, .droid-config button {
  font: inherit;
  color: inherit;
  min-height: var(--control-height, 34px);
  border: var(--border-width, 1px) solid var(--theme-input-border, #aeb2bb);
  border-radius: var(--theme-input-radius, var(--radius-component, 6px));
  background: var(--theme-input-bg, transparent);
  padding: 6px 10px;
}
.droid-config button:disabled { opacity: .5; }
.droid-config button:not(:disabled) { cursor: pointer; }
.droid-config textarea {
  width: 100%;
  min-height: 19rem;
  resize: vertical;
  font-family: ui-monospace, monospace;
  line-height: 1.5;
}
.droid-config code { overflow-wrap: anywhere; }
.droid-config .config-status { min-height: 1.5em; }
.droid-config .config-status[data-error] { color: var(--error-color, #ad2525); }
@media (max-width: 550px) {
  .droid-config, .droid-config form { padding: 12px; }
}
`

function element(tag, text) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

function labeled(text, input) {
  const label = element('label')
  label.append(element('span', text), input)
  return label
}

function button(text) {
  const control = element('button', text)
  control.type = 'button'
  return control
}

export function mount(target, ctx) {
  const t = ctx.locale === 'zh-TW' ? traditional : ctx.locale?.startsWith('zh') ? simplified : english
  const view = ctx.view
  const items = view === 'skills' || view === 'mcp'
  const collection = view === 'skills' ? 'skill' : 'mcp'
  const root = element('section')
  root.className = 'droid-config'
  const style = element('style', stylesheet)
  const scope = element('p', t.scope)
  const form = element('form')
  form.dataset.themeSurface = 'card'
  form.addEventListener('submit', event => event.preventDefault())
  const selection = element('select')
  const name = element('input')
  name.type = 'text'
  name.maxLength = view === 'skills' ? 64 : 96
  const add = button(t.add)
  const choose = element('div')
  choose.className = 'config-row'
  if (items) {
    choose.append(labeled(t.entry, selection), labeled(t.name, name), add)
  } else {
    selection.add(new Option('settings.json', 'settings'))
    selection.add(new Option('settings.local.json', 'settings-local'))
    choose.append(labeled(t.file, selection))
  }
  const path = element('code')
  const editor = element('textarea')
  editor.spellcheck = false
  const actions = element('div')
  actions.className = 'config-row'
  const reload = button(t.reload)
  const save = button(t.save)
  const remove = button(t.remove)
  actions.append(reload, save)
  if (items) actions.append(remove)
  const status = element('p')
  status.className = 'config-status'
  status.setAttribute('role', 'status')
  form.append(choose, path, labeled(t.body, editor), element('p', t[view]), actions, status)
  root.append(scope, form)
  target.replaceChildren(style, root)

  let current
  let busy = false
  const changed = () => current && current.document.text !== editor.value
  function setControls() {
    selection.disabled = name.disabled = busy
    reload.disabled = busy
    add.disabled = busy || !name.value.trim()
    editor.disabled = busy || !current
    save.disabled = busy || !current || (current.document.exists && !changed())
    remove.disabled = busy || !current?.document.exists
  }
  function showStatus(message, failed = false) {
    status.textContent = message
    status.toggleAttribute('data-error', failed)
  }
  async function operation(work) {
    if (busy || ctx.signal?.aborted) return
    busy = true
    showStatus('')
    setControls()
    try { await work() }
    catch (error) { showStatus(error?.message || String(error), true) }
    finally { busy = false; setControls() }
  }
  async function pick(input) {
    const document = await ctx.rpc.call('read-native-config', input)
    if (ctx.signal?.aborted) return
    current = { input, document }
    path.textContent = document.path
    editor.value = document.text
  }
  async function list(preferred = '') {
    const { names } = await ctx.rpc.call('list-native-config', { resource: collection })
    if (ctx.signal?.aborted) return
    selection.replaceChildren(new Option(t.choose, ''), ...names.map(value => new Option(value, value)))
    if (names.includes(preferred)) selection.value = preferred
  }
  function clear() {
    current = undefined
    path.textContent = ''
    editor.value = ''
  }
  async function mayDiscard() { return !changed() || await ctx.ui.confirm(t.discard) }
  function restoreSelection() {
    if (!current) return
    selection.value = items ? current.input.name : current.input.resource
  }
  selection.onchange = () => void operation(async () => {
    const value = selection.value
    try {
      if (!await mayDiscard()) { restoreSelection(); return }
      if (items && !value) clear()
      else await pick(items ? { resource: collection, name: value } : { resource: value })
    } catch (error) { restoreSelection(); throw error }
  })
  name.oninput = editor.oninput = setControls
  add.onclick = () => void operation(async () => {
    if (!await mayDiscard()) return
    const input = { resource: collection, name: name.value.trim() }
    await pick(input)
    selection.value = input.name
    name.value = ''
  })
  reload.onclick = () => void operation(async () => {
    if (!await mayDiscard()) return
    if (items) await list(current?.input.name)
    if (current) await pick(current.input)
    else if (!items) await pick({ resource: selection.value })
  })
  save.onclick = () => void operation(async () => {
    if (!current) return
    const { input, document } = current
    await ctx.rpc.call('save-native-config', { ...input, revision: document.revision, text: editor.value })
    await pick(input)
    if (items) await list(input.name)
    showStatus(t.saved)
  })
  remove.onclick = () => void operation(async () => {
    if (!current?.document.exists) return
    const { input, document } = current
    if (!await ctx.ui.confirm(t.confirmRemove(input.name))) return
    await ctx.rpc.call('remove-native-config', { ...input, revision: document.revision })
    clear()
    await list()
    showStatus(t.removed)
  })

  void operation(() => items ? list() : pick({ resource: selection.value }))
  return () => target.replaceChildren()
}
