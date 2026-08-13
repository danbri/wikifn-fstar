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
      source: "Z10052 -> Z10077 -> Z10075"
    },
    "Decimal comma to point (Z21679) on \"3,14\"": {
      task: "Decimal comma to point",
      input: "3,14",
      source: "Z21679 -> Z21681 -> Z10075"
    },
    "French contractions (Z38114) on \"de les amis et de le chat\"": {
      task: "French contraction replacement",
      input: "de les amis et de le chat",
      source: "Z38114 -> Z38115 -> Z10075"
    },
    "Devanagari digits to Arabic digits (Z22294) on codepoints [2407,2408,2409]": {
      task: "Devanagari digits to Arabic digits",
      input: "codepoints [2407,2408,2409]",
      source: "Z22294 -> Z22295 -> Z14613 -> Z36070"
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
