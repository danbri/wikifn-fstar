open Js_of_ocaml

let parse_fuel text =
  try
    let value = int_of_string text in
    if value >= 0 then value else Wikifn_call_common.default_fuel
  with
  | Failure _ -> Wikifn_call_common.default_fuel

let args_for_zid zid arg0 arg1 =
  match Wikifn_call_common.spec_for_zid zid with
  | Some (_, _, 2) -> [arg0; arg1]
  | _ -> [arg0]

let call mode_js zid_js fuel_js arg0_js arg1_js =
  let mode = Js.to_string mode_js in
  let zid = Js.to_string zid_js in
  let fuel = parse_fuel (Js.to_string fuel_js) in
  let arg0 = Js.to_string arg0_js in
  let arg1 = Js.to_string arg1_js in
  let result =
    match Wikifn_call_common.parse_path mode with
    | Some path ->
        Wikifn_call_common.evaluate path zid fuel (args_for_zid zid arg0 arg1)
    | None ->
        Wikifn_call_common.error_envelope
          ~code:"mode"
          ("unknown mode " ^ mode)
  in
  Js.string result

let list_supported () =
  Js.string
    (Printf.sprintf {|{"ok":true,"supported":%s}|}
       (Wikifn_call_common.supported_json ()))

let () =
  Js.Unsafe.set
    Js.Unsafe.global
    "wikifnFstarCall"
    (Js.Unsafe.callback call);
  Js.Unsafe.set
    Js.Unsafe.global
    "wikifnFstarSupported"
    (Js.Unsafe.callback list_supported)
