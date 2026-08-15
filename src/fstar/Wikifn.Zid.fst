module Wikifn.Zid

open FStar.Mul
open Wikifn.Primitive.Kernel

(*
  Identifiers, represented so that comparison is one integer test.

  A ZID is the letter Z followed by a positive decimal integer with no leading
  zero, so Z10627 is fully described by 10627. A key is a ZID and a positive
  index, so Z10627K1 is (10627, 1). Carrying them as numbers rather than as
  strings makes equality a machine comparison instead of a list traversal, and
  makes an invalid identifier unrepresentable rather than merely unlikely.

  Text here is the same codepoint list the primitive kernel uses. There is one
  text representation in this codebase and identifiers are parsed from it, so
  nothing has to convert between string types mid-evaluation.
*)

type zid = n:nat{n > 0}

(* Keys come in two forms. A global key names its owner, as in Z10627K1. A
   local key omits it, as in K1, which is how a function's own definition
   refers to its arguments. Both are real; the owner is therefore optional. *)
type zkey = {
  key_owner: option zid;
  key_index: n:nat{n > 0}
}

let cp_z : codepoint = 90
let cp_k : codepoint = 75
let cp_zero : codepoint = 48
let cp_nine : codepoint = 57

let is_digit (c:codepoint) : Tot bool =
  c >= cp_zero && c <= cp_nine

let digit_value (c:codepoint) : Tot nat =
  if is_digit c then c - cp_zero else 0

(* Reads the leading run of digits, returning its value, how many digits it
   consumed, and what is left. The count distinguishes "no digits" from a
   parsed zero. *)
let rec take_digits (s:text) (value:nat) (count:nat) : Tot (nat & nat & text) (decreases s) =
  match s with
  | [] -> (value, count, [])
  | head :: tail ->
      if is_digit head
      then take_digits tail (value * 10 + digit_value head) (count + 1)
      else (value, count, s)

let starts_with_zero (s:text) : Tot bool =
  match s with
  | head :: _ -> head = cp_zero
  | [] -> false

(* A decimal natural. Wikifunctions writes a Z13518 natural as the string of its
   digits, so reading one back is what Z808 Abstract needs. Leading zeros are
   refused for the same reason parse_zid refuses them: two spellings for one
   value would make the round trip below untrue. *)
let parse_nat (s:text) : Tot (option nat) =
  match s with
  | [] -> None
  | [only] -> if is_digit only then Some (digit_value only) else None
  | _ ->
      if starts_with_zero s then None
      else
        let (value, count, remainder) = take_digits s 0 0 in
        if count > 0 && Nil? remainder then Some value else None

let parse_zid (s:text) : Tot (option zid) =
  match s with
  | [] -> None
  | head :: rest ->
      if head <> cp_z || starts_with_zero rest then None
      else
        let (value, count, remainder) = take_digits rest 0 0 in
        if count > 0 && Nil? remainder && value > 0 then Some value else None

(* Reads the K-and-index tail shared by both key forms. *)
let parse_key_index (owner:option zid) (s:text) : Tot (option zkey) =
  match s with
  | [] -> None
  | marker :: after_marker ->
      if marker <> cp_k || starts_with_zero after_marker then None
      else
        let (index, index_count, remainder) = take_digits after_marker 0 0 in
        if index_count > 0 && Nil? remainder && index > 0
        then Some ({ key_owner = owner; key_index = index })
        else None

let parse_zkey (s:text) : Tot (option zkey) =
  match s with
  | [] -> None
  | head :: rest ->
      if head = cp_k then parse_key_index None s
      else if head <> cp_z || starts_with_zero rest then None
      else
        let (owner, owner_count, after_owner) = take_digits rest 0 0 in
        if owner_count = 0 || owner = 0 then None
        else parse_key_index (Some owner) after_owner

(* Rendering builds the digits onto an accumulator, so the result is produced in
   one pass with no repeated appending. *)
let rec render_nat (n:nat) (acc:text) : Tot text (decreases n) =
  if n = 0 then acc
  else render_nat (n / 10) ((cp_zero + n % 10) :: acc)

