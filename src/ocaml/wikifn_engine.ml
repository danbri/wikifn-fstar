(* Runner for the Wikifn.Eval engine.

   This is boundary glue only: UTF-8 in and out, JSON in and out, and the call
   into the extracted evaluator. It decides nothing about what a ZObject means.
   Values are encoded so that a caller can see exactly what came back. *)

let default_fuel = 5000

(* --- UTF-8 --------------------------------------------------------------- *)

let decode_utf8 text =
  let length = String.length text in
  let rec go index acc =
    if index >= length then List.rev acc
    else
      let byte = Char.code text.[index] in
      let continuation offset = Char.code text.[index + offset] land 0x3f in
      if byte < 0x80 then go (index + 1) (byte :: acc)
      else if byte < 0xe0 && index + 1 < length then
        go (index + 2) ((((byte land 0x1f) lsl 6) lor continuation 1) :: acc)
      else if byte < 0xf0 && index + 2 < length then
        go (index + 3)
          ((((byte land 0x0f) lsl 12) lor (continuation 1 lsl 6) lor continuation 2) :: acc)
      else if index + 3 < length then
        go (index + 4)
          ((((byte land 0x07) lsl 18) lor (continuation 1 lsl 12)
            lor (continuation 2 lsl 6) lor continuation 3) :: acc)
      else go (index + 1) (0xfffd :: acc)
  in
  go 0 []

let encode_utf8 codepoints =
  let buffer = Buffer.create 32 in
  let add n =
    if n < 0x80 then Buffer.add_char buffer (Char.chr n)
    else if n < 0x800 then begin
      Buffer.add_char buffer (Char.chr (0xc0 lor (n lsr 6)));
      Buffer.add_char buffer (Char.chr (0x80 lor (n land 0x3f)))
    end else if n < 0x10000 then begin
      Buffer.add_char buffer (Char.chr (0xe0 lor (n lsr 12)));
      Buffer.add_char buffer (Char.chr (0x80 lor ((n lsr 6) land 0x3f)));
      Buffer.add_char buffer (Char.chr (0x80 lor (n land 0x3f)))
    end else begin
      Buffer.add_char buffer (Char.chr (0xf0 lor (n lsr 18)));
      Buffer.add_char buffer (Char.chr (0x80 lor ((n lsr 12) land 0x3f)));
      Buffer.add_char buffer (Char.chr (0x80 lor ((n lsr 6) land 0x3f)));
      Buffer.add_char buffer (Char.chr (0x80 lor (n land 0x3f)))
    end
  in
  List.iter (fun n -> add (Z.to_int n)) codepoints;
  Buffer.contents buffer

(* --- JSON ---------------------------------------------------------------- *)

let json_escape text =
  let buffer = Buffer.create (String.length text + 8) in
  String.iter
    (fun c ->
      match c with
      | '"' -> Buffer.add_string buffer "\\\""
      | '\\' -> Buffer.add_string buffer "\\\\"
      | '\n' -> Buffer.add_string buffer "\\n"
      | '\r' -> Buffer.add_string buffer "\\r"
      | '\t' -> Buffer.add_string buffer "\\t"
      | c when Char.code c < 0x20 ->
          Buffer.add_string buffer (Printf.sprintf "\\u%04x" (Char.code c))
      | c -> Buffer.add_char buffer c)
    text;
  Buffer.contents buffer

let quote text = "\"" ^ json_escape text ^ "\""

(* A key is Z10627K1 when it names its owner and K1 when it does not. Both
   spellings occur, so both are rendered rather than normalised. *)
let encode_zkey (k : Wikifn_Zid.zkey) =
  let index = Z.to_string k.Wikifn_Zid.key_index in
  match k.Wikifn_Zid.key_owner with
  | FStar_Pervasives_Native.Some owner -> Printf.sprintf "Z%sK%s" (Z.to_string owner) index
  | FStar_Pervasives_Native.None -> "K" ^ index

