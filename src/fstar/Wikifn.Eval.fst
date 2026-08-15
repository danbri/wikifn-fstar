module Wikifn.Eval

open FStar.Mul
open Wikifn.Primitive.Kernel
open Wikifn.Unicode.Case
open Wikifn.Zid

(*
  The scalable evaluator.

  Three things separate this from Wikifn.Composition, which it is intended to
  replace:

  1. Functions are identified by their ZID number, not by a constructor in a
     closed enum. Adding a function is generating data, not editing this file.
  2. Values include lists, pairs and function references, so the LISP-shaped
     core of Wikifunctions (cons, first, rest, empty, map, filter, reduce) can
     be expressed.
  3. Composition arguments are bound into an environment once and referred to
     by index, rather than substituted as expressions. Substitution makes a body
     that mentions an argument twice evaluate it twice, which costs 2^depth when
     such calls nest.

  Evaluation order: arguments are evaluated before entering a composition body.
  Z802 is the exception and stays lazy in its branches, which is what makes
  recursion terminate; 230 of the 288 directly self-recursive compositions in
  the corpus guard their recursive branch with Z802. Eager arguments can spend
  fuel that a lazy evaluator would not, so a difference shows up as fuel
  exhaustion rather than as a wrong answer.
*)

type value =
  | VText : text -> value
  | VBool : bool -> value
  | VNat : nat -> value
  (* A typed list: its element type, and its elements.
 
     The type is carried because an empty list has no element to ask, and
     Wikifunctions writes it: ["Z6", "a", "b"] is a list *of strings* and the
     head of that array is the type. Without it the best that could be said of a
     list of strings was that it was a list, and Z22764 could not render the
     parameter its own testers ask for.
 
     A pair needs no such field. Its component types are the types of its
     components, and those are always there to ask. *)
  | VList : value -> list value -> value
  | VPair : value -> value -> value
  | VFunc : zid -> value
  (* A typed object: its type and its fields. Wikidata references, monolingual
     text, rationals and floats are all written this way in compositions, and
     without it those literals cannot be expressed at all. *)
  | VRecord : zid -> list (zkey & value) -> value
  (* A Z99: a piece of composition held as data rather than run.
 
     Z99 is a *type*, not a function - the corpus writes a quote as the literal
     object {Z1K1: Z99, Z99K1: x}, and there is no call to Z99 anywhere in the
     dump. So a quote is always a value, even when what it holds is computed,
     and it never needs an expression form of its own.
 
     What it holds is an expr rather than a value, and that is the whole point.
     Z899 unquote is not "take the wrapper off": Z13036 apply a function to a
     value is written as Z899(Z31754(f, [v])) - build a call as data, then run
     it - and that cannot be said if the payload has already been evaluated. *)
  | VQuote : expr -> value

and expr =
  | EValue : value -> expr
  | EArg : nat -> expr
  | ECall : zid -> list expr -> expr
  (* Building a record from fields that are not yet values. A record whose
     fields are all literals is an EValue; this is for the other case, where a
     field is an argument or a call. *)
  | ERecord : zid -> list (zkey & expr) -> expr

type eval_error =
  | EFuelExhausted
  | EDepthExceeded
  | EUnboundArgument
  | EArityMismatch : zid -> eval_error
  | ETypeMismatch : zid -> eval_error
  | ENoImplementation : zid -> eval_error
  (* Its own error rather than a type mismatch, because the arguments were the
     right type and the answer still does not exist. Wikifunctions' own Python
     for Z13546 raises Z28194 here. *)
  | EDivisionByZero : zid -> eval_error
  (* An error the composition itself raised, carrying the Z5 it was given.
     Wikifunctions has errors as values: Z851 throws one, Z850 catches one of a
     named type, and Z853 reports whether a call threw. That makes an error part
     of the data model rather than only a way for evaluation to stop, so it
     travels as a value and can be caught, inspected and returned. *)
  | EThrown : value -> eval_error
  | EPrimitiveError : kernel_error -> eval_error

type eval_result (a:Type0) =
  | EOk : a -> eval_result a
  | EErr : eval_error -> eval_result a

(* A policy maps a function ZID to a body written against argument indices. *)
type policy = zid -> Tot (option expr)

