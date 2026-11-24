// 由 index.src.html + style.css 生成 index.html：把样式内嵌进页面。
// 插件页面的资源若偶发取不到，外链样式会让整页失去样式；内嵌后至少版式还在。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const page = join(here, "..", "page");
const css = readFileSync(join(page, "style.css"), "utf8").trimEnd();
const tpl = readFileSync(join(page, "index.src.html"), "utf8");
if (!tpl.includes("/*INLINE_CSS*/")) throw new Error("index.src.html 缺少 /*INLINE_CSS*/ 标记");
const out = tpl.replace("/*INLINE_CSS*/", () => css);
writeFileSync(join(page, "index.html"), out, "utf8");
console.log("page/index.html 已生成：内嵌样式 " + css.length + " 字节");
