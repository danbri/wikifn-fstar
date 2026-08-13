module Wikifn.Model

open Wikifn.Primitive.Kernel
open Wikifn.Zid

(*
  The ZObject model, as definitions rather than assumptions.

  Every predicate here is computable and returns a bool, so a caller can run the
  check rather than only state it. The one remaining assumption is has_type,
  which belongs with the typing rules and is deliberately left for later; it is
  marked where it appears.

  Terms carry text as codepoint lists, the same representation the primitive
  kernel uses, so a decoded input never has to be converted again.
*)

type zterm =
  | ZString : text -> zterm
  | ZRef : zid -> zterm
  | ZRecord : list (zkey & zterm) -> zterm
  | ZList : list zterm -> zterm

(* A canonical array carries its element type first and then its items, so an
   empty array is not a well-formed list. *)
let rec has_key (k:zkey) (fields:list (zkey & zterm)) : Tot bool =
  match fields with
  | [] -> false
  | (key, _) :: rest -> if zkey_eq key k then true else has_key k rest

let rec lookup (k:zkey) (fields:list (zkey & zterm)) : Tot (option zterm) =
  match fields with
  | [] -> None
  | (key, value) :: rest -> if zkey_eq key k then Some value else lookup k rest

let rec keys_unique (fields:list (zkey & zterm)) : Tot bool =
  match fields with
  | [] -> true
  | (key, _) :: rest -> if has_key key rest then false else keys_unique rest

let rec structurally_valid (t:zterm) : Tot bool (decreases t) =
  match t with
  | ZString _ -> true
  | ZRef _ -> true
  | ZRecord fields ->
      keys_unique fields && has_key key_z1k1 fields && fields_valid fields
  | ZList items ->
      Cons? items && items_valid items

and fields_valid (fields:list (zkey & zterm)) : Tot bool (decreases fields) =
  match fields with
  | [] -> true
  | (_, value) :: rest -> structurally_valid value && fields_valid rest

and items_valid (items:list zterm) : Tot bool (decreases items) =
  match items with
  | [] -> true
  | head :: rest -> structurally_valid head && items_valid rest

(* Persistent objects and the world they are resolved against. *)

type object_version = {
  ov_zid: zid;
  ov_revision: nat;
  ov_value: zterm;
  ov_digest: text
}

(* A world is a snapshot: the objects pinned for one evaluation. Lookup is
   linear, which is right for the handful of objects a single call needs. A
   snapshot large enough for that to matter wants an ordered structure here, and
   changing it does not affect anything below. *)
type world = list object_version

let rec resolve (w:world) (z:zid) : Tot (option object_version) =
  match w with
  | [] -> None
  | entry :: rest -> if zid_eq entry.ov_zid z then Some entry else resolve rest z

let resolves (w:world) (z:zid) : Tot bool =
  Some? (resolve w z)

(* A term is closed in a world when every reference it mentions resolves. *)
let rec closed_in_world (w:world) (t:zterm) : Tot bool (decreases t) =
  match t with
  | ZString _ -> true
  | ZRef z -> resolves w z
  | ZRecord fields -> fields_closed w fields
  | ZList items -> items_closed w items

and fields_closed (w:world) (fields:list (zkey & zterm)) : Tot bool (decreases fields) =
  match fields with
  | [] -> true
  | (_, value) :: rest -> closed_in_world w value && fields_closed w rest

and items_closed (w:world) (items:list zterm) : Tot bool (decreases items) =
  match items with
  | [] -> true
  | head :: rest -> closed_in_world w head && items_closed w rest

let object_valid (w:world) (o:object_version) : Tot bool =
  structurally_valid o.ov_value && closed_in_world w o.ov_value

let rec world_valid (w:world) (entries:list object_version) : Tot bool =
  match entries with
  | [] -> true
  | entry :: rest -> object_valid w entry && world_valid w rest

(* Shapes the evaluator cares about, read straight off a record. *)

