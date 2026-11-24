// 插件页：读写本插件在 plugins.json 里的选项。页面在 sandbox 里，
// 碰不到网络也碰不到 magpie 的接口，一切都经 bridge 转给窗口。
//
// 页面上有三件事：提示词本身、怎么处理原来的提示词、对哪些软件生效。
// 「生效范围」按 magpie 记下的调用方（agent）、上游（provider）和协议来挑，
// 不是按 magpie 里的 provider 配置挑——同一个 provider 可能同时服务好几个软件。
//
// 中英双语：页面文案集中在 STR 里，按 navigator.languages 选语言，右上角可手动切换。
const $ = (id) => document.getElementById(id);
let presets = Array.isArray(globalThis.PROMPT_PRESETS) ? globalThis.PROMPT_PRESETS : [];
let presetsReady = presets.length > 0;
let lastOptions = null;
let customDraft = "";
let currentPreset = "";

// ---- 语言 ------------------------------------------------------------------

const STR = {
  zh: {
    "doc.title": "提示词替换",
    boot: "页面脚本没有加载成功。刷新一次（Ctrl+R）通常即可恢复。",
    h1: "提示词替换",
    intro: "设置网关如何处理发往模型的系统提示词，并选择对哪些软件生效。",
    "notice.title": "整体替换会影响 Agent 的行为",
    "notice.body": "原系统提示词中可能包含工具调用和工作方式的说明。可以先选「追加」验证链路，再决定是否整段替换。",
    "sec.content": "替换内容",
    "sec.content.p": "填写要使用的系统提示词。",
    "label.preset": "选择人格",
    "preset.auto": "自定义提示词",
    "preset.hint": "选择后会填入下方，可继续编辑；点击「保存设置」后生效。",
    "label.prompt": "提示词",
    "prompt.ph": "在这里输入要使用的提示词…",
    "prompt.ph.strip": "删除模式不需要提示词。",
    "prompt.hint": "「删除」模式不需要填写；其余模式留空则本条不生效。",
    "label.mode": "处理方式",
    "mode.replace": "替换：整段换成上面的提示词",
    "mode.append": "追加：接在原系统提示词后面",
    "mode.prepend": "前置：放在原系统提示词前面",
    "mode.strip": "删除：清空原系统提示词",
    "mode.hint": "拿不准先用「追加」：原提示词还在，只多一段你的，能立刻看出有没有生效。",
    "tag.replace": "替换",
    "tag.append": "追加",
    "tag.prepend": "前置",
    "tag.strip": "删除",
    "sec.scope": "生效范围",
    "sec.scope.p": "magpie 对每个请求都记了调用方和上游，这里按它们挑。",
    "label.scope": "换哪些软件",
    "scope.all": "所有接入 magpie 的软件",
    "scope.selected": "只有下面列出的软件",
    "scopeTag.all": "全部软件",
    "scopeTag.selected": "部分软件",
    "label.targets": "目标",
    "optional.perLine": "每行一条",
    "targets.hint": "不写前缀就是调用方。<code>agent:</code> 调用方、<code>provider:</code> 上游、<code>protocol:</code> 协议、<code>app:</code> 应用、<code>model:</code> 模型；<code>*</code> 通配，行首 <code>!</code> 排除；只写排除项表示「除了这些，其余都换」。",
    "label.debug": "把新出现的调用方写进 <code>logs/app.log</code>",
    "debug.hint": "不知道某个软件叫什么，就打开它发一次消息，再看日志里的 <code>[prompt-override] caller</code>。",
    "adv.summary": "单独设置某些软件",
    "adv.summary.small": "可选：给某个客户端配另一套提示词或另一种处理方式",
    "label.rules": "规则",
    "optional.json": "JSON 数组",
    "rules.hint": "命中第一条就用它，优先于上面的整体设置；每条可写 <code>match</code>（选择器数组）、<code>mode</code>、<code>prompt</code>、<code>replace_reminders</code>。留空表示不单独设置。",
    "rules.sample": "插入示例",
    "enable.strong": "启用提示词处理",
    "enable.small": "开启后对支持的网关请求生效",
    "btn.reload": "重新读取",
    "btn.save": "保存设置",
    "current.title": "当前已保存的设置",
    "group.other": "其他",
    "status.reading": "读取中…",
    "status.saving": "保存中…",
    "status.savedAll": "已保存，对所有软件生效。",
    "status.savedN": "已保存，只对 {n} 个目标生效。",
    "status.readFail": "读取失败：",
    "status.saveFail": "保存失败：",
    "err.promptRequired": "请先填写提示词，再启用替换。",
    "err.targetsRequired": "范围选了「只有下面列出的软件」，但目标框是空的。",
    "err.rulesPrefix": "规则没保存：",
    "rules.whyArray": "规则必须是 JSON 数组",
    "rules.whyObject": "每条规则必须是对象",
    "rules.whyMatch": "每条规则都要有 match",
    "rules.whyMode": "mode 只能是 replace/append/prepend/strip/skip",
    "rules.whyPrompt": "prompt 必须是字符串",
    "rules.badJson": "JSON 写错了：",
    "rules.sampleHint": "已填入示例，按需改选择器。",
    "preset.fail": "人格列表没有加载成功，可以继续手动填写提示词。",
    "timeout": "窗口 {s} 秒没有回应{what}。多半是 magpie 版本比插件旧，或者页面是缓存的旧版：强制刷新一次（Ctrl+Shift+R），还不行就重启 magpie。",
    "what.get": "读取选项",
    "what.set": "保存",
    "what.reread": "读回保存结果",
    "what.ready": "完成握手",
    "friendly.rate": "刚保存过一次，magpie 限制每秒只能写一次，等一秒再点。",
    "friendly.noPage": "magpie 不认识这个插件的页面定义，去插件列表里关掉再打开一次。",
    "bridge.reloading": "正在重新加载页面桥接…",
    "bridge.fail": "页面桥接没有加载成功，请刷新页面（Ctrl+Shift+R）再试。",
    "bridge.noAnswer": "窗口没有应答：",
    "current.len": "…（共 {n} 字）",
    "lang.switch": "EN",
    "lang.title": "切换语言 / Switch language",
  },
  en: {
    "doc.title": "Prompt override",
    boot: "The page script did not load. Reloading once (Ctrl+R) usually fixes it.",
    h1: "Prompt override",
    intro: "Choose how the gateway handles the system prompt sent to the model, and which apps it applies to.",
    "notice.title": "Replacing the whole prompt changes agent behaviour",
    "notice.body": "The original system prompt may describe tool use and working style. Try Append first to confirm the plumbing, then decide whether to replace it wholesale.",
    "sec.content": "Content",
    "sec.content.p": "The system prompt to apply.",
    "label.preset": "Persona",
    "preset.auto": "Custom prompt",
    "preset.hint": "Picking one fills the box below; edit freely. Click Save to apply.",
    "label.prompt": "Prompt",
    "prompt.ph": "Type the prompt to apply…",
    "prompt.ph.strip": "Strip mode needs no prompt.",
    "prompt.hint": "Strip mode needs no text; other modes are skipped when this is empty.",
    "label.mode": "Mode",
    "mode.replace": "Replace: swap the whole prompt for the text above",
    "mode.append": "Append: add the text after the original prompt",
    "mode.prepend": "Prepend: put the text before the original prompt",
    "mode.strip": "Strip: remove the original prompt",
    "mode.hint": "Unsure? Start with Append — the original stays, yours is added, so you can tell at once whether it works.",
    "tag.replace": "Replace",
    "tag.append": "Append",
    "tag.prepend": "Prepend",
    "tag.strip": "Strip",
    "sec.scope": "Scope",
    "sec.scope.p": "Magpie records the caller and upstream of every request; pick by those.",
    "label.scope": "Which apps",
    "scope.all": "Every app connected to magpie",
    "scope.selected": "Only the apps listed below",
    "scopeTag.all": "All apps",
    "scopeTag.selected": "Selected apps",
    "label.targets": "Targets",
    "optional.perLine": "one per line",
    "targets.hint": "No prefix means caller. <code>agent:</code> caller, <code>provider:</code> upstream, <code>protocol:</code> protocol, <code>app:</code> app, <code>model:</code> model; <code>*</code> wildcards, leading <code>!</code> excludes; exclusion-only means “everything except these”.",
    "label.debug": "Log newly seen callers to <code>logs/app.log</code>",
    "debug.hint": "Not sure what an app is called? Open it, send one message, then read the <code>[prompt-override] caller</code> line in the log.",
    "adv.summary": "Per-app rules",
    "adv.summary.small": "Optional: give one client its own prompt or mode",
    "label.rules": "Rules",
    "optional.json": "JSON array",
    "rules.hint": "The first match wins and beats the settings above. Each rule takes <code>match</code> (selector array), <code>mode</code>, <code>prompt</code>, <code>replace_reminders</code>. Empty means no per-app rules.",
    "rules.sample": "Insert example",
    "enable.strong": "Enable prompt processing",
    "enable.small": "Applies to supported gateway requests once on",
    "btn.reload": "Reload",
    "btn.save": "Save",
    "current.title": "Currently saved options",
    "group.other": "Other",
    "status.reading": "Loading…",
    "status.saving": "Saving…",
    "status.savedAll": "Saved. Applies to every app.",
    "status.savedN": "Saved. Applies to {n} target(s).",
    "status.readFail": "Load failed: ",
    "status.saveFail": "Save failed: ",
    "err.promptRequired": "Enter a prompt before enabling the override.",
    "err.targetsRequired": "Scope is set to “only the apps listed below”, but the target box is empty.",
    "err.rulesPrefix": "Rules not saved: ",
    "rules.whyArray": "rules must be a JSON array",
    "rules.whyObject": "each rule must be an object",
    "rules.whyMatch": "each rule needs a match",
    "rules.whyMode": "mode must be replace/append/prepend/strip/skip",
    "rules.whyPrompt": "prompt must be a string",
    "rules.badJson": "Invalid JSON: ",
    "rules.sampleHint": "Example inserted — adjust the selectors as needed.",
    "preset.fail": "The persona list did not load; you can still type a prompt by hand.",
    "timeout": "The window did not answer for {s}s{what}. Usually magpie is older than this plugin, or the page is cached: hard-reload (Ctrl+Shift+R), then restart magpie if that fails.",
    "what.get": " while loading options",
    "what.set": " while saving",
    "what.reread": " while reading back the save",
    "what.ready": " during the handshake",
    "friendly.rate": "You just saved; magpie allows one write per second. Wait a second and try again.",
    "friendly.noPage": "Magpie does not recognise this plugin's page definition. Toggle the plugin off and on again in the plugin list.",
    "bridge.reloading": "Reloading the page bridge…",
    "bridge.fail": "The page bridge did not load. Reload the page (Ctrl+Shift+R) and try again.",
    "bridge.noAnswer": "The window did not answer: ",
    "current.len": "…({n} chars total)",
    "lang.switch": "中文",
    "lang.title": "切换语言 / Switch language",
  },
};

