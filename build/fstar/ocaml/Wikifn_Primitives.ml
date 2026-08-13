open Prims
type primitive =
  | PIsZero
  | PSuccessor
  | PPredecessor
let (uu___is_PIsZero : primitive -> Prims.bool) =
  fun projectee -> match projectee with | PIsZero -> true | uu___ -> false
let (uu___is_PSuccessor : primitive -> Prims.bool) =
  fun projectee -> match projectee with | PSuccessor -> true | uu___ -> false
let (uu___is_PPredecessor : primitive -> Prims.bool) =
  fun projectee ->
    match projectee with | PPredecessor -> true | uu___ -> false
type value =
  | VNat of Prims.nat
  | VBool of Prims.bool
let (uu___is_VNat : value -> Prims.bool) =
  fun projectee -> match projectee with | VNat _0 -> true | uu___ -> false
let (__proj__VNat__item___0 : value -> Prims.nat) =
  fun projectee -> match projectee with | VNat _0 -> _0
let (uu___is_VBool : value -> Prims.bool) =
  fun projectee -> match projectee with | VBool _0 -> true | uu___ -> false
let (__proj__VBool__item___0 : value -> Prims.bool) =
  fun projectee -> match projectee with | VBool _0 -> _0
type prim_error =
  | TypeMismatch
  | Underflow
let (uu___is_TypeMismatch : prim_error -> Prims.bool) =
  fun projectee ->
    match projectee with | TypeMismatch -> true | uu___ -> false
let (uu___is_Underflow : prim_error -> Prims.bool) =
  fun projectee -> match projectee with | Underflow -> true | uu___ -> false
type 'a prim_result =
  | POk of 'a
  | PErr of prim_error
let uu___is_POk : 'a . 'a prim_result -> Prims.bool =
  fun projectee -> match projectee with | POk _0 -> true | uu___ -> false
let __proj__POk__item___0 : 'a . 'a prim_result -> 'a =
  fun projectee -> match projectee with | POk _0 -> _0
let uu___is_PErr : 'a . 'a prim_result -> Prims.bool =
  fun projectee -> match projectee with | PErr _0 -> true | uu___ -> false
let __proj__PErr__item___0 : 'a . 'a prim_result -> prim_error =
  fun projectee -> match projectee with | PErr _0 -> _0
let (is_zero_nat : Prims.nat -> Prims.bool) =
  fun n ->
    match n with | uu___ when uu___ = Prims.int_zero -> true | uu___ -> false
let (successor_nat : Prims.nat -> Prims.nat) = fun n -> n + Prims.int_one
let (predecessor_nat : Prims.nat -> Prims.nat prim_result) =
  fun n ->
    match n with
    | uu___ when uu___ = Prims.int_zero -> PErr Underflow
    | uu___ -> POk (n - Prims.int_one)
let (eval_unary : primitive -> value -> value prim_result) =
  fun p ->
    fun x ->
      match (p, x) with
      | (PIsZero, VNat n) -> POk (VBool (is_zero_nat n))
      | (PSuccessor, VNat n) -> POk (VNat (successor_nat n))
      | (PPredecessor, VNat n) ->
          (match predecessor_nat n with
           | POk m -> POk (VNat m)
           | PErr e -> PErr e)
      | (uu___, uu___1) -> PErr TypeMismatch
