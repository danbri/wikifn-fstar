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
              | EOk first, EOk last -> EOk (VText (text_unicode_range first last))
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

let rec eval (p:policy) (fuel:nat) (env:list value) (e:expr)
  : Tot (eval_result value) (decreases %[fuel; 0; 0])
=
  match e with
  | EValue v -> EOk v
  | EArg index -> env_lookup index env
  | ECall fid args ->
      if fuel = 0 then EErr EFuelExhausted
      else
        let next : nat = fuel - 1 in
        (* Z802 is lazy in its branches; the condition alone is evaluated. *)
        if fid = fid_if then
          match args with
          | [condition; then_branch; else_branch] -> begin
              match eval p next env condition with
              | EOk (VBool b) -> eval p next env (if b then then_branch else else_branch)
              | EOk _ -> EErr (ETypeMismatch fid)
              | EErr err -> EErr err
            end
          | _ -> EErr (EArityMismatch fid)
        else
          match eval_list p next env args with
          | EErr err -> EErr err
          | EOk values -> begin
              match apply_primitive fid values with
              | Some result -> result
              | None -> begin
                  (* Higher-order primitives need the evaluator itself. *)
                  match higher_order p next fid values with
                  | Some result -> result
                  | None -> begin
                      match p fid with
                      | Some body -> eval p next values body
                      | None -> EErr (ENoImplementation fid)
                    end
                end
            end

and eval_list (p:policy) (fuel:nat) (env:list value) (es:list expr)
  : Tot (eval_result (list value)) (decreases %[fuel; 1; es])
=
  match es with
  | [] -> EOk []
  | head :: rest -> begin
      match eval p fuel env head with
      | EErr err -> EErr err
      | EOk value -> begin
          match eval_list p fuel env rest with
          | EErr err -> EErr err
          | EOk others -> EOk (value :: others)
        end
    end

(* map, filter and reduce take a function reference as a value and therefore
   have to call back into evaluation. *)
and higher_order (p:policy) (fuel:nat) (fid:zid) (args:list value)
  : Tot (option (eval_result value)) (decreases %[fuel; 3; 0])
=
  match args with
  | [VFunc f; VList items] ->
      if fid = fid_map then Some (map_values p fuel f items)
      else if fid = fid_filter then Some (filter_values p fuel f items)
      else None
  | [VFunc f; seed; VList items] ->
      if fid = fid_fold then Some (reduce_values p fuel f seed items)
      else None
  | _ -> None

and map_values (p:policy) (fuel:nat) (f:zid) (items:list value)
  : Tot (eval_result value) (decreases %[fuel; 2; items])
=
  match items with
  | [] -> EOk (VList [])
  | head :: rest -> begin
      match eval p fuel [] (ECall f [EValue head]) with
      | EErr err -> EErr err
      | EOk mapped -> begin
          match map_values p fuel f rest with
          | EErr err -> EErr err
          | EOk (VList others) -> EOk (VList (mapped :: others))
          | EOk _ -> EErr (ETypeMismatch f)
        end
    end

and filter_values (p:policy) (fuel:nat) (f:zid) (items:list value)
  : Tot (eval_result value) (decreases %[fuel; 2; items])
=
  match items with
  | [] -> EOk (VList [])
  | head :: rest -> begin
      match eval p fuel [] (ECall f [EValue head]) with
      | EErr err -> EErr err
      | EOk (VBool keep) -> begin
          match filter_values p fuel f rest with
          | EErr err -> EErr err
          | EOk (VList others) -> EOk (VList (if keep then head :: others else others))
          | EOk _ -> EErr (ETypeMismatch f)
        end
      | EOk _ -> EErr (ETypeMismatch f)
    end

and reduce_values (p:policy) (fuel:nat) (f:zid) (acc:value) (items:list value)
  : Tot (eval_result value) (decreases %[fuel; 2; items])
=
  match items with
  | [] -> EOk acc
  | head :: rest -> begin
      match eval p fuel [] (ECall f [EValue acc; EValue head]) with
      | EErr err -> EErr err
      | EOk next_acc -> reduce_values p fuel f next_acc rest
    end

let empty_policy : policy = fun _ -> None

let run (p:policy) (fuel:nat) (fid:zid) (args:list value) : Tot (eval_result value) =
  eval p fuel [] (ECall fid (values_as_exprs args))