// 与 magpie 自己页面同一套判定：zh / zh-TW / 其他一律 en。
function detectLang() {
  if (typeof globalThis.__magpieLang === "string" && STR[globalThis.__magpieLang]) {
    return globalThis.__magpieLang;
  }
  let list = [];
  try {
    const nav = globalThis.navigator;
    if (nav) list = nav.languages && nav.languages.length ? nav.languages : [nav.language || "en"];
  } catch (e) { /* sandbox 里可能没有 navigator */ }
  for (const l of list) {
    const s = String(l).toLowerCase();
    if (s.startsWith("zh")) return /hant|tw|hk|mo/.test(s) ? "zh-TW" : "zh";
    if (s.startsWith("en")) return "en";
  }
  return list.length ? "en" : "zh";
}

let LANG = detectLang();
if (LANG === "zh-TW") LANG = "zh";

function t(key, vars) {
  let s = (STR[LANG] && STR[LANG][key]) || (STR.zh && STR.zh[key]) || key;
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}

// 把 data-t / data-t-ph / data-t-html 的节点按当前语言重写一遍
function applyI18n() {
  try {
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.lang = LANG === "en" ? "en" : "zh-CN";
    }
    if (typeof document !== "undefined" && "title" in document) document.title = t("doc.title");
    const each = (sel, fn) => {
      if (typeof document.querySelectorAll !== "function") return;
      const list = document.querySelectorAll(sel);
      if (list && typeof list.forEach === "function") list.forEach(fn);
    };
    each("[data-t]", (el) => { el.textContent = t(el.getAttribute("data-t")); });
    each("[data-t-html]", (el) => { el.innerHTML = t(el.getAttribute("data-t-html")); });
    each("[data-t-ph]", (el) => { el.placeholder = t(el.getAttribute("data-t-ph")); });
    // <option> 的文案：data-t 已经在上面处理，这里只补 select 自身的选项
    const mode = $("mode");
    if (mode && typeof mode.querySelectorAll === "function") {
      mode.querySelectorAll("option").forEach((opt) => {
        const k = opt.getAttribute && opt.getAttribute("data-t");
        if (k) opt.textContent = t(k);
      });
    }
    const btn = $("lang");
    if (btn) {
      btn.textContent = t("lang.switch");
      btn.title = t("lang.title");
    }
  } catch (e) { /* 桩环境里没有这些节点，忽略 */ }
}

