module Wikifn.Roundtrip

open FStar.Mul
open Wikifn.Primitive.Kernel
open Wikifn.Zid
open Wikifn.Zid.Laws
open Wikifn.Eval

(*
  Z805 Reify and Z808 Abstract are inverses.

  Wikifunctions has no type system. What it has instead is Reify, which takes
  any object apart into the key-value pairs it is made of, and Abstract, which
  puts one back together. The corpus asks and answers questions about types
  with them: Z15818 is Natural number is written as

      Z13052(Z811(Z805(x)), Z811(Z805(natural 0)))

  - reify both, take the first pair of each, compare. That only works if the
  two agree, and "agree" is exactly this lemma. If Abstract could not read what
  Reify wrote, every such test would answer wrongly and nothing would say so.

  Proved for every shape Reify answers for. It refuses a list and a pair, which
  carry no element type; there the statement is vacuous and says so rather than
  pretending otherwise.

  The spellings underneath - a natural as its digits, a key as Z13518K1 - are
  proved to read back in Wikifn.Zid.Laws. This module is the value-level
  statement on top of those.
*)

#set-options "--fuel 4 --ifuel 2 --z3rlimit 200 --split_queries always"

(* Reify never answers anything but a list of pairs, so the round trip can be
   stated over the list rather than over an option of an unknown shape. *)
let reify_answers_a_list (v:value)
  : Lemma (ensures (match reify_value v with
                    | Some (VList _ _) -> True
                    | Some _ -> False
                    | None -> True))
= ()

(* The fields of a record survive being taken apart and put back together.
   Each key is written out and read back, which is where Wikifn.Zid.Laws comes
   in; the values are carried across untouched because Reify is shallow. *)
let rec pairs_fields_reify_fields (fields:list (zkey & value))
  : Lemma (requires fields_avoid_type_key fields)
          (ensures pairs_fields (reify_fields fields) == Some fields)
          (decreases fields)
=
  match fields with
  | [] -> ()
  | (k, _) :: rest ->
      parse_render_zkey k;
      pairs_fields_reify_fields rest

(* With the Z1K1 entry in front, which Abstract drops because it carries the
   type rather than a field. *)
let pairs_fields_with_type (t:zid) (fields:list (zkey & value))
  : Lemma (requires fields_avoid_type_key fields)
          (ensures pairs_fields (VPair (key_reference_value key_z1k1) (VFunc t)
                                 :: reify_fields fields) == Some fields)
=
  parse_render_zkey key_z1k1;
  pairs_fields_reify_fields fields

(* The type entry is found, and it is the type. *)
let type_entry_found (t:zid) (rest:list value)
  : Lemma (ensures pairs_lookup key_z1k1
                     (VPair (key_reference_value key_z1k1) (VFunc t) :: rest)
                == Some (VFunc t))
= ()

(* One shape at a time. Every case needs the same two facts - that the type
   entry is found under Z1K1, and that the one field entry is found under its
   own key - and each is an instance of the key round trip. *)
let reify_abstract_text (t:text)
  : Lemma (ensures (match reify_value (VText t) with
                    | Some (VList _ items) -> abstract_value items == Some (VText t)
                    | _ -> False))
=
  parse_render_zkey key_z1k1;
  parse_render_zkey key_z6k1

let reify_abstract_bool (b:bool)
  : Lemma (ensures (match reify_value (VBool b) with
                    | Some (VList _ items) -> abstract_value items == Some (VBool b)
                    | _ -> False))
=
  parse_render_zkey key_z1k1;
  parse_render_zkey (global_key 40 1)

let reify_abstract_nat (n:nat)
  : Lemma (ensures (match reify_value (VNat n) with
                    | Some (VList _ items) -> abstract_value items == Some (VNat n)
                    | _ -> False))
=
  parse_render_zkey key_z1k1;
  parse_render_zkey (global_key 13518 1);
  parse_render_nat n

let reify_abstract_func (f:zid)
  : Lemma (ensures (match reify_value (VFunc f) with
                    | Some (VList _ items) -> abstract_value items == Some (VFunc f)
                    | _ -> False))
=
  parse_render_zkey key_z1k1;
  parse_render_zkey (global_key 9 1)

let reify_abstract_record (t:zid) (fields:list (zkey & value))
  : Lemma (requires record_type_is_a_record t /\ fields_avoid_type_key fields)
          (ensures (match reify_value (VRecord t fields) with
                    | Some (VList _ items) -> abstract_value items == Some (VRecord t fields)
                    | _ -> False))
=
  parse_render_zkey key_z1k1;
  pairs_fields_with_type t fields

let reify_abstract (v:value)
  : Lemma (ensures (match reify_value v with
                    | Some (VList _ items) -> abstract_value items == Some v
                    | _ -> True))
=
  match v with
  | VText t -> reify_abstract_text t
  | VBool b -> reify_abstract_bool b
  | VNat n -> reify_abstract_nat n
  | VFunc f -> reify_abstract_func f
  | VRecord t fields ->
      if record_type_is_a_record t && fields_avoid_type_key fields
      then reify_abstract_record t fields else ()
  | VList _ _ -> ()
  | VPair _ _ -> ()
  | VQuote _ -> ()

(* Stated the way a caller would use it: reify then abstract, and you have what
   you started with. *)
let reify_then_abstract (v:value)
  : Lemma (requires Some? (reify_value v))
          (ensures (match reify_value v with
                    | Some (VList _ items) -> abstract_value items == Some v
                    | _ -> False))
=
  reify_answers_a_list v;
  reify_abstract v

(* Which values Reify answers for, so the requires above is checkable rather
   than a condition a caller has to guess at. *)
let reify_answers_for (v:value)
  : Lemma (ensures Some? (reify_value v) <==> (match v with
                                               | VList _ _ | VPair _ _ | VQuote _ -> False
                                               | VRecord t fields ->
                                                   record_type_is_a_record t /\ fields_avoid_type_key fields
                                               | _ -> True))
= ()