let term_type (t:zterm) : Tot (option zterm) =
  match t with
  | ZRecord fields -> lookup key_z1k1 fields
  | _ -> None

let type_zid (t:zterm) : Tot (option zid) =
  match term_type t with
  | Some (ZRef z) -> Some z
  | _ -> None

let is_call (t:zterm) : Tot bool =
  match type_zid t with
  | Some z -> zid_eq z zid_z7
  | None -> false

let called_function (t:zterm) : Tot (option zid) =
  match t with
  | ZRecord fields -> begin
      match lookup key_z7k1 fields with
      | Some (ZRef z) -> Some z
      | _ -> None
    end
  | _ -> None

let string_value (t:zterm) : Tot (option text) =
  match t with
  | ZString s -> Some s
  | ZRecord fields -> begin
      match type_zid t, lookup key_z6k1 fields with
      | Some z, Some (ZString s) -> if zid_eq z zid_z6 then Some s else None
      | _, _ -> None
    end
  | _ -> None

let reference_target (t:zterm) : Tot (option zid) =
  match t with
  | ZRef z -> Some z
  | ZRecord fields -> begin
      match type_zid t, lookup key_z9k1 fields with
      | Some z, Some (ZRef target) -> if zid_eq z zid_z9 then Some target else None
      | _, _ -> None
    end
  | _ -> None

(* Types. The datatype is real; the typing judgement is the one thing this
   module still assumes, and it stays assumed until the typing rules are
   written. Nothing above depends on it. *)

type zty =
  | TObject : zty
  | TString : zty
  | TReference : zty
  | TNamed : zid -> zty
  | TComputed : zterm -> zty

assume val has_type : world -> zterm -> zty -> Type0

(* Worked examples. Z10627K1 is key (10627, 1); Z6 is the string type. *)

let string_record : zterm =
  ZRecord [
    (key_z1k1, ZRef zid_z6);
    (key_z6k1, ZString [104; 105])
  ]

let call_record : zterm =
  ZRecord [
    (key_z1k1, ZRef zid_z7);
    (key_z7k1, ZRef 10627);
    (global_key 10627 1, ZString [104; 105])
  ]

let string_record_is_valid () :
  Lemma (structurally_valid string_record == true)
  = assert_norm (structurally_valid string_record == true)

let string_record_reads_as_text () :
  Lemma (string_value string_record == Some [104; 105])
  = assert_norm (string_value string_record == Some [104; 105])

let call_record_is_a_call () :
  Lemma (is_call call_record == true /\ called_function call_record == Some 10627)
  = assert_norm (is_call call_record == true /\ called_function call_record == Some 10627)

let record_without_type_is_invalid () :
  Lemma (structurally_valid (ZRecord [(key_z6k1, ZString [])]) == false)
  = assert_norm (structurally_valid (ZRecord [(key_z6k1, ZString [])]) == false)

let record_with_duplicate_keys_is_invalid () :
  Lemma (
    structurally_valid (ZRecord [(key_z1k1, ZRef zid_z6); (key_z1k1, ZRef zid_z6)]) == false
  )
  = assert_norm (
      structurally_valid (ZRecord [(key_z1k1, ZRef zid_z6); (key_z1k1, ZRef zid_z6)]) == false
    )

let empty_list_is_invalid () :
  Lemma (structurally_valid (ZList []) == false)
  = assert_norm (structurally_valid (ZList []) == false)

let unresolved_reference_is_not_closed () :
  Lemma (closed_in_world [] (ZRef 10627) == false)
  = assert_norm (closed_in_world [] (ZRef 10627) == false)

let resolved_reference_is_closed () :
  Lemma (
    closed_in_world
      [{ ov_zid = 10627; ov_revision = 1; ov_value = ZString []; ov_digest = [] }]
      (ZRef 10627)
    == true
  )
  = assert_norm (
      closed_in_world
        [{ ov_zid = 10627; ov_revision = 1; ov_value = ZString []; ov_digest = [] }]
        (ZRef 10627)
      == true
    )
