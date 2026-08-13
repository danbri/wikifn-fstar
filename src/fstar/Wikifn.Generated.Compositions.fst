module Wikifn.Generated.Compositions

open Wikifn.Primitive.Kernel
open Wikifn.Composition

(*
  Generated from pinned local Wikifunctions cache entries.
  Regenerate with: node scripts/generate-fstar-compositions.js

  Z10052@257241 -> Z10077@145855 digest 49fbc6ab7af0c00d6397f78bb61b5d6f9ea02e2179bbef9f0c3bbb0fc4a988db
  Z14613@280542 -> Z36070@280538 digest 41605ec554aef833e8ee9354de5857fa88d31958b94a22b3998dd8d8d925437c
  Z21679@163193 -> Z21681@157559 digest da92a1e80363a96004f2936401e405671109d283c72fe9d56c461232eda05f8a
  Z22294@214920 -> Z22295@164133 digest d2da923987dbe1dc638cca056caae0db62d65d0c18f1bf8786f0b94d270b2eac
  Z38114@293195 -> Z38115@293192 digest 82c3ed0335de17c07a53c3c83ef6e6f08cd8e2687ccf82587f321e027019ca42
*)

let generated_z10077_expr (z10052k1_0:expr) : expr =
  ECall FZ10075 [z10052k1_0; EValue (VText [32]); EValue (VText [])]
let generated_z36070_expr (z14613k1_0:expr) (z14613k2_1:expr) (z14613k3_2:expr) : expr =
  ECall FZ802 [ECall FZ10008 [z14613k2_1]; z14613k1_0; ECall FZ10075 [ECall FZ14613 [ECall FZ10075 [z14613k1_0; ECall FZ10901 [z14613k2_1]; ECall FInternalFreshPrivateUse [z14613k1_0]]; ECall FZ14456 [z14613k2_1]; ECall FZ14456 [z14613k3_2]]; ECall FInternalFreshPrivateUse [z14613k1_0]; ECall FZ10901 [z14613k3_2]]]
let generated_z21681_expr (z21679k1_0:expr) : expr =
  ECall FZ10075 [z21679k1_0; EValue (VText [44]); EValue (VText [46])]
let generated_z22295_expr (z22294k1_0:expr) : expr =
  ECall FZ14613 [z22294k1_0; EValue (VText [2406; 2407; 2408; 2409; 2410; 2411; 2412; 2413; 2414; 2415]); EValue (VText [48; 49; 50; 51; 52; 53; 54; 55; 56; 57])]
let generated_z38115_expr (z38114k1_0:expr) : expr =
  ECall FZ10075 [ECall FZ10075 [z38114k1_0; EValue (VText [100; 101; 32; 108; 101; 115]); EValue (VText [100; 101; 115])]; EValue (VText [100; 101; 32; 108; 101]); EValue (VText [100; 117])]

let generated_policy (fid:function_id) (args:list expr) : Tot body_option =
  match fid, args with
  | FZ10052, z10052k1_0 :: [] ->
      Body (generated_z10077_expr z10052k1_0)
  | FZ14613, z14613k1_0 :: z14613k2_1 :: z14613k3_2 :: [] ->
      Body (generated_z36070_expr z14613k1_0 z14613k2_1 z14613k3_2)
  | FZ21679, z21679k1_0 :: [] ->
      Body (generated_z21681_expr z21679k1_0)
  | FZ22294, z22294k1_0 :: [] ->
      Body (generated_z22295_expr z22294k1_0)
  | FZ38114, z38114k1_0 :: [] ->
      Body (generated_z38115_expr z38114k1_0)
  | _, _ -> NoBody

let eval_generated_z10052 (fuel:nat) (input:text) : Tot (eval_result value) =
  eval_with_policy generated_policy fuel [] (ECall FZ10052 [EValue (VText input)])
let eval_generated_z14613 (fuel:nat) (input:text) (old_alphabet:text) (new_alphabet:text) : Tot (eval_result value) =
  eval_with_policy generated_policy fuel [] (ECall FZ14613 [EValue (VText input); EValue (VText old_alphabet); EValue (VText new_alphabet)])
let eval_generated_z21679 (fuel:nat) (input:text) : Tot (eval_result value) =
  eval_with_policy generated_policy fuel [] (ECall FZ21679 [EValue (VText input)])
let eval_generated_z22294 (fuel:nat) (input:text) : Tot (eval_result value) =
  eval_with_policy generated_policy fuel [] (ECall FZ22294 [EValue (VText input)])
let eval_generated_z38114 (fuel:nat) (input:text) : Tot (eval_result value) =
  eval_with_policy generated_policy fuel [] (ECall FZ38114 [EValue (VText input)])
