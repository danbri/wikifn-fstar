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

let add_utf8_codepoint buffer codepoint =
  let code = int_of_string (Prims.to_string codepoint) in
  let code = if code < 0 || code > 0x10ffff then 0xfffd else code in
  if code <= 0x7f then
    Buffer.add_char buffer (Char.chr code)
  else if code <= 0x7ff then begin
    Buffer.add_char buffer (Char.chr (0xc0 lor (code lsr 6)));
    Buffer.add_char buffer (Char.chr (0x80 lor (code land 0x3f)))
  end else if code <= 0xffff then begin
    Buffer.add_char buffer (Char.chr (0xe0 lor (code lsr 12)));
    Buffer.add_char buffer (Char.chr (0x80 lor ((code lsr 6) land 0x3f)));
    Buffer.add_char buffer (Char.chr (0x80 lor (code land 0x3f)))
  end else begin
    Buffer.add_char buffer (Char.chr (0xf0 lor (code lsr 18)));
    Buffer.add_char buffer (Char.chr (0x80 lor ((code lsr 12) land 0x3f)));
    Buffer.add_char buffer (Char.chr (0x80 lor ((code lsr 6) land 0x3f)));
    Buffer.add_char buffer (Char.chr (0x80 lor (code land 0x3f)))
  end

let show_text text =
  let buffer = Buffer.create (List.length text) in
  List.iter (add_utf8_codepoint buffer) text;
  Buffer.contents buffer

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
  Printf.sprintf {|{"type":"Z6","codepoints":%s,"text":"%s","ascii":"%s"}|}
    (show_codepoints text)
    (json_escape (show_text text))
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
  publish
    (Printf.sprintf
       {|{"case":"%s","result":%s}|}
       (json_escape name)
       (show_composition_result result))

let run_specialized_case name result =
  publish
    (Printf.sprintf
       {|{"case":"%s","result":%s}|}
       (json_escape name)
       (show_kernel_text_result result))

let run_extracted_composition_cases () =
  run_composition_case
    "Remove regular spaces (Z10052) on \"a b c\""
    (Wikifn_Generated_Compositions.eval_generated_z10052 (Prims.of_int 50) (text_of_ascii "a b c"));
  run_composition_case
    "ROT13 Latin alphabet (Z10627) on \"hello\""
    (Wikifn_Generated_Compositions.eval_generated_z10627 (Prims.of_int 100) (text_of_ascii "hello"));
  run_composition_case
    "Fallback if string is empty (Z11082) on empty"
    (Wikifn_Generated_Compositions.eval_generated_z11082 (Prims.of_int 50) [] (text_of_ascii "fallback"));
  run_composition_case
    "Turn to superscript (Z19612) on \"x2+y3\""
    (Wikifn_Generated_Compositions.eval_generated_z19612 (Prims.of_int 120) (text_of_ascii "x2+y3"));
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
       [Prims.of_int 2407; Prims.of_int 2408; Prims.of_int 2409]);
  run_composition_case
    "Arabic numerals to Devanagari numerals (Z22649) on \"123\""
    (Wikifn_Generated_Compositions.eval_generated_z22649 (Prims.of_int 500) (text_of_ascii "123"));
  run_composition_case
    "Digits to subscript (Z27053) on \"H2O\""
    (Wikifn_Generated_Compositions.eval_generated_z27053 (Prims.of_int 500) (text_of_ascii "H2O"))

