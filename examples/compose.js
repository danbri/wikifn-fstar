#!/usr/bin/env node
// Composing Wikifunctions functions in JavaScript.
//
// The other example, node-engine.js, calls one function. This one feeds the
// result of one into the next, which is the thing worth showing: once the
// engine is loaded, a Wikifunctions function is an ordinary JavaScript call,
// and composing two of them is ordinary JavaScript.
//
// The classic palindrome is only a palindrome once the spaces are gone:
//
//   "a man a plan a canal panama"  is not a palindrome, read literally
//   "amanaplanacanalpanama"        is
//
// So the composition is Z10096(Z10052(text)) - is-a-palindrome after
// remove-regular-spaces. Both come from the pinned corpus; neither was written
// here.
//
//   node examples/compose.js
//   node examples/compose.js "Never odd or even"

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

require(path.join(root, "docs", "generated", "wikifn_engine.cjs"));

// One small adapter, and after it these read like any other function. The
// engine speaks JSON strings across the js_of_ocaml boundary; unwrapping the
// result envelope is all that is needed to get a plain JavaScript value back.
function wikifn(zid, { fuel = 100000 } = {}) {
  return (...args) => {
    const response = JSON.parse(
      globalThis.wikifnEngineCall(zid, String(fuel), JSON.stringify(args)));
    if (!response.ok) throw new Error(`${zid}: ${response.message}`);
    const result = response.result;
    // Z6 is a string, Z40 a boolean, Z13518 a natural number, Z881 a list.
    if (result.type === "Z6") return result.text;
    if (result.type === "Z40") return result.value;
    if (result.type === "Z13518") return Number(result.value);
    return result;
  };
}

const removeSpaces = wikifn("Z10052"); // remove regular spaces
const isPalindrome = wikifn("Z10096"); // is a palindrome

// The composition. Nothing about this is special to Wikifunctions: it is two
// functions, and the second is applied to the result of the first.
const isPalindromeIgnoringSpaces = (text) => isPalindrome(removeSpaces(text));

const phrases = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "a man a plan a canal panama",
      "amanaplanacanalpanama",
      "Never odd or even",
      "not a palindrome at all"
    ];

console.log("Z10052 remove regular spaces  :  String -> String");
console.log("Z10096 is a palindrome        :  String -> Boolean");
console.log("composed                      :  isPalindrome(removeSpaces(text))\n");

const width = Math.max(...phrases.map((p) => p.length));
for (const phrase of phrases) {
  // Both readings, so the difference the composition makes is visible rather
  // than asserted.
  const literal = isPalindrome(phrase);
  const stripped = removeSpaces(phrase);
  const composed = isPalindrome(stripped);
  console.log(
    `${JSON.stringify(phrase).padEnd(width + 2)}  ` +
    `literally ${String(literal).padEnd(5)}  ` +
    `spaces removed ${JSON.stringify(stripped).padEnd(width + 2)}  ` +
    `then ${composed}`
  );
}

// Z10096 compares codepoints, so it is case-sensitive: "neveroddoreven" is a
// palindrome and "Neveroddoreven" is not. That is the corpus function's actual
// behaviour, not a limitation of this engine, and it is worth saying rather
// than letting the row above read as a bug. Case folding would be another
// composition - Z10047 to lowercase - which this engine does not have yet.
console.log(
  "\nZ10096 compares codepoints, so it is case-sensitive: " +
  `"neveroddoreven" is ${isPalindrome("neveroddoreven")}, ` +
  `"Neveroddoreven" is ${isPalindrome("Neveroddoreven")}.`
);

// Composition is not limited to two, and the middle value is a plain string, so
// anything else that takes a string can go in between.
const rot13 = wikifn("Z10627");
const roundTrip = rot13(rot13("a man a plan a canal panama"));
console.log(
  `\nZ10627 ROT13 twice is the identity: ${JSON.stringify(roundTrip)} ` +
  `-> palindrome ignoring spaces: ${isPalindromeIgnoringSpaces(roundTrip)}`
);
