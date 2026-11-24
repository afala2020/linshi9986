// node --test test/
// 覆盖：范围选择、规则优先、四种协议、模式、提醒块。
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../prompt-override.middleware.js";

const call = (body, options, ctx = {}) =>
  onRequest(body, { options, protocol: ctx.protocol || "anthropic", ...ctx });

const base = { enabled: true, system_prompt: "NEW", mode: "replace", replace_reminders: true };

// ---- 范围 ---------------------------------------------------------------

test("默认对全部调用方生效", () => {
  const out = call({ system: "OLD" }, { ...base }, { agent: "codex" });
  assert.equal(out.system, "NEW");
});

test("scope=selected 时未命中的调用方不动", () => {
  const o = { ...base, scope: "selected", targets: ["codex"] };
  assert.equal(call({ system: "OLD" }, o, { agent: "claude-desktop" }), undefined);
  assert.equal(call({ system: "OLD" }, o, { agent: "codex" }).system, "NEW");
});

test("agent 匹配不分大小写，支持通配", () => {
  const o = { ...base, scope: "selected", targets: ["*CODE*"] };
  assert.equal(call({ system: "OLD" }, o, { agent: "codex-cli" }).system, "NEW");
});

test("只有排除项表示其余都换", () => {
  const o = { ...base, scope: "selected", targets: ["!agent:magpie"] };
  assert.equal(call({ system: "OLD" }, o, { agent: "magpie" }), undefined);
  assert.equal(call({ system: "OLD" }, o, { agent: "zed" }).system, "NEW");
});

test("provider 与 protocol 都能选", () => {
  const o = { ...base, scope: "selected", targets: ["provider:trae-cn"] };
  assert.equal(call({ system: "OLD" }, o, { agent: "x", provider: "trae-cn" }).system, "NEW");
  const p = { ...base, scope: "selected", targets: ["protocol:chat"] };
  const body = { messages: [{ role: "system", content: "OLD" }] };
  assert.equal(call(body, p, { agent: "x", protocol: "chat" }).messages[0].content, "NEW");
});

test("没写前缀当成 agent", () => {
  const o = { ...base, scope: "selected", targets: ["workbuddy"] };
  assert.equal(call({ system: "OLD" }, o, { agent: "workbuddy" }).system, "NEW");
});

test("model 选择器读请求体", () => {
  const o = { ...base, scope: "selected", targets: ["model:*sonnet*"] };
  assert.equal(call({ system: "OLD", model: "claude-sonnet-4-5" }, o, { agent: "z" }).system, "NEW");
  assert.equal(call({ system: "OLD", model: "gpt-5" }, o, { agent: "z" }), undefined);
});

test("ctx.context 里的字段也能读到", () => {
  const o = { ...base, scope: "selected", targets: ["codex"] };
  const out = call({ system: "OLD" }, o, { context: { agent: "codex" } });
  assert.equal(out.system, "NEW");
});

test("enabled 不是 true 时不动", () => {
  assert.equal(call({ system: "OLD" }, { ...base, enabled: false }, { agent: "codex" }), undefined);
});

// ---- 规则 ---------------------------------------------------------------

test("规则优先于整体设置", () => {
  const o = {
    ...base,
    rules: [{ match: ["codex"], mode: "append", prompt: "TAIL" }],
  };
  assert.equal(call({ system: "OLD" }, o, { agent: "codex" }).system, "OLD\nTAIL");
  assert.equal(call({ system: "OLD" }, o, { agent: "zed" }).system, "NEW");
});

test("规则可只带 mode，prompt 回落到整体设置", () => {
  const o = { ...base, rules: [{ match: ["codex"], mode: "prepend" }] };
  assert.equal(call({ system: "OLD" }, o, { agent: "codex" }).system, "NEW\nOLD");
});

test("规则 mode:skip 单独放过某个客户端", () => {
  const o = { ...base, rules: [{ match: ["agent:magpie"], mode: "skip" }] };
  assert.equal(call({ system: "OLD" }, o, { agent: "magpie" }), undefined);
  assert.equal(call({ system: "OLD" }, o, { agent: "zed" }).system, "NEW");
});

test("不认识的 mode 按 replace 处理，不会静默丢掉整段提示词", () => {
  const o = { ...base, rules: [{ match: ["codex"], mode: "bogus" }] };
  assert.equal(call({ system: "OLD" }, o, { agent: "codex" }).system, "NEW");
});

test("规则可以是 JSON 字符串", () => {
  const o = { ...base, rules: JSON.stringify([{ match: ["codex"], mode: "strip" }]) };
  assert.equal(call({ system: "OLD" }, o, { agent: "codex" }).system, undefined);
});

// ---- 模式 ---------------------------------------------------------------