function setLang(next) {
  LANG = next === "en" ? "en" : "zh";
  try { globalThis.localStorage.setItem("prompt-override-lang", LANG); } catch (e) { /* sandbox 可能不给 */ }
  applyI18n();
  syncMode();
  syncScope();
  drawChips();
  if (lastOptions) showCurrent(lastOptions);
}

try {
  const saved = globalThis.localStorage && globalThis.localStorage.getItem("prompt-override-lang");
  if (saved === "en" || saved === "zh") LANG = saved;
} catch (e) { /* 忽略 */ }

// 常见调用方。magpie 记的是 agent（也可能是客户端产品名），大小写不定，
// 匹配不分大小写。点一下就写进目标框，不用去翻日志。
const KNOWN = [
  ["agent:claude-desktop", "Claude Desktop"],
  ["agent:claude-code", "Claude Code"],
  ["agent:codex", "Codex"],
  ["agent:workbuddy", "WorkBuddy"],
  ["agent:trae-cn", "Trae CN"],
  ["agent:zcode", "ZCode"],
  ["agent:zed", "Zed"],
  ["agent:codearts", "CodeArts"],
  ["agent:qwenwork", "QwenWork"],
  ["agent:catpaw", "CatPaw"],
  ["agent:dumate", "DuMate"],
  ["agent:notion", "Notion"],
  ["agent:doubao-work", "豆包办公"],
  ["agent:node", "node"],
  ["agent:curl", "curl"],
  ["agent:python-urllib", "python"],
];

