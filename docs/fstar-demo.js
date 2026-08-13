(function () {
  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var rows = root.wikifnFstarPrimitiveDemoOutput || [];
  var status = document.getElementById("fstar-demo-status");
  var tbody = document.querySelector("#fstar-demo-results tbody");

  var cases = {
    "Z782 is_zero(0)": {
      task: "Is zero?",
      input: "0",
      source: "F* primitive Z782"
    },
    "Z783 successor(2)": {
      task: "Next natural number",
      input: "2",
      source: "F* primitive Z783"
    },
    "Z784 predecessor(2)": {
      task: "Previous natural number",
      input: "2",
      source: "F* primitive Z784"
    },
    "Z784 predecessor(0)": {
      task: "Previous natural number at zero",
      input: "0",
      source: "F* primitive Z784"
    },
    "Remove regular spaces (Z10052) on \"a b c\"": {
      task: "Remove regular spaces",
      input: "a b c",
      source: "generated F* IR: Z10052 -> Z10077 -> Z10075"
    },
    "Fallback if string is empty (Z11082) on empty": {
      task: "Fallback if string is empty",
      input: "empty, fallback",
      source: "generated F* IR: Z11082 -> Z31951 -> Z802/Z10008"
    },
    "Decimal comma to point (Z21679) on \"3,14\"": {
      task: "Decimal comma to point",
      input: "3,14",
      source: "generated F* IR: Z21679 -> Z21681 -> Z10075"
    },
    "French contractions (Z38114) on \"de les amis et de le chat\"": {
      task: "French contraction replacement",
      input: "de les amis et de le chat",
      source: "generated F* IR: Z38114 -> Z38115 -> Z10075"
    },
    "Devanagari digits to Arabic digits (Z22294) on codepoints [2407,2408,2409]": {
      task: "Devanagari digits to Arabic digits",
      input: "codepoints [2407,2408,2409]",
      source: "generated F* IR: Z22294 -> Z22295 -> Z14613 -> Z36070"
    },
    "Arabic numerals to Devanagari numerals (Z22649) on \"123\"": {
      task: "Arabic numerals to Devanagari numerals",
      input: "123",
      source: "generated F* IR: Z22649 -> Z22653 -> Z14613 fast path"
    },
    "Digits to subscript (Z27053) on \"H2O\"": {
      task: "Digits to subscript",
      input: "H2O",
      source: "generated F* IR: Z27053 -> Z27216 -> Z14613 fast path"
    },
    "ROT13 Latin alphabet (Z10627) on \"hello\"": {
      task: "ROT13 Latin alphabet",
      input: "hello",
      source: "generated F* IR: Z10627 -> Z21749 -> Z14613 fast path"
    },
    "Turn to superscript (Z19612) on \"x2+y3\"": {
      task: "Turn to superscript",
      input: "x2+y3",
      source: "generated F* IR: Z19612 -> Z22828 -> Z14613 fast path"
    },
    "Compiled F* remove regular spaces (Z10052) on \"a b c\"": {
      task: "Remove regular spaces",
      input: "a b c",
      source: "generated direct F*: Z10052 -> Z10077"
    },
    "Compiled F* ROT13 Latin alphabet (Z10627) on \"hello\"": {
      task: "ROT13 Latin alphabet",
      input: "hello",
      source: "generated direct F*: Z10627 -> Z21749 -> Z14613 marker optimization"
    },
    "Compiled F* fallback if string is empty (Z11082) on empty": {
      task: "Fallback if string is empty",
      input: "empty, fallback",
      source: "generated direct F*: Z11082 -> Z31951"
    },
    "Compiled F* turn to superscript (Z19612) on \"x2+y3\"": {
      task: "Turn to superscript",
      input: "x2+y3",
      source: "generated direct F*: Z19612 -> Z22828 -> Z14613 marker optimization"
    },
    "Compiled F* decimal comma to point (Z21679) on \"3,14\"": {
      task: "Decimal comma to point",
      input: "3,14",
      source: "generated direct F*: Z21679 -> Z21681"
    },
    "Compiled F* French contractions (Z38114) on \"de les amis et de le chat\"": {
      task: "French contraction replacement",
      input: "de les amis et de le chat",
      source: "generated direct F*: Z38114 -> Z38115"
    },
    "Compiled F* Devanagari digits to Arabic digits (Z22294) on codepoints [2407,2408,2409]": {
      task: "Devanagari digits to Arabic digits",
      input: "codepoints [2407,2408,2409]",
      source: "generated direct F*: Z22294 -> Z22295 -> Z14613 marker optimization"
    },
    "Compiled F* Arabic numerals to Devanagari numerals (Z22649) on \"123\"": {
      task: "Arabic numerals to Devanagari numerals",
      input: "123",
      source: "generated direct F*: Z22649 -> Z22653 -> Z14613 marker optimization"
    },
    "Compiled F* digits to subscript (Z27053) on \"H2O\"": {
      task: "Digits to subscript",
      input: "H2O",
      source: "generated direct F*: Z27053 -> Z27216 -> Z14613 marker optimization"
    },
    "Specialized F* remove regular spaces (Z10052) on \"a b c\"": {
      task: "Remove regular spaces",
      input: "a b c",
      source: "direct specialized F* function from Z10052/Z10077"
    },
    "Specialized F* ROT13 Latin alphabet (Z10627) on \"hello\"": {
      task: "ROT13 Latin alphabet",
      input: "hello",
      source: "direct specialized F* function from Z10627/Z21749"
    },
    "Specialized F* fallback if string is empty (Z11082) on empty": {
      task: "Fallback if string is empty",
      input: "empty, fallback",
      source: "direct specialized F* function from Z11082/Z31951"
    },
    "Specialized F* turn to superscript (Z19612) on \"x2+y3\"": {
      task: "Turn to superscript",
      input: "x2+y3",
      source: "direct specialized F* function from Z19612/Z22828"
    },
    "Specialized F* decimal comma to point (Z21679) on \"3,14\"": {
      task: "Decimal comma to point",
      input: "3,14",
      source: "direct specialized F* function from Z21679/Z21681"
    },
    "Specialized F* French contractions (Z38114) on \"de les amis et de le chat\"": {
      task: "French contraction replacement",
      input: "de les amis et de le chat",
      source: "direct specialized F* function from Z38114/Z38115"
    },
    "Specialized F* Devanagari digits to Arabic digits (Z22294) on codepoints [2407,2408,2409]": {
      task: "Devanagari digits to Arabic digits",
      input: "codepoints [2407,2408,2409]",
      source: "direct specialized F* function from Z22294/Z22295/Z14613/Z36070"
    },
    "Specialized F* Arabic numerals to Devanagari numerals (Z22649) on \"123\"": {
      task: "Arabic numerals to Devanagari numerals",
      input: "123",
      source: "direct specialized F* function from Z22649/Z22653"
    },
    "Specialized F* digits to subscript (Z27053) on \"H2O\"": {
      task: "Digits to subscript",
      input: "H2O",
      source: "direct specialized F* function from Z27053/Z27216"
    }
  };

  if (!tbody || !status) {
    return;
  }

  if (rows.length === 0) {
    status.textContent = "No extracted F* output was captured.";
    return;
  }

  tbody.textContent = "";
  var parsedCount = 0;
  rows.forEach(function (line) {
    var record;
    try {
      record = JSON.parse(line);
    } catch (_error) {
      return;
    }
    parsedCount += 1;
    var meta = cases[record.case] || { task: record.case, input: "", source: "extracted F* artifact" };
    var tr = document.createElement("tr");
    appendCell(tr, meta.task);
    appendCell(tr, meta.input);
    appendCell(tr, formatResult(record.result));
    appendCell(tr, meta.source);
    tbody.appendChild(tr);
  });

  status.textContent = "Rendered " + parsedCount + " result lines from the extracted F* browser artifact.";

  function appendCell(tr, value) {
    var td = document.createElement("td");
    td.textContent = value;
    tr.appendChild(td);
  }

  function formatResult(result) {
    if (!result || result.ok !== true) {
      return result && result.error ? "error: " + result.error : "error";
    }
    var value = result.value || {};
    if (typeof value.text === "string" && value.text.length > 0) {
      return value.text;
    }
    if (typeof value.ascii === "string" && value.ascii.length > 0) {
      return value.ascii;
    }
    if (Object.prototype.hasOwnProperty.call(value, "value")) {
      return String(value.value);
    }
    if (Array.isArray(value.codepoints)) {
      return "[" + value.codepoints.join(",") + "]";
    }
    return JSON.stringify(value);
  }
})();
