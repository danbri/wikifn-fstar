module Wikifn.Direct

open Wikifn.Primitive.Kernel
open Wikifn.Zid
open Wikifn.Eval

(*
  What a compiled composition is made of.

  The interpreter carries a composition as data - an `expr` tree - and walks it.
  This module is the other thing: the support a composition needs when it is
  compiled into an F* function of its own, so that calling it is calling a
  function rather than interpreting a tree.

  Two decisions shape everything here.

  A compiled function takes and returns `eval_result value` rather than a type
  derived from its Z8 signature. That is what makes the whole data model
  reachable: a Wikifunctions argument can be a string, a natural number, a
  boolean, a typed list, a pair, a record or a function, and `value` is exactly
  that set. Deriving an F* type per signature would mean modelling all 82
  declared type heads in the corpus and would cover less, not more. The declared
  types stay documentation, as they already are - `has_type` is assumed.

  Threading `eval_result` rather than `value` means an error propagates without
  the generator emitting a single line to propagate it, and it makes composition
  trivial: the result of one call is directly the argument of the next.
*)

let ok (v:value) : Tot (eval_result value) = EOk v

(* What a recursive compiled function is given when it is called from outside
   its own recursive group. Inside the group a call spends the caller's fuel, so
   a group cannot loop for ever; entering one from outside has to start the
   budget somewhere, and this is that number. Running out is reported, as
   everywhere else, rather than hidden. *)
let default_fuel : nat = 100000

(* Arguments, left to right, stopping at the first error. *)
let rec sequence (results:list (eval_result value)) : Tot (eval_result (list value)) =
  match results with
  | [] -> EOk []
  | EErr e :: _ -> EErr e
  | EOk v :: rest ->
      match sequence rest with
      | EErr e -> EErr e
      | EOk vs -> EOk (v :: vs)

(* Calling a primitive from compiled code. The same apply_primitive the
   interpreter uses, so a primitive cannot mean one thing interpreted and
   another compiled. *)
let call_primitive (fid:zid) (args:list (eval_result value)) : Tot (eval_result value) =
  match sequence args with
  | EErr e -> EErr e
  | EOk values ->
      match apply_primitive fid values with
      | Some result -> result
      | None -> EErr (ENoImplementation fid)

(* A conditional is generated as an F* `if`, not as a call, so only the taken
   branch is evaluated. This is not a preference: 230 of the 288 directly
   self-recursive compositions in the corpus guard their recursive branch with
   Z802, and a strict conditional would make every one of them diverge. This
   function exists only to read the condition; the branches are supplied by the
   generator as expressions and F* evaluates one of them. *)
let condition_of (fid:zid) (c:eval_result value) : Tot (eval_result bool) =
  match c with
  | EErr e -> EErr e
  | EOk (VBool b) -> EOk b
  | EOk _ -> EErr (ETypeMismatch fid)

(* Building a record whose fields are computed. *)
let rec sequence_fields (fields:list (zkey & eval_result value))
  : Tot (eval_result (list (zkey & value)))
=
  match fields with
  | [] -> EOk []
  | (_, EErr e) :: _ -> EErr e
  | (k, EOk v) :: rest ->
      match sequence_fields rest with
      | EErr e -> EErr e
      | EOk vs -> EOk ((k, v) :: vs)

let make_record (t:zid) (fields:list (zkey & eval_result value)) : Tot (eval_result value) =
  match sequence_fields fields with
  | EErr e -> EErr e
  | EOk vs -> EOk (VRecord t vs)

(*
  The higher-order primitives, taking an actual F* function rather than a ZID.

  This is where compiled code differs from interpreted code and where it wins:
  the interpreter looks the callee up by number on every element, while here the
  callee is an ordinary function the extracted OCaml calls directly. All three
  are structurally recursive on the list, so none of them needs fuel.
*)
let rec map_direct (f:value -> Tot (eval_result value)) (items:list value)
  : Tot (eval_result value) (decreases items)
