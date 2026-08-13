module Wikifn.Specialized.Compositions

open Wikifn.Primitive.Kernel

(*
  Direct F* specializations for selected composition-closed Wikifunctions paths.

  These are not hand-written alternative behavior. They are the same small string
  compositions currently generated into Wikifn.Generated.Compositions, lowered to
  direct calls against the checked primitive kernel.
*)

let devanagari_digits : text =
  [2406; 2407; 2408; 2409; 2410; 2411; 2412; 2413; 2414; 2415]

let ascii_digits : text =
  [48; 49; 50; 51; 52; 53; 54; 55; 56; 57]

let z10052_remove_regular_spaces (input:text) : Tot (kernel_result text) =
  z10075_replace_all_substrings input [32] []

let z21679_decimal_comma_to_point (input:text) : Tot (kernel_result text) =
  z10075_replace_all_substrings input [44] [46]

let z38114_french_contractions (input:text) : Tot (kernel_result text) =
  bind_kernel
    (z10075_replace_all_substrings
      input
      [100; 101; 32; 108; 101; 115]
      [100; 101; 115])
    (fun first_pass ->
      z10075_replace_all_substrings
        first_pass
        [100; 101; 32; 108; 101]
        [100; 117])

let rec z14613_replace_character_set_fuel
  (fuel:nat)
  (input:text)
  (old_alphabet:text)
  (new_alphabet:text)
  : Tot (kernel_result text) (decreases fuel) =
  match fuel with
  | 0 -> KErr KFuelExhausted
  | _ ->
      if z10008_is_empty_string old_alphabet then KOk input
      else
        let marker = z36070_first_available_private_use_character input in
        bind_kernel
          (z10075_replace_all_substrings
            input
            (z10901_get_first_character old_alphabet)
            marker)
          (fun marked_input ->
            bind_kernel
              (z14613_replace_character_set_fuel
                (fuel - 1)
                marked_input
                (z14456_remove_first_character old_alphabet)
                (z14456_remove_first_character new_alphabet))
              (fun rest_replaced ->
                z10075_replace_all_substrings
                  rest_replaced
                  marker
                  (z10901_get_first_character new_alphabet)))

let z22294_devanagari_digits_to_arabic_digits
  (fuel:nat)
  (input:text)
  : Tot (kernel_result text) =
  z14613_replace_character_set_fuel fuel input devanagari_digits ascii_digits

let z10052_specialized_example () :
  Lemma (
    z10052_remove_regular_spaces [97; 32; 98; 32; 99] == KOk [97; 98; 99]
  )
  = assert_norm (z10052_remove_regular_spaces [97; 32; 98; 32; 99] == KOk [97; 98; 99])

let z21679_specialized_example () :
  Lemma (
    z21679_decimal_comma_to_point [51; 44; 49; 52] == KOk [51; 46; 49; 52]
  )
  = assert_norm (z21679_decimal_comma_to_point [51; 44; 49; 52] == KOk [51; 46; 49; 52])

let z38114_specialized_example () :
  Lemma (
    z38114_french_contractions
      [100; 101; 32; 108; 101; 115; 32; 101; 116; 32; 100; 101; 32; 108; 101]
    == KOk [100; 101; 115; 32; 101; 116; 32; 100; 117]
  )
  = assert_norm (
      z38114_french_contractions
        [100; 101; 32; 108; 101; 115; 32; 101; 116; 32; 100; 101; 32; 108; 101]
      == KOk [100; 101; 115; 32; 101; 116; 32; 100; 117]
    )