let run_compiled_composition_cases () =
  run_specialized_case
    "Compiled F* remove regular spaces (Z10052) on \"a b c\""
    (Wikifn_Compiled_Compositions.compiled_z10052_remove_regular_spaces (text_of_ascii "a b c"));
  run_specialized_case
    "Compiled F* ROT13 Latin alphabet (Z10627) on \"hello\""
    (Wikifn_Compiled_Compositions.compiled_z10627_rot13_latin_alphabet (Prims.of_int 80) (text_of_ascii "hello"));
  run_specialized_case
    "Compiled F* fallback if string is empty (Z11082) on empty"
    (Wikifn_Compiled_Compositions.compiled_z11082_fallback_if_string_is_empty [] (text_of_ascii "fallback"));
  run_specialized_case
    "Compiled F* turn to superscript (Z19612) on \"x2+y3\""
    (Wikifn_Compiled_Compositions.compiled_z19612_turn_to_superscript (Prims.of_int 100) (text_of_ascii "x2+y3"));
  run_specialized_case
    "Compiled F* decimal comma to point (Z21679) on \"3,14\""
    (Wikifn_Compiled_Compositions.compiled_z21679_decimal_comma_to_point (text_of_ascii "3,14"));
  run_specialized_case
    "Compiled F* French contractions (Z38114) on \"de les amis et de le chat\""
    (Wikifn_Compiled_Compositions.compiled_z38114_french_contractions (text_of_ascii "de les amis et de le chat"));
  run_specialized_case
    "Compiled F* Devanagari digits to Arabic digits (Z22294) on codepoints [2407,2408,2409]"
    (Wikifn_Compiled_Compositions.compiled_z22294_devanagari_digits_to_arabic_digits
       (Prims.of_int 20)
       [Prims.of_int 2407; Prims.of_int 2408; Prims.of_int 2409]);
  run_specialized_case
    "Compiled F* Arabic numerals to Devanagari numerals (Z22649) on \"123\""
    (Wikifn_Compiled_Compositions.compiled_z22649_arabic_numerals_to_devanagari_numerals
       (Prims.of_int 20)
       (text_of_ascii "123"));
  run_specialized_case
    "Compiled F* digits to subscript (Z27053) on \"H2O\""
    (Wikifn_Compiled_Compositions.compiled_z27053_digits_to_subscript
       (Prims.of_int 20)
       (text_of_ascii "H2O"))

let run_specialized_composition_cases () =
  run_specialized_case
    "Specialized F* remove regular spaces (Z10052) on \"a b c\""
    (Wikifn_Specialized_Compositions.z10052_remove_regular_spaces (text_of_ascii "a b c"));
  run_specialized_case
    "Specialized F* ROT13 Latin alphabet (Z10627) on \"hello\""
    (Wikifn_Specialized_Compositions.z10627_rot13_latin_alphabet (Prims.of_int 80) (text_of_ascii "hello"));
  run_specialized_case
    "Specialized F* fallback if string is empty (Z11082) on empty"
    (Wikifn_Specialized_Compositions.z11082_fallback_if_string_is_empty [] (text_of_ascii "fallback"));
  run_specialized_case
    "Specialized F* turn to superscript (Z19612) on \"x2+y3\""
    (Wikifn_Specialized_Compositions.z19612_turn_to_superscript (Prims.of_int 100) (text_of_ascii "x2+y3"));
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
       [Prims.of_int 2407; Prims.of_int 2408; Prims.of_int 2409]);
  run_specialized_case
    "Specialized F* Arabic numerals to Devanagari numerals (Z22649) on \"123\""
    (Wikifn_Specialized_Compositions.z22649_arabic_numerals_to_devanagari_numerals
       (Prims.of_int 20)
       (text_of_ascii "123"));
  run_specialized_case
    "Specialized F* digits to subscript (Z27053) on \"H2O\""
    (Wikifn_Specialized_Compositions.z27053_digits_to_subscript
       (Prims.of_int 20)
       (text_of_ascii "H2O"))

let () =
  let open Wikifn_Primitives in
  run_case "Z782 is_zero(0)" PIsZero (VNat Prims.int_zero);
  run_case "Z783 successor(2)" PSuccessor (VNat (Prims.of_int 2));
  run_case "Z784 predecessor(2)" PPredecessor (VNat (Prims.of_int 2));
  run_case "Z784 predecessor(0)" PPredecessor (VNat Prims.int_zero);
  run_extracted_composition_cases ();
  run_compiled_composition_cases ();
  run_specialized_composition_cases ()