const MODES = ["replace", "append", "prepend", "strip"];

function setupPresets() {
  const groups = new Map();
  for (const preset of presets) {
    if (!preset || typeof preset.id !== "string" || typeof preset.text !== "string") continue;
    const groupName = typeof preset.group === "string" ? preset.group : t("group.other");
    if (!groups.has(groupName)) {
      const group = document.createElement("optgroup");
      group.label = groupName;
      $("preset").appendChild(group);
      groups.set(groupName, group);
    }
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    groups.get(groupName).appendChild(option);
  }
}

// 人格库有 660 KB，不能挡在“向窗口报到”前面：报到晚了，Magpie 会判定
// 页面首次绘制没有回应，直接显示“此页面已停止工作”。所以先报到，
// 人格库之后再异步加载，失败就重试两次，仍不行就让用户手动填写。
function loadPresets(attempt = 0) {
  addScript("presets.js" + (attempt ? "?retry=" + attempt : "")).then((ok) => {
    if (ok && Array.isArray(globalThis.PROMPT_PRESETS) && globalThis.PROMPT_PRESETS.length) {
      applyPresets(globalThis.PROMPT_PRESETS);
      return;
    }
    if (attempt < 2) { loadPresets(attempt + 1); return; }
    presetHint(t("preset.fail"));
  });
}

