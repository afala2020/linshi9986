// 网关提示词替换：把经过本网关的请求，发给上游的 system prompt 换成你的那一套。
//
// 0.9.0 起可以选“换谁”：默认仍然对全部客户端生效（和 0.8.x 一样），
// 也可以只对列出的调用方生效，或给某个客户端单独配一套提示词。
//
// 选项：
//   enabled          总开关
//   scope            "all"（默认，谁都换）| "selected"（只换 targets 命中的）
//   targets          选择器列表，见下
//   rules            按客户端单独设置，命中第一条就用它
//   system_prompt    整体使用的那段提示词
//   mode             replace（默认）| append | prepend | strip
//   replace_reminders  replace 模式下顺手删掉 user 消息里的行为类 <system-reminder> 块
//   debug            把每个新出现的调用方写进 app.log（magpie 把插件 stdout 转成 stderr 记录）
//
// 选择器写法（targets 里每一条）：
//   agent:claude-code      Magpie 记录的调用方（agent，也可能是客户端产品名）
//   provider:trae-cn       上游 provider id
//   protocol:anthropic     anthropic | chat | responses | gemini
//   app:xxx                应用标识
//   model:*sonnet*         请求里的模型名
//   workdir:D:\proj        工作目录（ctx 里有的话）
//   不带前缀的当成 agent。
//   * 和 ? 通配，不区分大小写；行首 ! 表示排除。
//   只有排除项时表示“除了这些，其余都换”。
//
// 四种协议各按自己的位置处理：Anthropic 的 system、Chat 的首条 system/developer
// 消息、Responses 的 instructions 与 input 里的指令项、Gemini 的 systemInstruction。
//
// 这是有破坏性的中间件：Claude Code、Codex 的系统提示词里写着工具怎么调、文件
// 怎么改，整段换掉之后它们的行为会跟着变。先用 append 确认链路通，再考虑 replace。

var MODES = ["replace", "append", "prepend", "strip"]
var KINDS = ["agent", "provider", "protocol", "app", "model", "workdir"]

export function onRequest(body, ctx) {
  if (!body || typeof body !== "object") return
  var o = ctx.options || {}
  if (o.enabled !== true) return

  var who = identify(ctx, body)
  if (o.debug === true) noteCaller(who)

  var hit = pick(who, o)
  if (!hit) return
  var mode = hit.mode
  var prompt = hit.prompt
  // strip 不需要提示词；其余模式没有提示词就什么都不做
  if (mode !== "strip" && !prompt) return

  var out
  switch (who.protocol || ctx.protocol) {
    case "anthropic":
      out = anthropic(body, prompt, mode)
      break
    case "chat":
      out = chat(body, prompt, mode)
      break
    case "responses":
      out = responses(body, prompt, mode)
      break
    case "gemini":
      out = gemini(body, prompt, mode)
      break
    default:
      return
  }
  if (!out) return out
  // 有的客户端（WorkBuddy 等）把身份与行为规则塞在第一条 user 消息的
  // <system-reminder> 块里，而不是 system 字段。换掉 system 字段不够，
  // 那套规则照样进模型，看着就像“替换没生效”。这里把它们一并换掉。
  if (mode === "replace" && hit.replaceReminders) {
    var touched = applyReminders(out)
    if (touched) out = touched
  }
  return out
}

// ---- 识别调用方 ------------------------------------------------------------

// field 读 ctx 上的一个字段；magpie 有时把上下文放在 ctx.context 里。
function field(ctx, name) {
  if (!ctx || typeof ctx !== "object") return ""
  var v = ctx[name]
  if (typeof v === "string" && v) return v
  var n = ctx.context
  if (n && typeof n === "object") {
    var w = n[name]
    if (typeof w === "string" && w) return w
  }
  return ""
}

function str(v) {
  return typeof v === "string" ? v.trim() : ""
}

function modelOf(body) {
  var m = body && body.model
  if (typeof m === "string") return m
  if (m && typeof m === "object") return str(m.id) || str(m.name) || str(m.model)
  return ""
}

