module Wikifn.Primitive.Kernel

type codepoint = nat
type text = list codepoint

type kernel_value =
  | KNat : nat -> kernel_value
  | KBool : bool -> kernel_value
  | KText : text -> kernel_value

type kernel_error =
  | KTypeMismatch
  | KUnderflow
  | KEmptyPattern
  | KFuelExhausted

type kernel_result (a:Type0) =
  | KOk : a -> kernel_result a
  | KErr : kernel_error -> kernel_result a

let bind_kernel (#a:Type0) (#b:Type0)
  (r:kernel_result a)
  (f:a -> Tot (kernel_result b))
  : Tot (kernel_result b) =
  match r with
  | KOk x -> f x
  | KErr e -> KErr e

(* Decidable equality on nat, not unary recursion. The recursive form costs
   O(min a b) steps, and every codepoint comparison against a private-use
   marker near 61000 then costs about 61000 bignum operations after
   extraction. The comparison functions below already use the built-in
   operators; this one was the outlier. *)
let nat_eq (a:nat) (b:nat) : Tot bool =
  a = b

let nat_is_zero (n:nat) : Tot bool =
  match n with
  | 0 -> true
  | _ -> false

let nat_successor (n:nat) : Tot nat =
  n + 1

let nat_predecessor (n:nat) : Tot (kernel_result nat) =
  match n with
  | 0 -> KErr KUnderflow
  | _ -> KOk (n - 1)

let nat_decrement_floor (n:nat) : Tot nat =
  match n with
  | 0 -> 0
  | _ -> n - 1

let nat_sub_floor (left:nat) (right:nat) : Tot nat =
  if left <= right then 0 else left - right

let nat_greater_than (left:nat) (right:nat) : Tot bool =
  right < left

let nat_greater_than_or_equal (left:nat) (right:nat) : Tot bool =
  right <= left

let nat_less_than (left:nat) (right:nat) : Tot bool =
  left < right

let nat_less_than_or_equal (left:nat) (right:nat) : Tot bool =
  left <= right

let bool_and (left:bool) (right:bool) : Tot bool =
  left && right

let bool_or (left:bool) (right:bool) : Tot bool =
  left || right

let bool_not (input:bool) : Tot bool =
  not input

let text_empty : text = []

let text_is_empty (s:text) : Tot bool =
  match s with
  | [] -> true
  | _ -> false

let rec text_length (s:text) : Tot nat =
  match s with
  | [] -> 0
  | _ :: tail -> 1 + text_length tail

let rec text_eq (left:text) (right:text) : Tot bool =
  match left, right with
  | [], [] -> true
  | [], _ :: _ -> false
  | _ :: _, [] -> false
  | lhead :: ltail, rhead :: rtail ->
      if nat_eq lhead rhead then text_eq ltail rtail else false

let rec text_concat (left:text) (right:text) : Tot text =
  match left with
  | [] -> right
  | head :: tail -> head :: text_concat tail right

let rec text_starts_with (prefix:text) (s:text) : Tot bool =
  match prefix, s with
  | [], _ -> true
  | _ :: _, [] -> false
  | p :: ptail, c :: ctail ->
      if nat_eq p c then text_starts_with ptail ctail else false

let rec text_drop_prefix (prefix:text) (s:text) : Tot (kernel_result text) =
  match prefix, s with
  | [], _ -> KOk s
  | _ :: _, [] -> KErr KTypeMismatch
  | p :: ptail, c :: ctail ->
      if nat_eq p c then text_drop_prefix ptail ctail else KErr KTypeMismatch

let text_first (s:text) : Tot text =
  match s with
  | [] -> []
  | head :: _ -> [head]

let text_remove_first (s:text) : Tot text =
  match s with
  | [] -> []
  | _ :: tail -> tail

let rec text_contains_codepoint (needle:codepoint) (s:text) : Tot bool =
  match s with
  | [] -> false
  | head :: tail ->
      if nat_eq needle head then true else text_contains_codepoint needle tail

let rec text_remove_chars (input:text) (chars:text) : Tot text =
  match input with
  | [] -> []
  | head :: tail ->
      if text_contains_codepoint head chars
      then text_remove_chars tail chars
      else head :: text_remove_chars tail chars

let rec text_range_from_len (start:codepoint) (len:nat) : Tot text (decreases len) =
  match len with
  | 0 -> []
  | _ -> start :: text_range_from_len (start + 1) (len - 1)

let text_unicode_range (first:codepoint) (last:codepoint) : Tot text =
  if first <= last
  then text_range_from_len first (last - first + 1)
  else []

let rec text_replace_all_fuel
  (fuel:nat)
  (input:text)
  (pattern:text)
  (replacement:text)
  : Tot (kernel_result text) (decreases fuel) =
  match fuel with
  | 0 -> KErr KFuelExhausted
  | _ ->
      if text_is_empty pattern then KErr KEmptyPattern
      else if text_starts_with pattern input then
        bind_kernel (text_drop_prefix pattern input) (fun rest ->
          bind_kernel (text_replace_all_fuel (fuel - 1) rest pattern replacement) (fun replaced ->
            KOk (text_concat replacement replaced)))
      else
        match input with
        | [] -> KOk []
        | head :: tail ->
            bind_kernel (text_replace_all_fuel (fuel - 1) tail pattern replacement) (fun replaced ->
              KOk (head :: replaced))

let text_replace_all
  (input:text)
  (pattern:text)
  (replacement:text)
  : Tot (kernel_result text) =
  text_replace_all_fuel (text_length input + 1) input pattern replacement

let z10008_is_empty_string (input:text) : Tot bool =
  text_is_empty input

let z10075_replace_all_substrings
  (input:text)
  (substring:text)
  (replacement:text)
  : Tot (kernel_result text) =
  text_replace_all input substring replacement

let z10901_get_first_character (input:text) : Tot text =
  text_first input

let z14124_string_of_characters_from_unicode_range
  (first:codepoint)
  (last:codepoint)
  : Tot text =
  text_unicode_range first last

let z14456_remove_first_character (input:text) : Tot text =
  text_remove_first input

let z14520_remove_all_characters_in_second_string
  (input:text)
  (chars:text)
  : Tot text =
  text_remove_chars input chars

let z866_string_equality (left:text) (right:text) : Tot bool =
  text_eq left right

let z10174_and (left:bool) (right:bool) : Tot bool =
  bool_and left right

let z10184_or (left:bool) (right:bool) : Tot bool =
  bool_or left right

let z10216_not (input:bool) : Tot bool =
  bool_not input

let z13522_equality_of_natural_numbers
  (left:nat)
  (right:nat)
  : Tot bool =
  nat_eq left right

let z13569_subtract_natural_numbers_with_floor_of_0
  (left:nat)
  (right:nat)
  : Tot nat =
  nat_sub_floor left right

let z13582_decrement_natural_number_by_one (input:nat) : Tot nat =
  nat_decrement_floor input

let z13676_greater_than_natural_numbers
  (left:nat)
  (right:nat)
  : Tot bool =
  nat_greater_than left right

let z13682_greater_than_or_equal_natural_numbers
  (left:nat)
  (right:nat)
  : Tot bool =
  nat_greater_than_or_equal left right

let z13689_less_than_natural_numbers
  (left:nat)
  (right:nat)
  : Tot bool =
  nat_less_than left right

let z13695_less_than_or_equal_natural_numbers
  (left:nat)
  (right:nat)
  : Tot bool =
  nat_less_than_or_equal left right

let rec text_first_fresh_from_fuel
  (fuel:nat)
  (current:codepoint)
  (used:text)
  : Tot text (decreases fuel) =
  match fuel with
  | 0 -> []
  | _ ->
      if text_contains_codepoint current used
      then text_first_fresh_from_fuel (fuel - 1) (current + 1) used
      else [current]

let z36070_first_available_private_use_character (input:text) : Tot text =
  text_first_fresh_from_fuel (63487 - 60928 + 1) 60928 input

let z802_if (#a:Type0) (condition:bool) (then_value:a) (else_value:a) : Tot a =
  if condition then then_value else else_value

let nat_eq_refl_2 () :
  Lemma (nat_eq 2 2 == true)
  = ()

let nat_eq_false_2_3 () :
  Lemma (nat_eq 2 3 == false)
  = ()

let text_length_concat_example () :
  Lemma (text_length (text_concat [1; 2] [3]) == 3)
  = ()

let text_starts_with_example () :
  Lemma (text_starts_with [1; 2] [1; 2; 3] == true)
  = ()

let text_starts_with_false_example () :
  Lemma (text_starts_with [1; 3] [1; 2; 3] == false)
  = ()

let text_eq_true_example () :
  Lemma (text_eq [1; 2; 3] [1; 2; 3] == true)
  = ()

let text_eq_false_example () :
  Lemma (text_eq [1; 2; 3] [1; 2] == false)
  = ()

let z10008_empty_example () :
  Lemma (z10008_is_empty_string [] == true)
  = ()

let z10008_nonempty_example () :
  Lemma (z10008_is_empty_string [97] == false)
  = ()

let z10075_replace_one_char_example () :
  Lemma (
    z10075_replace_all_substrings [1; 2; 1] [1] [3]
    == KOk [3; 2; 3]
  )
  = ()

let z10075_delete_substring_example () :
  Lemma (
    z10075_replace_all_substrings [1; 2; 1] [2] []
    == KOk [1; 1]
  )
  = ()

let z10901_first_character_example () :
  Lemma (z10901_get_first_character [116; 101; 115; 116] == [116])
  = ()

let z14124_small_range_example () :
  Lemma (
    z14124_string_of_characters_from_unicode_range 1 3
    == [1; 2; 3]
  )
  = ()

let z14456_remove_first_character_example () :
  Lemma (
    z14456_remove_first_character
      [72; 101; 108; 108; 111; 44; 32; 119; 111; 114; 108; 100; 33]
    == [101; 108; 108; 111; 44; 32; 119; 111; 114; 108; 100; 33]
  )
  = ()

let z14456_empty_example () :
  Lemma (z14456_remove_first_character [] == [])
  = ()

let z14520_remove_chars_example () :
  Lemma (
    z14520_remove_all_characters_in_second_string [1; 2; 3; 2] [2]
    == [1; 3]
  )
  = ()

let z866_string_equality_true_example () :
  Lemma (z866_string_equality [1; 2; 3] [1; 2; 3] == true)
  = ()

let z866_string_equality_false_example () :
  Lemma (z866_string_equality [1; 2; 3] [1; 2] == false)
  = ()

let z10174_and_examples () :
  Lemma (
    z10174_and true true == true /\
    z10174_and true false == false /\
    z10174_and false true == false /\
    z10174_and false false == false
  )
  = ()

let z10184_or_examples () :
  Lemma (
    z10184_or true true == true /\
    z10184_or true false == true /\
    z10184_or false true == true /\
    z10184_or false false == false
  )
  = ()

let z10216_not_examples () :
  Lemma (
    z10216_not true == false /\
    z10216_not false == true
  )
  = ()

let z13522_nat_equality_examples () :
  Lemma (
    z13522_equality_of_natural_numbers 2 2 == true /\
    z13522_equality_of_natural_numbers 2 3 == false
  )
  = ()

let z13569_subtract_floor_examples () :
  Lemma (
    z13569_subtract_natural_numbers_with_floor_of_0 4 2 == 2 /\
    z13569_subtract_natural_numbers_with_floor_of_0 2 4 == 0
  )
  = ()

let z13582_decrement_floor_examples () :
  Lemma (
    z13582_decrement_natural_number_by_one 7 == 6 /\
    z13582_decrement_natural_number_by_one 0 == 0
  )
  = ()

let natural_comparison_examples () :
  Lemma (
    z13676_greater_than_natural_numbers 99 42 == true /\
    z13676_greater_than_natural_numbers 42 42 == false /\
    z13682_greater_than_or_equal_natural_numbers 42 42 == true /\
    z13689_less_than_natural_numbers 42 99 == true /\
    z13689_less_than_natural_numbers 42 42 == false /\
    z13695_less_than_or_equal_natural_numbers 42 42 == true
  )
  = ()

let z802_if_string_example () :
  Lemma (z802_if true [1] [2] == [1])
  = ()
