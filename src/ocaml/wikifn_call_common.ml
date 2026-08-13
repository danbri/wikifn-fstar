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

let json_member name = function
  | `Assoc fields -> List.assoc_opt name fields
  | _ -> None

let int_of_json = function
  | `Int value when value >= 0 -> Ok value
  | `Int _ -> Error "expected non-negative integer"
  | `String value -> begin
      try
        let parsed = int_of_string value in
        if parsed >= 0 then Ok parsed else Error "expected non-negative integer"
      with
      | Failure _ -> Error "expected integer string"
    end
  | _ -> Error "expected integer"

let parse_function_id = function
  | "Z802" -> Ok Wikifn_Composition.FZ802
  | "Z866" -> Ok Wikifn_Composition.FZ866
  | "Z10008" -> Ok Wikifn_Composition.FZ10008
  | "Z10000" -> Ok Wikifn_Composition.FZ10000
  | "Z10075" -> Ok Wikifn_Composition.FZ10075
  | "Z10901" -> Ok Wikifn_Composition.FZ10901
  | "Z10615" -> Ok Wikifn_Composition.FZ10615
  | "Z11040" -> Ok Wikifn_Composition.FZ11040
  | "Z14124" -> Ok Wikifn_Composition.FZ14124
  | "Z14456" -> Ok Wikifn_Composition.FZ14456
  | "Z14520" -> Ok Wikifn_Composition.FZ14520
  | "Z10174" -> Ok Wikifn_Composition.FZ10174
  | "Z10184" -> Ok Wikifn_Composition.FZ10184
  | "Z10216" -> Ok Wikifn_Composition.FZ10216
  | "Z13522" -> Ok Wikifn_Composition.FZ13522
  | "Z13569" -> Ok Wikifn_Composition.FZ13569
  | "Z13582" -> Ok Wikifn_Composition.FZ13582
  | "Z13676" -> Ok Wikifn_Composition.FZ13676
  | "Z13682" -> Ok Wikifn_Composition.FZ13682
  | "Z13689" -> Ok Wikifn_Composition.FZ13689
  | "Z13695" -> Ok Wikifn_Composition.FZ13695
  | "Z10052" -> Ok Wikifn_Composition.FZ10052
  | "Z10627" -> Ok Wikifn_Composition.FZ10627
  | "Z11082" -> Ok Wikifn_Composition.FZ11082
  | "Z14613" -> Ok Wikifn_Composition.FZ14613
  | "Z19612" -> Ok Wikifn_Composition.FZ19612
  | "Z21679" -> Ok Wikifn_Composition.FZ21679
  | "Z22294" -> Ok Wikifn_Composition.FZ22294
  | "Z22649" -> Ok Wikifn_Composition.FZ22649
  | "Z27053" -> Ok Wikifn_Composition.FZ27053
  | "Z38114" -> Ok Wikifn_Composition.FZ38114
  | "InternalFreshPrivateUse" -> Ok Wikifn_Composition.FInternalFreshPrivateUse
  | zid -> Error ("unsupported function id in JSON IR: " ^ zid)

let starts_with ~prefix value =
  let prefix_len = String.length prefix in
  String.length value >= prefix_len && String.sub value 0 prefix_len = prefix

