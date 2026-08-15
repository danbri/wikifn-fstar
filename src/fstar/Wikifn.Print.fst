module Wikifn.Print

open FStar.Mul
open Wikifn.Primitive.Kernel
open Wikifn.Zid
open Wikifn.Eval

(*
  Rendering expressions as s-expressions, in F*.

  This was JavaScript build tooling. It is a pure, total function over expr, so
  there is no reason for it to sit outside the checked part of the system: the
  same module that the evaluator uses is now also what prints it, and the two
  cannot drift.

  Names come from a lookup the caller supplies, so the label language is a
  choice made at the edge rather than baked in here. When the lookup has no
  name, the bare ZID is printed, which is always correct and always reversible.

  Primitives that LISP already named are printed with the classical name. That
  mapping is one to one, so the text stays convertible back to identifiers.
*)

type name_lookup = zid -> Tot (option text)

let cp_open : codepoint = 40      (* ( *)
let cp_close : codepoint = 41     (* ) *)
let cp_space : codepoint = 32
let cp_quote : codepoint = 34     (* " *)
let cp_backslash : codepoint = 92
let cp_newline : codepoint = 10
let cp_hash : codepoint = 35      (* # *)
let cp_t : codepoint = 116
let cp_f : codepoint = 102
let cp_n : codepoint = 110

let rec text_of_list (parts:list text) : Tot text =
  match parts with
  | [] -> []
  | head :: tail -> text_concat head (text_of_list tail)

let rec join_with (separator:text) (parts:list text) : Tot text =
  match parts with
  | [] -> []
  | [only] -> only
  | head :: tail -> text_concat head (text_concat separator (join_with separator tail))

let parenthesise (inner:text) : Tot text =
  cp_open :: text_concat inner [cp_close]

(* Scheme string literals: only the quote and the backslash have to be escaped,
   and a newline is written as an escape so a body stays on one line. *)
let rec escape_text (s:text) : Tot text =
  match s with
  | [] -> []
  | c :: rest ->
      if c = cp_quote then cp_backslash :: cp_quote :: escape_text rest
      else if c = cp_backslash then cp_backslash :: cp_backslash :: escape_text rest
      else if c = cp_newline then cp_backslash :: cp_n :: escape_text rest
      else c :: escape_text rest

let quoted (s:text) : Tot text =
  cp_quote :: text_concat (escape_text s) [cp_quote]

let boolean_text (b:bool) : Tot text =
  if b then [cp_hash; cp_t] else [cp_hash; cp_f]

let nat_text (n:nat) : Tot text =
  if n = 0 then [48] else render_nat n []

(* The classical name for a primitive, where LISP has one. *)
let classical_name (f:zid) : Tot (option text) =
  if f = 801 then Some [105; 100; 101; 110; 116; 105; 116; 121]           (* identity *)
  else if f = 802 then Some [105; 102]                                     (* if *)
  else if f = 810 then Some [99; 111; 110; 115]                            (* cons *)
  else if f = 811 then Some [99; 97; 114]                                  (* car *)
  else if f = 812 then Some [99; 100; 114]                                 (* cdr *)
  else if f = 813 then Some [110; 117; 108; 108; 63]                       (* null? *)
  else if f = 821 then Some [102; 115; 116]                                (* fst *)
  else if f = 822 then Some [115; 110; 100]                                (* snd *)
  else if f = 866 then Some [115; 116; 114; 105; 110; 103; 61; 63]         (* string=? *)
  else if f = 872 then Some [102; 105; 108; 116; 101; 114]                 (* filter *)
  else if f = 873 then Some [109; 97; 112]                                 (* map *)
  else if f = 876 then Some [102; 111; 108; 100]                           (* fold *)
  (* Not Scheme's and/or. Those are syntax and they short-circuit; Z10174 and
     Z10184 are ordinary functions that evaluate both arguments. Rendering them
     as plain procedures is both more faithful and safe to mention in value
     position. *)
  else if f = 10174 then Some [98; 111; 111; 108; 45; 97; 110; 100]
  else if f = 10184 then Some [98; 111; 111; 108; 45; 111; 114]
  else if f = 10216 then Some [110; 111; 116]                              (* not *)
  else if f = 12681 then Some [108; 101; 110; 103; 116; 104]               (* length *)
  else if f = 13521 then Some [43]                                         (* + *)
  else if f = 13522 then Some [61]                                         (* = *)
  else if f = 13539 then Some [42]                                         (* * *)
  else if f = 13578 then Some [97; 100; 100; 49]                           (* add1 *)
  else if f = 13630 then Some [109; 97; 120]                               (* max *)
  else if f = 13633 then Some [109; 105; 110]                              (* min *)
  else if f = 13647 then Some [101; 120; 112; 116]                         (* expt *)
  else if f = 13676 then Some [62]                                         (* > *)
  else if f = 13682 then Some [62; 61]                                     (* >= *)
  else if f = 13689 then Some [60]                                         (* < *)
  else if f = 13695 then Some [60; 61]                                     (* <= *)
  else if f = 13846 then Some [105; 102]                                   (* if *)
  (* Not a Wikifunctions function: the marker helper the generator emits for the
     private-use-character idiom. Named so a reader is not left guessing. *)
  else if f = 1000000001 then Some [102; 114; 101; 115; 104; 45; 112; 114; 105; 118; 97; 116; 101; 45; 117; 115; 101; 45; 99; 104; 97; 114]
  else None

(* and, or and if are syntax in Scheme, not procedures, so a bare mention of one
   in value position is a syntax error rather than a reference. The corpus does
   this: Z13651 bitwise and passes Z10174 to a higher-order function. In value
   position they are wrapped in a lambda.

   The wrapper for if is eager in both branches, which the special form is not.
   That is a real difference and it is why only value position is wrapped;
   in operator position if stays the special form and stays lazy. *)
let lambda_word : text = [108; 97; 109; 98; 100; 97]

let binary_wrapper (operator:text) : Tot text =
  let a = [97] in
  let b = [98] in
  parenthesise (join_with [cp_space] [
    lambda_word;
    parenthesise (join_with [cp_space] [a; b]);
    parenthesise (join_with [cp_space] [operator; a; b])
  ])

let if_wrapper () : Tot text =
  let c = [99] in
  let t = [116] in
  let e = [101] in
  parenthesise (join_with [cp_space] [
    lambda_word;
    parenthesise (join_with [cp_space] [c; t; e]);
    parenthesise (join_with [cp_space] [[105; 102]; c; t; e])
  ])

(* Only if remains a special form here, and only if can appear in value
   position needing a wrapper. The wrapper is eager where the special form is
   lazy, which is a real difference; in operator position if is left alone. *)
let syntactic_wrapper (f:zid) : Tot (option text) =
  if f = 802 || f = 13846 then Some (if_wrapper ())
  else None

let name_of (lookup:name_lookup) (f:zid) : Tot text =
  match classical_name f with
  | Some name -> name
  | None ->
      match lookup f with
      | Some name -> name
      | None -> render_zid f

let rec nth_text (index:nat) (names:list text) : Tot text (decreases names) =
  match index, names with
  | 0, head :: _ -> head
  | _, _ :: tail -> nth_text (index - 1) tail
  | _, [] -> [97; 114; 103]   (* arg, when the caller gave too few names *)

(* Values and expressions print in one mutual group, because a quote is a value
   that holds an expression. Splitting them meant a quote could only be printed
   as a marker; printed properly it is a thunk, which is what it is: the body
   runs when the quote is opened, not where it is written. *)
let rec print_value (lookup:name_lookup) (names:list text) (v:value)
  : Tot text (decreases v)
=
  match v with
  | VText s -> quoted s
  | VBool b -> boolean_text b
  | VNat n -> nat_text n
  | VFunc f -> begin
      match syntactic_wrapper f with
      | Some wrapped -> wrapped
      | None -> name_of lookup f
    end
  | VPair left right ->
      parenthesise (join_with [cp_space]
        [[99; 111; 110; 115]; print_value lookup names left; print_value lookup names right])
  | VList items ->
      parenthesise (join_with [cp_space]
        ([108; 105; 115; 116] :: print_values lookup names items))
  | VRecord t fields ->
      (* (record Z11 (Z11K1 . value) ...) - readable, and the type stays visible *)
      parenthesise (join_with [cp_space]
        ([114; 101; 99; 111; 114; 100] :: name_of lookup t :: print_fields lookup names fields))
  | VQuote body ->
      (* A thunk, not Scheme's quote. Scheme's (quote x) is a datum and opening
         it again would need eval; Wikifunctions' unquote evaluates the body in
         the environment the unquote sits in. A procedure of no arguments is
         exactly that, and unquote in the prelude just calls it. *)
      parenthesise (join_with [cp_space]
        [lambda_word; parenthesise []; print_expr lookup names body])

and print_values (lookup:name_lookup) (names:list text) (items:list value)
  : Tot (list text) (decreases items)
=
  match items with
  | [] -> []
  | head :: tail -> print_value lookup names head :: print_values lookup names tail

and print_fields (lookup:name_lookup) (names:list text) (fields:list (zkey & value))
  : Tot (list text) (decreases fields)
=
  match fields with
  | [] -> []
  | (k, v) :: tail ->
      parenthesise (join_with [cp_space] [render_zkey k; print_value lookup names v])
      :: print_fields lookup names tail

and print_expr (lookup:name_lookup) (names:list text) (e:expr)
  : Tot text (decreases e)
=
  match e with
  | EValue v -> print_value lookup names v
  | EArg index -> nth_text index names
  | ECall f args ->
      parenthesise (join_with [cp_space] (name_of lookup f :: print_args lookup names args))
  | ERecord t fields ->
      (* Same shape as a record value, so a record reads the same whether its
         fields were literals or computed. *)
      parenthesise (join_with [cp_space]
        ([114; 101; 99; 111; 114; 100] :: name_of lookup t
         :: print_field_exprs lookup names fields))

and print_args (lookup:name_lookup) (names:list text) (args:list expr)
  : Tot (list text) (decreases args)
=
  match args with
  | [] -> []
  | head :: tail -> print_expr lookup names head :: print_args lookup names tail

and print_field_exprs (lookup:name_lookup) (names:list text) (fields:list (zkey & expr))
  : Tot (list text) (decreases fields)
=
  match fields with
  | [] -> []
  | (k, e) :: tail ->
      parenthesise (join_with [cp_space] [render_zkey k; print_expr lookup names e])
      :: print_field_exprs lookup names tail

(* A whole definition: (define (name a0 a1) body) *)
let print_definition
  (lookup:name_lookup)
  (name:text)
  (argument_names:list text)
  (body:expr)
  : Tot text
=
  let header =
    parenthesise (join_with [cp_space] (name :: argument_names)) in
  parenthesise (
    join_with [cp_space] [
      [100; 101; 102; 105; 110; 101];   (* define *)
      header;
      print_expr lookup argument_names body
    ])

let no_names : name_lookup = fun _ -> None

let example_body : expr =
  ECall 13846 [ECall 10008 [EArg 0]; EArg 1; EArg 0]

let print_example_is_stable () :
  Lemma (
    print_expr no_names [[97; 48]; [97; 49]] example_body
    == [40; 105; 102; 32; 40; 90; 49; 48; 48; 48; 56; 32; 97; 48; 41; 32; 97; 49; 32; 97; 48; 41]
  )
  = assert_norm (
      print_expr no_names [[97; 48]; [97; 49]] example_body
      == [40; 105; 102; 32; 40; 90; 49; 48; 48; 48; 56; 32; 97; 48; 41; 32; 97; 49; 32; 97; 48; 41]
    )

let escaping_a_quote_example () :
  Lemma (quoted [97; 34; 98] == [34; 97; 92; 34; 98; 34])
  = assert_norm (quoted [97; 34; 98] == [34; 97; 92; 34; 98; 34])

let boolean_and_is_a_procedure_not_syntax () :
  Lemma (
    print_value no_names [] (VFunc 10174) == [98; 111; 111; 108; 45; 97; 110; 100]
  )
  = assert_norm (print_value no_names [] (VFunc 10174) == [98; 111; 111; 108; 45; 97; 110; 100])

let if_in_value_position_is_wrapped () :
  Lemma (
    print_value no_names [] (VFunc 802) == [40; 108; 97; 109; 98; 100; 97; 32; 40; 99; 32; 116; 32; 101; 41; 32; 40; 105; 102; 32; 99; 32; 116; 32; 101; 41; 41]
  )
  = assert_norm (
      print_value no_names [] (VFunc 802) == [40; 108; 97; 109; 98; 100; 97; 32; 40; 99; 32; 116; 32; 101; 41; 32; 40; 105; 102; 32; 99; 32; 116; 32; 101; 41; 41]
    )

let if_in_operator_position_is_not_wrapped () :
  Lemma (
    print_expr no_names [] (ECall 802 [EValue (VBool true); EValue (VNat 1); EValue (VNat 2)])
    == [40; 105; 102; 32; 35; 116; 32; 49; 32; 50; 41]
  )
  = assert_norm (
      print_expr no_names [] (ECall 802 [EValue (VBool true); EValue (VNat 1); EValue (VNat 2)])
      == [40; 105; 102; 32; 35; 116; 32; 49; 32; 50; 41]
    )

let classical_names_are_used () :
  Lemma (name_of no_names 810 == [99; 111; 110; 115])
  = assert_norm (name_of no_names 810 == [99; 111; 110; 115])

let unknown_zid_prints_as_itself () :
  Lemma (name_of no_names 22294 == render_zid 22294)
  = ()
