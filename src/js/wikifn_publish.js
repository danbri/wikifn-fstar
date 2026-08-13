//Provides: wikifn_publish
//Requires: caml_jsstring_of_string
function wikifn_publish(value) {
  var text = caml_jsstring_of_string(value);
  var root = typeof globalThis !== "undefined" ? globalThis : window;
  root.wikifnFstarPrimitiveDemoOutput = root.wikifnFstarPrimitiveDemoOutput || [];
  root.wikifnFstarPrimitiveDemoOutput.push(text);
  if (root.document) {
    var target = root.document.getElementById("fstar-extraction-output");
    if (target) {
      target.textContent += text + "\n";
    }
  }
  return 0;
}
