open Js_of_ocaml

(* Exposes the Wikifn.Eval engine to JavaScript. Callers pass a ZID; the
   natural-language name lookup lives in the JavaScript layer, which reads
   docs/generated/functions.json.

   Written without the js_of_ocaml PPX so the build needs no preprocessor. *)

let call zid_js fuel_js args_js =
  let zid = Js.to_string zid_js in
  let fuel = try int_of_string (Js.to_string fuel_js) with Failure _ -> 0 in
  let args = Js.to_string args_js in
  Js.string (Wikifn_engine.call zid fuel args)

let source zid_js arity_js names_js =
  let zid = Js.to_string zid_js in
  let arity = try int_of_string (Js.to_string arity_js) with Failure _ -> 0 in
  let names = Js.to_string names_js in
  Js.string (Wikifn_engine.source zid arity names)

let () =
  Js.Unsafe.set
    Js.Unsafe.global
    (Js.string "wikifnEngineCall")
    (Js.Unsafe.inject (Js.wrap_callback call));
  Js.Unsafe.set
    Js.Unsafe.global
    (Js.string "wikifnEngineSource")
    (Js.Unsafe.inject (Js.wrap_callback source))
