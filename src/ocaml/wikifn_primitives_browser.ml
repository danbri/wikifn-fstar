external publish : string -> unit = "wikifn_publish"

let show_value = function
  | Wikifn_Primitives.VNat n ->
      Printf.sprintf {|{"type":"Z10","value":"%s"}|} (Prims.to_string n)
  | Wikifn_Primitives.VBool b ->
      Printf.sprintf {|{"type":"Z40","value":%s}|} (if b then "true" else "false")

let show_error = function
  | Wikifn_Primitives.TypeMismatch -> "type_mismatch"
  | Wikifn_Primitives.Underflow -> "underflow"

let show_result = function
  | Wikifn_Primitives.POk value ->
      Printf.sprintf {|{"ok":true,"value":%s}|} (show_value value)
  | Wikifn_Primitives.PErr error ->
      Printf.sprintf {|{"ok":false,"error":"%s"}|} (show_error error)

let run_case name primitive value =
  let result = Wikifn_Primitives.eval_unary primitive value in
  publish (Printf.sprintf {|{"case":"%s","result":%s}|} name (show_result result))

let () =
  let open Wikifn_Primitives in
  run_case "Z782 is_zero(0)" PIsZero (VNat Prims.int_zero);
  run_case "Z783 successor(2)" PSuccessor (VNat (Prims.of_int 2));
  run_case "Z784 predecessor(2)" PPredecessor (VNat (Prims.of_int 2));
  run_case "Z784 predecessor(0)" PPredecessor (VNat Prims.int_zero)