let rec encode_value (v : Wikifn_Eval.value) =
  match v with
  | Wikifn_Eval.VText codepoints ->
      Printf.sprintf "{\"type\":\"Z6\",\"text\":%s}" (quote (encode_utf8 codepoints))
  | Wikifn_Eval.VBool b ->
      Printf.sprintf "{\"type\":\"Z40\",\"value\":%b}" b
  | Wikifn_Eval.VNat n ->
      Printf.sprintf "{\"type\":\"Z13518\",\"value\":%s}" (Z.to_string n)
  | Wikifn_Eval.VList items ->
      Printf.sprintf "{\"type\":\"Z881\",\"items\":[%s]}"
        (String.concat "," (List.map encode_value items))
  | Wikifn_Eval.VPair (l, r) ->
      Printf.sprintf "{\"type\":\"Z882\",\"first\":%s,\"second\":%s}"
        (encode_value l) (encode_value r)
  | Wikifn_Eval.VFunc z ->
      Printf.sprintf "{\"type\":\"Z8\",\"zid\":\"Z%s\"}" (Z.to_string z)
  (* Records are how the corpus writes Wikidata references, monolingual text,
     rationals and floats. Without this case a function that returns one raised
     Match_failure out of the runner and took the host process with it, which
     is a crash rather than an answer and so worse than any error the evaluator
     could have reported. *)
  | Wikifn_Eval.VRecord (t, fields) ->
      let field (k, v) =
        Printf.sprintf "%s:%s" (quote (encode_zkey k)) (encode_value v)
      in
      Printf.sprintf "{\"type\":\"Z%s\",\"fields\":{%s}}"
        (Z.to_string t) (String.concat "," (List.map field fields))

let describe_error (e : Wikifn_Eval.eval_error) =
  match e with
  | Wikifn_Eval.EFuelExhausted -> "fuel exhausted"
  | Wikifn_Eval.EDepthExceeded ->
      "nesting depth limit reached; this composition may be defined in terms of \
       itself without a base case"
  | Wikifn_Eval.EUnboundArgument -> "unbound argument"
  | Wikifn_Eval.EArityMismatch z -> Printf.sprintf "arity mismatch calling Z%s" (Z.to_string z)
  | Wikifn_Eval.ETypeMismatch z -> Printf.sprintf "type mismatch in Z%s" (Z.to_string z)
  | Wikifn_Eval.ENoImplementation z ->
      Printf.sprintf "no implementation for Z%s" (Z.to_string z)
  | Wikifn_Eval.EDivisionByZero z ->
      Printf.sprintf "division by zero in Z%s" (Z.to_string z)
  | Wikifn_Eval.EPrimitiveError k -> (
      match k with
      | Wikifn_Primitive_Kernel.KTypeMismatch -> "primitive type mismatch"
      | Wikifn_Primitive_Kernel.KUnderflow -> "primitive underflow"
      | Wikifn_Primitive_Kernel.KEmptyPattern -> "primitive empty pattern"
      | Wikifn_Primitive_Kernel.KFuelExhausted -> "primitive fuel exhausted")

(* --- Argument decoding ---------------------------------------------------- *)

(* Arguments arrive as a JSON array of already-simple values. Only the forms the
   engine has values for are accepted; anything else is refused here rather than
   guessed at. *)
exception Bad_argument of string

let skip_ws s i =
  let n = String.length s in
  let rec go i = if i < n && (s.[i] = ' ' || s.[i] = '\n' || s.[i] = '\t' || s.[i] = '\r') then go (i + 1) else i in
  go i

let parse_string_literal s i =
  let n = String.length s in
  if i >= n || s.[i] <> '"' then raise (Bad_argument "expected a JSON string");
  let buffer = Buffer.create 16 in
  let rec go i =
    if i >= n then raise (Bad_argument "unterminated string")
    else
      match s.[i] with
      | '"' -> (Buffer.contents buffer, i + 1)
      | '\\' ->
          if i + 1 >= n then raise (Bad_argument "unterminated escape");
          let c = s.[i + 1] in
          if c = 'u' then begin
            if i + 5 >= n then raise (Bad_argument "unterminated \\u escape");
            let code = int_of_string ("0x" ^ String.sub s (i + 2) 4) in
            List.iter (fun b -> Buffer.add_char buffer (Char.chr b))
              (List.map Char.code (List.init (String.length (encode_utf8 [Z.of_int code]))
                 (fun k -> (encode_utf8 [Z.of_int code]).[k])));
            go (i + 6)
          end else begin
            Buffer.add_char buffer
              (match c with
               | 'n' -> '\n' | 't' -> '\t' | 'r' -> '\r'
               | 'b' -> '\b' | 'f' -> '\012'
               | c -> c);
            go (i + 2)
          end
      | c -> Buffer.add_char buffer c; go (i + 1)
  in
  go (i + 1)

