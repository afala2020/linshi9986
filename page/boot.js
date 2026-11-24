// Magpie 要求插件页在 10 秒内“报到”（hello），否则显示“此页面已停止工作”。
//
// 原生的报到只在 _magpie/bridge.js 加载成功时发生一次，而 bridge.js 与
// 页面文件是按同一个令牌分发的：新装或窗口正在刷新插件列表时，这一次请求
// 可能 404；消息也可能在窗口换页时被丢掉。两种情况都表现为“页面没有响应”。
//
// 所以这里自己再报一次到：只要本文件加载成功，就立刻发 hello，并在 9 秒内
// 每 400 毫秒重发一次，直到窗口回话。窗口对重复的 hello 是幂等的（只置位
// 已报到并回主题），所以多发无害。
(() => {
  const EVERY_MS = 400;
  const MAX_MS = 9000;
  const pending = new Set();
  let next = 0;
  let answered = false;

  addEventListener("message", (e) => {
    if (e.source !== parent) return;
    const m = e.data;
    if (!m || m.magpie !== 1) return;
    // 窗口推来的主题/可见性事件也能证明它认识这个页面，不必再报
    if (m.event) { answered = true; return; }
    if (!pending.has(m.id)) return;
    pending.delete(m.id);
    answered = true;
    globalThis.__magpieHello = m.result; // 主题、context，供页面取用
  });

  function hello() {
    if (answered) return;
    const id = "boot-" + ++next;
    pending.add(id);
    parent.postMessage({ magpie: 1, id, method: "hello", params: {} }, "*");
  }

  hello();
  const timer = setInterval(hello, EVERY_MS);
  setTimeout(() => clearInterval(timer), MAX_MS);
  addEventListener("pagehide", () => clearInterval(timer));
})();