function presetHint(text) {
  const el = $("preset-hint");
  if (el) el.textContent = text;
}

function applyPresets(list) {
  if (presetsReady || !Array.isArray(list) || !list.length) return;
  presets = list;
  presetsReady = true;
  setupPresets();
  presetHint(t("preset.hint"));
  if (lastOptions) selectPresetFor(lastOptions);
}

function selectPresetFor(o) {
  const match = presets.find(p => p.id === o.preset_id) || presets.find(p => p.text === $("prompt").value);
  currentPreset = match ? match.id : "";
  $("preset").value = currentPreset;
  customDraft = currentPreset ? "" : $("prompt").value;
}

function choosePreset() {
  if (!currentPreset) customDraft = $("prompt").value;
  const selected = presets.find(p => p.id === $("preset").value);
  currentPreset = selected ? selected.id : "";
  $("prompt").value = selected ? selected.text : customDraft;
}

// 桥接的调用是发消息给父窗口，等它回。如果父窗口是旧版 magpie（不认识
// options.set 这条消息），Promise 永远不返回，按钮就一直卡在"保存中"，
// 看起来像点不动。所以每个调用都要有超时，宁可报错也不无限等。
const CALL_TIMEOUT_MS = Number(globalThis.__magpieCallTimeoutMs) || 8000;

function withTimeout(promise, whatKey) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(t("timeout", { s: CALL_TIMEOUT_MS / 1000, what: t(whatKey) })));
    }, CALL_TIMEOUT_MS);
    promise.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// 把服务端的原始错误翻成人话，翻不动的原样返回
function friendly(err) {
  const m = String((err && err.message) || err || "");
  if (/once a second|429/i.test(m)) return t("friendly.rate");
  if (/no plugin page/i.test(m)) return t("friendly.noPage");
  return m;
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text || "";
  el.dataset.kind = kind || "";
}

// ---- 生效范围 --------------------------------------------------------------

function targetsOf(o) {
  const t2 = o.targets;
  if (Array.isArray(t2)) return t2.filter(x => typeof x === "string" && x.trim()).join("\n");
  if (typeof t2 === "string") return t2;
  return "";
}

function linesOf(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

function drawChips() {
  const box = $("chips");
  if (!box) return;
  const on = new Set(linesOf($("targets").value).map(s => s.toLowerCase()));
  box.textContent = "";
  for (const [sel, name] of KNOWN) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.title = sel;
    if (on.has(sel.toLowerCase())) b.dataset.on = "1";
    b.addEventListener("click", () => toggleTarget(sel));
    box.appendChild(b);
  }
}

// 点标签：已有就删掉那一行，没有就加上。顺手把范围切到「只有下面列出的」，
// 否则加了目标也不会生效，看着像没反应。
function toggleTarget(sel) {
  const box = $("targets");
  const list = linesOf(box.value);
  const i = list.findIndex(s => s.toLowerCase() === sel.toLowerCase());
  if (i >= 0) list.splice(i, 1);
  else list.push(sel);
  box.value = list.join("\n");
  if (list.length) $("scope").value = "selected";
  syncScope();
  drawChips();
}

function syncScope() {
  const selected = $("scope").value === "selected";
  $("scope-tag").textContent = selected ? t("scopeTag.selected") : t("scopeTag.all");
  $("targets").disabled = !selected;
  $("targets").style.opacity = selected ? "" : ".55";
  drawChips();
}

function syncMode() {
  const m = MODES.includes($("mode").value) ? $("mode").value : "replace";
  $("mode-tag").textContent = t("tag." + m);
  const needPrompt = m !== "strip";
  $("prompt").placeholder = needPrompt ? t("prompt.ph") : t("prompt.ph.strip");
}