let rec parse_argument s i : Wikifn_Eval.value * int =
  let i = skip_ws s i in
  let n = String.length s in
  if i >= n then raise (Bad_argument "unexpected end of arguments")
  else if s.[i] = '"' then
    let (text, next) = parse_string_literal s i in
    (Wikifn_Eval.VText (List.map Z.of_int (decode_utf8 text)), next)
  else if s.[i] = '[' then begin
    let rec items i acc =
      let i = skip_ws s i in
      if i < n && s.[i] = ']' then (List.rev acc, i + 1)
      else
        let (value, next) = parse_argument s i in
        let next = skip_ws s next in
        if next < n && s.[next] = ',' then items (next + 1) (value :: acc)
        else if next < n && s.[next] = ']' then (List.rev (value :: acc), next + 1)
        else raise (Bad_argument "malformed list argument")
    in
    let (values, next) = items (i + 1) [] in
    (Wikifn_Eval.VList values, next)
  end
  else if i + 3 < n && String.sub s i 4 = "true" then (Wikifn_Eval.VBool true, i + 4)
  else if i + 4 < n && String.sub s i 5 = "false" then (Wikifn_Eval.VBool false, i + 5)
  else begin
    let rec digits j = if j < n && s.[j] >= '0' && s.[j] <= '9' then digits (j + 1) else j in
    let j = digits i in
    if j = i then raise (Bad_argument "unsupported argument form")
    else (Wikifn_Eval.VNat (Z.of_string (String.sub s i (j - i))), j)
  end

let parse_arguments text =
  let i = skip_ws text 0 in
  let n = String.length text in
  if i >= n || text.[i] <> '[' then raise (Bad_argument "arguments must be a JSON array");
  let rec items i acc =
    let i = skip_ws text i in
    if i < n && text.[i] = ']' then List.rev acc
    else
      let (value, next) = parse_argument text i in
      let next = skip_ws text next in
      if next < n && text.[next] = ',' then items (next + 1) (value :: acc)
      else if next < n && text.[next] = ']' then List.rev (value :: acc)
      else raise (Bad_argument "malformed argument array")
  in
  items (i + 1) []

(* --- Entry point ---------------------------------------------------------- *)

let parse_zid text =
  let n = String.length text in
  if n < 2 || text.[0] <> 'Z' then None
  else
    let rec digits i = if i < n && text.[i] >= '0' && text.[i] <= '9' then digits (i + 1) else i in
    if digits 1 = n then (try Some (Z.of_string (String.sub text 1 (n - 1))) with _ -> None)
    else None

