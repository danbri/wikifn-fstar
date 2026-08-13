module Wikifn.Composition

open Wikifn.Primitive.Kernel

type function_id =
  | FZ802
  | FZ10008
  | FZ10075
  | FZ10901
  | FZ14124
  | FZ14456
  | FZ14520
  | FZ10052
  | FZ14613
  | FZ21679
  | FZ22294
  | FZ38114
  | FInternalFreshPrivateUse

type value =
  | VBool : bool -> value
  | VNat : nat -> value
  | VText : text -> value

type expr =
  | EValue : value -> expr
  | EArg : nat -> expr
  | ECall : function_id -> list expr -> expr

type eval_error =
  | EFuelExhausted
  | EUnboundArgument
  | EArityMismatch
  | ETypeMismatch
  | EPrimitiveError : kernel_error -> eval_error

type eval_result (a:Type0) =
  | EOk : a -> eval_result a
  | EErr : eval_error -> eval_result a

type body_option =
  | NoBody
  | Body : expr -> body_option

type policy = function_id -> list expr -> Tot body_option

let lift_kernel (#a:Type0) (r:kernel_result a) : Tot (eval_result a) =
  match r with
  | KOk x -> EOk x
  | KErr e -> EErr (EPrimitiveError e)

let rec env_lookup (index:nat) (env:list value) : Tot (eval_result value) (decreases env) =
  match index, env with
  | 0, head :: _ -> EOk head
  | _, _ :: tail -> env_lookup (index - 1) tail
  | _, [] -> EErr EUnboundArgument

let first_available_private_use_character (input:expr) : expr =
  ECall FInternalFreshPrivateUse [input]

let z36070_expr (input:expr) (old_alphabet:expr) (new_alphabet:expr) : expr =
  let marker = first_available_private_use_character input in
  ECall FZ802 [
    ECall FZ10008 [old_alphabet];
    input;
    ECall FZ10075 [
      ECall FZ14613 [
        ECall FZ10075 [
          input;
          ECall FZ10901 [old_alphabet];
          marker
        ];
        ECall FZ14456 [old_alphabet];
        ECall FZ14456 [new_alphabet]
      ];
      marker;
      ECall FZ10901 [new_alphabet]
    ]
  ]

let devanagari_digits : text =
  [2406; 2407; 2408; 2409; 2410; 2411; 2412; 2413; 2414; 2415]

let ascii_digits : text =
  [48; 49; 50; 51; 52; 53; 54; 55; 56; 57]

let regular_space : text = [32]
let empty_text : text = []
let comma : text = [44]
let point : text = [46]
let de_les : text = [100; 101; 32; 108; 101; 115]
let des : text = [100; 101; 115]
let de_le : text = [100; 101; 32; 108; 101]
let du : text = [100; 117]

let z22295_expr (input:expr) : expr =
  ECall FZ14613 [
    input;
    EValue (VText devanagari_digits);
    EValue (VText ascii_digits)
  ]

let z10077_expr (input:expr) : expr =
  ECall FZ10075 [input; EValue (VText regular_space); EValue (VText empty_text)]

let z21681_expr (input:expr) : expr =
  ECall FZ10075 [input; EValue (VText comma); EValue (VText point)]

let z38115_expr (input:expr) : expr =
  ECall FZ10075 [
    ECall FZ10075 [input; EValue (VText de_les); EValue (VText des)];
    EValue (VText de_le);
    EValue (VText du)
  ]

let rec eval_with_policy (p:policy) (fuel:nat) (env:list value) (e:expr) : Tot (eval_result value) (decreases fuel) =
  match e with
  | EValue v -> EOk v
  | EArg index -> env_lookup index env
  | ECall fid args ->
      match fuel with
      | 0 -> EErr EFuelExhausted
      | _ ->
          let next = fuel - 1 in
          match fid, args with
          | FZ802, condition :: then_expr :: else_expr :: [] ->
              (match eval_with_policy p next env condition with
               | EOk (VBool b) ->
                   if b then eval_with_policy p next env then_expr else eval_with_policy p next env else_expr
               | EOk _ -> EErr ETypeMismatch
               | EErr err -> EErr err)
          | FZ10008, input :: [] ->
              (match eval_with_policy p next env input with
               | EOk (VText s) -> EOk (VBool (z10008_is_empty_string s))
               | EOk _ -> EErr ETypeMismatch
               | EErr err -> EErr err)
          | FZ10075, input :: substring :: replacement :: [] ->
              (match eval_with_policy p next env input with
               | EOk (VText input_text) ->
                   (match eval_with_policy p next env substring with
                    | EOk (VText substring_text) ->
                        (match eval_with_policy p next env replacement with
                         | EOk (VText replacement_text) ->
                             (match lift_kernel (z10075_replace_all_substrings input_text substring_text replacement_text) with
                              | EOk output -> EOk (VText output)
                              | EErr err -> EErr err)
                         | EOk _ -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | EOk _ -> EErr ETypeMismatch
                    | EErr err -> EErr err)
               | EOk _ -> EErr ETypeMismatch
               | EErr err -> EErr err)
          | FZ10901, input :: [] ->
              (match eval_with_policy p next env input with
               | EOk (VText s) -> EOk (VText (z10901_get_first_character s))
               | EOk _ -> EErr ETypeMismatch
               | EErr err -> EErr err)
          | FZ14124, first :: last :: [] ->
              (match eval_with_policy p next env first with
               | EOk (VNat first_codepoint) ->
                   (match eval_with_policy p next env last with
                    | EOk (VNat last_codepoint) ->
                        EOk (VText (z14124_string_of_characters_from_unicode_range first_codepoint last_codepoint))
                    | EOk _ -> EErr ETypeMismatch
                    | EErr err -> EErr err)
               | EOk _ -> EErr ETypeMismatch
               | EErr err -> EErr err)
          | FZ14456, input :: [] ->
              (match eval_with_policy p next env input with
               | EOk (VText s) -> EOk (VText (z14456_remove_first_character s))
               | EOk _ -> EErr ETypeMismatch
               | EErr err -> EErr err)
          | FZ14520, input :: chars :: [] ->
              (match eval_with_policy p next env input with
               | EOk (VText input_text) ->
                   (match eval_with_policy p next env chars with
                    | EOk (VText chars_text) ->
                        EOk (VText (z14520_remove_all_characters_in_second_string input_text chars_text))
                    | EOk _ -> EErr ETypeMismatch
                    | EErr err -> EErr err)
               | EOk _ -> EErr ETypeMismatch
               | EErr err -> EErr err)
          | FInternalFreshPrivateUse, input :: [] ->
              (match eval_with_policy p next env input with
               | EOk (VText s) -> EOk (VText (z36070_first_available_private_use_character s))
               | EOk _ -> EErr ETypeMismatch
               | EErr err -> EErr err)
          | _, _ ->
              (match p fid args with
               | Body body -> eval_with_policy p next env body
               | NoBody -> EErr EArityMismatch)

let manual_policy (fid:function_id) (args:list expr) : Tot body_option =
  match fid, args with
  | FZ10052, input :: [] -> Body (z10077_expr input)
  | FZ14613, input :: old_alphabet :: new_alphabet :: [] ->
      Body (z36070_expr input old_alphabet new_alphabet)
  | FZ21679, input :: [] -> Body (z21681_expr input)
  | FZ22294, input :: [] -> Body (z22295_expr input)
  | FZ38114, input :: [] -> Body (z38115_expr input)
  | _, _ -> NoBody

let eval (fuel:nat) (env:list value) (e:expr) : Tot (eval_result value) =
  eval_with_policy manual_policy fuel env e

let eval_z10052 (fuel:nat) (input:text) : Tot (eval_result value) =
  eval fuel [] (ECall FZ10052 [EValue (VText input)])

let eval_z22294 (fuel:nat) (input:text) : Tot (eval_result value) =
  eval fuel [] (ECall FZ22294 [EValue (VText input)])

let eval_z14613 (fuel:nat) (input:text) (old_alphabet:text) (new_alphabet:text) : Tot (eval_result value) =
  eval fuel [] (ECall FZ14613 [EValue (VText input); EValue (VText old_alphabet); EValue (VText new_alphabet)])

let eval_z21679 (fuel:nat) (input:text) : Tot (eval_result value) =
  eval fuel [] (ECall FZ21679 [EValue (VText input)])

let eval_z38114 (fuel:nat) (input:text) : Tot (eval_result value) =
  eval fuel [] (ECall FZ38114 [EValue (VText input)])
