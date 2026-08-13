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
  Printf.printf {|{"case":"%s","result":%s}|} name (show_result result);
  print_newline ()

let json_escape s =
  let buffer = Buffer.create (String.length s) in
  String.iter
    (function
      | '"' -> Buffer.add_string buffer "\\\""
      | '\\' -> Buffer.add_string buffer "\\\\"
      | '\n' -> Buffer.add_string buffer "\\n"
      | '\r' -> Buffer.add_string buffer "\\r"
      | '\t' -> Buffer.add_string buffer "\\t"
      | ch -> if Char.code ch >= 32 then Buffer.add_char buffer ch)
    s;
  Buffer.contents buffer

let show_codepoints text =
  "[" ^ String.concat "," (List.map Prims.to_string text) ^ "]"

let show_ascii text =
  let buffer = Buffer.create (List.length text) in
  List.iter
    (fun codepoint ->
      let code = int_of_string (Prims.to_string codepoint) in
      if code >= 32 && code <= 126 && code <> 34 && code <> 92 then
        Buffer.add_char buffer (Char.chr code))
    text;
  Buffer.contents buffer

let text_of_ascii s =
  List.init (String.length s) (fun index -> Prims.of_int (Char.code s.[index]))

let show_kernel_error = function
  | Wikifn_Primitive_Kernel.KTypeMismatch -> "type_mismatch"
  | Wikifn_Primitive_Kernel.KUnderflow -> "underflow"
  | Wikifn_Primitive_Kernel.KEmptyPattern -> "empty_pattern"
  | Wikifn_Primitive_Kernel.KFuelExhausted -> "fuel_exhausted"

let show_composition_error = function
  | Wikifn_Composition.EFuelExhausted -> "fuel_exhausted"
  | Wikifn_Composition.EUnboundArgument -> "unbound_argument"
  | Wikifn_Composition.EArityMismatch -> "arity_mismatch"
  | Wikifn_Composition.ETypeMismatch -> "type_mismatch"
  | Wikifn_Composition.EPrimitiveError error ->
      "primitive_" ^ show_kernel_error error

let show_text_value text =
  Printf.sprintf {|{"type":"Z6","codepoints":%s,"ascii":"%s"}|}
    (show_codepoints text)
    (json_escape (show_ascii text))

let show_composition_value = function
  | Wikifn_Composition.VBool b ->
      Printf.sprintf {|{"type":"Z40","value":%s}|} (if b then "true" else "false")
  | Wikifn_Composition.VNat n ->
      Printf.sprintf {|{"type":"Z10","value":"%s"}|} (Prims.to_string n)
  | Wikifn_Composition.VText text ->
      show_text_value text

let show_composition_result = function
  | Wikifn_Composition.EOk value ->
      Printf.sprintf {|{"ok":true,"value":%s}|} (show_composition_value value)
  | Wikifn_Composition.EErr error ->
      Printf.sprintf {|{"ok":false,"error":"%s"}|} (show_composition_error error)

let show_kernel_text_result = function
  | Wikifn_Primitive_Kernel.KOk text ->
      Printf.sprintf {|{"ok":true,"value":%s}|} (show_text_value text)
  | Wikifn_Primitive_Kernel.KErr error ->
      Printf.sprintf {|{"ok":false,"error":"%s"}|} (show_kernel_error error)

let run_composition_case name result =
  Printf.printf {|{"case":"%s","result":%s}|}
    (json_escape name)
    (show_composition_result result);
  print_newline ()

let run_specialized_case name result =
  Printf.printf {|{"case":"%s","result":%s}|}
    (json_escape name)
    (show_kernel_text_result result);
  print_newline ()

let run_extracted_composition_cases () =
  run_composition_case
    "Remove regular spaces (Z10052) on \"a b c\""
    (Wikifn_Generated_Compositions.eval_generated_z10052 (Prims.of_int 50) (text_of_ascii "a b c"));
  run_composition_case
    "Decimal comma to point (Z21679) on \"3,14\""
    (Wikifn_Generated_Compositions.eval_generated_z21679 (Prims.of_int 50) (text_of_ascii "3,14"));
  run_composition_case
    "French contractions (Z38114) on \"de les amis et de le chat\""
    (Wikifn_Generated_Compositions.eval_generated_z38114 (Prims.of_int 50) (text_of_ascii "de les amis et de le chat"));
  run_composition_case
    "Devanagari digits to Arabic digits (Z22294) on codepoints [2407,2408,2409]"
    (Wikifn_Generated_Compositions.eval_generated_z22294
       (Prims.of_int 500)
       [Prims.of_int 2407; Prims.of_int 2408; Prims.of_int 2409])

let run_specialized_composition_cases () =
  run_specialized_case
    "Specialized F* remove regular spaces (Z10052) on \"a b c\""
    (Wikifn_Specialized_Compositions.z10052_remove_regular_spaces (text_of_ascii "a b c"));
  run_specialized_case
    "Specialized F* decimal comma to point (Z21679) on \"3,14\""
    (Wikifn_Specialized_Compositions.z21679_decimal_comma_to_point (text_of_ascii "3,14"));
  run_specialized_case
    "Specialized F* French contractions (Z38114) on \"de les amis et de le chat\""
    (Wikifn_Specialized_Compositions.z38114_french_contractions (text_of_ascii "de les amis et de le chat"));
  run_specialized_case
    "Specialized F* Devanagari digits to Arabic digits (Z22294) on codepoints [2407,2408,2409]"
    (Wikifn_Specialized_Compositions.z22294_devanagari_digits_to_arabic_digits
       (Prims.of_int 20)
       [Prims.of_int 2407; Prims.of_int 2408; Prims.of_int 2409])

let () =
  let open Wikifn_Primitives in
  run_case "Z782 is_zero(0)" PIsZero (VNat Prims.int_zero);
  run_case "Z783 successor(2)" PSuccessor (VNat (Prims.of_int 2));
  run_case "Z784 predecessor(2)" PPredecessor (VNat (Prims.of_int 2));
  run_case "Z784 predecessor(0)" PPredecessor (VNat Prims.int_zero);
  run_extracted_composition_cases ();
  run_specialized_composition_cases ()
