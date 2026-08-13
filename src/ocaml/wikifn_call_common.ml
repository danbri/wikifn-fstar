type call_path =
  | Generated
  | Compiled
  | Specialized

let default_fuel = 500

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

let show_generated_result = function
  | Wikifn_Composition.EOk value ->
      Printf.sprintf {|{"ok":true,"value":%s}|} (show_composition_value value)
  | Wikifn_Composition.EErr error ->
      Printf.sprintf {|{"ok":false,"error":"%s"}|} (show_composition_error error)

let show_kernel_text_result = function
  | Wikifn_Primitive_Kernel.KOk text ->
      Printf.sprintf {|{"ok":true,"value":%s}|} (show_text_value text)
  | Wikifn_Primitive_Kernel.KErr error ->
      Printf.sprintf {|{"ok":false,"error":"%s"}|} (show_kernel_error error)

let byte s index = Char.code s.[index]

let continuation s index =
  index < String.length s && byte s index land 0xc0 = 0x80

let replacement = Prims.of_int 0xfffd

let decode_utf8 s =
  let length = String.length s in
  let rec loop index acc =
    if index >= length then
      List.rev acc
    else
      let b0 = byte s index in
      if b0 land 0x80 = 0 then
        loop (index + 1) (Prims.of_int b0 :: acc)
      else if b0 land 0xe0 = 0xc0 && continuation s (index + 1) then
        let b1 = byte s (index + 1) in
        let code = ((b0 land 0x1f) lsl 6) lor (b1 land 0x3f) in
        if code >= 0x80 then
          loop (index + 2) (Prims.of_int code :: acc)
        else
          loop (index + 1) (replacement :: acc)
      else if b0 land 0xf0 = 0xe0
              && continuation s (index + 1)
              && continuation s (index + 2) then
        let b1 = byte s (index + 1) in
        let b2 = byte s (index + 2) in
        let code =
          ((b0 land 0x0f) lsl 12) lor ((b1 land 0x3f) lsl 6) lor (b2 land 0x3f)
        in
        if code >= 0x800 && (code < 0xd800 || code > 0xdfff) then
          loop (index + 3) (Prims.of_int code :: acc)
        else
          loop (index + 1) (replacement :: acc)
      else if b0 land 0xf8 = 0xf0
              && continuation s (index + 1)
              && continuation s (index + 2)
              && continuation s (index + 3) then
        let b1 = byte s (index + 1) in
        let b2 = byte s (index + 2) in
        let b3 = byte s (index + 3) in
        let code =
          ((b0 land 0x07) lsl 18)
          lor ((b1 land 0x3f) lsl 12)
          lor ((b2 land 0x3f) lsl 6)
          lor (b3 land 0x3f)
        in
        if code >= 0x10000 && code <= 0x10ffff then
          loop (index + 4) (Prims.of_int code :: acc)
        else
          loop (index + 1) (replacement :: acc)
      else
        loop (index + 1) (replacement :: acc)
  in
  loop 0 []

let parse_path = function
  | "generated" -> Some Generated
  | "compiled" -> Some Compiled
  | "specialized" -> Some Specialized
  | _ -> None

let show_path = function
  | Generated -> "generated"
  | Compiled -> "compiled"
  | Specialized -> "specialized"

let path_from_case_name = function
  | Generated -> "generated F* IR interpreted by extracted F*"
  | Compiled -> "generated direct F* function"
  | Specialized -> "hand-maintained direct F* specialization"

let specs =
  [
    ("Z10052", "remove regular spaces", 1);
    ("Z10627", "ROT13 Latin alphabet", 1);
    ("Z11082", "fallback if string is empty", 2);
    ("Z19612", "turn to superscript", 1);
    ("Z21679", "decimal comma to point", 1);
    ("Z22294", "Devanagari digits to Arabic digits", 1);
    ("Z22649", "Arabic numerals to Devanagari numerals", 1);
    ("Z27053", "digits to subscript", 1);
    ("Z38114", "French contractions", 1);
  ]

let spec_for_zid zid =
  List.find_opt (fun (candidate, _, _) -> candidate = zid) specs

let supported_json () =
  let entries =
    List.map
      (fun (zid, label, arity) ->
        Printf.sprintf {|{"zid":"%s","label":"%s","arity":%d}|}
          zid
          (json_escape label)
          arity)
      specs
  in
  "[" ^ String.concat "," entries ^ "]"

let arg_json args =
  "[" ^ String.concat "," (List.map (fun arg -> "\"" ^ json_escape arg ^ "\"") args) ^ "]"

let decoded_arg_json args =
  "[" ^ String.concat "," (List.map (fun arg -> show_codepoints (decode_utf8 arg)) args) ^ "]"

