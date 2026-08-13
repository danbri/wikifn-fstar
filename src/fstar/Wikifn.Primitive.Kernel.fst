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

type kernel_result (a:Type0) =
  | KOk : a -> kernel_result a
  | KErr : kernel_error -> kernel_result a

let rec nat_eq (a:nat) (b:nat) : Tot bool =
  match a, b with
  | 0, 0 -> true
  | 0, _ -> false
  | _, 0 -> false
  | _, _ -> nat_eq (a - 1) (b - 1)

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

let text_empty : text = []

let text_is_empty (s:text) : Tot bool =
  match s with
  | [] -> true
  | _ -> false

let rec text_length (s:text) : Tot nat =
  match s with
  | [] -> 0
  | _ :: tail -> 1 + text_length tail

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
