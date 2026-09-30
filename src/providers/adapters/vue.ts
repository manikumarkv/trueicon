import type { LiteralCursor } from "../jsLiteral.js";
import { toSvgAttrs, type SvgNode } from "../svg.js";

/*
 * Parses elements from compiled Vue render functions, as emitted by the Vue SFC compiler:
 *
 *   _createElementVNode("path", { d: "...", "stroke-linecap": "round" })
 *   e("path", { d: "..." }, null, -1)                       (minified)
 *   _createElementVNode("g", null, [ _createElementVNode("path", {...}), ... ])
 *
 * The callee name varies (it is an import alias), so any identifier is accepted. Arguments after
 * the attributes are a children array, or null/patch flags, which are skipped. Children given as
 * variable references (hoisted vnodes) are resolved through `resolve`.
 */

export type VNodeResolver = (identifier: string) => SvgNode[];

export function parseVNode(cursor: LiteralCursor, resolve?: VNodeResolver): SvgNode {
  cursor.identifier();
  cursor.expect("(");
  const tag = cursor.string();
  cursor.expect(",");
  const attr = cursor.peek() === "{" ? toSvgAttrs(cursor.object()) : (cursor.value(), {});
  const child: SvgNode[] = [];
  while (cursor.eat(",")) {
    if (cursor.peek() === "[") child.push(...parseVNodes(cursor, resolve));
    else cursor.value();
  }
  cursor.expect(")");
  return { tag, attr, child };
}

/** Parses `[vnode, vnode, ...]`, where items are vnode calls or (with `resolve`) hoisted variables. */
export function parseVNodes(cursor: LiteralCursor, resolve?: VNodeResolver): SvgNode[] {
  cursor.expect("[");
  const nodes: SvgNode[] = [];
  while (!cursor.eat("]")) {
    const start = cursor.pos;
    const name = cursor.identifier();
    if (cursor.peek() === "(") {
      cursor.pos = start;
      nodes.push(parseVNode(cursor, resolve));
    } else if (resolve) {
      nodes.push(...resolve(name));
    } else {
      cursor.fail(`unexpected identifier ${name}`);
    }
    if (!cursor.eat(",") && cursor.peek() !== "]") cursor.fail('expected "," or "]"');
  }
  return nodes;
}
