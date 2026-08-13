module Wikifn.Semantics

open Wikifn.Model

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
