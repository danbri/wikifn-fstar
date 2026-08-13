module Wikifn.Semantics

open Wikifn.Primitive.Kernel
open Wikifn.Zid
open Wikifn.Model

(*
  Statements about evaluation over the full ZObject model.

  Everything here is still assumed. The working evaluator is Wikifn.Composition,
  which runs over a small expression type rather than over zterm directly.
  Connecting the two is the last step of the model work, not this file's job
  yet; these signatures record the intended shape so the gap stays visible.
*)

type eval_error =
  | FuelExhausted
  | UnboundReference
  | UnboundArgument
  | NoImplementation
  | ForeignCodeBoundary
  | TypeError

type result (a:Type0) =
  | Ok : a -> result a
  | Err : eval_error -> result a

type env = zkey -> option zterm
type impl_policy = zid -> option zterm

assume val composition_expr :
  impl:zterm ->
  Type0

assume val eval :
  w:world ->
  policy:impl_policy ->
  env:env ->
  fuel:nat ->
  expr:zterm ->
  Tot (result zterm)

assume val eval_preserves_type :
  w:world ->
  policy:impl_policy ->
  env:env ->
  fuel:nat ->
  expr:zterm ->
  ty:zty ->
  has_type w expr ty ->
  Lemma (
    match eval w policy env fuel expr with
    | Ok value -> has_type w value ty
    | Err _ -> True
  )
