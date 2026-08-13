open Prims
type function_id =
  | FZ802
  | FZ10008
  | FZ10075
  | FZ10901
  | FZ14124
  | FZ14456
  | FZ14520
  | FZ10052
  | FZ10627
  | FZ11082
  | FZ14613
  | FZ19612
  | FZ21679
  | FZ22294
  | FZ22649
  | FZ27053
  | FZ38114
  | FInternalFreshPrivateUse
let (uu___is_FZ802 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ802 -> true | uu___ -> false
let (uu___is_FZ10008 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ10008 -> true | uu___ -> false
let (uu___is_FZ10075 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ10075 -> true | uu___ -> false
let (uu___is_FZ10901 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ10901 -> true | uu___ -> false
let (uu___is_FZ14124 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ14124 -> true | uu___ -> false
let (uu___is_FZ14456 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ14456 -> true | uu___ -> false
let (uu___is_FZ14520 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ14520 -> true | uu___ -> false
let (uu___is_FZ10052 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ10052 -> true | uu___ -> false
let (uu___is_FZ10627 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ10627 -> true | uu___ -> false
let (uu___is_FZ11082 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ11082 -> true | uu___ -> false
let (uu___is_FZ14613 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ14613 -> true | uu___ -> false
let (uu___is_FZ19612 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ19612 -> true | uu___ -> false
let (uu___is_FZ21679 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ21679 -> true | uu___ -> false
let (uu___is_FZ22294 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ22294 -> true | uu___ -> false
let (uu___is_FZ22649 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ22649 -> true | uu___ -> false
let (uu___is_FZ27053 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ27053 -> true | uu___ -> false
let (uu___is_FZ38114 : function_id -> Prims.bool) =
  fun projectee -> match projectee with | FZ38114 -> true | uu___ -> false
let (uu___is_FInternalFreshPrivateUse : function_id -> Prims.bool) =
  fun projectee ->
    match projectee with | FInternalFreshPrivateUse -> true | uu___ -> false
type value =
  | VBool of Prims.bool
  | VNat of Prims.nat
  | VText of Wikifn_Primitive_Kernel.text
let (uu___is_VBool : value -> Prims.bool) =
  fun projectee -> match projectee with | VBool _0 -> true | uu___ -> false
let (__proj__VBool__item___0 : value -> Prims.bool) =
  fun projectee -> match projectee with | VBool _0 -> _0
let (uu___is_VNat : value -> Prims.bool) =
  fun projectee -> match projectee with | VNat _0 -> true | uu___ -> false
let (__proj__VNat__item___0 : value -> Prims.nat) =
  fun projectee -> match projectee with | VNat _0 -> _0
let (uu___is_VText : value -> Prims.bool) =
  fun projectee -> match projectee with | VText _0 -> true | uu___ -> false
let (__proj__VText__item___0 : value -> Wikifn_Primitive_Kernel.text) =
  fun projectee -> match projectee with | VText _0 -> _0
type expr =
  | EValue of value
  | EArg of Prims.nat
  | ECall of function_id * expr Prims.list
let (uu___is_EValue : expr -> Prims.bool) =
  fun projectee -> match projectee with | EValue _0 -> true | uu___ -> false
let (__proj__EValue__item___0 : expr -> value) =
  fun projectee -> match projectee with | EValue _0 -> _0
let (uu___is_EArg : expr -> Prims.bool) =
  fun projectee -> match projectee with | EArg _0 -> true | uu___ -> false
let (__proj__EArg__item___0 : expr -> Prims.nat) =
  fun projectee -> match projectee with | EArg _0 -> _0
let (uu___is_ECall : expr -> Prims.bool) =
  fun projectee ->
    match projectee with | ECall (_0, _1) -> true | uu___ -> false
let (__proj__ECall__item___0 : expr -> function_id) =
  fun projectee -> match projectee with | ECall (_0, _1) -> _0
let (__proj__ECall__item___1 : expr -> expr Prims.list) =
  fun projectee -> match projectee with | ECall (_0, _1) -> _1
type eval_error =
  | EFuelExhausted
  | EUnboundArgument
  | EArityMismatch
  | ETypeMismatch
  | EPrimitiveError of Wikifn_Primitive_Kernel.kernel_error
let (uu___is_EFuelExhausted : eval_error -> Prims.bool) =
  fun projectee ->
    match projectee with | EFuelExhausted -> true | uu___ -> false
let (uu___is_EUnboundArgument : eval_error -> Prims.bool) =
  fun projectee ->
    match projectee with | EUnboundArgument -> true | uu___ -> false
let (uu___is_EArityMismatch : eval_error -> Prims.bool) =
  fun projectee ->
    match projectee with | EArityMismatch -> true | uu___ -> false
let (uu___is_ETypeMismatch : eval_error -> Prims.bool) =
  fun projectee ->
    match projectee with | ETypeMismatch -> true | uu___ -> false
let (uu___is_EPrimitiveError : eval_error -> Prims.bool) =
  fun projectee ->
    match projectee with | EPrimitiveError _0 -> true | uu___ -> false
let (__proj__EPrimitiveError__item___0 :
  eval_error -> Wikifn_Primitive_Kernel.kernel_error) =
  fun projectee -> match projectee with | EPrimitiveError _0 -> _0
type 'a eval_result =
  | EOk of 'a
  | EErr of eval_error
let uu___is_EOk : 'a . 'a eval_result -> Prims.bool =
  fun projectee -> match projectee with | EOk _0 -> true | uu___ -> false
let __proj__EOk__item___0 : 'a . 'a eval_result -> 'a =
  fun projectee -> match projectee with | EOk _0 -> _0
let uu___is_EErr : 'a . 'a eval_result -> Prims.bool =
  fun projectee -> match projectee with | EErr _0 -> true | uu___ -> false
let __proj__EErr__item___0 : 'a . 'a eval_result -> eval_error =
  fun projectee -> match projectee with | EErr _0 -> _0
type body_option =
  | NoBody
  | Body of expr
let (uu___is_NoBody : body_option -> Prims.bool) =
  fun projectee -> match projectee with | NoBody -> true | uu___ -> false
let (uu___is_Body : body_option -> Prims.bool) =
  fun projectee -> match projectee with | Body _0 -> true | uu___ -> false
let (__proj__Body__item___0 : body_option -> expr) =
  fun projectee -> match projectee with | Body _0 -> _0
type policy = function_id -> expr Prims.list -> body_option
let lift_kernel :
  'a . 'a Wikifn_Primitive_Kernel.kernel_result -> 'a eval_result =
  fun r ->
    match r with
    | Wikifn_Primitive_Kernel.KOk x -> EOk x
    | Wikifn_Primitive_Kernel.KErr e -> EErr (EPrimitiveError e)
let rec (env_lookup : Prims.nat -> value Prims.list -> value eval_result) =
  fun index ->
    fun env ->
      match (index, env) with
      | (uu___, head::uu___1) when uu___ = Prims.int_zero -> EOk head
      | (uu___, uu___1::tail) -> env_lookup (index - Prims.int_one) tail
      | (uu___, []) -> EErr EUnboundArgument
let (first_available_private_use_character : expr -> expr) =
  fun input -> ECall (FInternalFreshPrivateUse, [input])
let (z36070_expr : expr -> expr -> expr -> expr) =
  fun input ->
    fun old_alphabet ->
      fun new_alphabet ->
        let marker = first_available_private_use_character input in
        ECall
          (FZ802,
            [ECall (FZ10008, [old_alphabet]);
            input;
            ECall
              (FZ10075,
                [ECall
                   (FZ14613,
                     [ECall
                        (FZ10075,
                          [input; ECall (FZ10901, [old_alphabet]); marker]);
                     ECall (FZ14456, [old_alphabet]);
                     ECall (FZ14456, [new_alphabet])]);
                marker;
                ECall (FZ10901, [new_alphabet])])])
let (devanagari_digits : Wikifn_Primitive_Kernel.text) =
  [(Prims.of_int (2406));
  (Prims.of_int (2407));
  (Prims.of_int (2408));
  (Prims.of_int (2409));
  (Prims.of_int (2410));
  (Prims.of_int (2411));
  (Prims.of_int (2412));
  (Prims.of_int (2413));
  (Prims.of_int (2414));
  (Prims.of_int (2415))]
let (ascii_digits : Wikifn_Primitive_Kernel.text) =
  [(Prims.of_int (48));
  (Prims.of_int (49));
  (Prims.of_int (50));
  (Prims.of_int (51));
  (Prims.of_int (52));
  (Prims.of_int (53));
  (Prims.of_int (54));
  (Prims.of_int (55));
  (Prims.of_int (56));
  (Prims.of_int (57))]
let (regular_space : Wikifn_Primitive_Kernel.text) = [(Prims.of_int (32))]
let (empty_text : Wikifn_Primitive_Kernel.text) = []
let (comma : Wikifn_Primitive_Kernel.text) = [(Prims.of_int (44))]
let (point : Wikifn_Primitive_Kernel.text) = [(Prims.of_int (46))]
let (de_les : Wikifn_Primitive_Kernel.text) =
  [(Prims.of_int (100));
  (Prims.of_int (101));
  (Prims.of_int (32));
  (Prims.of_int (108));
  (Prims.of_int (101));
  (Prims.of_int (115))]
let (des : Wikifn_Primitive_Kernel.text) =
  [(Prims.of_int (100)); (Prims.of_int (101)); (Prims.of_int (115))]
let (de_le : Wikifn_Primitive_Kernel.text) =
  [(Prims.of_int (100));
  (Prims.of_int (101));
  (Prims.of_int (32));
  (Prims.of_int (108));
  (Prims.of_int (101))]
let (du : Wikifn_Primitive_Kernel.text) =
  [(Prims.of_int (100)); (Prims.of_int (117))]
let (z22295_expr : expr -> expr) =
  fun input ->
    ECall
      (FZ14613,
        [input;
        EValue (VText devanagari_digits);
        EValue (VText ascii_digits)])
let (z10077_expr : expr -> expr) =
  fun input ->
    ECall
      (FZ10075,
        [input; EValue (VText regular_space); EValue (VText empty_text)])
let (z21681_expr : expr -> expr) =
  fun input ->
    ECall (FZ10075, [input; EValue (VText comma); EValue (VText point)])
let (z38115_expr : expr -> expr) =
  fun input ->
    ECall
      (FZ10075,
        [ECall (FZ10075, [input; EValue (VText de_les); EValue (VText des)]);
        EValue (VText de_le);
        EValue (VText du)])
let rec (eval_with_policy :
  policy -> Prims.nat -> value Prims.list -> expr -> value eval_result) =
  fun p ->
    fun fuel ->
      fun env ->
        fun e ->
          match e with
          | EValue v -> EOk v
          | EArg index -> env_lookup index env
          | ECall (fid, args) ->
              (match fuel with
               | uu___ when uu___ = Prims.int_zero -> EErr EFuelExhausted
               | uu___ ->
                   let next = fuel - Prims.int_one in
                   (match (fid, args) with
                    | (FZ802, condition::then_expr::else_expr::[]) ->
                        (match eval_with_policy p next env condition with
                         | EOk (VBool b) ->
                             if b
                             then eval_with_policy p next env then_expr
                             else eval_with_policy p next env else_expr
                         | EOk uu___1 -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | (FZ10008, input::[]) ->
                        (match eval_with_policy p next env input with
                         | EOk (VText s) ->
                             EOk
                               (VBool
                                  (Wikifn_Primitive_Kernel.z10008_is_empty_string
                                     s))
                         | EOk uu___1 -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | (FZ10075, input::substring::replacement::[]) ->
                        (match eval_with_policy p next env input with
                         | EOk (VText input_text) ->
                             (match eval_with_policy p next env substring
                              with
                              | EOk (VText substring_text) ->
                                  (match eval_with_policy p next env
                                           replacement
                                   with
                                   | EOk (VText replacement_text) ->
                                       (match lift_kernel
                                                (Wikifn_Primitive_Kernel.z10075_replace_all_substrings
                                                   input_text substring_text
                                                   replacement_text)
                                        with
                                        | EOk output -> EOk (VText output)
                                        | EErr err -> EErr err)
                                   | EOk uu___1 -> EErr ETypeMismatch
                                   | EErr err -> EErr err)
                              | EOk uu___1 -> EErr ETypeMismatch
                              | EErr err -> EErr err)
                         | EOk uu___1 -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | (FZ10901, input::[]) ->
                        (match eval_with_policy p next env input with
                         | EOk (VText s) ->
                             EOk
                               (VText
                                  (Wikifn_Primitive_Kernel.z10901_get_first_character
                                     s))
                         | EOk uu___1 -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | (FZ14124, first::last::[]) ->
                        (match eval_with_policy p next env first with
                         | EOk (VNat first_codepoint) ->
                             (match eval_with_policy p next env last with
                              | EOk (VNat last_codepoint) ->
                                  EOk
                                    (VText
                                       (Wikifn_Primitive_Kernel.z14124_string_of_characters_from_unicode_range
                                          first_codepoint last_codepoint))
                              | EOk uu___1 -> EErr ETypeMismatch
                              | EErr err -> EErr err)
                         | EOk uu___1 -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | (FZ14456, input::[]) ->
                        (match eval_with_policy p next env input with
                         | EOk (VText s) ->
                             EOk
                               (VText
                                  (Wikifn_Primitive_Kernel.z14456_remove_first_character
                                     s))
                         | EOk uu___1 -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | (FZ14520, input::chars::[]) ->
                        (match eval_with_policy p next env input with
                         | EOk (VText input_text) ->
                             (match eval_with_policy p next env chars with
                              | EOk (VText chars_text) ->
                                  EOk
                                    (VText
                                       (Wikifn_Primitive_Kernel.z14520_remove_all_characters_in_second_string
                                          input_text chars_text))
                              | EOk uu___1 -> EErr ETypeMismatch
                              | EErr err -> EErr err)
                         | EOk uu___1 -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | (FInternalFreshPrivateUse, input::[]) ->
                        (match eval_with_policy p next env input with
                         | EOk (VText s) ->
                             EOk
                               (VText
                                  (Wikifn_Primitive_Kernel.z36070_first_available_private_use_character
                                     s))
                         | EOk uu___1 -> EErr ETypeMismatch
                         | EErr err -> EErr err)
                    | (uu___1, uu___2) ->
                        (match p fid args with
                         | Body body -> eval_with_policy p next env body
                         | NoBody -> EErr EArityMismatch)))
let (manual_policy : function_id -> expr Prims.list -> body_option) =
  fun fid ->
    fun args ->
      match (fid, args) with
      | (FZ10052, input::[]) -> Body (z10077_expr input)
      | (FZ14613, input::old_alphabet::new_alphabet::[]) ->
          Body (z36070_expr input old_alphabet new_alphabet)
      | (FZ21679, input::[]) -> Body (z21681_expr input)
      | (FZ22294, input::[]) -> Body (z22295_expr input)
      | (FZ38114, input::[]) -> Body (z38115_expr input)
      | (uu___, uu___1) -> NoBody
let (eval : Prims.nat -> value Prims.list -> expr -> value eval_result) =
  fun fuel -> fun env -> fun e -> eval_with_policy manual_policy fuel env e
let (eval_z10052 :
  Prims.nat -> Wikifn_Primitive_Kernel.text -> value eval_result) =
  fun fuel ->
    fun input -> eval fuel [] (ECall (FZ10052, [EValue (VText input)]))
let (eval_z22294 :
  Prims.nat -> Wikifn_Primitive_Kernel.text -> value eval_result) =
  fun fuel ->
    fun input -> eval fuel [] (ECall (FZ22294, [EValue (VText input)]))
let (eval_z14613 :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text ->
        Wikifn_Primitive_Kernel.text -> value eval_result)
  =
  fun fuel ->
    fun input ->
      fun old_alphabet ->
        fun new_alphabet ->
          eval fuel []
            (ECall
               (FZ14613,
                 [EValue (VText input);
                 EValue (VText old_alphabet);
                 EValue (VText new_alphabet)]))
let (eval_z21679 :
  Prims.nat -> Wikifn_Primitive_Kernel.text -> value eval_result) =
  fun fuel ->
    fun input -> eval fuel [] (ECall (FZ21679, [EValue (VText input)]))
let (eval_z38114 :
  Prims.nat -> Wikifn_Primitive_Kernel.text -> value eval_result) =
  fun fuel ->
    fun input -> eval fuel [] (ECall (FZ38114, [EValue (VText input)]))
