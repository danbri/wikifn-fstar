open Prims
type codepoint = Prims.nat
type text = codepoint Prims.list
type kernel_value =
  | KNat of Prims.nat
  | KBool of Prims.bool
  | KText of text
let (uu___is_KNat : kernel_value -> Prims.bool) =
  fun projectee -> match projectee with | KNat _0 -> true | uu___ -> false
let (__proj__KNat__item___0 : kernel_value -> Prims.nat) =
  fun projectee -> match projectee with | KNat _0 -> _0
let (uu___is_KBool : kernel_value -> Prims.bool) =
  fun projectee -> match projectee with | KBool _0 -> true | uu___ -> false
let (__proj__KBool__item___0 : kernel_value -> Prims.bool) =
  fun projectee -> match projectee with | KBool _0 -> _0
let (uu___is_KText : kernel_value -> Prims.bool) =
  fun projectee -> match projectee with | KText _0 -> true | uu___ -> false
let (__proj__KText__item___0 : kernel_value -> text) =
  fun projectee -> match projectee with | KText _0 -> _0
type kernel_error =
  | KTypeMismatch
  | KUnderflow
  | KEmptyPattern
  | KFuelExhausted
let (uu___is_KTypeMismatch : kernel_error -> Prims.bool) =
  fun projectee ->
    match projectee with | KTypeMismatch -> true | uu___ -> false
let (uu___is_KUnderflow : kernel_error -> Prims.bool) =
  fun projectee -> match projectee with | KUnderflow -> true | uu___ -> false
let (uu___is_KEmptyPattern : kernel_error -> Prims.bool) =
  fun projectee ->
    match projectee with | KEmptyPattern -> true | uu___ -> false
let (uu___is_KFuelExhausted : kernel_error -> Prims.bool) =
  fun projectee ->
    match projectee with | KFuelExhausted -> true | uu___ -> false
type 'a kernel_result =
  | KOk of 'a
  | KErr of kernel_error
let uu___is_KOk : 'a . 'a kernel_result -> Prims.bool =
  fun projectee -> match projectee with | KOk _0 -> true | uu___ -> false
let __proj__KOk__item___0 : 'a . 'a kernel_result -> 'a =
  fun projectee -> match projectee with | KOk _0 -> _0
let uu___is_KErr : 'a . 'a kernel_result -> Prims.bool =
  fun projectee -> match projectee with | KErr _0 -> true | uu___ -> false
let __proj__KErr__item___0 : 'a . 'a kernel_result -> kernel_error =
  fun projectee -> match projectee with | KErr _0 -> _0
let bind_kernel :
  'a 'b . 'a kernel_result -> ('a -> 'b kernel_result) -> 'b kernel_result =
  fun r -> fun f -> match r with | KOk x -> f x | KErr e -> KErr e
let rec (nat_eq : Prims.nat -> Prims.nat -> Prims.bool) =
  fun a ->
    fun b ->
      match (a, b) with
      | (uu___, uu___1) when
          (uu___ = Prims.int_zero) && (uu___1 = Prims.int_zero) -> true
      | (uu___, uu___1) when uu___ = Prims.int_zero -> false
      | (uu___, uu___1) when uu___1 = Prims.int_zero -> false
      | (uu___, uu___1) -> nat_eq (a - Prims.int_one) (b - Prims.int_one)
let (nat_is_zero : Prims.nat -> Prims.bool) =
  fun n ->
    match n with | uu___ when uu___ = Prims.int_zero -> true | uu___ -> false
let (nat_successor : Prims.nat -> Prims.nat) = fun n -> n + Prims.int_one
let (nat_predecessor : Prims.nat -> Prims.nat kernel_result) =
  fun n ->
    match n with
    | uu___ when uu___ = Prims.int_zero -> KErr KUnderflow
    | uu___ -> KOk (n - Prims.int_one)
let (nat_decrement_floor : Prims.nat -> Prims.nat) =
  fun n ->
    match n with
    | uu___ when uu___ = Prims.int_zero -> Prims.int_zero
    | uu___ -> n - Prims.int_one