(* Source rendering, delegated to Wikifn.Print so the s-expression form comes
   from the same checked module as evaluation. Only the name table is supplied
   here, which is an edge concern: the label language is the caller's choice. *)

let parse_name_table text =
  let n = String.length text in
  let table = Hashtbl.create 64 in
  let rec skip i = if i < n && (text.[i] = ' ' || text.[i] = '\n' || text.[i] = '\t' || text.[i] = '\r') then skip (i + 1) else i in
  let rec entries i =
    let i = skip i in
    if i >= n || text.[i] = '}' then ()
    else
      let (key, next) = parse_string_literal text i in
      let next = skip next in
      if next >= n || text.[next] <> ':' then ()
      else
        let (value, next) = parse_string_literal text (skip (next + 1)) in
        Hashtbl.replace table key value;
        let next = skip next in
        if next < n && text.[next] = ',' then entries (next + 1) else ()
  in
  let start = skip 0 in
  if start < n && text.[start] = '{' then entries (start + 1);
  table

let lookup_of_table table zid =
  match Hashtbl.find_opt table ("Z" ^ Z.to_string zid) with
  | Some name -> FStar_Pervasives_Native.Some (List.map Z.of_int (decode_utf8 name))
  | None -> FStar_Pervasives_Native.None

let argument_names arity =
  let rec go i acc =
    if i >= arity then List.rev acc
    else go (i + 1) (List.map Z.of_int (decode_utf8 (Printf.sprintf "a%d" i)) :: acc)
  in
  go 0 []

let error code message =
  Printf.sprintf "{\"ok\":false,\"error\":%s,\"message\":%s}" (quote code) (quote message)

let source zid_text arity names_json =
  match parse_zid zid_text with
  | None -> Printf.sprintf "{\"ok\":false,\"error\":\"zid\",\"message\":%s}" (quote (zid_text ^ " is not a ZID"))
  | Some zid -> (
      match Wikifn_Generated_Eval.generated_policy zid with
      | FStar_Pervasives_Native.None ->
          Printf.sprintf
            "{\"ok\":false,\"error\":\"unknown\",\"message\":%s}"
            (quote (zid_text ^ " has no generated body"))
      | FStar_Pervasives_Native.Some body ->
          let table = parse_name_table names_json in
          let name =
            match lookup_of_table table zid with
            | FStar_Pervasives_Native.Some n -> n
            | FStar_Pervasives_Native.None -> Wikifn_Zid.render_zid zid
          in
          let rendered =
            Wikifn_Print.print_definition
              (lookup_of_table table) name (argument_names arity) body
          in
          Printf.sprintf
            "{\"ok\":true,\"zid\":%s,\"source\":%s}"
            (quote zid_text) (quote (encode_utf8 rendered)))

let call zid_text fuel arguments_json =
  match parse_zid zid_text with
  | None -> error "zid" (zid_text ^ " is not a ZID")
  | Some zid -> (
      match parse_arguments arguments_json with
      | exception Bad_argument message -> error "arguments" message
      | args -> (
          let fuel = if fuel > 0 then fuel else default_fuel in
          match
            Wikifn_Eval.run Wikifn_Generated_Eval.generated_policy (Z.of_int fuel) zid args
          with
          | Wikifn_Eval.EOk value ->
              Printf.sprintf
                "{\"ok\":true,\"zid\":%s,\"fuel\":%d,\"result\":%s}"
                (quote zid_text) fuel (encode_value value)
          | Wikifn_Eval.EErr e ->
              Printf.sprintf
                "{\"ok\":false,\"error\":\"eval\",\"zid\":%s,\"message\":%s}"
                (quote zid_text) (quote (describe_error e))))


(* Calling a composition that was compiled into an F* function of its own,
   rather than interpreted from its tree.

   The answer must be the same either way - that is what makes the compiled path
   trustworthy and it is what test/compiled.test.js checks - so the two entry
   points are deliberately identical in shape. What differs is that this one
   selects a function and calls it, while the other walks an expression. A ZID
   with no compiled function says so, rather than quietly falling back to the
   interpreter and hiding the gap. *)
let compiled zid_text arguments_json =
  match parse_zid zid_text with
  | None -> error "zid" (zid_text ^ " is not a ZID")
  | Some zid -> (
      match parse_arguments arguments_json with
      | exception Bad_argument message -> error "arguments" message
      | args -> (
          let wrapped = List.map (fun v -> Wikifn_Eval.EOk v) args in
          match Wikifn_Compiled_Direct.compiled_by_zid zid wrapped with
          | FStar_Pervasives_Native.None ->
              error "compiled"
                (zid_text ^ " has no compiled function of that arity")
          | FStar_Pervasives_Native.Some (Wikifn_Eval.EOk value) ->
              Printf.sprintf
                "{\"ok\":true,\"zid\":%s,\"compiled\":true,\"result\":%s}"
                (quote zid_text) (encode_value value)
          | FStar_Pervasives_Native.Some (Wikifn_Eval.EErr e) ->
              Printf.sprintf
                "{\"ok\":false,\"error\":\"eval\",\"zid\":%s,\"compiled\":true,\"message\":%s}"
                (quote zid_text) (quote (describe_error e))))
