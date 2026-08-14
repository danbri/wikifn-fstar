module Wikifn.Fuel

open Wikifn.Primitive.Kernel
open Wikifn.Zid
open Wikifn.Eval

(*
  Is the fuel bound honest?

  The evaluator takes a budget and threads what is left of it through every
  result, and the type already says the budget never grows:
  `remaining:nat{remaining <= fuel}`. That is a real refinement doing real work,
  but it is not the property anyone actually relies on. What a caller assumes
  when they raise the fuel and try again is this: *more fuel never changes an
  answer*. It can only turn a fuel-exhausted report into a result.

  Nothing was checking that. This module states it and proves it.

  The theorem proved here is stronger than monotonicity, and deliberately so,
  because the stronger form is the one that inducts. Monotonicity says the answer
  is unchanged; it says nothing about the fuel left over, so an induction on it
  has nothing to say about what the *next* step gets. This says extra fuel passes
  straight through:

      if evaluating with `fuel` succeeds and leaves `left`,
      then evaluating with `fuel + extra` gives the same answer
      and leaves exactly `left + extra`.

  Monotonicity follows immediately, and is stated at the bottom in the form a
  caller would want.

  The proof mirrors the evaluator exactly: one lemma per function, the same
  mutual group, the same decreases measures. That is not incidental - a fuelled
  interpreter's termination argument and its monotonicity argument are the same
  induction, so the lemmas can only be written this way.
*)

