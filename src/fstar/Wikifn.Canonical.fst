module Wikifn.Canonical

open Wikifn.Primitive.Kernel
open Wikifn.Zid
open Wikifn.Model

(*
  Canonical JSON to ZObject terms.

  This is the rule set that src/normalize.js implements in JavaScript, moved
  into F* so that the decision "what does this JSON mean" is checked rather than
  hand-written twice. The JavaScript stays as a differential oracle.

  The rule that matters most here: in canonical form a bare string shaped like a
  ZID is a reference, not text. Reading it as text silently returns a wrong
  answer rather than failing, which is exactly what the extracted evaluator did
  for tester Z13116 before this module existed. An explicit Z6 object is the
  escape hatch for text that happens to look like a ZID.

  The JSON type includes the forms canonical ZObjects may not contain, so that
  rejecting them is this module's job rather than the shim's.
*)

type json =
  | JString : text -> json
  | JArray : list json -> json
  | JObject : list (text & json) -> json
  | JNumber : text -> json
  | JBool : bool -> json
  | JNull : json

type norm_error =
  | InvalidJsonValue
  | EmptyBenjaminArray
  | InvalidZKey : text -> norm_error
  | InvalidExplicitString
  | InvalidExplicitStringValue
  | InvalidExplicitReference
  | InvalidExplicitReferenceValue

type norm_result (a:Type0) =
  | NOk : a -> norm_result a
  | NErr : norm_error -> norm_result a

let rec json_member (k:text) (fields:list (text & json)) : Tot (option json) =
  match fields with
  | [] -> None
  | (key, value) :: rest -> if text_eq key k then Some value else json_member k rest

let rec field_count (fields:list (text & json)) : Tot nat =
  match fields with
  | [] -> 0
  | _ :: rest -> 1 + field_count rest

(* Key spellings needed before any key has been parsed. *)
let text_z1k1 : text = [90; 49; 75; 49]
let text_z6k1 : text = [90; 54; 75; 49]
let text_z9k1 : text = [90; 57; 75; 49]

(* The declared type of an object, when it is written either as a bare ZID or as
   an explicit reference object. *)
let explicit_type_zid (value:json) : Tot (option zid) =
  match value with
  | JString s -> parse_zid s
  | JObject fields -> begin
      match json_member text_z1k1 fields, json_member text_z9k1 fields with
      | Some (JString marker), Some (JString target) ->
          if parse_zid marker = Some zid_z9 then parse_zid target else None
      | _, _ -> None
    end
  | _ -> None

(* An explicit Z6 or Z9 object is a terminal: it denotes text or a reference and
   has no other fields. Returning None means "not a terminal, keep going". *)
let explicit_terminal (fields:list (text & json)) : Tot (option (norm_result zterm)) =
  match json_member text_z1k1 fields with
  | None -> None
  | Some type_value ->
      match explicit_type_zid type_value with
      | Some z ->
          if zid_eq z zid_z6 then
            (if field_count fields <> 2 then Some (NErr InvalidExplicitString)
             else match json_member text_z6k1 fields with
                  | Some (JString s) -> Some (NOk (ZString s))
                  | Some _ -> Some (NErr InvalidExplicitStringValue)
                  | None -> Some (NErr InvalidExplicitString))
          else if zid_eq z zid_z9 then
            (if field_count fields <> 2 then Some (NErr InvalidExplicitReference)
             else match json_member text_z9k1 fields with
                  | Some (JString target) -> begin
                      match parse_zid target with
                      | Some t -> Some (NOk (ZRef t))
                      | None -> Some (NErr InvalidExplicitReferenceValue)
                    end
                  | Some _ -> Some (NErr InvalidExplicitReferenceValue)
                  | None -> Some (NErr InvalidExplicitReference))
          else None
      | None -> None

let rec normalize_canonical (value:json) : Tot (norm_result zterm) (decreases value) =
  match value with
  | JString s -> begin
      match parse_zid s with
      | Some z -> NOk (ZRef z)
      | None -> NOk (ZString s)
    end
  | JArray items -> begin
      match items with
      | [] -> NErr EmptyBenjaminArray
      | _ -> begin
          match normalize_items items with
          | NOk normalized -> NOk (ZList normalized)
          | NErr e -> NErr e
        end
    end
  | JObject fields -> begin
      match explicit_terminal fields with
      | Some result -> result
      | None -> begin
          match normalize_fields fields with
          | NOk normalized -> NOk (ZRecord normalized)
          | NErr e -> NErr e
        end
    end
  | JNumber _ -> NErr InvalidJsonValue
  | JBool _ -> NErr InvalidJsonValue
  | JNull -> NErr InvalidJsonValue

