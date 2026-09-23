/*
 * Minimal reader for the JavaScript literals found in compiled icon modules: strings,
 * numbers, booleans, null, arrays and objects with bare or quoted keys. It is not a general
 * JS parser; it only needs to cover what icon build tools emit, and throws on anything else.
 */

export type JsValue = string | number | boolean | null | JsValue[] | { [key: string]: JsValue };

const IDENTIFIER = /[A-Za-z_$][\w$]*/y;
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

export class LiteralCursor {
  constructor(
    readonly src: string,
    public pos = 0,
  ) {}

  // Skips whitespace and comments (including /*#__PURE__*/ annotations).
  skipWs(): void {
    for (;;) {
      while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) this.pos++;
      if (this.src.startsWith("/*", this.pos)) {
        const end = this.src.indexOf("*/", this.pos + 2);
        this.pos = end < 0 ? this.src.length : end + 2;
      } else if (this.src.startsWith("//", this.pos)) {
        const end = this.src.indexOf("\n", this.pos);
        this.pos = end < 0 ? this.src.length : end + 1;
      } else {
        return;
      }
    }
  }

  peek(): string | undefined {
    this.skipWs();
    return this.src[this.pos];
  }

  // Consumes `token` if it comes next; returns whether it did.
  eat(token: string): boolean {
    this.skipWs();
    if (!this.src.startsWith(token, this.pos)) return false;
    this.pos += token.length;
    return true;
  }

  expect(token: string): void {
    if (!this.eat(token)) this.fail(`expected "${token}"`);
  }

  fail(message: string): never {
    const context = this.src.slice(this.pos, this.pos + 40);
    throw new Error(`Parse error at offset ${this.pos}: ${message} (near ${JSON.stringify(context)})`);
  }

  identifier(): string {
    this.skipWs();
    IDENTIFIER.lastIndex = this.pos;
    const match = IDENTIFIER.exec(this.src);
    if (!match) this.fail("expected identifier");
    this.pos += match[0].length;
    return match[0];
  }

  string(): string {
    this.skipWs();
    const quote = this.src[this.pos];
    if (quote !== '"' && quote !== "'") this.fail("expected string");
    let out = "";
    let i = this.pos + 1;
    while (i < this.src.length && this.src[i] !== quote) {
      if (this.src[i] === "\\") {
        const next = this.src[i + 1];
        if (next === "u") {
          out += String.fromCharCode(parseInt(this.src.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }
        out += next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : (next ?? "");
        i += 2;
      } else {
        out += this.src[i];
        i++;
      }
    }
    if (i >= this.src.length) this.fail("unterminated string");
    this.pos = i + 1;
    return out;
  }

  value(): JsValue {
    const ch = this.peek();
    if (ch === '"' || ch === "'") return this.string();
    if (ch === "[") return this.array();
    if (ch === "{") return this.object();
    NUMBER.lastIndex = this.pos;
    const num = NUMBER.exec(this.src);
    if (num) {
      this.pos += num[0].length;
      return Number(num[0]);
    }
    const word = this.identifier();
    if (word === "true") return true;
    if (word === "false") return false;
    if (word === "null") return null;
    this.fail(`unsupported value "${word}"`);
  }

  array(): JsValue[] {
    this.expect("[");
    const out: JsValue[] = [];
    while (!this.eat("]")) {
      out.push(this.value());
      if (!this.eat(",") && this.peek() !== "]") this.fail('expected "," or "]"');
    }
    return out;
  }

  object(): { [key: string]: JsValue } {
    this.expect("{");
    const out: { [key: string]: JsValue } = {};
    while (!this.eat("}")) {
      const ch = this.peek();
      const key = ch === '"' || ch === "'" ? this.string() : this.identifier();
      this.expect(":");
      out[key] = this.value();
      if (!this.eat(",") && this.peek() !== "}") this.fail('expected "," or "}"');
    }
    return out;
  }
}