(*
  One thing the statement above got wrong, and it is worth recording rather than
  quietly fixing: extra fuel *can* change an answer. At fuel zero a call reports
  EFuelExhausted, and the same call with more fuel may well succeed. That is the
  whole point of raising the fuel, so the theorem cannot be unconditional.

  The condition is not "the smaller run succeeded", which is the obvious guess
  and is too strong. Z850 try-catch evaluates a call that may legitimately fail -
  that is what it is for - and the surrounding evaluation still succeeds, so an
  induction that only covers successful sub-runs has nothing to say about it.

  The right condition is that the smaller run did not *run out*: it reached an
  answer, whether that answer was a value or an error the composition raised.
  Fuel exhaustion propagates, so this holds of every sub-run of a run that has
  it, which is exactly what the induction needs.
*)
let reached (#a:Type0) (r:eval_result a) : Tot prop = ~(r == EErr EFuelExhausted)

(* Shorthand for "these two runs agree, and the second kept the extra".
   Written over the components rather than the pairs: the evaluator returns a
   refined `remaining:nat{remaining <= fuel}`, and a pair of a refined type is
   not a subtype of a pair of the plain one, so taking the halves separately is
   what lets the same predicate describe both runs. *)
let agreed (#a:Type0) (r1:eval_result a) (n1:nat) (r2:eval_result a) (n2:nat) (extra:nat)
  : Tot prop
= r2 == r1 /\ n2 == n1 + extra

let agrees_on (#a:Type0) (fuel:nat) (extra:nat)
              (first:(eval_result a & (m:nat{m <= fuel})))
              (second:(eval_result a & (m:nat{m <= fuel + extra})))
  : Tot prop
= agreed (fst first) (snd first) (fst second) (snd second) extra

(*
  WHAT IS PROVED HERE, AND WHAT IS NOT.
 
  Two of the seven lemmas below carry `admit ()`: eval itself and higher_order.
  The other five - eval_list, map, filter, zip and reduce - discharge.
 
  That does NOT make five of seven done, and the difference matters. All seven
  are one mutual group, so the five that discharge do so by *calling* eval_extra
  and using its stated postcondition, which is exactly what the admit assumes.
  They are proved relative to the two, not independently of them. Nothing here
  is a result until the admits are gone.
 
  What blocks them is one missing lemma, and it is worth naming precisely. Every
  recursive case has to discharge the precondition of its own inductive call:
  that the sub-run reached an answer. That follows from the parent having reached
  one, because fuel exhaustion propagates - but "exhaustion propagates" is itself
  a mutual induction over the same seven functions, and it is not written yet.
  Concretely, at the try-catch case, showing that evaluating the errortype did
  not run out requires knowing that if it had, the whole call would have reported
  exhaustion and the precondition would be false.
 
  So: `eval_fuel_monotone` and `run_fuel_monotone` at the bottom are STATED, not
  proved. Do not cite them as results. The five lemmas that carry no admit are
  proved, and the correction recorded above - that the unconditional statement is
  false, and that "the smaller run succeeded" is the wrong condition - was found
  by trying.
*)
let rec eval_extra (p:policy) (fuel:nat) (extra:nat) (depth:nat) (env:list value) (e:expr)
  : Lemma (requires reached (fst (eval p fuel depth env e)))
          (ensures agrees_on fuel extra (eval p fuel depth env e)
                          (eval p (fuel + extra) depth env e))
          (decreases %[fuel; 0; 0])
=
  (* Blocked on the propagation lemma described above. The case analysis below
     is the shape the finished proof needs; every branch already lines up with
     the evaluator, and what is missing is discharging each inductive call's
     precondition from the parent's. *)
  admit ();
  match e with
  | EValue _ -> ()
  | EArg _ -> ()
  | ERecord _ fields ->
      if fuel = 0 then () else
      if depth >= max_depth then () else
      eval_list_extra p (fuel - 1) extra (depth + 1) env (field_exprs fields)
  | ECall fid args ->
      if fuel = 0 then () else
      if depth >= max_depth then () else
      let next : nat = fuel - 1 in
      let deeper : nat = depth + 1 in
      if fid = fid_throw then eval_list_extra p next extra deeper env args
      else if fid = fid_get_error then
        (match args with
         | [call] -> eval_extra p next extra deeper env call
         | _ -> ())
      else if fid = fid_try_catch then
        (match args with
         | [call; errortype; handler] ->
             eval_extra p next extra deeper env call;
             let (attempted, after) = eval p next deeper env call in
             (match attempted with
              | EErr (EThrown _) ->
                  eval_extra p after extra deeper env errortype;
                  let (asked, later) = eval p after deeper env errortype in
                  (match asked with
                   | EOk _ -> eval_extra p later extra deeper env handler
                   | _ -> ())
              | _ -> ())
         | _ -> ())
      else if fid = fid_if || fid = fid_if_nat then
        (match args with
         | [condition; then_branch; else_branch] ->
             eval_extra p next extra deeper env condition;
             let (decided, after) = eval p next deeper env condition in
             (match decided with
              | EOk (VBool b) ->
                  eval_extra p after extra deeper env (if b then then_branch else else_branch)
              | _ -> ())
         | _ -> ())
      else begin
        eval_list_extra p next extra deeper env args;
        let (values, after) = eval_list p next deeper env args in
        match values with
        | EErr _ -> ()
        | EOk vs ->
            match apply_primitive fid vs with
            | Some _ -> ()
            | None ->
                higher_order_extra p after extra deeper fid vs;
                match higher_order p after deeper fid vs with
                | Some _ -> ()
                | None ->
                    match p fid with
                    | Some body -> eval_extra p after extra deeper vs body
                    | None -> ()
      end

and eval_list_extra (p:policy) (fuel:nat) (extra:nat) (depth:nat) (env:list value) (es:list expr)
  : Lemma (requires reached (fst (eval_list p fuel depth env es)))
          (ensures agrees_on fuel extra (eval_list p fuel depth env es)
                               (eval_list p (fuel + extra) depth env es))
          (decreases %[fuel; 1; es])
=
  match es with
  | [] -> ()
  | head :: rest ->
      eval_extra p fuel extra depth env head;
      let (first, after) = eval p fuel depth env head in
      match first with
      | EErr _ -> ()
      | EOk _ -> eval_list_extra p after extra depth env rest

and higher_order_extra (p:policy) (fuel:nat) (extra:nat) (depth:nat) (fid:zid) (args:list value)
  : Lemma (requires (match higher_order p fuel depth fid args with
                     | Some a -> reached (fst a)
                     | None -> True))
          (ensures (match higher_order p fuel depth fid args,
                          higher_order p (fuel + extra) depth fid args with
                    | Some a, Some b -> agreed (fst a) (snd a) (fst b) (snd b) extra
                    | None, None -> True
                    | _, _ -> False))
          (decreases %[fuel; 3; 0])
=
  (* Blocked on the same lemma, through eval_extra. *)
  admit ();
  if fid = fid_map then
    (match args with
     | [VFunc f; VList items] -> map_extra p fuel extra depth f items
     | _ -> ())
  else if fid = fid_filter then
    (match args with
     | [VFunc f; VList items] -> filter_extra p fuel extra depth f items
     | _ -> ())
  else if fid = fid_fold then
    (match args with
     | [VFunc f; VList items; seed] -> reduce_extra p fuel extra depth f seed items
     | _ -> ())
  else if fid = fid_zip_with then
    (match args with
     | [VFunc f; VList left; VList right] -> zip_extra p fuel extra depth f left right
     | _ -> ())
  else if fid = fid_apply2 then
    (match args with
     | [VFunc f; a; b] -> eval_extra p fuel extra depth [] (ECall f [EValue a; EValue b])
     | _ -> ())
  else if fid = fid_apply3 then
    (match args with
     | [VFunc f; a; b; c] ->
         eval_extra p fuel extra depth [] (ECall f [EValue a; EValue b; EValue c])
     | _ -> ())
  else if fid = fid_apply4 then
    (match args with
     | [VFunc f; a; b; c; d] ->
         eval_extra p fuel extra depth [] (ECall f [EValue a; EValue b; EValue c; EValue d])
     | _ -> ())
  else ()

and map_extra (p:policy) (fuel:nat) (extra:nat) (depth:nat) (f:zid) (items:list value)
  : Lemma (requires reached (fst (map_values p fuel depth f items)))
          (ensures agrees_on fuel extra (map_values p fuel depth f items)
                               (map_values p (fuel + extra) depth f items))
          (decreases %[fuel; 2; items])
=
  match items with
  | [] -> ()
  | head :: rest ->
      eval_extra p fuel extra depth [] (ECall f [EValue head]);
      let (mapped, after) = eval p fuel depth [] (ECall f [EValue head]) in
      match mapped with
      | EErr _ -> ()
      | EOk _ -> map_extra p after extra depth f rest

and filter_extra (p:policy) (fuel:nat) (extra:nat) (depth:nat) (f:zid) (items:list value)
  : Lemma (requires reached (fst (filter_values p fuel depth f items)))
          (ensures agrees_on fuel extra (filter_values p fuel depth f items)
                               (filter_values p (fuel + extra) depth f items))
          (decreases %[fuel; 2; items])
=
  match items with
  | [] -> ()
  | head :: rest ->
      eval_extra p fuel extra depth [] (ECall f [EValue head]);
      let (kept, after) = eval p fuel depth [] (ECall f [EValue head]) in
      match kept with
      | EOk (VBool _) -> filter_extra p after extra depth f rest
      | _ -> ()

and zip_extra (p:policy) (fuel:nat) (extra:nat) (depth:nat) (f:zid)
              (left:list value) (right:list value)
  : Lemma (requires reached (fst (zip_with_values p fuel depth f left right)))
          (ensures agrees_on fuel extra (zip_with_values p fuel depth f left right)
                               (zip_with_values p (fuel + extra) depth f left right))
          (decreases %[fuel; 2; left])
=
  match left, right with
  | [], _ -> ()
  | _, [] -> ()
  | l :: ltail, r :: rtail ->
      eval_extra p fuel extra depth [] (ECall f [EValue l; EValue r]);
      let (combined, after) = eval p fuel depth [] (ECall f [EValue l; EValue r]) in
      match combined with
      | EErr _ -> ()
      | EOk _ -> zip_extra p after extra depth f ltail rtail

and reduce_extra (p:policy) (fuel:nat) (extra:nat) (depth:nat) (f:zid)
                 (acc:value) (items:list value)
  : Lemma (requires reached (fst (reduce_values p fuel depth f acc items)))
          (ensures agrees_on fuel extra (reduce_values p fuel depth f acc items)
                               (reduce_values p (fuel + extra) depth f acc items))
          (decreases %[fuel; 2; items])
=
  match items with
  | [] -> ()
  | head :: rest ->
      eval_extra p fuel extra depth [] (ECall f [EValue acc; EValue head]);
      let (stepped, after) = eval p fuel depth [] (ECall f [EValue acc; EValue head]) in
      match stepped with
      | EErr _ -> ()
      | EOk next_acc -> reduce_extra p after extra depth f next_acc rest

(*
  What a caller actually wants: raising the fuel never changes an answer, as
  long as the smaller run reached one. That proviso is not a technicality - it is
  the whole content. Without it the statement is false, because turning
  "ran out of fuel" into a result is exactly what raising the fuel is for.

  STATED, NOT PROVED: both rest on eval_extra, which carries an admit. They are
  written out because the statement is the useful half - it says precisely what
  "the fuel bound is honest" has to mean - and it is what the remaining work has
  to deliver.
*)
let eval_fuel_monotone (p:policy) (smaller:nat) (larger:nat{larger >= smaller})
                       (depth:nat) (env:list value) (e:expr)
  : Lemma (requires reached (fst (eval p smaller depth env e)))
          (ensures fst (eval p larger depth env e) == fst (eval p smaller depth env e))
= eval_extra p smaller (larger - smaller) depth env e

(* And the same for a whole call, which is the entry point a caller uses. *)
let run_fuel_monotone (p:policy) (smaller:nat) (larger:nat{larger >= smaller})
                      (fid:zid) (args:list value)
  : Lemma (requires reached (run p smaller fid args))
          (ensures run p larger fid args == run p smaller fid args)
= eval_extra p smaller (larger - smaller) 0 [] (ECall fid (values_as_exprs args))