// identify 收集用来匹配的身份字段。缺的字段留空，不影响其它字段匹配。
function identify(ctx, body) {
  return {
    agent: field(ctx, "agent") || field(ctx, "client") || field(ctx, "app"),
    provider: field(ctx, "provider"),
    protocol: field(ctx, "protocol"),
    app: field(ctx, "app"),
    model: modelOf(body),
    workdir:
      field(ctx, "workDir") ||
      field(ctx, "workdir") ||
      field(ctx, "directory") ||
      field(ctx, "cwd") ||
      field(ctx, "project"),
  }
}

// ---- 选择器 ----------------------------------------------------------------

function glob(pattern) {
  var s = String(pattern || "")
  var re = ""
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i)
    if (ch === "*") re += ".*"
    else if (ch === "?") re += "."
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  try {
    return new RegExp("^" + re + "$", "i")
  } catch (e) {
    return null
  }
}

// parseSelector 把 "agent:claude-code" 拆成 {kind, pattern}；没前缀就是 agent。
function parseSelector(raw) {
  var s = str(raw)
  if (!s) return null
  var negate = false
  if (s.charAt(0) === "!") {
    negate = true
    s = s.slice(1).trim()
    if (!s) return null
  }
  var kind = "agent"
  var pattern = s
  var i = s.indexOf(":")
  if (i > 0) {
    var head = s.slice(0, i).trim().toLowerCase()
    if (KINDS.indexOf(head) >= 0) {
      kind = head
      pattern = s.slice(i + 1).trim()
    }
  }
  if (!pattern) return null
  return { kind: kind, pattern: pattern, negate: negate, re: glob(pattern) }
}

function selectorHits(sel, who) {
  if (!sel || !sel.re) return false
  var v = who[sel.kind]
  if (!v) return false
  return sel.re.test(v)
}

// selects 判断 who 是否落在列表里。
//   有排除项命中 → 不算
//   有包含项 → 至少要命中一条
//   只有排除项 → 没命中排除就算（“除了这些”）
function selects(list, who) {
  if (!Array.isArray(list) || !list.length) return false
  var positives = 0
  var hit = false
  for (var i = 0; i < list.length; i++) {
    var item = list[i]
    var raw = typeof item === "string" ? item : item && typeof item.match === "string" ? item.match : ""
    var sel = parseSelector(raw)
    if (!sel) continue
    if (sel.negate) {
      if (selectorHits(sel, who)) return false
      continue
    }
    positives++
    if (selectorHits(sel, who)) hit = true
  }
  return positives === 0 ? true : hit
}

function normMode(m) {
  return MODES.indexOf(m) >= 0 ? m : "replace"
}

function ruleList(v) {
  if (Array.isArray(v)) return v
  if (typeof v === "string" && v.trim()) {
    try {
      var p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch (e) {
      return []
    }
  }
  return []
}

// pick 决定这次请求怎么处理。返回 null 表示不动这个请求。
function pick(who, o) {
  var rules = ruleList(o.rules)
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i]
    if (!r || typeof r !== "object") continue
    if (r.enabled === false) continue
    var list = Array.isArray(r.match) ? r.match : typeof r.match === "string" ? [r.match] : []
    if (!list.length) continue
    if (!selects(list, who)) continue
    // mode:"skip" 就是“这个客户端别动”，用来在整体生效时单独放过某个软件
    if (r.mode === "skip") return null
    var p = typeof r.prompt === "string" ? r.prompt : typeof o.system_prompt === "string" ? o.system_prompt : ""
    return {
      mode: normMode(r.mode || o.mode),
      prompt: p,
      replaceReminders: r.replace_reminders !== false && o.replace_reminders !== false,
    }
  }
  var scope = typeof o.scope === "string" ? o.scope : "all"
  if (scope === "selected" && !selects(o.targets, who)) return null
  return {
    mode: normMode(o.mode),
    prompt: typeof o.system_prompt === "string" ? o.system_prompt : "",
    replaceReminders: o.replace_reminders !== false,
  }
}

// ---- 调用方记录 ------------------------------------------------------------

// 只记第一次见到的组合，最多 80 条，免得刷满 app.log。
var seenCallers = Object.create(null)
var seenCount = 0