let render_zid (z:zid) : Tot text =
  cp_z :: render_nat z []

let render_zkey (k:zkey) : Tot text =
  let tail = cp_k :: render_nat k.key_index [] in
  match k.key_owner with
  | Some owner -> text_concat (render_zid owner) tail
  | None -> tail

let zid_eq (left:zid) (right:zid) : Tot bool =
  left = right

let owner_eq (left:option zid) (right:option zid) : Tot bool =
  match left, right with
  | Some l, Some r -> l = r
  | None, None -> true
  | _, _ -> false

let zkey_eq (left:zkey) (right:zkey) : Tot bool =
  owner_eq left.key_owner right.key_owner && left.key_index = right.key_index

(* Identifiers used throughout the object model. *)
let zid_z1 : zid = 1       (* Object *)
let zid_z6 : zid = 6       (* String *)
let zid_z7 : zid = 7       (* Function call *)
let zid_z9 : zid = 9       (* Reference *)
let zid_z18 : zid = 18     (* Argument reference *)

let global_key (owner:zid) (index:nat{index > 0}) : Tot zkey =
  { key_owner = Some owner; key_index = index }

let local_key (index:nat{index > 0}) : Tot zkey =
  { key_owner = None; key_index = index }

let key_z1k1 : zkey = global_key 1 1   (* type of an object *)
let key_z6k1 : zkey = global_key 6 1   (* string value *)
let key_z7k1 : zkey = global_key 7 1   (* function of a call *)
let key_z9k1 : zkey = global_key 9 1   (* target of a reference *)
let key_z18k1 : zkey = global_key 18 1 (* argument key *)

let parse_zid_example () :
  Lemma (parse_zid [90; 49; 48; 54; 50; 55] == Some 10627)
  = assert_norm (parse_zid [90; 49; 48; 54; 50; 55] == Some 10627)

let parse_zid_rejects_leading_zero () :
  Lemma (parse_zid [90; 48; 49] == None)
  = assert_norm (parse_zid [90; 48; 49] == None)

let parse_zid_rejects_trailing_text () :
  Lemma (parse_zid [90; 49; 75; 49] == None)
  = assert_norm (parse_zid [90; 49; 75; 49] == None)

let parse_zid_rejects_bare_z () :
  Lemma (parse_zid [90] == None)
  = assert_norm (parse_zid [90] == None)

let render_zid_example () :
  Lemma (render_zid 10627 == [90; 49; 48; 54; 50; 55])
  = assert_norm (render_zid 10627 == [90; 49; 48; 54; 50; 55])

let zid_round_trip_example () :
  Lemma (parse_zid (render_zid 22294) == Some 22294)
  = assert_norm (parse_zid (render_zid 22294) == Some 22294)

let parse_zkey_example () :
  Lemma (parse_zkey [90; 49; 75; 49] == Some key_z1k1)
  = assert_norm (parse_zkey [90; 49; 75; 49] == Some key_z1k1)

let parse_local_key_example () :
  Lemma (parse_zkey [75; 50] == Some (local_key 2))
  = assert_norm (parse_zkey [75; 50] == Some (local_key 2))

let parse_zkey_rejects_plain_zid () :
  Lemma (parse_zkey [90; 54] == None)
  = assert_norm (parse_zkey [90; 54] == None)

let parse_zkey_rejects_zero_index () :
  Lemma (parse_zkey [90; 54; 75; 48] == None)
  = assert_norm (parse_zkey [90; 54; 75; 48] == None)

let global_and_local_keys_differ () :
  Lemma (zkey_eq (global_key 6 1) (local_key 1) == false)
  = assert_norm (zkey_eq (global_key 6 1) (local_key 1) == false)

let zkey_round_trip_example () :
  Lemma (parse_zkey (render_zkey (global_key 10627 1)) == Some (global_key 10627 1))
  = assert_norm (parse_zkey (render_zkey (global_key 10627 1)) == Some (global_key 10627 1))

let local_zkey_round_trip_example () :
  Lemma (parse_zkey (render_zkey (local_key 3)) == Some (local_key 3))
  = assert_norm (parse_zkey (render_zkey (local_key 3)) == Some (local_key 3))