function parseRules() {
  const raw = $("rules").value.trim();
  if (!raw) return { ok: true, value: [] };
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return { ok: false, why: t("rules.whyArray") };
    for (const r of v) {
      if (!r || typeof r !== "object") return { ok: false, why: t("rules.whyObject") };
      const m = r.match;
      const list = Array.isArray(m) ? m : typeof m === "string" ? [m] : null;
      if (!list || !list.length) return { ok: false, why: t("rules.whyMatch") };
      if (r.mode && !MODES.includes(r.mode) && r.mode !== "skip") return { ok: false, why: t("rules.whyMode") };
      if (r.prompt !== undefined && typeof r.prompt !== "string") return { ok: false, why: t("rules.whyPrompt") };
    }
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, why: t("rules.badJson") + (e && e.message ? e.message : e) };
  }
}

const SAMPLE = [
  { match: ["agent:codex"], mode: "append", prompt: "回答一律用中文。" },
  { match: ["provider:trae-cn"], mode: "replace", prompt: "你是 Trae 里的编程助手。" },
];

function fill(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  lastOptions = o;
  $("prompt").value = typeof o.system_prompt === "string" ? o.system_prompt : "";
  $("mode").value = MODES.includes(o.mode) ? o.mode : "replace";
  $("scope").value = o.scope === "selected" ? "selected" : "all";
  $("targets").value = targetsOf(o);
  $("debug").checked = o.debug === true;
  const rules = Array.isArray(o.rules) ? o.rules : [];
  $("rules").value = rules.length ? JSON.stringify(rules, null, 2) : "";
  $("rules-hint").textContent = "";
  selectPresetFor(o);
  $("enabled").checked = o.enabled === true;
  syncMode();
  syncScope();
  showCurrent(o);
}

function showCurrent(o) {
  const box = $("current");
  const body = $("current-body");
  if (!o || !Object.keys(o).length) {
    box.hidden = true;
    body.textContent = "";
    return;
  }
  // 提示词可能很长，摘要里只给前 60 个字
  const view = {
    enabled: o.enabled === true,
    mode: o.mode,
    scope: o.scope,
    targets: o.targets,
    rules: Array.isArray(o.rules) ? o.rules.length : o.rules,
    debug: o.debug === true,
    system_prompt: o.system_prompt,
  };
  if (typeof view.system_prompt === "string") {
    const s = view.system_prompt;
    view.system_prompt = s.length > 60 ? s.slice(0, 60) + t("current.len", { n: s.length }) : s;
  }
  box.hidden = false;
  body.textContent = JSON.stringify(view, null, 2);
}

async function load(quiet) {
  if (!quiet) setStatus(t("status.reading"));
  try {
    const opts = await withTimeout(magpie.options.get(), "what.get");
    fill(opts);
    if (!quiet) setStatus("");
  } catch (err) {
    setStatus(t("status.readFail") + friendly(err), "error");
  }
}

async function save(ev) {
  if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
  const btn = $("save");
  btn.disabled = true;
  setStatus(t("status.saving"));
  try {
    const mode = MODES.includes($("mode").value) ? $("mode").value : "replace";
    const scope = $("scope").value === "selected" ? "selected" : "all";
    const targets = linesOf($("targets").value);
    const prompt = $("prompt").value;
    if ($("enabled").checked && mode !== "strip" && !prompt.trim()) {
      throw new Error(t("err.promptRequired"));
    }
    if ($("enabled").checked && scope === "selected" && !targets.length) {
      throw new Error(t("err.targetsRequired"));
    }
    const rules = parseRules();
    if (!rules.ok) throw new Error(t("err.rulesPrefix") + rules.why);

    // 这里必须把每个字段都列出来：桥接是把整个对象写回 plugins.json，
    // 没写的字段就是没有，不是"保持原样"。
    const next = {
      enabled: $("enabled").checked,
      system_prompt: prompt,
      mode: mode,
      preset_id: currentPreset,
      scope: scope,
      targets: targets,
      rules: rules.value,
      debug: $("debug").checked,
      replace_reminders: true,
    };
    // 不依赖 set 的返回值：桥接只保证写入成功，返回什么由窗口决定。
    // 写完再读一次，看到的才是 plugins.json 里真正存下的东西。
    await withTimeout(magpie.options.set(next), "what.set");
    const saved = await withTimeout(magpie.options.get(), "what.reread");
    fill(saved && typeof saved === "object" ? saved : next);
    setStatus(scope === "selected" ? t("status.savedN", { n: targets.length }) : t("status.savedAll"), "ok");
  } catch (err) {
    setStatus(t("status.saveFail") + friendly(err), "error");
  } finally {
    btn.disabled = false;
  }
}