function noteCaller(who) {
  var key = who.agent + "|" + who.provider + "|" + who.protocol + "|" + who.app
  if (seenCallers[key]) return
  if (seenCount >= 80) return
  seenCallers[key] = true
  seenCount++
  try {
    // 宿主把 console.log 重定向到 stderr，magpie 会写进 logs/app.log
    console.log("[prompt-override] caller " + JSON.stringify(who))
  } catch (e) {}
}

// ---- 提醒块 ----------------------------------------------------------------

// 行为类提醒块：这些是客户端自己的身份/语气/环境规则，属于“系统提示词”的一部分。
// user-context（用户资料、SOUL/IDENTITY/OS 信息）与 additional-data（文件引用、
// 当前时间、附件）不是行为规则，留着——删了会丢工作目录与文件上下文。
var BEHAVIOR_TAGS = ["<product_identity", "<tone_and_style", "<project_context", "<connector-status"]
var KEEP_ROLES = ["user-context", "additional-data", "craft_mode"]

// <system-reminder data-role="xxx"> ... </system-reminder>
var REMINDER_RE = /<system-reminder\b([^>]*)>([\s\S]*?)<\/system-reminder>/g

function reminderRole(attrs) {
  var m = /data-role\s*=\s*"([^"]*)"/.exec(attrs || "")
  return m ? m[1] : ""
}

// 这块提醒算不算“行为规则”。
// WorkBuddy 的行为块常常是 <system-reminder>（没有 data-role），身份与语气规则
// 写在它内部的 <product_identity> / <tone_and_style> 等标签里，所以先看内容。
function isBehaviorBlock(attrs, inner) {
  var body = String(inner || "")
  for (var i = 0; i < BEHAVIOR_TAGS.length; i++) {
    if (body.indexOf(BEHAVIOR_TAGS[i]) >= 0) return true
  }
  if (KEEP_ROLES.indexOf(reminderRole(attrs)) >= 0) return false
  return false
}

// 把文本里的行为类提醒块删掉。
// 你的提示词已经写进 system 字段了，这里的旧规则只会稀释它，直接删。
// 返回 null 表示文本里没有这类块。
function rewriteText(text) {
  if (typeof text !== "string" || text.indexOf("<system-reminder") < 0) return null
  var hit = false
  var next = text.replace(REMINDER_RE, function (whole, attrs, inner) {
    if (!isBehaviorBlock(attrs, inner)) return whole
    hit = true
    return ""
  })
  if (!hit) return null
  return next
}

// 对一个消息的 content 做替换：字符串，或带文本块的数组（各协议都长这样）。
function rewriteContent(content) {
  if (typeof content === "string") {
    var t = rewriteText(content)
    return t === null ? null : t
  }
  if (!Array.isArray(content)) return null
  var changed = false
  for (var i = 0; i < content.length; i++) {
    var part = content[i]
    if (!part || typeof part.text !== "string") continue
    var t = rewriteText(part.text)
    if (t === null) continue
    part.text = t
    changed = true
  }
  return changed ? content : null
}

// 把 body 里所有消息的提醒块删掉。返回 body（就地改），没找到就返回 null。
function applyReminders(body) {
  var lists = []
  if (Array.isArray(body.messages)) lists.push(body.messages)
  if (Array.isArray(body.input)) lists.push(body.input)
  var any = false
  for (var i = 0; i < lists.length; i++) {
    var msgs = lists[i]
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j]
      if (!m) continue
      var c = rewriteContent(m.content)
      if (c !== null) {
        m.content = c
        any = true
      }
    }
  }
  return any ? body : null
}

// ---- 各协议 ----------------------------------------------------------------

// isEmpty 判断 Anthropic 的 system 是不是等于没写。
function isEmpty(s) {
  if (s === undefined || s === null || s === "") return true
  if (Array.isArray(s) && !s.length) return true
  return false
}

function anthropic(body, prompt, mode) {
  var s = body.system
  if (mode === "strip") {
    if (s === undefined) return
    delete body.system
    return body
  }
  if (mode === "replace") {
    body.system = prompt
    return body
  }
  if (isEmpty(s)) {
    body.system = prompt
    return body
  }
  if (typeof s === "string") {
    body.system = mode === "prepend" ? prompt + "\n" + s : s + "\n" + prompt
    return body
  }
  if (Array.isArray(s)) {
    var block = { type: "text", text: prompt }
    if (mode === "prepend") s.unshift(block)
    else s.push(block)
    return body
  }
  return
}

