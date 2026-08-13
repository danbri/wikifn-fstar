module Wikifn.Primitive.Frontier

open Wikifn.Primitive.Kernel

(*
  Checked primitive-frontier witnesses for high-reuse Wikifunction string
  functions. These wrappers ground the intended operation over the current
  codepoint-list text model; they do not yet claim a complete canonical ZObject
  adapter or host-language equivalence proof.
*)

let z10000_join_two_strings (left:text) (right:text) : Tot text =
  text_concat left right

let z10615_string_starts_with (input:text) (prefix:text) : Tot bool =
  text_starts_with prefix input

let z11040_string_length (input:text) : Tot nat =
  text_length input

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

let z10000_join_example () :
  Lemma (
    z10000_join_two_strings [1; 2] [3; 4]
    == [1; 2; 3; 4]
  )
  = ()

let z10000_join_empty_left_example () :
  Lemma (
    z10000_join_two_strings [] [3; 4]
    == [3; 4]
  )
  = ()

let z10615_starts_with_true_example () :
  Lemma (
    z10615_string_starts_with [1; 2; 3] [1; 2]
    == true
  )
  = ()

let z10615_starts_with_false_example () :
  Lemma (
    z10615_string_starts_with [1; 2; 3] [2; 3]
    == false
  )
  = ()

let z11040_length_example () :
  Lemma (
    z11040_string_length [1; 2; 3]
    == 3
  )
  = ()

let z866_string_equality_example () :
  Lemma (
    z866_string_equality [1; 2; 3] [1; 2; 3] == true
  )
  = ()

let z10174_and_example () :
  Lemma (z10174_and true false == false)
  = ()

let z10184_or_example () :
  Lemma (z10184_or false true == true)
  = ()

let z10216_not_example () :
  Lemma (z10216_not false == true)
  = ()

let z13522_nat_equality_example () :
  Lemma (
    z13522_equality_of_natural_numbers 2 3 == false
  )
  = ()

let z13569_subtract_floor_example () :
  Lemma (
    z13569_subtract_natural_numbers_with_floor_of_0 2 4 == 0
  )
  = ()

let z13582_decrement_floor_example () :
  Lemma (
    z13582_decrement_natural_number_by_one 0 == 0
  )
  = ()

let natural_comparison_frontier_example () :
  Lemma (
    z13676_greater_than_natural_numbers 99 42 == true /\
    z13682_greater_than_or_equal_natural_numbers 42 42 == true /\
    z13689_less_than_natural_numbers 42 99 == true /\
    z13695_less_than_or_equal_natural_numbers 99 42 == false
  )
  = ()