let (nat_sub_floor : Prims.nat -> Prims.nat -> Prims.nat) =
  fun left ->
    fun right -> if left <= right then Prims.int_zero else left - right
let (nat_greater_than : Prims.nat -> Prims.nat -> Prims.bool) =
  fun left -> fun right -> right < left
let (nat_greater_than_or_equal : Prims.nat -> Prims.nat -> Prims.bool) =
  fun left -> fun right -> right <= left
let (nat_less_than : Prims.nat -> Prims.nat -> Prims.bool) =
  fun left -> fun right -> left < right
let (nat_less_than_or_equal : Prims.nat -> Prims.nat -> Prims.bool) =
  fun left -> fun right -> left <= right
let (bool_and : Prims.bool -> Prims.bool -> Prims.bool) =
  fun left -> fun right -> left && right
let (bool_or : Prims.bool -> Prims.bool -> Prims.bool) =
  fun left -> fun right -> left || right
let (bool_not : Prims.bool -> Prims.bool) =
  fun input -> Prims.op_Negation input
let (text_empty : text) = []
let (text_is_empty : text -> Prims.bool) =
  fun s -> match s with | [] -> true | uu___ -> false
let rec (text_length : text -> Prims.nat) =
  fun s ->
    match s with
    | [] -> Prims.int_zero
    | uu___::tail -> Prims.int_one + (text_length tail)
let rec (text_eq : text -> text -> Prims.bool) =
  fun left ->
    fun right ->
      match (left, right) with
      | ([], []) -> true
      | ([], uu___::uu___1) -> false
      | (uu___::uu___1, []) -> false
      | (lhead::ltail, rhead::rtail) ->
          if nat_eq lhead rhead then text_eq ltail rtail else false
let rec (text_concat : text -> text -> text) =
  fun left ->
    fun right ->
      match left with
      | [] -> right
      | head::tail -> head :: (text_concat tail right)
let rec (text_starts_with : text -> text -> Prims.bool) =
  fun prefix ->
    fun s ->
      match (prefix, s) with
      | ([], uu___) -> true
      | (uu___::uu___1, []) -> false
      | (p::ptail, c::ctail) ->
          if nat_eq p c then text_starts_with ptail ctail else false
let rec (text_drop_prefix : text -> text -> text kernel_result) =
  fun prefix ->
    fun s ->
      match (prefix, s) with
      | ([], uu___) -> KOk s
      | (uu___::uu___1, []) -> KErr KTypeMismatch
      | (p::ptail, c::ctail) ->
          if nat_eq p c
          then text_drop_prefix ptail ctail
          else KErr KTypeMismatch
let (text_first : text -> text) =
  fun s -> match s with | [] -> [] | head::uu___ -> [head]
let (text_remove_first : text -> text) =
  fun s -> match s with | [] -> [] | uu___::tail -> tail
let rec (text_contains_codepoint : codepoint -> text -> Prims.bool) =
  fun needle ->
    fun s ->
      match s with
      | [] -> false
      | head::tail ->
          if nat_eq needle head
          then true
          else text_contains_codepoint needle tail
let rec (text_remove_chars : text -> text -> text) =
  fun input ->
    fun chars ->
      match input with
      | [] -> []
      | head::tail ->
          if text_contains_codepoint head chars
          then text_remove_chars tail chars
          else head :: (text_remove_chars tail chars)
let rec (text_range_from_len : codepoint -> Prims.nat -> text) =
  fun start ->
    fun len ->
      match len with
      | uu___ when uu___ = Prims.int_zero -> []
      | uu___ -> start ::
          (text_range_from_len (start + Prims.int_one) (len - Prims.int_one))
let (text_unicode_range : codepoint -> codepoint -> text) =
  fun first ->
    fun last ->
      if first <= last
      then text_range_from_len first ((last - first) + Prims.int_one)
      else []