let parse_ref_zid = function
  | `String zid -> Ok zid
  | `Assoc fields -> begin
      match List.assoc_opt "Z9K1" fields with
      | Some (`String zid) -> Ok zid
      | _ -> Error "expected ZID string or Z9 reference"
    end
  | _ -> Error "expected ZID string or Z9 reference"

let rec parse_codepoints acc = function
  | [] -> Ok (List.rev acc)
  | item :: rest -> begin
      match int_of_json item with
      | Ok value when value <= 0x10ffff ->
          parse_codepoints (Prims.of_int value :: acc) rest
      | Ok _ -> Error "codepoint out of Unicode range"
      | Error message -> Error message
    end

let rec parse_expr_json json =
  match json with
  | `String text ->
      Ok (Wikifn_Composition.EValue (Wikifn_Composition.VText (decode_utf8 text)))
  | `Bool value ->
      Ok (Wikifn_Composition.EValue (Wikifn_Composition.VBool value))
  | `Int value when value >= 0 ->
      Ok (Wikifn_Composition.EValue (Wikifn_Composition.VNat (Prims.of_int value)))
  | `Int _ ->
      Error "negative JSON integer cannot become a Wikifn nat"
  | `Assoc _ -> parse_expr_object json
  | _ -> Error "unsupported JSON IR expression"

and parse_expr_object json =
  match json_member "text" json with
  | Some (`String text) ->
      Ok (Wikifn_Composition.EValue (Wikifn_Composition.VText (decode_utf8 text)))
  | Some _ -> Error "text field must be a string"
  | None ->
      match json_member "codepoints" json with
      | Some (`List items) -> begin
          match parse_codepoints [] items with
          | Ok text ->
              Ok (Wikifn_Composition.EValue (Wikifn_Composition.VText text))
          | Error message -> Error message
        end
      | Some _ -> Error "codepoints field must be a list"
      | None ->
          match json_member "bool" json with
          | Some (`Bool value) ->
              Ok (Wikifn_Composition.EValue (Wikifn_Composition.VBool value))
          | Some _ -> Error "bool field must be a boolean"
          | None ->
              match json_member "nat" json with
              | Some value -> begin
                  match int_of_json value with
                  | Ok nat ->
                      Ok (Wikifn_Composition.EValue (Wikifn_Composition.VNat (Prims.of_int nat)))
                  | Error message -> Error message
                end
              | None ->
                  match json_member "arg" json with
                  | Some value -> begin
                      match int_of_json value with
                      | Ok index -> Ok (Wikifn_Composition.EArg (Prims.of_int index))
                      | Error message -> Error message
                    end
                  | None -> parse_call_object json

and parse_call_object json =
  match json_member "call" json with
  | Some (`String zid) -> begin
      match parse_function_id zid with
      | Error message -> Error message
      | Ok fid -> begin
          match json_member "args" json with
          | Some (`List items) -> begin
              match parse_expr_list [] items with
              | Ok args -> Ok (Wikifn_Composition.ECall (fid, args))
              | Error message -> Error message
            end
          | Some _ -> Error "call args field must be a list"
          | None -> Ok (Wikifn_Composition.ECall (fid, []))
        end
    end
  | Some _ -> Error "call field must be a string ZID"
  | None -> Error "JSON IR object needs text, codepoints, bool, nat, arg, or call"

and parse_expr_list acc = function
  | [] -> Ok (List.rev acc)
  | item :: rest -> begin
      match parse_expr_json item with
      | Ok expr -> parse_expr_list (expr :: acc) rest
      | Error message -> Error message
    end

let call_arg_index zid key =
  let prefix = zid ^ "K" in
  if starts_with ~prefix key then
    let suffix = String.sub key (String.length prefix) (String.length key - String.length prefix) in
    try
      let index = int_of_string suffix in
      if index > 0 then Some index else None
    with
    | Failure _ -> None
  else
    None

let zobject_nat_value json =
  match int_of_json json with
  | Ok nat -> Ok nat
  | Error message -> Error message

let zobject_bool_value = function
  | `String "Z41" -> Ok true
  | `String "Z42" -> Ok false
  | `Assoc fields -> begin
      match List.assoc_opt "Z40K1" fields with
      | Some (`String "Z41") -> Ok true
      | Some (`String "Z42") -> Ok false
      | _ -> Error "expected Z40K1 boolean identity Z41 or Z42"
    end
  | _ -> Error "expected Z40K1 boolean identity Z41 or Z42"

let rec parse_zobject_expr json =
  match json with
  | `String text ->
      Ok (Wikifn_Composition.EValue (Wikifn_Composition.VText (decode_utf8 text)))
  | `Assoc fields -> parse_zobject_object fields
  | _ -> parse_expr_json json

and parse_zobject_object fields =
  match List.assoc_opt "Z7K1" fields with
  | Some function_ref -> parse_zobject_call fields function_ref
  | None ->
      match List.assoc_opt "Z1K1" fields with
      | Some (`String "Z6") -> begin
          match List.assoc_opt "Z6K1" fields with
          | Some (`String text) ->
              Ok (Wikifn_Composition.EValue (Wikifn_Composition.VText (decode_utf8 text)))
          | _ -> Error "Z6 object needs string Z6K1"
        end
      | Some (`String "Z10") -> begin
          match List.assoc_opt "Z10K1" fields with
          | Some value -> begin
              match zobject_nat_value value with
              | Ok nat ->
                  Ok (Wikifn_Composition.EValue (Wikifn_Composition.VNat (Prims.of_int nat)))
              | Error message -> Error message
            end
          | None -> Error "Z10 object needs Z10K1"
        end
      | Some (`String "Z13518") -> begin
          match List.assoc_opt "Z13518K1" fields with
          | Some value -> begin
              match zobject_nat_value value with
              | Ok nat ->
                  Ok (Wikifn_Composition.EValue (Wikifn_Composition.VNat (Prims.of_int nat)))
              | Error message -> Error message
            end
          | None -> Error "Z13518 object needs Z13518K1"
        end
      | Some (`String "Z40") -> begin
          match zobject_bool_value (`Assoc fields) with
          | Ok value ->
              Ok (Wikifn_Composition.EValue (Wikifn_Composition.VBool value))
          | Error message -> Error message
        end
      | _ -> parse_expr_object (`Assoc fields)

and parse_zobject_call fields function_ref =
  match parse_ref_zid function_ref with
  | Error message -> Error message
  | Ok zid -> begin
      match parse_function_id zid with
      | Error message -> Error message
      | Ok fid -> begin
          match parse_zobject_call_args zid fields with
          | Error message -> Error message
          | Ok args -> Ok (Wikifn_Composition.ECall (fid, args))
        end
    end

and parse_zobject_call_args zid fields =
  let rec collect acc = function
    | [] -> Ok acc
    | (key, value) :: rest -> begin
        match call_arg_index zid key with
        | None -> collect acc rest
        | Some index -> begin
            match parse_zobject_expr value with
            | Ok expr -> collect ((index, expr) :: acc) rest
            | Error message -> Error message
          end
      end
  in
  match collect [] fields with
  | Error message -> Error message
  | Ok indexed ->
      let sorted = List.sort (fun (left, _) (right, _) -> compare left right) indexed in
      Ok (List.map snd sorted)

let json_request_fuel json =
  match json_member "fuel" json with
  | None -> default_fuel
  | Some value -> begin
      match int_of_json value with
      | Ok fuel -> fuel
      | Error _ -> default_fuel
    end

let json_request_expr json =
  match json_member "expr" json with
  | Some expr -> expr
  | None -> json

let eval_json_envelope fuel result =
  Printf.sprintf
    {|{"ok":true,"path":"json-ir","source":"runtime JSON IR interpreted by extracted F*","policy":"Wikifn.Generated.Compositions.generated_policy","fuel":%d,"result":%s}|}
    fuel
    result

let eval_zobject_envelope fuel result =
  Printf.sprintf
    {|{"ok":true,"path":"zobject","source":"supported Z7 call object lowered to extracted F*","policy":"Wikifn.Generated.Compositions.generated_policy","fuel":%d,"result":%s}|}
    fuel
    result

let evaluate_json_ir_text json_text =
  try
    let json = Yojson.Safe.from_string json_text in
    let fuel = json_request_fuel json in
    match parse_expr_json (json_request_expr json) with
    | Error message -> error_envelope ~code:"json_ir" message
    | Ok expr ->
        eval_json_envelope
          fuel
          (show_generated_result
             (Wikifn_Composition.eval_with_policy
                Wikifn_Generated_Compositions.generated_policy
                (Prims.of_int fuel)
                []
                expr))
  with
  | Yojson.Json_error message ->
      error_envelope ~code:"json" message

let evaluate_zobject_text json_text =
  try
    let json = Yojson.Safe.from_string json_text in
    let fuel = json_request_fuel json in
    match parse_zobject_expr (json_request_expr json) with
    | Error message -> error_envelope ~code:"zobject" message
    | Ok expr ->
        eval_zobject_envelope
          fuel
          (show_generated_result
             (Wikifn_Composition.eval_with_policy
                Wikifn_Generated_Compositions.generated_policy
                (Prims.of_int fuel)
                []
                expr))
  with
  | Yojson.Json_error message ->
      error_envelope ~code:"json" message