// systemIndexes 列出 messages 里全部 system / developer 消息的下标。
function systemIndexes(msgs) {
  var idx = []
  for (var i = 0; i < msgs.length; i++) {
    var r = msgs[i] && msgs[i].role
    if (r === "system" || r === "developer") idx.push(i)
  }
  return idx
}

// replaceContent 换掉一条消息的提示文本，图片等非文本块留着。
function replaceContent(msg, prompt) {
  var c = msg.content
  if (Array.isArray(c)) {
    var keep = []
    for (var i = 0; i < c.length; i++) {
      if (c[i] && c[i].type !== "text") keep.push(c[i])
    }
    msg.content = [{ type: "text", text: prompt }].concat(keep)
    return
  }
  msg.content = prompt
}

function chat(body, prompt, mode) {
  if (!Array.isArray(body.messages)) return
  var msgs = body.messages
  var idx = systemIndexes(msgs)

  if (mode === "strip") {
    if (!idx.length) return
    for (var k = idx.length - 1; k >= 0; k--) msgs.splice(idx[k], 1)
    return body
  }

  if (mode === "replace") {
    if (!idx.length) {
      msgs.unshift({ role: "system", content: prompt })
      return body
    }
    // 第一条换成自己的，其余的删掉：留着就是旧的提示词还在
    replaceContent(msgs[idx[0]], prompt)
    for (var m = idx.length - 1; m >= 1; m--) msgs.splice(idx[m], 1)
    return body
  }

  if (!idx.length) {
    msgs.unshift({ role: "system", content: prompt })
    return body
  }
  var first = msgs[idx[0]]
  var pre = mode === "prepend"
  if (typeof first.content === "string") {
    first.content = pre ? prompt + "\n" + first.content : first.content + "\n" + prompt
    return body
  }
  if (Array.isArray(first.content)) {
    var part = { type: "text", text: prompt }
    if (pre) first.content.unshift(part)
    else first.content.push(part)
    return body
  }
  return
}

// dropInputRoles 清掉 Responses 的 input 里的 system / developer 指令项，
// 否则换了 instructions，旧指令还留在 input 里。
function dropInputRoles(body) {
  if (!Array.isArray(body.input)) return
  var kept = []
  for (var i = 0; i < body.input.length; i++) {
    var r = body.input[i] && body.input[i].role
    if (r !== "system" && r !== "developer") kept.push(body.input[i])
  }
  body.input = kept
}

function responses(body, prompt, mode) {
  var s = body.instructions
  if (mode === "strip") {
    var hasInputInstructions = Array.isArray(body.input) && systemIndexes(body.input).length > 0
    if (s === undefined && !hasInputInstructions) return
    delete body.instructions
    dropInputRoles(body)
    return body
  }
  if (mode === "replace") {
    body.instructions = prompt
    dropInputRoles(body)
    return body
  }
  if (typeof s !== "string" || !s) {
    body.instructions = prompt
    return body
  }
  body.instructions = mode === "prepend" ? prompt + "\n" + s : s + "\n" + prompt
  return body
}

function gemini(body, prompt, mode) {
  var camel = body.systemInstruction
  var snake = body.system_instruction
  // 原来用哪个键就接着用哪个，别把渠道认的字段名换掉
  var useSnake = !camel && !!snake
  var key = useSnake ? "system_instruction" : "systemInstruction"
  var s = useSnake ? snake : camel

  if (mode === "strip") {
    var any = false
    if (camel !== undefined) {
      delete body.systemInstruction
      any = true
    }
    if (snake !== undefined) {
      delete body.system_instruction
      any = true
    }
    return any ? body : undefined
  }

  if (mode === "replace" || !s || !Array.isArray(s.parts) || !s.parts.length) {
    body[key] = { parts: [{ text: prompt }] }
    // 两个键同时存在时一起换，别让一条请求里出现两套提示词
    if (camel && snake) {
      body.systemInstruction = body[key]
      body.system_instruction = body[key]
    }
    return body
  }

  var pre = mode === "prepend"
  if (pre) s.parts.unshift({ text: prompt })
  else s.parts.push({ text: prompt })
  return body
}