// 不走表单提交：插件页面在 sandbox 里，CSP 写着 form-action 'none'，
// 提交型按钮在沙箱里会被直接拦掉，submit 事件根本不触发，点了就是没反应。
// 所以按钮是 type="button"，走 click。
applyI18n();
if (presetsReady) setupPresets();
$("preset").addEventListener("change", choosePreset);
$("save").addEventListener("click", save);
$("reload").addEventListener("click", () => load(false));
$("mode").addEventListener("change", syncMode);
$("scope").addEventListener("change", syncScope);
$("targets").addEventListener("input", drawChips);
$("lang")?.addEventListener?.("click", () => setLang(LANG === "en" ? "zh" : "en"));
$("rules-sample").addEventListener("click", () => {
  $("rules").value = JSON.stringify(SAMPLE, null, 2);
  $("rules-hint").textContent = t("rules.sampleHint");
  $("advanced").open = true;
});
$("rules").addEventListener("input", () => { $("rules-hint").textContent = ""; });

// 页面已经能跑起来，撤掉「脚本没加载」的兜底提示
$("boot-hint")?.remove?.();

// 桥接脚本与页面文件走同一个令牌分发：新装或窗口刷新插件列表时，这一次
// 请求可能短暂 404，页面就永远收不到 magpie 对象。这里重试几次，
// 通常几百毫秒内就能补上，用户不必刷新。
const BRIDGE_RETRIES = Number(globalThis.__magpieBridgeRetries ?? 12);
const BRIDGE_DELAY_MS = Number(globalThis.__magpieBridgeDelayMs ?? 300);

const SCRIPT_TIMEOUT_MS = Number(globalThis.__magpieScriptTimeoutMs ?? 1500);

// 请求既没成功也没失败时也要收尾，否则会一直挂着等
function addScript(src) {
  return new Promise((resolve) => {
    if (!document.createElement || !document.head) return resolve(false);
    const s = document.createElement("script");
    const done = (ok) => { clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => done(false), SCRIPT_TIMEOUT_MS);
    s.src = src;
    s.onload = () => done(true);
    s.onerror = () => done(false);
    document.head.appendChild(s);
  });
}

async function ensureBridge(attempt = 0) {
  if (globalThis.magpie) return true;
  if (attempt >= BRIDGE_RETRIES) return false;
  if (attempt > 0) await new Promise((r) => setTimeout(r, BRIDGE_DELAY_MS));
  if (globalThis.magpie) return true;
  await addScript("_magpie/bridge.js?retry=" + attempt);
  return ensureBridge(attempt + 1);
}

function stopControls() {
  if (typeof document.querySelectorAll === "function") {
    document.querySelectorAll("#save, #reload").forEach((b) => { b.disabled = true; });
  }
}

if (globalThis.magpie) {
  start();
} else {
  setStatus(t("bridge.reloading"));
  ensureBridge().then((ok) => {
    if (ok && globalThis.magpie) { setStatus(""); start(); return; }
    setStatus(t("bridge.fail"), "error");
    stopControls();
  });
}

function start() {
  withTimeout(magpie.ready, "what.ready").then(
    () => {
      load(true);
      if (!presetsReady) loadPresets();
    },
    (err) => setStatus(t("bridge.noAnswer") + friendly(err), "error"),
  );
}
