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

let latin_rot13_source : text =
  [65; 66; 67; 68; 69; 70; 71; 72; 73; 74; 75; 76; 77; 78; 79; 80; 81; 82; 83; 84; 85; 86; 87; 88; 89; 90; 97; 98; 99; 100; 101; 102; 103; 104; 105; 106; 107; 108; 109; 110; 111; 112; 113; 114; 115; 116; 117; 118; 119; 120; 121; 122]

let latin_rot13_target : text =
  [78; 79; 80; 81; 82; 83; 84; 85; 86; 87; 88; 89; 90; 65; 66; 67; 68; 69; 70; 71; 72; 73; 74; 75; 76; 77; 110; 111; 112; 113; 114; 115; 116; 117; 118; 119; 120; 121; 122; 97; 98; 99; 100; 101; 102; 103; 104; 105; 106; 107; 108; 109]

let superscript_source : text =
  [48; 49; 50; 51; 52; 53; 54; 55; 56; 57; 97; 98; 99; 100; 101; 102; 103; 104; 105; 106; 107; 108; 109; 110; 111; 112; 113; 114; 115; 116; 117; 118; 119; 120; 121; 122; 65; 66; 67; 68; 69; 70; 71; 72; 73; 74; 75; 76; 77; 78; 79; 80; 81; 82; 83; 84; 85; 86; 87; 88; 89; 90; 43; 45; 61; 40; 41]

let superscript_target : text =
  [8304; 185; 178; 179; 8308; 8309; 8310; 8311; 8312; 8313; 7491; 7495; 7580; 7496; 7497; 7584; 7501; 688; 7590; 690; 7503; 737; 7504; 8319; 7506; 7510; 7520; 691; 738; 7511; 7512; 7515; 695; 739; 696; 7611; 7468; 7470; 7580; 7472; 7473; 7584; 7475; 7476; 7477; 7478; 7479; 7480; 7481; 7482; 7484; 7486; 42996; 7487; 738; 7488; 7489; 11389; 7490; 739; 696; 7611; 8314; 8315; 8316; 8317; 8318]

let subscript_digits : text =
  [8320; 8321; 8322; 8323; 8324; 8325; 8326; 8327; 8328; 8329]

let z10052_remove_regular_spaces (input:text) : Tot (kernel_result text) =
  z10075_replace_all_substrings input [32] []

let z21679_decimal_comma_to_point (input:text) : Tot (kernel_result text) =
  z10075_replace_all_substrings input [44] [46]

let z11082_fallback_if_string_is_empty
  (value:text)
  (fallback:text)
  : Tot (kernel_result text) =
  if z10008_is_empty_string value then KOk fallback else KOk value

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

let z10627_rot13_latin_alphabet
  (fuel:nat)
  (input:text)
  : Tot (kernel_result text) =
  z14613_replace_character_set_fuel fuel input latin_rot13_source latin_rot13_target

let z19612_turn_to_superscript
  (fuel:nat)
  (input:text)
  : Tot (kernel_result text) =
  z14613_replace_character_set_fuel fuel input superscript_source superscript_target

let z22649_arabic_numerals_to_devanagari_numerals
  (fuel:nat)
  (input:text)
  : Tot (kernel_result text) =
  z14613_replace_character_set_fuel fuel input ascii_digits devanagari_digits

let z27053_digits_to_subscript
  (fuel:nat)
  (input:text)
  : Tot (kernel_result text) =
  z14613_replace_character_set_fuel fuel input ascii_digits subscript_digits

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

let z11082_empty_specialized_example () :
  Lemma (
    z11082_fallback_if_string_is_empty [] [102; 97; 108; 108; 98; 97; 99; 107]
    == KOk [102; 97; 108; 108; 98; 97; 99; 107]
  )
  = ()

let z11082_nonempty_specialized_example () :
  Lemma (
    z11082_fallback_if_string_is_empty [97; 98; 99] [102; 97; 108; 108; 98; 97; 99; 107]
    == KOk [97; 98; 99]
  )
  = ()
