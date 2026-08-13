module Wikifn.Primitives

type primitive =
  | PIsZero
  | PSuccessor
  | PPredecessor

type value =
  | VNat : nat -> value
  | VBool : bool -> value

type prim_error =
  | TypeMismatch
  | Underflow

type prim_result (a:Type0) =
  | POk : a -> prim_result a
  | PErr : prim_error -> prim_result a

let is_zero_nat (n:nat) : Tot bool =
  match n with
  | 0 -> true
  | _ -> false

let successor_nat (n:nat) : Tot nat =
  n + 1

let predecessor_nat (n:nat) : Tot (prim_result nat) =
  match n with
  | 0 -> PErr Underflow
  | _ -> POk (n - 1)

let eval_unary (p:primitive) (x:value) : Tot (prim_result value) =
  match p, x with
  | PIsZero, VNat n -> POk (VBool (is_zero_nat n))
  | PSuccessor, VNat n -> POk (VNat (successor_nat n))
  | PPredecessor, VNat n ->
      (match predecessor_nat n with
       | POk m -> POk (VNat m)
       | PErr e -> PErr e)
  | _, _ -> PErr TypeMismatch

let is_zero_zero () :
  Lemma (eval_unary PIsZero (VNat 0) == POk (VBool true))
  = ()

let successor_two () :
  Lemma (eval_unary PSuccessor (VNat 2) == POk (VNat 3))
  = ()

let predecessor_two () :
  Lemma (eval_unary PPredecessor (VNat 2) == POk (VNat 1))
  = ()

let predecessor_zero () :
  Lemma (eval_unary PPredecessor (VNat 0) == PErr Underflow)
  = ()
