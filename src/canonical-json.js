import { err, ok } from "./result.js";
import { isPlainObject } from "./ids.js";

export function parseJsonStrict(text) {
  const parser = new JsonParser(String(text));
  const result = parser.parseValue(["$"]);
  if (!result.ok) {
    return result;
  }
  parser.skipWhitespace();
  if (!parser.isEof()) {
    return parser.error("json_trailing_input", "unexpected input after JSON value", ["$"]);
  }
  return result;
}

export function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

export function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJson(value[key]);
  }
  return sorted;
}

class JsonParser {
  constructor(text) {
    this.text = text;
    this.index = 0;
  }

  isEof() {
    return this.index >= this.text.length;
  }

  peek() {
    return this.text[this.index];
  }

  next() {
    return this.text[this.index++];
  }

  skipWhitespace() {
    while (!this.isEof() && /[\t\n\r ]/.test(this.peek())) {
      this.index += 1;
    }
  }

  error(code, message, path, details = {}) {
    return err(code, message, path, { index: this.index, ...details });
  }

  parseValue(path) {
    this.skipWhitespace();
    if (this.isEof()) {
      return this.error("json_unexpected_eof", "expected a JSON value", path);
    }

    const ch = this.peek();
    if (ch === "{") {
      return this.parseObject(path);
    }
    if (ch === "[") {
      return this.parseArray(path);
    }
    if (ch === "\"") {
      return this.parseString(path);
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      return this.parseNumber(path);
    }
    if (this.text.startsWith("true", this.index)) {
      this.index += 4;
      return ok(true);
    }
    if (this.text.startsWith("false", this.index)) {
      this.index += 5;
      return ok(false);
    }
    if (this.text.startsWith("null", this.index)) {
      this.index += 4;
      return ok(null);
    }
    return this.error("json_unexpected_token", `unexpected token ${JSON.stringify(ch)}`, path);
  }

  parseObject(path) {
    this.next();
    this.skipWhitespace();
    const value = {};
    const seen = new Set();

    if (this.peek() === "}") {
      this.next();
      return ok(value);
    }

    while (true) {
      this.skipWhitespace();
      if (this.peek() !== "\"") {
        return this.error("json_expected_key", "expected an object key string", path);
      }
      const keyResult = this.parseString(path);
      if (!keyResult.ok) {
        return keyResult;
      }
      const key = keyResult.value;
      if (seen.has(key)) {
        return this.error("json_duplicate_key", `duplicate object key ${JSON.stringify(key)}`, path.concat(key));
      }
      seen.add(key);

      this.skipWhitespace();
      if (this.next() !== ":") {
        return this.error("json_expected_colon", "expected ':' after object key", path.concat(key));
      }

      const childResult = this.parseValue(path.concat(key));
      if (!childResult.ok) {
        return childResult;
      }
      value[key] = childResult.value;

      this.skipWhitespace();
      const separator = this.next();
      if (separator === "}") {
        return ok(value);
      }
      if (separator !== ",") {
        return this.error("json_expected_comma_or_end", "expected ',' or '}' in object", path);
      }
    }
  }

  parseArray(path) {
    this.next();
    this.skipWhitespace();
    const value = [];

    if (this.peek() === "]") {
      this.next();
      return ok(value);
    }

    while (true) {
      const childResult = this.parseValue(path.concat(String(value.length)));
      if (!childResult.ok) {
        return childResult;
      }
      value.push(childResult.value);

      this.skipWhitespace();
      const separator = this.next();
      if (separator === "]") {
        return ok(value);
      }
      if (separator !== ",") {
        return this.error("json_expected_comma_or_end", "expected ',' or ']' in array", path);
      }
    }
  }

  parseString(path) {
    if (this.next() !== "\"") {
      return this.error("json_expected_string", "expected string", path);
    }

    let value = "";
    while (!this.isEof()) {
      const ch = this.next();
      if (ch === "\"") {
        return ok(value);
      }
      if (ch === "\\") {
        const escaped = this.parseEscape(path);
        if (!escaped.ok) {
          return escaped;
        }
        value += escaped.value;
        continue;
      }
      if (ch < " ") {
        return this.error("json_control_character", "unescaped control character in string", path);
      }
      value += ch;
    }

    return this.error("json_unterminated_string", "unterminated string", path);
  }

  parseEscape(path) {
    if (this.isEof()) {
      return this.error("json_unexpected_eof", "unterminated escape sequence", path);
    }

    const ch = this.next();
    switch (ch) {
      case "\"":
      case "\\":
      case "/":
        return ok(ch);
      case "b":
        return ok("\b");
      case "f":
        return ok("\f");
      case "n":
        return ok("\n");
      case "r":
        return ok("\r");
      case "t":
        return ok("\t");
      case "u":
        return this.parseUnicodeEscape(path);
      default:
        return this.error("json_invalid_escape", `invalid escape \\${ch}`, path);
    }
  }

  parseUnicodeEscape(path) {
    const hex = this.text.slice(this.index, this.index + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
      return this.error("json_invalid_unicode_escape", "invalid unicode escape", path);
    }
    this.index += 4;
    const codeUnit = Number.parseInt(hex, 16);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const checkpoint = this.index;
      if (this.text.slice(this.index, this.index + 2) === "\\u") {
        this.index += 2;
        const lowHex = this.text.slice(this.index, this.index + 4);
        if (/^[0-9a-fA-F]{4}$/.test(lowHex)) {
          const low = Number.parseInt(lowHex, 16);
          if (low >= 0xdc00 && low <= 0xdfff) {
            this.index += 4;
            const codePoint = 0x10000 + ((codeUnit - 0xd800) << 10) + (low - 0xdc00);
            return ok(String.fromCodePoint(codePoint));
          }
        }
      }
      this.index = checkpoint;
      return this.error("json_invalid_surrogate_pair", "high surrogate must be followed by a low surrogate", path);
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return this.error("json_invalid_surrogate_pair", "low surrogate without preceding high surrogate", path);
    }

    return ok(String.fromCharCode(codeUnit));
  }

  parseNumber(path) {
    const rest = this.text.slice(this.index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(rest);
    if (!match) {
      return this.error("json_invalid_number", "invalid number", path);
    }
    this.index += match[0].length;
    return ok(Number(match[0]));
  }
}