and normalize_items (items:list json) : Tot (norm_result (list zterm)) (decreases items) =
  match items with
  | [] -> NOk []
  | head :: rest -> begin
      match normalize_canonical head with
      | NErr e -> NErr e
      | NOk term -> begin
          match normalize_items rest with
          | NErr e -> NErr e
          | NOk others -> NOk (term :: others)
        end
    end

and normalize_fields (fields:list (text & json)) : Tot (norm_result (list (zkey & zterm))) (decreases fields) =
  match fields with
  | [] -> NOk []
  | (key, value) :: rest -> begin
      match parse_zkey key with
      | None -> NErr (InvalidZKey key)
      | Some k -> begin
          match normalize_canonical value with
          | NErr e -> NErr e
          | NOk term -> begin
              match normalize_fields rest with
              | NErr e -> NErr e
              | NOk others -> NOk ((k, term) :: others)
            end
        end
    end

(* Examples. Codepoints spelled out because this layer runs before any text
   decoding convenience exists. *)

let text_z6 : text = [90; 54]
let text_z9 : text = [90; 57]
let text_z11853 : text = [90; 49; 49; 56; 53; 51]

let bare_zid_is_a_reference () :
  Lemma (normalize_canonical (JString text_z11853) == NOk (ZRef 11853))
  = assert_norm (normalize_canonical (JString text_z11853) == NOk (ZRef 11853))

let plain_text_is_a_string () :
  Lemma (normalize_canonical (JString [104; 105]) == NOk (ZString [104; 105]))
  = assert_norm (normalize_canonical (JString [104; 105]) == NOk (ZString [104; 105]))

(* The escape hatch: an explicit Z6 keeps ZID-shaped text as text. *)
let explicit_string_escapes_a_zid_shape () :
  Lemma (
    normalize_canonical (JObject [(text_z1k1, JString text_z6); (text_z6k1, JString text_z11853)])
    == NOk (ZString text_z11853)
  )
  = assert_norm (
      normalize_canonical (JObject [(text_z1k1, JString text_z6); (text_z6k1, JString text_z11853)])
      == NOk (ZString text_z11853)
    )

let explicit_reference_normalizes () :
  Lemma (
    normalize_canonical (JObject [(text_z1k1, JString text_z9); (text_z9k1, JString text_z11853)])
    == NOk (ZRef 11853)
  )
  = assert_norm (
      normalize_canonical (JObject [(text_z1k1, JString text_z9); (text_z9k1, JString text_z11853)])
      == NOk (ZRef 11853)
    )

let explicit_string_rejects_extra_fields () :
  Lemma (
    normalize_canonical (JObject [
      (text_z1k1, JString text_z6);
      (text_z6k1, JString [104]);
      (text_z9k1, JString text_z11853)
    ]) == NErr InvalidExplicitString
  )
  = assert_norm (
      normalize_canonical (JObject [
        (text_z1k1, JString text_z6);
        (text_z6k1, JString [104]);
        (text_z9k1, JString text_z11853)
      ]) == NErr InvalidExplicitString
    )

let empty_array_is_rejected () :
  Lemma (normalize_canonical (JArray []) == NErr EmptyBenjaminArray)
  = assert_norm (normalize_canonical (JArray []) == NErr EmptyBenjaminArray)

let numbers_are_rejected () :
  Lemma (normalize_canonical (JNumber [49]) == NErr InvalidJsonValue)
  = assert_norm (normalize_canonical (JNumber [49]) == NErr InvalidJsonValue)

let non_key_field_is_rejected () :
  Lemma (
    normalize_canonical (JObject [([104; 105], JString [104])]) == NErr (InvalidZKey [104; 105])
  )
  = assert_norm (
      normalize_canonical (JObject [([104; 105], JString [104])]) == NErr (InvalidZKey [104; 105])
    )

(* A normalized call object is structurally valid and reads back as a call.
   This is the Z13116 shape that previously evaluated to the wrong answer. *)
let normalized_call_is_valid () :
  Lemma (
    match normalize_canonical (JObject [
      (text_z1k1, JString [90; 55]);
      ([90; 55; 75; 49], JString [90; 49; 48; 48; 53; 50]);
      ([90; 49; 48; 48; 53; 50; 75; 49], JString text_z11853)
    ]) with
    | NOk term -> structurally_valid term == true /\ is_call term == true
    | NErr _ -> False
  )
  = assert_norm (
      match normalize_canonical (JObject [
        (text_z1k1, JString [90; 55]);
        ([90; 55; 75; 49], JString [90; 49; 48; 48; 53; 50]);
        ([90; 49; 48; 48; 53; 50; 75; 49], JString text_z11853)
      ]) with
      | NOk term -> structurally_valid term == true /\ is_call term == true
      | NErr _ -> False
    )