=
  match items with
  | [] -> EOk (VList [])
  | head :: tail ->
      match f head with
      | EErr e -> EErr e
      | EOk mapped ->
          match map_direct f tail with
          | EErr e -> EErr e
          | EOk (VList others) -> EOk (VList (mapped :: others))
          | EOk _ -> EErr (ETypeMismatch fid_map)

let rec filter_direct (f:value -> Tot (eval_result value)) (items:list value)
  : Tot (eval_result value) (decreases items)
=
  match items with
  | [] -> EOk (VList [])
  | head :: tail ->
      match f head with
      | EErr e -> EErr e
      | EOk (VBool keep) ->
          begin match filter_direct f tail with
          | EErr e -> EErr e
          | EOk (VList others) -> EOk (VList (if keep then head :: others else others))
          | EOk _ -> EErr (ETypeMismatch fid_filter)
          end
      | EOk _ -> EErr (ETypeMismatch fid_filter)

(* Z876 declares (function, iterable, initial object) and applies the function
   as f accumulator element, which is the order Z12781 left fold states. *)
let rec fold_direct (f:value -> value -> Tot (eval_result value)) (items:list value) (seed:value)
  : Tot (eval_result value) (decreases items)
=
  match items with
  | [] -> EOk seed
  | head :: tail ->
      match f seed head with
      | EErr e -> EErr e
      | EOk next -> fold_direct f tail next

let rec zip_direct (f:value -> value -> Tot (eval_result value))
                   (left:list value) (right:list value)
  : Tot (eval_result value) (decreases left)
=
  match left, right with
  | [], _ -> EOk (VList [])
  | _, [] -> EOk (VList [])
  | l :: ltail, r :: rtail ->
      match f l r with
      | EErr e -> EErr e
      | EOk combined ->
          match zip_direct f ltail rtail with
          | EErr e -> EErr e
          | EOk (VList others) -> EOk (VList (combined :: others))
          | EOk _ -> EErr (ETypeMismatch fid_zip_with)

(*
  Errors as values, compiled.

  These need no special evaluation order here, and that is a property of the
  representation rather than a convenience. A compiled function threads
  eval_result, so an argument that raised an error is already an EErr in hand
  rather than a computation that aborted - which is exactly what try-catch needs
  to look at. The interpreter has to treat these as special forms because it
  would otherwise propagate the error before Z850 could see it.

  The handler is the one thing that must stay lazy, so the generator emits it as
  a branch rather than passing it here.
*)
let throw_error (errortype:eval_result value) (parameters:eval_result value)
  : Tot (eval_result value)
=
  match errortype, parameters with
  | EErr e, _ -> EErr e
  | _, EErr e -> EErr e
  | EOk t, EOk ps -> EErr (EThrown (VRecord type_z5 [(key_z5k1, t); (key_z5k2, ps)]))

(* Whether a call threw, and what. An error is an answer here, not a failure. *)
let get_error (attempted:eval_result value) : Tot (eval_result value) =
  match attempted with
  | EErr (EThrown thrown) -> EOk (VPair (VBool true) thrown)
  | EErr e -> EErr e
  | EOk value -> EOk (VPair (VBool false) value)

(* Whether a try-catch should run its handler: the call threw, and what it threw
   has the errortype that was asked for. Anything else passes through, so a
   catch cannot swallow what it was not asked to catch. *)
let caught (attempted:eval_result value) (errortype:eval_result value) : Tot bool =
  match attempted, errortype with
  | EErr (EThrown thrown), EOk wanted -> thrown_matches thrown wanted
  | _, _ -> false

(* A list argument, for the higher-order forms above. *)
let as_items (fid:zid) (r:eval_result value) : Tot (eval_result (list value)) =
  match r with
  | EErr e -> EErr e
  | EOk (VList items) -> EOk items
  | EOk _ -> EErr (ETypeMismatch fid)

let with_items (fid:zid) (r:eval_result value) (k:list value -> Tot (eval_result value))
  : Tot (eval_result value)
=
  match as_items fid r with
  | EErr e -> EErr e
  | EOk items -> k items