let lift_kernel (#a:Type0) (fid:zid) (r:kernel_result a) : Tot (eval_result a) =
  match r with
  | KOk x -> EOk x
  | KErr e -> EErr (EPrimitiveError e)

let rec env_lookup (index:nat) (env:list value) : Tot (eval_result value) (decreases env) =
  match index, env with
  | 0, head :: _ -> EOk head
  | _, _ :: tail -> env_lookup (index - 1) tail
  | _, [] -> EErr EUnboundArgument

// Primitive identifiers, by number.
//
// Where Wikifunctions has reinvented something LISP already named, the classical
// name is used and the Wikifunctions label is kept alongside it. The mapping is
// one to one, so nothing is lost: the number is the identifier, the classical
// name is for reading, and the label after // is what the wiki calls it.

let fid_identity : zid = 801        // Z801 Echo
let fid_if : zid = 802              // Z802 If
let fid_cons : zid = 810            // Z810 prepend element to list
let fid_car : zid = 811             // Z811 first element
let fid_cdr : zid = 812             // Z812 list without first element
let fid_null_p : zid = 813          // Z813 Is empty list, written null? in Scheme
let fid_fst : zid = 821             // Z821 Get first element of a Typed pair
let fid_snd : zid = 822             // Z822 Get second element of a typed pair
let fid_filter : zid = 872          // Z872 Filter Function
let fid_map : zid = 873             // Z873 map function
let fid_fold : zid = 876            // Z876 Reduce Function
let fid_string_eq : zid = 866       // Z866 string equality, string=? in Scheme
let fid_object_eq : zid = 13052     // Z13052 object equality, over any two values
// Z29294 object equivalence. Three code implementations on the wiki and no
// composition, so following it was never going to reach anything; its Python is
// an identity check, a type check and then a structural comparison, which is
// what value_eq is. Grounded for the same reason Z13052 is.
let fid_object_equiv : zid = 29294  // Z29294 object equivalence
let fid_string_append : zid = 10000 // Z10000 join two strings
let fid_not : zid = 10216           // Z10216 not
let fid_and : zid = 10174           // Z10174 and
let fid_or : zid = 10184            // Z10184 or
let fid_length : zid = 12681        // Z12681 length of a list

// Reversing and appending, grounded for the same reason the arithmetic below
// is. The corpus defines these in terms of each other with no base case:
// Z12668 reverse is cdr(Z17763), Z17763 is cons("", Z18759), and Z18759 goes
// back to Z12668 or to Z18479, which is itself Z12668 over a mapped list.
// Following that never bottoms out. The wiki does not hit it because its own
// evaluator prefers the code implementations - Z12668 has five and Z12961 has
// two - so grounding them here restores what the wiki computes rather than
// changing it. With these two grounded the rest of the group (Z18479, Z18759,
// Z17763) evaluates through its compositions as written.
let fid_reverse_list : zid = 12668  // Z12668 reverse untyped list
let fid_append_last : zid = 12961   // Z12961 append element to Typed list

// Natural-number arithmetic. Wikifunctions also defines these as Peano-style
// compositions, but those definitions are mutually circular: increment is
// defined as add(n, 1), and add is defined in terms of increment, so add(n, 1)
// never bottoms out. The wiki does not hit this because its own evaluator
// prefers the code implementations. Grounding them here keeps the arithmetic
// correct and fast without changing what any composition above them says.
let fid_add : zid = 13521           // Z13521 add two Natural numbers
let fid_multiply : zid = 13539      // Z13539 multiply two natural numbers
let fid_increment : zid = 13578     // Z13578 increment natural number
let fid_max : zid = 13630           // Z13630 greater of two natural numbers
let fid_min : zid = 13633           // Z13633 lesser of two natural numbers
let fid_expt : zid = 13647          // Z13647 exponentiation of natural numbers
// Floor division, erroring on a zero divisor, which is what Wikifunctions' own
// Python implementation of Z13546 does.
let fid_nat_divide : zid = 13546    // Z13546 divide natural numbers
let fid_if_nat : zid = 13846        // Z13846 if natural number output

// Applying a function value to arguments. These are how the corpus writes
// higher-order code, so they gate a lot of it.
let fid_value_by_key : zid = 803   // Z803 Value by key
let fid_type_of : zid = 16829      // Z16829 type of object
let fid_apply2 : zid = 13318   // Z13318 apply two-argument function
let fid_apply3 : zid = 21216   // Z21216 apply three-argument function
let fid_apply4 : zid = 30438   // Z30438 apply four-argument function
let fid_zip_with : zid = 14779 // Z14779 apply pairwise to two lists

// Errors as values. These three are special forms rather than primitives: Z850
// and Z853 have to see whether their argument produced an error, which means
// they are handed the result rather than the value, and Z850's handler must not
// run unless it is needed.
let fid_throw : zid = 851          // Z851 Throw Error
let fid_try_catch : zid = 850      // Z850 Try-Catch Function
let fid_get_error : zid = 853      // Z853 Get error thrown by function call
let type_z5 : zid = 5              // Z5 Error
let key_z5k1 : zkey = global_key 5 1   // the errortype
let key_z5k2 : zkey = global_key 5 2   // its parameters

// Text and codepoint lists are the same data in two shapes. These conversions
// bridge the string primitives and the list primitives, which is why they gate
// so much of the corpus.
let fid_string_to_codepoints : zid = 22717  // Z22717 String to codepoint list
let fid_codepoints_to_string : zid = 22693  // Z22693 Codepoint list to string
// Z868 is Z22717 under an older name - same one string argument, same list of
// Z86 codepoints out - and the corpus still calls it. The wiki marks it
// deprecated and points at Z22717; treating it as the same function is what
// that deprecation means.
let fid_z868_string_to_codepoints : zid = 868
// And Z886 is Z22693 the same way: same list of Z86 in, same string out.
let fid_z886_codepoints_to_string : zid = 886

// No classical equivalent; these keep their Wikifunctions spelling.
let fid_z10008_is_empty_string : zid = 10008
let fid_z10075_replace_all : zid = 10075
let fid_z10615_starts_with : zid = 10615
let fid_z10901_first_character : zid = 10901
let fid_z11040_string_length : zid = 11040
let fid_z13522_nat_equality : zid = 13522
let fid_z13569_subtract : zid = 13569
let fid_z13582_decrement : zid = 13582
let fid_z13676_greater : zid = 13676
let fid_z13682_greater_equal : zid = 13682
let fid_z13689_less : zid = 13689
let fid_z13695_less_equal : zid = 13695
let fid_z14124_unicode_range : zid = 14124
let fid_z14456_remove_first_character : zid = 14456
let fid_z14520_remove_characters : zid = 14520
// Case conversion, root locale, from Wikifn.Unicode.Case. Not ASCII: nine of
// the fifteen testers for these two functions falsify an ASCII-only version.
let fid_z10047_to_lowercase : zid = 10047
let fid_z10018_to_uppercase : zid = 10018

// Types as values.
//
// A type is a value in Wikifunctions - Z4 - and the generic ones are written as
// a call: Z881(Z6) is the type "list of strings". Those calls had no
// implementation here, so a composition that asked what type something was, or
// built a type to compare against, stopped. Applying a type constructor now
// yields a record of that type holding its parameters, which is the same shape
// the corpus writes it in, and Z22764 renders it back to text.
let fid_typed_list : zid = 881      // Z881 Typed list
let fid_typed_pair : zid = 882      // Z882 Typed pair
let fid_typed_map : zid = 883       // Z883 Typed map
let fid_string_from_type : zid = 22764  // Z22764 String from Type

// Quoting. Z99 is a type, so a quote is written as a literal object and never
// called; what needs a form is Z899, because unquoting is evaluating.
let type_z99 : zid = 99            // Z99 Quote
let key_z99k1 : zkey = global_key 99 1
let fid_unquote : zid = 899        // Z899 Unquote
let fid_quoted_reference : zid = 29267  // Z29267 quoted reference
let fid_reify : zid = 805          // Z805 Reify
let fid_abstract : zid = 808       // Z808 Abstract, the inverse of Z805

(* An internal helper the generator emits for the private-use marker idiom.
   Numbered outside the Wikifunctions range so it cannot collide. *)
let internal_fresh_private_use : zid = 1000000001

(* Applying a function value to however many arguments it takes. Wikifunctions
   has Z13318, Z21216 and Z30438 for two, three and four; the corpus also writes
   calls whose function is computed with none, one and five, and those have no
   named function to use. Numbered outside the Wikifunctions range so it cannot
   collide with one. *)
let internal_apply : zid = 1000000002

let rec codepoints_as_values (s:text) : Tot (list value) =
  match s with
  | [] -> []
  | head :: tail -> VNat head :: codepoints_as_values tail

let rec values_as_codepoints (items:list value) : Tot (option text) =
  match items with
  | [] -> Some []
  | VNat n :: tail -> begin
      match values_as_codepoints tail with
      | Some rest -> Some (n :: rest)
      | None -> None
    end
  | _ -> None

(* Reversing with an accumulator: one pass, and no repeated list append, which
   would make it quadratic. *)
let rec value_rev_onto (items:list value) (acc:list value) : Tot (list value) (decreases items) =
  match items with
  | [] -> acc
  | head :: tail -> value_rev_onto tail (head :: acc)

let value_reverse (items:list value) : Tot (list value) = value_rev_onto items []

(* items followed by one more element: reverse onto a singleton, so the whole
   thing is two passes and no intermediate append. *)
let value_append_last (items:list value) (x:value) : Tot (list value) =
  value_rev_onto (value_reverse items) [x]

(* Structural equality over values, grounded for the same reason reverse is.
   Z13052 object equality is written as Z23360(a, b, Z13052) and Z23360 applies
   its third argument to its first two, so Z13052(a,b) reduces to Z13052(a,b)
   and never bottoms out. It is the comparator underneath contains, index-of,
   is-permutation and anagrams, so following it strands all of them. The wiki
   does not hit this because Z13052 has two code implementations. *)
let rec value_eq (left:value) (right:value) : Tot bool (decreases left) =
  match left, right with
  | VText l, VText r -> text_eq l r
  | VNat l, VNat r -> l = r
  | VBool l, VBool r -> l = r
  | VFunc l, VFunc r -> l = r
  | VPair la lb, VPair ra rb -> if value_eq la ra then value_eq lb rb else false
  (* The element type is not compared. Where the corpus wrote it, it is exact;
     where a map or a zip produced the list, the best that can be said is Z1 -
     so comparing types would make a computed list of strings differ from a
     written one, which is not what Z13052 means. *)
  | VList _ l, VList _ r -> value_list_eq l r
  | VRecord lt lf, VRecord rt rf -> if lt = rt then field_list_eq lf rf else false
  | _, _ -> false

and value_list_eq (left:list value) (right:list value) : Tot bool (decreases left) =
  match left, right with
  | [], [] -> true
  | lh :: lt, rh :: rt -> if value_eq lh rh then value_list_eq lt rt else false
  | _, _ -> false

(* Field order is part of the record as the corpus writes it, so this compares
   position by position rather than as a set. *)
and field_list_eq (left:list (zkey & value)) (right:list (zkey & value))
  : Tot bool (decreases left)
=
  match left, right with
  | [], [] -> true
  | (lk, lv) :: lt, (rk, rv) :: rt ->
      if zkey_eq lk rk then (if value_eq lv rv then field_list_eq lt rt else false) else false
  | _, _ -> false

(* What type a value has. Every shape answers, which is what Z16829 promises.
 
   Two of them answer less than they should, and the reason is the value model
   rather than this function: a list and a pair carry no parameter, so the best
   that can be said of a list of strings is that it is a list. The corpus writes
   that parameter and Z22764's own testers ask for it back, so this is a real
   limit and not a rounding. *)
(* Z1 is Wikifunctions' top type: every object is one. It is what a list's
   element type is when nothing better is known - a map's result, a zip's, a
   list read from a JSON argument. Saying Z1 is honest; saying Z6 because the
   first element happened to be a string would not be. *)
let type_any : value = VFunc 1

(* The element type a list carries. Anything that is not a list has already
   failed on as_list by the time this is asked, so Z1 is a safe answer. *)
let list_element_type (v:value) : Tot value =
  match v with
  | VList t _ -> t
  | _ -> type_any

let rec type_of_value (v:value) : Tot value (decreases v) =
  match v with
  | VText _ -> VFunc 6
  | VBool _ -> VFunc 40
  | VNat _ -> VFunc 13518
  (* The generic applied to its parameter, which is what Z22764 renders as
     "Z881 (Z6)" - not the bare constructor. A pair's parameters are the types
     of its two components, which is why this is recursive and why a pair needs
     no stored type. *)
  | VList t _ -> VRecord fid_typed_list [(global_key 881 1, t)]
  | VPair a b -> VRecord fid_typed_pair
                   [(global_key 882 1, type_of_value a); (global_key 882 2, type_of_value b)]
  | VFunc _ -> VFunc 8
  | VRecord t _ -> VFunc t
  | VQuote _ -> VFunc type_z99

(* Z39 is a key reference: a record holding the key's spelling. *)
let key_reference_value (k:zkey) : Tot value =
  VRecord 39 [(global_key 39 1, VText (render_zkey k))]

(* A reference, in the normal form the corpus writes: an object whose type is Z9
   and whose one field is the identifier being referred to. *)
(* Z805 Reify: an object as the list of its key-value pairs, recursively.
 
   This is honest about what it cannot do. A list and a pair carry no element
   type here, and reify's whole job is to expose the encoding that parameter
   lives in - the corpus uses it for exactly that, in "type of list (as string)"
   and "is a Typed list". So those two shapes are refused rather than answered
   with something that would read as a type-free list and be wrong. Records and
   scalars, which carry everything they need, are answered. *)
(* Z805 Reify: an object as the list of key-value pairs it is made of.
   
   Shallow, which is what Wikifunctions means by it: the value under a key is
   the object itself, not that object reified in turn. It also has to be
   shallow for Z808 Abstract to be its inverse, which is proved in
   Wikifn.Roundtrip - reifying the fields as well would mean abstract handed
   back the reified forms rather than the object.
   
   A type is a value here, exactly as Z16829 returns it, so the entry under
   Z1K1 is the type itself rather than a reference object standing for it. *)
(* A record whose own fields include Z1K1 cannot be reified faithfully: the
   type entry and the field would collide, and putting it back together would
   have to guess which was which. Nothing in the corpus writes one - the type
   of a record lives outside its fields - and refusing is the only answer that
   keeps Reify and Abstract inverses. *)
(* What Z805 Reify returns a list of: pairs of a key reference and a value. *)
let reified_pair_type : value =
  VRecord fid_typed_pair [(global_key 882 1, VFunc 39); (global_key 882 2, VFunc 1)]

let rec fields_avoid_type_key (fields:list (zkey & value)) : Tot bool (decreases fields) =
  match fields with
  | [] -> true
  | (k, _) :: rest -> not (zkey_eq k key_z1k1) && fields_avoid_type_key rest

(* Nor can a record claim to be a string, a boolean, a natural or a reference.
   Abstract reads Z1K1 to decide what to build, so a record wearing a scalar's
   type would come back as that scalar with its fields dropped. Refused for the
   same reason as above: the encoding has to be reversible. The translator
   never builds one - a Z6 literal becomes text, not a record - so this rules
   out a shape that only hand-built values could reach. *)
let record_type_is_a_record (t:zid) : Tot bool =
  t <> 6 && t <> 40 && t <> 13518 && t <> 9

let rec reify_fields (fields:list (zkey & value)) : Tot (list value) (decreases fields) =
  match fields with
  | [] -> []
  | (k, v) :: rest -> VPair (key_reference_value k) v :: reify_fields rest

let reify_value (v:value) : Tot (option value) =
  match v with
  | VText t ->
      Some (VList reified_pair_type [ VPair (key_reference_value key_z1k1) (VFunc 6)
                  ; VPair (key_reference_value key_z6k1) (VText t) ])
  | VBool b ->
      Some (VList reified_pair_type [ VPair (key_reference_value key_z1k1) (VFunc 40)
                  ; VPair (key_reference_value (global_key 40 1))
                          (VFunc (if b then 41 else 42)) ])
  | VNat n ->
      Some (VList reified_pair_type [ VPair (key_reference_value key_z1k1) (VFunc 13518)
                  ; VPair (key_reference_value (global_key 13518 1)) (VText (if n = 0 then [48] else render_nat n [])) ])
  | VFunc f ->
      Some (VList reified_pair_type [ VPair (key_reference_value key_z1k1) (VFunc 9)
                  ; VPair (key_reference_value (global_key 9 1)) (VFunc f) ])
  | VRecord t fields ->
      if record_type_is_a_record t && fields_avoid_type_key fields
      then Some (VList reified_pair_type
                   (VPair (key_reference_value key_z1k1) (VFunc t) :: reify_fields fields))
      else None
  (* A list and a pair carry no element type, and reify's whole job is to say
     what something is made of. Refused rather than answered wrongly. *)
  | _ -> None

(* Z29267 quoted reference: the identifier a value stands for, wrapped in a
   quote. A reference gives its target; a record of one field whose value is a
   reference gives that; a string is read as an identifier. *)
(* Z808 Abstract: the inverse of Z805 Reify.
   
   Reify says what an object is made of; Abstract puts it back together. The
   corpus uses the pair the way a language with no type system asks and answers
   questions about types - Z15818 is Natural number is car(reify(x)) compared
   against car(reify(0)) - so the two have to agree exactly, which is why the
   round trip is proved below rather than asserted here.
   
   A reified object is a list of pairs. Each pair is a Z39 key reference and the
   value under it, and the Z1K1 entry carries the type. *)
let rec pairs_lookup (k:zkey) (items:list value) : Tot (option value) (decreases items) =
  match items with
  | [] -> None
  | VPair (VRecord _ [(_, VText spelling)]) v :: rest -> begin
      (* Read the key and compare keys, rather than comparing the two
         spellings. Same answer, and it is the direction the round trip is
         proved in: Wikifn.Zid.Laws says a key written out reads back as
         itself, which settles this without also having to know that distinct
         keys never share a spelling. *)
      match parse_zkey spelling with
      | Some found -> if zkey_eq found k then Some v else pairs_lookup k rest
      | None -> pairs_lookup k rest
    end
  | _ :: rest -> pairs_lookup k rest

(* A reference, however it is spelled. Reify writes one as a two-entry list -
   the Z9 type and the target - but a bare function value or the identifier as
   text mean the same thing and the corpus writes both. *)
let zid_of_reference (v:value) : Tot (option zid) =
  match v with
  | VFunc f -> Some f
  | VText spelling -> parse_zid spelling
  | VList _ items -> begin
      match pairs_lookup (global_key 9 1) items with
      | Some (VText spelling) -> parse_zid spelling
      | Some (VFunc f) -> Some f
      | _ -> None
    end
  | _ -> None

(* Everything except the Z1K1 entry, as record fields. A pair whose key cannot
   be read back is refused rather than dropped: silently losing a field would
   make abstract answer with an object that is not the one it was given. *)
let rec pairs_fields (items:list value) : Tot (option (list (zkey & value))) (decreases items) =
  match items with
  | [] -> Some []
  | VPair (VRecord _ [(_, VText spelling)]) v :: rest -> begin
      match parse_zkey spelling, pairs_fields rest with
      | Some k, Some tail -> if zkey_eq k key_z1k1 then Some tail else Some ((k, v) :: tail)
      | _, _ -> None
    end
  | _ :: _ -> None

let abstract_value (items:list value) : Tot (option value) =
  match pairs_lookup key_z1k1 items with
  | None -> None
  | Some declared ->
      match zid_of_reference declared with
      | None -> None
      | Some t ->
          if t = 6 then
            (match pairs_lookup key_z6k1 items with
             | Some (VText s) -> Some (VText s)
             | _ -> None)
          else if t = 40 then
            (match pairs_lookup (global_key 40 1) items with
             | Some r -> begin
                 match zid_of_reference r with
                 | Some 41 -> Some (VBool true)
                 | Some 42 -> Some (VBool false)
                 | _ -> None
               end
             | _ -> None)
          else if t = 13518 then
            (match pairs_lookup (global_key 13518 1) items with
             | Some (VText s) -> begin
                 match parse_nat s with
                 | Some n -> Some (VNat n)
                 | None -> None
               end
             | _ -> None)
          else if t = 9 then
            (* A reference. Reify writes the target as the value it stands for,
               and the corpus writes it as the identifier in text; both are
               read here. *)
            (match pairs_lookup (global_key 9 1) items with
             | Some r -> begin
                 match zid_of_reference r with
                 | Some f -> Some (VFunc f)
                 | None -> None
               end
             | _ -> None)
          else
            (match pairs_fields items with
             | Some fields -> Some (VRecord t fields)
             | None -> None)

let quoted_reference (v:value) : Tot (option value) =
  match v with
  | VQuote _ -> Some v
  | VFunc f -> Some (VQuote (EValue (VFunc f)))
  | VRecord _ ((_, VFunc f) :: _) -> Some (VQuote (EValue (VFunc f)))
  | VText spelling -> begin
      match parse_zid spelling with
      | Some target -> Some (VQuote (EValue (VFunc target)))
      | None -> None
    end
  | _ -> None

(* A type as text. A plain type is its identifier; a generic is its identifier
   and its parameters in brackets, which is the spelling Z22764's testers use:
   Z882 (Z99, Z883 (Z6, Z881 (Z6))). *)
let rec render_type (v:value) : Tot (option text) (decreases v) =
  match v with
  | VFunc t -> Some (render_zid t)
  | VRecord t fields -> begin
      match render_type_arguments fields with
      | None -> None
      | Some [] -> Some (render_zid t)
      | Some rendered ->
          Some (text_concat (render_zid t)
                 (text_concat [32; 40] (text_concat rendered [41])))
    end
  | _ -> None

and render_type_arguments (fields:list (zkey & value)) : Tot (option text) (decreases fields) =
  match fields with
  | [] -> Some []
  | (_, v) :: [] -> render_type v
  | (_, v) :: rest -> begin
      match render_type v, render_type_arguments rest with
      | Some head, Some tail -> Some (text_concat head (text_concat [44; 32] tail))
      | _, _ -> None
    end

let rec value_count (items:list value) : Tot nat =
  match items with
  | [] -> 0
  | _ :: rest -> 1 + value_count rest

(* The field expressions of a record, and the way back once they are values.
   These need no subterm argument: eval spends fuel before evaluating a record's
   fields, and the termination measure is on fuel. *)
let rec field_exprs (fields:list (zkey & expr)) : Tot (list expr) =
  match fields with
  | [] -> []
  | (_, e) :: rest -> e :: field_exprs rest

let rec fields_with_values (fields:list (zkey & expr)) (values:list value)
  : Tot (list (zkey & value))
=
  match fields, values with
  | (k, _) :: field_tail, v :: value_tail -> (k, v) :: fields_with_values field_tail value_tail
  | _, _ -> []

let rec values_as_exprs (items:list value) : Tot (list expr) =
  match items with
  | [] -> []
  | head :: rest -> EValue head :: values_as_exprs rest

let as_text (fid:zid) (v:value) : Tot (eval_result text) =
  match v with
  | VText t -> EOk t
  | _ -> EErr (ETypeMismatch fid)

let as_bool (fid:zid) (v:value) : Tot (eval_result bool) =
  match v with
  | VBool b -> EOk b
  | _ -> EErr (ETypeMismatch fid)

let as_nat (fid:zid) (v:value) : Tot (eval_result nat) =
  match v with
  | VNat n -> EOk n
  | _ -> EErr (ETypeMismatch fid)

(* Z39 is a key reference: a record whose single field holds the key's spelling.
   Reading it is what makes value-by-key usable. *)
let rec field_of (k:zkey) (fields:list (zkey & value)) : Tot (option value) =
  match fields with
  | [] -> None
  | (key, v) :: rest -> if zkey_eq key k then Some v else field_of k rest

let key_reference (v:value) : Tot (option zkey) =
  match v with
  | VText spelling -> parse_zkey spelling
  | VRecord _ fields -> begin
      match fields with
      | (_, VText spelling) :: _ -> parse_zkey spelling
      | _ -> None
    end
  | _ -> None

let as_list (fid:zid) (v:value) : Tot (eval_result (list value)) =
  match v with
  | VList _ items -> EOk items
  | _ -> EErr (ETypeMismatch fid)

(* Primitives over already-evaluated arguments. Keeping this separate from the
   evaluator keeps the recursion in one place and makes the primitive table
   ordinary data. *)
let apply_primitive (fid:zid) (args:list value) : Tot (option (eval_result value)) =
  match args with
  | [a] ->
      (* Z801 Echo is the identity, and is used as a placeholder implementation
         throughout the corpus. *)
      if fid = fid_identity then Some (EOk a)
      else if fid = fid_z10008_is_empty_string then
        Some (match as_text fid a with
              | EOk t -> EOk (VBool (Wikifn.Primitive.Kernel.z10008_is_empty_string t))
              | EErr e -> EErr e)
      else if fid = fid_z10901_first_character then
        Some (match as_text fid a with
              | EOk t -> EOk (VText (z10901_get_first_character t))
              | EErr e -> EErr e)
      else if fid = fid_z14456_remove_first_character then
        Some (match as_text fid a with
              | EOk t -> EOk (VText (z14456_remove_first_character t))
              | EErr e -> EErr e)
      else if fid = fid_z11040_string_length then
        Some (match as_text fid a with
              | EOk t -> EOk (VNat (text_length t))
              | EErr e -> EErr e)
      else if fid = fid_not then
        Some (match as_bool fid a with
              | EOk b -> EOk (VBool (not b))
              | EErr e -> EErr e)
      else if fid = fid_increment then
        Some (match as_nat fid a with
              | EOk n -> EOk (VNat (n + 1))
              | EErr e -> EErr e)
      else if fid = fid_z13582_decrement then
        Some (match as_nat fid a with
              | EOk n -> EOk (VNat (nat_decrement_floor n))
              | EErr e -> EErr e)
      else if fid = fid_car then
        Some (match as_list fid a with
              | EOk (head :: _) -> EOk head
              | EOk [] -> EErr (ETypeMismatch fid)
              | EErr e -> EErr e)
      else if fid = fid_cdr then
        Some (match as_list fid a with
              | EOk (_ :: tail) -> EOk (VList (list_element_type a) tail)
              | EOk [] -> EErr (ETypeMismatch fid)
              | EErr e -> EErr e)
      else if fid = fid_null_p then
        Some (match as_list fid a with
              | EOk items -> EOk (VBool (Nil? items))
              | EErr e -> EErr e)
      else if fid = fid_length then
        Some (match as_list fid a with
              | EOk items -> EOk (VNat (value_count items))
              | EErr e -> EErr e)
      else if fid = fid_reverse_list then
        Some (match as_list fid a with
              | EOk items -> EOk (VList (list_element_type a) (value_reverse items))
              | EErr e -> EErr e)
      (* A Z882 pair is written two ways: as a pair value, and as an object with
         K1 and K2 whose type is the generic Z882 applied to its element types.
         Both are pairs, so both accessors read both. *)
      else if fid = fid_fst then
        Some (match a with
              | VPair l _ -> EOk l
              | VRecord _ ((_, l) :: _) -> EOk l
              | _ -> EErr (ETypeMismatch fid))
      else if fid = fid_snd then
        Some (match a with
              | VPair _ r -> EOk r
              | VRecord _ (_ :: (_, r) :: _) -> EOk r
              | _ -> EErr (ETypeMismatch fid))
      else if fid = fid_type_of then
        (* Every value has a type, so this answers for every value rather than
           only for records, which is what it used to do. *)
        Some (EOk (type_of_value a))
      else if fid = fid_reify then
        Some (match reify_value a with
              | Some reified -> EOk reified
              | None -> EErr (ETypeMismatch fid))
      else if fid = fid_abstract then
        Some (match a with
              | VList _ items -> begin
                  match abstract_value items with
                  | Some built -> EOk built
                  | None -> EErr (ETypeMismatch fid)
                end
              | _ -> EErr (ETypeMismatch fid))
      else if fid = fid_quoted_reference then
        Some (match a with
              | VList _ (first :: _) -> begin
                  match quoted_reference first with
                  | Some q -> EOk q
                  | None -> EErr (ETypeMismatch fid)
                end
              | _ -> begin
                  match quoted_reference a with
                  | Some q -> EOk q
                  | None -> EErr (ETypeMismatch fid)
                end)
      else if fid = fid_string_from_type then
        Some (match render_type a with
              | Some rendered -> EOk (VText rendered)
              | None -> EErr (ETypeMismatch fid))
      else if fid = fid_typed_list then
        Some (EOk (VRecord fid_typed_list [(global_key fid_typed_list 1, a)]))
      else if fid = fid_z10047_to_lowercase then
        Some (match as_text fid a with
              | EOk t -> EOk (VText (z10047_to_lowercase t))
              | EErr e -> EErr e)
      else if fid = fid_z10018_to_uppercase then
        Some (match as_text fid a with
              | EOk t -> EOk (VText (z10018_to_uppercase t))
              | EErr e -> EErr e)
      else if fid = fid_string_to_codepoints || fid = fid_z868_string_to_codepoints then
        Some (match as_text fid a with
              | EOk t -> EOk (VList (VFunc 13518) (codepoints_as_values t))
              | EErr e -> EErr e)
      else if fid = fid_codepoints_to_string || fid = fid_z886_codepoints_to_string then
        Some (match as_list fid a with
              | EOk items -> begin
                  match values_as_codepoints items with
                  | Some t -> EOk (VText t)
                  | None -> EErr (ETypeMismatch fid)
                end
              | EErr e -> EErr e)
      else if fid = internal_fresh_private_use then
        Some (match as_text fid a with
              | EOk t -> EOk (VText (z36070_first_available_private_use_character t))
              | EErr e -> EErr e)
      else None
  | [a; b] ->
      if fid = fid_string_eq then
        Some (match as_text fid a, as_text fid b with
              | EOk l, EOk r -> EOk (VBool (text_eq l r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_string_append then
        Some (match as_text fid a, as_text fid b with
              | EOk l, EOk r -> EOk (VText (text_concat l r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z10615_starts_with then
        Some (match as_text fid a, as_text fid b with
              | EOk input, EOk prefix -> EOk (VBool (text_starts_with prefix input))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z14520_remove_characters then
        Some (match as_text fid a, as_text fid b with
              | EOk input, EOk chars -> EOk (VText (text_remove_chars input chars))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z14124_unicode_range then
        Some (match as_nat fid a, as_nat fid b with
              | EOk first, EOk last -> begin
                  match lift_kernel fid (text_unicode_range first last) with
                  | EOk t -> EOk (VText t)
                  | EErr e -> EErr e
                end
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_and then
        Some (match as_bool fid a, as_bool fid b with
              | EOk l, EOk r -> EOk (VBool (l && r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_or then
        Some (match as_bool fid a, as_bool fid b with
              | EOk l, EOk r -> EOk (VBool (l || r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z13522_nat_equality then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VBool (l = r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z13569_subtract then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VNat (nat_sub_floor l r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z13676_greater then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VBool (r < l))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z13682_greater_equal then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VBool (r <= l))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z13689_less then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VBool (l < r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_z13695_less_equal then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VBool (l <= r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_add then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VNat (l + r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_multiply then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VNat (l * r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_max then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VNat (if l >= r then l else r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_min then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> EOk (VNat (if l <= r then l else r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_expt then
        Some (match as_nat fid a, as_nat fid b with
              | EOk base, EOk power -> begin
                  match lift_kernel fid (nat_pow base power) with
                  | EOk n -> EOk (VNat n)
                  | EErr e -> EErr e
                end
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_typed_pair then
        Some (EOk (VRecord fid_typed_pair
                    [(global_key fid_typed_pair 1, a); (global_key fid_typed_pair 2, b)]))
      else if fid = fid_typed_map then
        Some (EOk (VRecord fid_typed_map
                    [(global_key fid_typed_map 1, a); (global_key fid_typed_map 2, b)]))
      else if fid = fid_object_eq || fid = fid_object_equiv then
        Some (EOk (VBool (value_eq a b)))
      else if fid = fid_nat_divide then
        Some (match as_nat fid a, as_nat fid b with
              | EOk l, EOk r -> if r = 0 then EErr (EDivisionByZero fid) else EOk (VNat (l / r))
              | EErr e, _ -> EErr e
              | _, EErr e -> EErr e)
      else if fid = fid_value_by_key then
        (* Z803 declares Z803K1 key, Z803K2 object: the key comes first. *)
        Some (match key_reference a, b with
              | Some k, VRecord _ fields -> begin
                  match field_of k fields with
                  | Some found -> EOk found
                  | None -> EErr (ETypeMismatch fid)
                end
              | _, _ -> EErr (ETypeMismatch fid))
      else if fid = fid_cons then
        Some (match as_list fid b with
              | EOk items -> EOk (VList (list_element_type b) (a :: items))
              | EErr e -> EErr e)
      else if fid = fid_append_last then
        (* Z12961 takes the element first and the list second, the opposite of
           the order the name suggests. Its own composition is
           reverse(cons(x, reverse(list))), so this matches it exactly. *)
        Some (match as_list fid b with
              | EOk items -> EOk (VList (list_element_type b) (value_append_last items a))
              | EErr e -> EErr e)
      else None
  | [a; b; c] ->
      if fid = fid_z10075_replace_all then
        Some (match as_text fid a, as_text fid b, as_text fid c with
              | EOk input, EOk pattern, EOk replacement ->
                  lift_kernel fid (z10075_replace_all_substrings input pattern replacement)
                  |> (fun r -> match r with EOk t -> EOk (VText t) | EErr e -> EErr e)
              | EErr e, _, _ -> EErr e
              | _, EErr e, _ -> EErr e
              | _, _, EErr e -> EErr e)
      else None
  | _ -> None

(* Does a thrown error have the errortype a try-catch asked for? An errortype is
   named by reference, so this compares identifiers rather than structure. *)
let thrown_matches (thrown:value) (wanted:value) : Tot bool =
  match thrown, wanted with
  | VRecord _ ((_, VFunc raised) :: _), VFunc asked -> raised = asked
  | VRecord _ ((_, VRecord raised _) :: _), VFunc asked -> raised = asked
  | _, _ -> false

(* Fuel is a budget for total work, not a limit on nesting depth.

   Passing the same fuel down every branch bounds how deep evaluation goes but
   says nothing about how wide it goes, so a naive Fibonacci with a depth of
   thirty can still make millions of calls and never run out. Threading the
   remaining budget through every result fixes that: each call spends from what
   the previous one left, and the total number of steps is bounded by the fuel
   the caller supplied.

   The returned budget is refined to be no larger than the one supplied, which
   is what lets F* see that the recursion terminates. *)

(* A separate limit on nesting depth. Fuel bounds total steps, which is the
   right budget for work, but it does not bound how deep the call stack gets,
   and evaluation runs on a host stack that is much smaller than a large fuel
   allowance. Without this, a non-productive definition such as Z844 boolean
   equality - defined as not(inequality), where inequality is defined as
   not(equality) - takes the host down instead of returning an error. A library
   must not crash its caller. *)
let max_depth : nat = 900

let rec eval (p:policy) (fuel:nat) (depth:nat) (env:list value) (e:expr)
  : Tot (eval_result value & (remaining:nat{remaining <= fuel})) (decreases %[fuel; 0; 0])
=
  match e with
  | EValue v -> (EOk v, fuel)
  | EArg index -> (env_lookup index env, fuel)
  | ERecord t fields ->
      if fuel = 0 then (EErr EFuelExhausted, 0)
      else if depth >= max_depth then (EErr EDepthExceeded, fuel)
      else
        let next : nat = fuel - 1 in
        let deeper : nat = depth + 1 in
        (match eval_list p next deeper env (field_exprs fields) with
         | (EErr err, after) -> (EErr err, after)
         | (EOk values, after) -> (EOk (VRecord t (fields_with_values fields values)), after))
  | ECall fid args ->
      if fuel = 0 then (EErr EFuelExhausted, 0)
      else if depth >= max_depth then (EErr EDepthExceeded, fuel)
      else
        let next : nat = fuel - 1 in
        let deeper : nat = depth + 1 in
        if fid = fid_unquote then
          (* Unquoting is evaluating, not unwrapping. The quoted body runs in
             the environment the unquote sits in. A payload that is not a quote
             comes back as it stands, which is what the wiki does with one. *)
          (match eval_list p next deeper env args with
           | (EErr err, after) -> (EErr err, after)
           | (EOk [VQuote inner], after) ->
               let (result, left) = eval p after deeper env inner in
               (result, left)
           | (EOk [other], after) -> (EOk other, after)
           | (EOk _, after) -> (EErr (EArityMismatch fid), after))
        else if fid = fid_throw then
          (* An error is built and raised. Both parts are ordinary values, so
             they are evaluated first; it is the raising that is special. *)
          match eval_list p next deeper env args with
          | (EErr err, after) -> (EErr err, after)
          | (EOk [errortype; parameters], after) ->
              (EErr (EThrown (VRecord type_z5 [(key_z5k1, errortype); (key_z5k2, parameters)])), after)
          | (EOk _, after) -> (EErr (EArityMismatch fid), after)
        else if fid = fid_get_error then
          (* Whether a call threw, and what. The call is evaluated and its
             result inspected rather than propagated, which is the whole point:
             an error here is an answer, not a failure. *)
          (match args with
           | [call] ->
               let (attempted, after) = eval p next deeper env call in
               begin match attempted with
               | EErr (EThrown thrown) -> (EOk (VPair (VBool true) thrown), after)
               | EErr err -> (EErr err, after)
               | EOk value -> (EOk (VPair (VBool false) value), after)
               end
           | _ -> (EErr (EArityMismatch fid), next))
        else if fid = fid_try_catch then
          (* The handler runs only if the call threw an error of the named type.
             Anything else - a different error type, or no error - passes
             through untouched, so a try-catch cannot swallow what it was not
             asked to catch. *)
          (match args with
           | [call; errortype; handler] ->
               let (attempted, after) = eval p next deeper env call in
               begin match attempted with
               | EErr (EThrown thrown) ->
                   let (asked, later) = eval p after deeper env errortype in
                   begin match asked with
                   | EErr err -> (EErr err, later)
                   | EOk wanted ->
                       if thrown_matches thrown wanted then
                         let (handled, left) = eval p later deeper env handler in
                         (handled, left)
                       else (EErr (EThrown thrown), later)
                   end
               | _ -> (attempted, after)
               end
           | _ -> (EErr (EArityMismatch fid), next))
        else if fid = fid_if || fid = fid_if_nat then
          match args with
          | [condition; then_branch; else_branch] -> begin
              match eval p next deeper env condition with
              | (EOk (VBool b), after) ->
                  let (result, left) = eval p after deeper env (if b then then_branch else else_branch) in
                  (result, left)
              | (EOk _, after) -> (EErr (ETypeMismatch fid), after)
              | (EErr err, after) -> (EErr err, after)
            end
          | _ -> (EErr (EArityMismatch fid), next)
        else
          match eval_list p next deeper env args with
          | (EErr err, after) -> (EErr err, after)
          | (EOk values, after) -> begin
              match apply_primitive fid values with
              | Some result -> (result, after)
              | None -> begin
                  match higher_order p after deeper fid values with
                  | Some (result, left) -> (result, left)
                  | None -> begin
                      match p fid with
                      | Some body ->
                          let (result, left) = eval p after deeper values body in
                          (result, left)
                      | None -> (EErr (ENoImplementation fid), after)
                    end
                end
            end

and eval_list (p:policy) (fuel:nat) (depth:nat) (env:list value) (es:list expr)
  : Tot (eval_result (list value) & (remaining:nat{remaining <= fuel})) (decreases %[fuel; 1; es])
=
  match es with
  | [] -> (EOk [], fuel)
  | head :: rest -> begin
      match eval p fuel depth env head with
      | (EErr err, after) -> (EErr err, after)
      | (EOk value, after) -> begin
          match eval_list p after depth env rest with
          | (EErr err, left) -> (EErr err, left)
          | (EOk others, left) -> (EOk (value :: others), left)
        end
    end

and higher_order (p:policy) (fuel:nat) (depth:nat) (fid:zid) (args:list value)
  : Tot (option (eval_result value & (remaining:nat{remaining <= fuel}))) (decreases %[fuel; 3; 0])
=
  (* Which function first, argument shape second.
     Matching on shape first is wrong here, because the shapes overlap: a
     pattern for three arguments headed by a function matches every call of
     apply-two, fold and zip-with alike, so whichever is written first silently
     answers for all of them and the rest report no implementation. *)
  if fid = fid_map then
    (match args with
     | [VFunc f; VList _ items] -> Some (map_values p fuel depth f items)
     | _ -> None)
  else if fid = fid_filter then
    (match args with
     | [VFunc f; VList t items] -> Some (filter_values p fuel depth t f items)
     | _ -> None)
  else if fid = fid_fold then
    (* Z876 declares Z876K1 function, Z876K2 iterable, Z876K3 initial object:
       the list is the second argument and the seed is the third. *)
    (match args with
     | [VFunc f; VList _ items; seed] -> Some (reduce_values p fuel depth f seed items)
     | _ -> None)
  else if fid = fid_zip_with then
    (match args with
     | [VFunc f; VList _ left; VList _ right] -> Some (zip_with_values p fuel depth f left right)
     | _ -> None)
  else if fid = internal_apply then
    (match args with
     | VFunc f :: rest -> Some (eval p fuel depth [] (ECall f (values_as_exprs rest)))
     | _ -> None)
  else if fid = fid_apply2 then
    (match args with
     | [VFunc f; a; b] -> Some (eval p fuel depth [] (ECall f [EValue a; EValue b]))
     | _ -> None)
  else if fid = fid_apply3 then
    (match args with
     | [VFunc f; a; b; c] -> Some (eval p fuel depth [] (ECall f [EValue a; EValue b; EValue c]))
     | _ -> None)
  else if fid = fid_apply4 then
    (match args with
     | [VFunc f; a; b; c; d] ->
         Some (eval p fuel depth [] (ECall f [EValue a; EValue b; EValue c; EValue d]))
     | _ -> None)
  else None

and map_values (p:policy) (fuel:nat) (depth:nat) (f:zid) (items:list value)
  : Tot (eval_result value & (remaining:nat{remaining <= fuel})) (decreases %[fuel; 2; items])
=
  match items with
  | [] -> (EOk (VList type_any []), fuel)
  | head :: rest -> begin
      match eval p fuel depth [] (ECall f [EValue head]) with
      | (EErr err, after) -> (EErr err, after)
      | (EOk mapped, after) -> begin
          match map_values p after depth f rest with
          | (EErr err, left) -> (EErr err, left)
          | (EOk (VList t others), left) -> (EOk (VList t (mapped :: others)), left)
          | (EOk _, left) -> (EErr (ETypeMismatch f), left)
        end
    end

and filter_values (p:policy) (fuel:nat) (depth:nat) (t:value) (f:zid) (items:list value)
  : Tot (eval_result value & (remaining:nat{remaining <= fuel})) (decreases %[fuel; 2; items])
=
  match items with
  (* Filtering keeps the element type: what is left is a sublist of what came
     in, whatever ends up in it. Mapping and zipping do not, because what their
     function returns is not known here. *)
  | [] -> (EOk (VList t []), fuel)
  | head :: rest -> begin
      match eval p fuel depth [] (ECall f [EValue head]) with
      | (EErr err, after) -> (EErr err, after)
      | (EOk (VBool keep), after) -> begin
          match filter_values p after depth t f rest with
          | (EErr err, left) -> (EErr err, left)
          | (EOk (VList _ others), left) ->
              (EOk (VList t (if keep then head :: others else others)), left)
          | (EOk _, left) -> (EErr (ETypeMismatch f), left)
        end
      | (EOk _, after) -> (EErr (ETypeMismatch f), after)
    end

and zip_with_values (p:policy) (fuel:nat) (depth:nat) (f:zid) (left:list value) (right:list value)
  : Tot (eval_result value & (remaining:nat{remaining <= fuel})) (decreases %[fuel; 2; left])
=
  match left, right with
  | [], _ -> (EOk (VList type_any []), fuel)
  | _, [] -> (EOk (VList type_any []), fuel)
  | l :: ltail, r :: rtail -> begin
      match eval p fuel depth [] (ECall f [EValue l; EValue r]) with
      | (EErr err, after) -> (EErr err, after)
      | (EOk combined, after) -> begin
          match zip_with_values p after depth f ltail rtail with
          | (EErr err, left_over) -> (EErr err, left_over)
          | (EOk (VList t others), left_over) -> (EOk (VList t (combined :: others)), left_over)
          | (EOk _, left_over) -> (EErr (ETypeMismatch f), left_over)
        end
    end

and reduce_values (p:policy) (fuel:nat) (depth:nat) (f:zid) (acc:value) (items:list value)
  : Tot (eval_result value & (remaining:nat{remaining <= fuel})) (decreases %[fuel; 2; items])
=
  match items with
  | [] -> (EOk acc, fuel)
  | head :: rest -> begin
      match eval p fuel depth [] (ECall f [EValue acc; EValue head]) with
      | (EErr err, after) -> (EErr err, after)
      | (EOk next_acc, after) ->
          let (result, left) = reduce_values p after depth f next_acc rest in
          (result, left)
    end

let empty_policy : policy = fun _ -> None

let run (p:policy) (fuel:nat) (fid:zid) (args:list value) : Tot (eval_result value) =
  let (result, _) = eval p fuel 0 [] (ECall fid (values_as_exprs args)) in
  result

(* How much of the budget a call actually spent, which is the useful number when
   choosing a fuel setting. *)
let run_with_cost (p:policy) (fuel:nat) (fid:zid) (args:list value)
  : Tot (eval_result value & nat)
=
  let (result, remaining) = eval p fuel 0 [] (ECall fid (values_as_exprs args)) in
  (result, fuel - remaining)
