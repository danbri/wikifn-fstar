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