test("append / prepend 处理字符串 system", () => {
  assert.equal(call({ system: "OLD" }, { ...base, mode: "append" }).system, "OLD\nNEW");
  assert.equal(call({ system: "OLD" }, { ...base, mode: "prepend" }).system, "NEW\nOLD");
});

test("append 处理块数组 system", () => {
  const out = call({ system: [{ type: "text", text: "OLD" }] }, { ...base, mode: "append" });
  assert.deepEqual(out.system, [{ type: "text", text: "OLD" }, { type: "text", text: "NEW" }]);
});

test("strip 删掉 system", () => {
  const out = call({ system: "OLD" }, { ...base, mode: "strip", system_prompt: "" });
  assert.equal(out.system, undefined);
});

test("strip 不需要提示词", () => {
  const out = call({ system: "OLD" }, { enabled: true, mode: "strip", system_prompt: "" });
  assert.equal(out.system, undefined);
});

test("其他模式没有提示词就不动", () => {
  assert.equal(call({ system: "OLD" }, { enabled: true, mode: "append", system_prompt: "" }), undefined);
});

// ---- chat ---------------------------------------------------------------

test("chat 替换首条 system 并删掉多余的", () => {
  const body = {
    messages: [
      { role: "system", content: "A" },
      { role: "user", content: "hi" },
      { role: "system", content: "B" },
    ],
  };
  const out = call(body, base, { protocol: "chat" });
  assert.deepEqual(out.messages.map(m => m.role), ["system", "user"]);
  assert.equal(out.messages[0].content, "NEW");
});

test("chat 没有 system 时插一条", () => {
  const out = call({ messages: [{ role: "user", content: "hi" }] }, base, { protocol: "chat" });
  assert.equal(out.messages[0].role, "system");
  assert.equal(out.messages[0].content, "NEW");
});

test("chat 替换保留图片块", () => {
  const body = {
    messages: [{ role: "system", content: [{ type: "text", text: "A" }, { type: "image_url", image_url: { url: "u" } }] }],
  };
  const out = call(body, base, { protocol: "chat" });
  assert.equal(out.messages[0].content[0].text, "NEW");
  assert.equal(out.messages[0].content[1].type, "image_url");
});

test("chat strip 删掉 system 消息", () => {
  const body = { messages: [{ role: "system", content: "A" }, { role: "user", content: "hi" }] };
  const out = call(body, { ...base, mode: "strip", system_prompt: "" }, { protocol: "chat" });
  assert.deepEqual(out.messages.map(m => m.role), ["user"]);
});

// ---- responses ----------------------------------------------------------

test("responses 替换 instructions 并清掉 input 里的指令项", () => {
  const body = {
    instructions: "OLD",
    input: [{ role: "system", content: "OLD2" }, { role: "user", content: "hi" }],
  };
  const out = call(body, base, { protocol: "responses" });
  assert.equal(out.instructions, "NEW");
  assert.deepEqual(out.input.map(m => m.role), ["user"]);
});

// ---- gemini -------------------------------------------------------------

test("gemini 用原来的键名", () => {
  assert.deepEqual(
    call({ system_instruction: { parts: [{ text: "OLD" }] } }, base, { protocol: "gemini" }).system_instruction,
    { parts: [{ text: "NEW" }] },
  );
  assert.deepEqual(
    call({ systemInstruction: { parts: [{ text: "OLD" }] } }, base, { protocol: "gemini" }).systemInstruction,
    { parts: [{ text: "NEW" }] },
  );
});

test("gemini strip 两个键都没有时返回 undefined", () => {
  assert.equal(call({ contents: [] }, { ...base, mode: "strip", system_prompt: "" }, { protocol: "gemini" }), undefined);
});

// ---- 提醒块 -------------------------------------------------------------

test("replace 删掉行为类提醒块，留下用户资料与附件", () => {
  const text = [
    '<system-reminder data-role="user-context">我是谁</system-reminder>',
    "<system-reminder><product_identity>旧身份</product_identity></system-reminder>",
    '<system-reminder data-role="additional-data">文件</system-reminder>',
  ].join("\n");
  const out = call({ system: "OLD", messages: [{ role: "user", content: text }] }, base);
  const got = out.messages[0].content;
  assert.match(got, /我是谁/);
  assert.match(got, /文件/);
  assert.doesNotMatch(got, /旧身份/);
});

test("replace_reminders=false 时保留全部提醒块", () => {
  const text = "<system-reminder><tone_and_style>旧语气</tone_and_style></system-reminder>";
  const out = call(
    { system: "OLD", messages: [{ role: "user", content: text }] },
    { ...base, replace_reminders: false },
  );
  assert.match(out.messages[0].content, /旧语气/);
});

test("未知协议不动", () => {
  assert.equal(call({ system: "OLD" }, base, { protocol: "ollama" }), undefined);
});