let ok_envelope path zid label args fuel result =
  Printf.sprintf
    {|{"ok":true,"path":"%s","source":"%s","zid":"%s","label":"%s","fuel":%d,"args":%s,"argCodepoints":%s,"result":%s}|}
    (show_path path)
    (json_escape (path_from_case_name path))
    zid
    (json_escape label)
    fuel
    (arg_json args)
    (decoded_arg_json args)
    result

let error_envelope ?(code = "usage") message =
  Printf.sprintf {|{"ok":false,"error":"%s","message":"%s","supported":%s}|}
    (json_escape code)
    (json_escape message)
    (supported_json ())

let eval_generated zid fuel text_args =
  let fuel = Prims.of_int fuel in
  match (zid, text_args) with
  | "Z10052", [a] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z10052 fuel (decode_utf8 a))
  | "Z10627", [a] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z10627 fuel (decode_utf8 a))
  | "Z11082", [a; b] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z11082 fuel (decode_utf8 a) (decode_utf8 b))
  | "Z19612", [a] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z19612 fuel (decode_utf8 a))
  | "Z21679", [a] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z21679 fuel (decode_utf8 a))
  | "Z22294", [a] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z22294 fuel (decode_utf8 a))
  | "Z22649", [a] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z22649 fuel (decode_utf8 a))
  | "Z27053", [a] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z27053 fuel (decode_utf8 a))
  | "Z38114", [a] ->
      show_generated_result
        (Wikifn_Generated_Compositions.eval_generated_z38114 fuel (decode_utf8 a))
  | _ -> error_envelope ~code:"unsupported" "unsupported generated call"

let eval_compiled zid fuel text_args =
  let fuel = Prims.of_int fuel in
  match (zid, text_args) with
  | "Z10052", [a] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z10052_remove_regular_spaces (decode_utf8 a))
  | "Z10627", [a] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z10627_rot13_latin_alphabet fuel (decode_utf8 a))
  | "Z11082", [a; b] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z11082_fallback_if_string_is_empty
           (decode_utf8 a)
           (decode_utf8 b))
  | "Z19612", [a] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z19612_turn_to_superscript fuel (decode_utf8 a))
  | "Z21679", [a] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z21679_decimal_comma_to_point (decode_utf8 a))
  | "Z22294", [a] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z22294_devanagari_digits_to_arabic_digits
           fuel
           (decode_utf8 a))
  | "Z22649", [a] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z22649_arabic_numerals_to_devanagari_numerals
           fuel
           (decode_utf8 a))
  | "Z27053", [a] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z27053_digits_to_subscript fuel (decode_utf8 a))
  | "Z38114", [a] ->
      show_kernel_text_result
        (Wikifn_Compiled_Compositions.compiled_z38114_french_contractions (decode_utf8 a))
  | _ -> error_envelope ~code:"unsupported" "unsupported compiled call"

let eval_specialized zid fuel text_args =
  let fuel = Prims.of_int fuel in
  match (zid, text_args) with
  | "Z10052", [a] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z10052_remove_regular_spaces (decode_utf8 a))
  | "Z10627", [a] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z10627_rot13_latin_alphabet fuel (decode_utf8 a))
  | "Z11082", [a; b] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z11082_fallback_if_string_is_empty
           (decode_utf8 a)
           (decode_utf8 b))
  | "Z19612", [a] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z19612_turn_to_superscript fuel (decode_utf8 a))
  | "Z21679", [a] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z21679_decimal_comma_to_point (decode_utf8 a))
  | "Z22294", [a] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z22294_devanagari_digits_to_arabic_digits
           fuel
           (decode_utf8 a))
  | "Z22649", [a] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z22649_arabic_numerals_to_devanagari_numerals
           fuel
           (decode_utf8 a))
  | "Z27053", [a] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z27053_digits_to_subscript fuel (decode_utf8 a))
  | "Z38114", [a] ->
      show_kernel_text_result
        (Wikifn_Specialized_Compositions.z38114_french_contractions (decode_utf8 a))
  | _ -> error_envelope ~code:"unsupported" "unsupported specialized call"

let evaluate path zid fuel args =
  match spec_for_zid zid with
  | None ->
      error_envelope ~code:"unsupported" ("unsupported function " ^ zid)
  | Some (_, label, arity) when List.length args <> arity ->
      error_envelope
        ~code:"arity"
        (Printf.sprintf "%s expects %d text argument(s)" zid arity)
  | Some (_, label, _) ->
      let result =
        match path with
        | Generated -> eval_generated zid fuel args
        | Compiled -> eval_compiled zid fuel args
        | Specialized -> eval_specialized zid fuel args
      in
      ok_envelope path zid label args fuel result
