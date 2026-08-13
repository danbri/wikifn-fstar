(function () {
  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var rows = root.wikifnFstarPrimitiveDemoOutput || [];
  var status = document.getElementById("fstar-demo-status");
  var tbody = document.querySelector("#fstar-demo-results tbody");
  var demoRunButton = document.getElementById("fstar-demo-run");
  var rawOutput = document.getElementById("fstar-extraction-output");

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

  if (tbody && status) {
    tbody.textContent = "";
    status.textContent = typeof root.wikifnFstarRunPrimitiveDemo === "function"
      ? "Ready. Nothing has run yet; press Run fixed examples to execute the extracted F* artifact."
      : "Generated browser artifact is loaded, but the fixed-demo export was not found.";
    if (demoRunButton) {
      demoRunButton.addEventListener("click", function () {
        runFixedDemoSuite();
      });
    }
    if (rows.length > 0) {
      status.textContent = "Output was present before page setup; press Run fixed examples to refresh it deliberately.";
    }
  }

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

  function renderFixedRows(lines) {
    if (!tbody || !status) {
      return;
    }
    tbody.textContent = "";
    var parsedCount = 0;
    lines.forEach(function (line) {
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
  }

  function runFixedDemoSuite() {
    if (!tbody || !status) {
      return;
    }
    if (typeof root.wikifnFstarRunPrimitiveDemo !== "function") {
      status.textContent = "Cannot run: wikifnFstarRunPrimitiveDemo was not exported by the generated artifact.";
      return;
    }
    root.wikifnFstarPrimitiveDemoOutput = [];
    if (rawOutput) {
      rawOutput.textContent = "";
    }
    tbody.textContent = "";
    status.textContent = "Running fixed examples in the extracted F* browser artifact...";
    try {
      root.wikifnFstarRunPrimitiveDemo();
      renderFixedRows(root.wikifnFstarPrimitiveDemoOutput || []);
    } catch (error) {
      status.textContent = "Fixed examples failed: " + String(error && error.message ? error.message : error);
    }
  }

  var callForm = document.getElementById("fstar-call-form");
  var callOutput = document.querySelector("#fstar-call-output code");
  var callZid = document.getElementById("fstar-call-zid");
  var callArg0 = document.getElementById("fstar-call-arg0");
  var callArg1 = document.getElementById("fstar-call-arg1");
  var irForm = document.getElementById("fstar-ir-form");
  var irInput = document.getElementById("fstar-ir-input");
  var irOutput = document.querySelector("#fstar-ir-output code");
  var zobjectForm = document.getElementById("fstar-zobject-form");
  var zobjectInput = document.getElementById("fstar-zobject-input");
  var zobjectOutput = document.querySelector("#fstar-zobject-output code");

  if (callForm && callOutput && callZid && callArg0 && callArg1) {
    var examples = {
      Z10052: ["a b c", ""],
      Z10627: ["hello", ""],
      Z11082: ["", "fallback"],
      Z19612: ["x2+y3", ""],
      Z21679: ["3,14", ""],
      Z22294: ["१२३", ""],
      Z22649: ["123", ""],
      Z27053: ["H2O", ""],
      Z38114: ["de les amis et de le chat", ""]
    };

    callZid.addEventListener("change", function () {
      var example = examples[callZid.value];
      if (!example) {
        return;
      }
      callArg0.value = example[0];
      callArg1.value = example[1];
    });

    callForm.addEventListener("submit", function (event) {
      event.preventDefault();
      runBrowserCall();
    });
    callOutput.textContent = "Choose a path and function, then press Run Extracted F*.";
  }

  if (irForm && irInput && irOutput) {
    irForm.addEventListener("submit", function (event) {
      event.preventDefault();
      runJsonIr();
    });
    irOutput.textContent = "Press Run JSON IR to send this expression to the extracted F* evaluator.";
  }

  if (zobjectForm && zobjectInput && zobjectOutput) {
    zobjectForm.addEventListener("submit", function (event) {
      event.preventDefault();
      runZObject();
    });
    zobjectOutput.textContent = "Press Run Z7 Call to lower this supported ZObject call into the extracted F* evaluator.";
  }

  function runBrowserCall() {
    var mode = document.getElementById("fstar-call-mode").value;
    var zid = document.getElementById("fstar-call-zid").value;
    var arg0 = document.getElementById("fstar-call-arg0").value;
    var arg1 = document.getElementById("fstar-call-arg1").value;
    if (typeof root.wikifnFstarCall !== "function") {
      callOutput.textContent = JSON.stringify({
        ok: false,
        error: "missing_browser_artifact",
        message: "wikifnFstarCall was not exported by the generated artifact"
      }, null, 2);
      return;
    }
    try {
      callOutput.textContent = JSON.stringify(
        JSON.parse(root.wikifnFstarCall(mode, zid, "500", arg0, arg1)),
        null,
        2
      );
    } catch (error) {
      callOutput.textContent = JSON.stringify({
        ok: false,
        error: "browser_call_failed",
        message: String(error && error.message ? error.message : error)
      }, null, 2);
    }
  }

  function runJsonIr() {
    if (typeof root.wikifnFstarEvalJson !== "function") {
      irOutput.textContent = JSON.stringify({
        ok: false,
        error: "missing_browser_artifact",
        message: "wikifnFstarEvalJson was not exported by the generated artifact"
      }, null, 2);
      return;
    }
    try {
      irOutput.textContent = JSON.stringify(
        JSON.parse(root.wikifnFstarEvalJson(irInput.value)),
        null,
        2
      );
    } catch (error) {
      irOutput.textContent = JSON.stringify({
        ok: false,
        error: "browser_json_ir_failed",
        message: String(error && error.message ? error.message : error)
      }, null, 2);
    }
  }

  function runZObject() {
    if (typeof root.wikifnFstarEvalZObject !== "function") {
      zobjectOutput.textContent = JSON.stringify({
        ok: false,
        error: "missing_browser_artifact",
        message: "wikifnFstarEvalZObject was not exported by the generated artifact"
      }, null, 2);
      return;
    }
    try {
      zobjectOutput.textContent = JSON.stringify(
        JSON.parse(root.wikifnFstarEvalZObject(zobjectInput.value)),
        null,
        2
      );
    } catch (error) {
      zobjectOutput.textContent = JSON.stringify({
        ok: false,
        error: "browser_zobject_failed",
        message: String(error && error.message ? error.message : error)
      }, null, 2);
    }
  }
})();