let rec (text_replace_all_fuel :
  Prims.nat -> text -> text -> text -> text kernel_result) =
  fun fuel ->
    fun input ->
      fun pattern ->
        fun replacement ->
          match fuel with
          | uu___ when uu___ = Prims.int_zero -> KErr KFuelExhausted
          | uu___ ->
              if text_is_empty pattern
              then KErr KEmptyPattern
              else
                if text_starts_with pattern input
                then
                  bind_kernel (text_drop_prefix pattern input)
                    (fun rest ->
                       bind_kernel
                         (text_replace_all_fuel (fuel - Prims.int_one) rest
                            pattern replacement)
                         (fun replaced ->
                            KOk (text_concat replacement replaced)))
                else
                  (match input with
                   | [] -> KOk []
                   | head::tail ->
                       bind_kernel
                         (text_replace_all_fuel (fuel - Prims.int_one) tail
                            pattern replacement)
                         (fun replaced -> KOk (head :: replaced)))
let (text_replace_all : text -> text -> text -> text kernel_result) =
  fun input ->
    fun pattern ->
      fun replacement ->
        text_replace_all_fuel ((text_length input) + Prims.int_one) input
          pattern replacement
let (z10008_is_empty_string : text -> Prims.bool) =
  fun input -> text_is_empty input
let (z10075_replace_all_substrings :
  text -> text -> text -> text kernel_result) =
  fun input ->
    fun substring ->
      fun replacement -> text_replace_all input substring replacement
let (z10901_get_first_character : text -> text) =
  fun input -> text_first input
let (z14124_string_of_characters_from_unicode_range :
  codepoint -> codepoint -> text) =
  fun first -> fun last -> text_unicode_range first last
let (z14456_remove_first_character : text -> text) =
  fun input -> text_remove_first input
let (z14520_remove_all_characters_in_second_string : text -> text -> text) =
  fun input -> fun chars -> text_remove_chars input chars
let (z866_string_equality : text -> text -> Prims.bool) =
  fun left -> fun right -> text_eq left right
let (z10174_and : Prims.bool -> Prims.bool -> Prims.bool) =
  fun left -> fun right -> bool_and left right
let (z10184_or : Prims.bool -> Prims.bool -> Prims.bool) =
  fun left -> fun right -> bool_or left right
let (z10216_not : Prims.bool -> Prims.bool) = fun input -> bool_not input
let (z13522_equality_of_natural_numbers :
  Prims.nat -> Prims.nat -> Prims.bool) =
  fun left -> fun right -> nat_eq left right
let (z13569_subtract_natural_numbers_with_floor_of_0 :
  Prims.nat -> Prims.nat -> Prims.nat) =
  fun left -> fun right -> nat_sub_floor left right
let (z13582_decrement_natural_number_by_one : Prims.nat -> Prims.nat) =
  fun input -> nat_decrement_floor input
let (z13676_greater_than_natural_numbers :
  Prims.nat -> Prims.nat -> Prims.bool) =
  fun left -> fun right -> nat_greater_than left right
let (z13682_greater_than_or_equal_natural_numbers :
  Prims.nat -> Prims.nat -> Prims.bool) =
  fun left -> fun right -> nat_greater_than_or_equal left right
let (z13689_less_than_natural_numbers : Prims.nat -> Prims.nat -> Prims.bool)
  = fun left -> fun right -> nat_less_than left right
let (z13695_less_than_or_equal_natural_numbers :
  Prims.nat -> Prims.nat -> Prims.bool) =
  fun left -> fun right -> nat_less_than_or_equal left right
let rec (text_first_fresh_from_fuel : Prims.nat -> codepoint -> text -> text)
  =
  fun fuel ->
    fun current ->
      fun used ->
        match fuel with
        | uu___ when uu___ = Prims.int_zero -> []
        | uu___ ->
            if text_contains_codepoint current used
            then
              text_first_fresh_from_fuel (fuel - Prims.int_one)
                (current + Prims.int_one) used
            else [current]
let (z36070_first_available_private_use_character : text -> text) =
  fun input ->
    text_first_fresh_from_fuel (Prims.of_int (2560)) (Prims.of_int (60928))
      input
let z802_if : 'a . Prims.bool -> 'a -> 'a -> 'a =
  fun condition ->
    fun then_value ->
      fun else_value -> if condition then then_value else else_value
