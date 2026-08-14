module Wikifn.Eval

open FStar.Mul
open Wikifn.Primitive.Kernel
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
  | VList : list value -> value
  | VPair : value -> value -> value
  | VFunc : zid -> value

type eval_error =
  | EFuelExhausted
  | EDepthExceeded
  | EUnboundArgument
  | EArityMismatch : zid -> eval_error
  | ETypeMismatch : zid -> eval_error
  | ENoImplementation : zid -> eval_error
  | EPrimitiveError : kernel_error -> eval_error

type eval_result (a:Type0) =
  | EOk : a -> eval_result a
  | EErr : eval_error -> eval_result a

type expr =
  | EValue : value -> expr
  | EArg : nat -> expr
  | ECall : zid -> list expr -> expr

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
let fid_string_append : zid = 10000 // Z10000 join two strings
let fid_not : zid = 10216           // Z10216 not
let fid_and : zid = 10174           // Z10174 and
let fid_or : zid = 10184            // Z10184 or
let fid_length : zid = 12681        // Z12681 length of a list

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
let fid_if_nat : zid = 13846        // Z13846 if natural number output

// Text and codepoint lists are the same data in two shapes. These conversions
// bridge the string primitives and the list primitives, which is why they gate
// so much of the corpus.
let fid_string_to_codepoints : zid = 22717  // Z22717 String to codepoint list
let fid_codepoints_to_string : zid = 22693  // Z22693 Codepoint list to string

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

(* An internal helper the generator emits for the private-use marker idiom.
   Numbered outside the Wikifunctions range so it cannot collide. *)
let internal_fresh_private_use : zid = 1000000001

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

let rec value_count (items:list value) : Tot nat =
  match items with
  | [] -> 0
  | _ :: rest -> 1 + value_count rest

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

let as_list (fid:zid) (v:value) : Tot (eval_result (list value)) =
  match v with
  | VList items -> EOk items
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
              | EOk (_ :: tail) -> EOk (VList tail)
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
      else if fid = fid_fst then
        Some (match a with
              | VPair l _ -> EOk l
              | _ -> EErr (ETypeMismatch fid))
      else if fid = fid_snd then
        Some (match a with
              | VPair _ r -> EOk r
              | _ -> EErr (ETypeMismatch fid))
      else if fid = fid_string_to_codepoints then
        Some (match as_text fid a with
              | EOk t -> EOk (VList (codepoints_as_values t))
              | EErr e -> EErr e)
      else if fid = fid_codepoints_to_string then
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
      else if fid = fid_cons then
        Some (match as_list fid b with
              | EOk items -> EOk (VList (a :: items))
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
  | ECall fid args ->
      if fuel = 0 then (EErr EFuelExhausted, 0)
      else if depth >= max_depth then (EErr EDepthExceeded, fuel)
      else
        let next : nat = fuel - 1 in
        let deeper : nat = depth + 1 in
        if fid = fid_if || fid = fid_if_nat then
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
  match args with
  | [VFunc f; VList items] ->
      if fid = fid_map then Some (map_values p fuel depth f items)
      else if fid = fid_filter then Some (filter_values p fuel depth f items)
      else None
  | [VFunc f; seed; VList items] ->
      if fid = fid_fold then Some (reduce_values p fuel depth f seed items)
      else None
  | _ -> None

and map_values (p:policy) (fuel:nat) (depth:nat) (f:zid) (items:list value)
  : Tot (eval_result value & (remaining:nat{remaining <= fuel})) (decreases %[fuel; 2; items])
=
  match items with
  | [] -> (EOk (VList []), fuel)
  | head :: rest -> begin
      match eval p fuel depth [] (ECall f [EValue head]) with
      | (EErr err, after) -> (EErr err, after)
      | (EOk mapped, after) -> begin
          match map_values p after depth f rest with
          | (EErr err, left) -> (EErr err, left)
          | (EOk (VList others), left) -> (EOk (VList (mapped :: others)), left)
          | (EOk _, left) -> (EErr (ETypeMismatch f), left)
        end
    end

and filter_values (p:policy) (fuel:nat) (depth:nat) (f:zid) (items:list value)
  : Tot (eval_result value & (remaining:nat{remaining <= fuel})) (decreases %[fuel; 2; items])
=
  match items with
  | [] -> (EOk (VList []), fuel)
  | head :: rest -> begin
      match eval p fuel depth [] (ECall f [EValue head]) with
      | (EErr err, after) -> (EErr err, after)
      | (EOk (VBool keep), after) -> begin
          match filter_values p after depth f rest with
          | (EErr err, left) -> (EErr err, left)
          | (EOk (VList others), left) -> (EOk (VList (if keep then head :: others else others)), left)
          | (EOk _, left) -> (EErr (ETypeMismatch f), left)
        end
      | (EOk _, after) -> (EErr (ETypeMismatch f), after)
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
