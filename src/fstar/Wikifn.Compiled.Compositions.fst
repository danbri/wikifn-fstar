module Wikifn.Compiled.Compositions

open Wikifn.Primitive.Kernel

(*
  Generated direct F* functions from pinned local Wikifunctions cache entries.
  Regenerate with: node scripts/generate-fstar-compositions.js
  These functions bypass the expression interpreter but still use the same checked primitive kernel.

  Z10052@257241 -> Z10077@145855 digest 49fbc6ab7af0c00d6397f78bb61b5d6f9ea02e2179bbef9f0c3bbb0fc4a988db
  Z10627@269906 -> Z21749@157814 digest 06c490907c134f949d17405462083314b45630af549299423830c96ca39a0228
  Z11082@260004 -> Z31951@256653 digest f9d82b8468ae5b3080ba813bb9534a1f9d5f30e46dad4c2a95a19d9f0b851645
  Z14613@280542 -> Z36070@280538 digest 41605ec554aef833e8ee9354de5857fa88d31958b94a22b3998dd8d8d925437c
  Z19612@218723 -> Z22828@169983 digest 0339636518766292db2a29e0a5ce7193adbee9716d95ace546dffde885facdff
  Z21679@163193 -> Z21681@157559 digest da92a1e80363a96004f2936401e405671109d283c72fe9d56c461232eda05f8a
  Z22294@214920 -> Z22295@164133 digest d2da923987dbe1dc638cca056caae0db62d65d0c18f1bf8786f0b94d270b2eac
  Z22649@214919 -> Z22653@168466 digest ba1a4bedd2d01b06c9dc3fbba58091aa3c2dc7e4c99cedcd6c75c4a7942fcd4c
  Z27053@267303 -> Z27216@209269 digest ddea3f4ad8a87640978bb8a5be863220ba979216be2c31d72ce3eb9fdac615e5
  Z38114@293195 -> Z38115@293192 digest 82c3ed0335de17c07a53c3c83ef6e6f08cd8e2687ccf82587f321e027019ca42
*)

let rec compiled_z14613_replace_character_set (fuel:nat) (arg0:text) (arg1:text) (arg2:text) : Tot (kernel_result text) (decreases fuel) =
  match fuel with
    | 0 -> KErr KFuelExhausted
    | _ ->
        if (z10008_is_empty_string arg1) then
            KOk arg0
        else
            bind_kernel
            (bind_kernel
              (z10075_replace_all_substrings arg0 (z10901_get_first_character arg1) (z36070_first_available_private_use_character arg0))
              (fun input_0 ->
                compiled_z14613_replace_character_set (fuel - 1) input_0 (z14456_remove_first_character arg1) (z14456_remove_first_character arg2)))
            (fun input_1 ->
              z10075_replace_all_substrings input_1 (z36070_first_available_private_use_character arg0) (z10901_get_first_character arg2))
let compiled_z10052_remove_regular_spaces (arg0:text) : Tot (kernel_result text) =
  z10075_replace_all_substrings arg0 [32] []
let compiled_z10627_rot13_latin_alphabet (fuel:nat) (arg0:text) : Tot (kernel_result text) =
  compiled_z14613_replace_character_set fuel arg0 [65; 66; 67; 68; 69; 70; 71; 72; 73; 74; 75; 76; 77; 78; 79; 80; 81; 82; 83; 84; 85; 86; 87; 88; 89; 90; 97; 98; 99; 100; 101; 102; 103; 104; 105; 106; 107; 108; 109; 110; 111; 112; 113; 114; 115; 116; 117; 118; 119; 120; 121; 122] [78; 79; 80; 81; 82; 83; 84; 85; 86; 87; 88; 89; 90; 65; 66; 67; 68; 69; 70; 71; 72; 73; 74; 75; 76; 77; 110; 111; 112; 113; 114; 115; 116; 117; 118; 119; 120; 121; 122; 97; 98; 99; 100; 101; 102; 103; 104; 105; 106; 107; 108; 109]
let compiled_z11082_fallback_if_string_is_empty (arg0:text) (arg1:text) : Tot (kernel_result text) =
  if (z10008_is_empty_string arg0) then
      KOk arg1
  else
      KOk arg0
let compiled_z19612_turn_to_superscript (fuel:nat) (arg0:text) : Tot (kernel_result text) =
  compiled_z14613_replace_character_set fuel arg0 [48; 49; 50; 51; 52; 53; 54; 55; 56; 57; 97; 98; 99; 100; 101; 102; 103; 104; 105; 106; 107; 108; 109; 110; 111; 112; 113; 114; 115; 116; 117; 118; 119; 120; 121; 122; 65; 66; 67; 68; 69; 70; 71; 72; 73; 74; 75; 76; 77; 78; 79; 80; 81; 82; 83; 84; 85; 86; 87; 88; 89; 90; 43; 45; 61; 40; 41] [8304; 185; 178; 179; 8308; 8309; 8310; 8311; 8312; 8313; 7491; 7495; 7580; 7496; 7497; 7584; 7501; 688; 7590; 690; 7503; 737; 7504; 8319; 7506; 7510; 7520; 691; 738; 7511; 7512; 7515; 695; 739; 696; 7611; 7468; 7470; 7580; 7472; 7473; 7584; 7475; 7476; 7477; 7478; 7479; 7480; 7481; 7482; 7484; 7486; 42996; 7487; 738; 7488; 7489; 11389; 7490; 739; 696; 7611; 8314; 8315; 8316; 8317; 8318]
let compiled_z21679_decimal_comma_to_point (arg0:text) : Tot (kernel_result text) =
  z10075_replace_all_substrings arg0 [44] [46]
let compiled_z22294_devanagari_digits_to_arabic_digits (fuel:nat) (arg0:text) : Tot (kernel_result text) =
  compiled_z14613_replace_character_set fuel arg0 [2406; 2407; 2408; 2409; 2410; 2411; 2412; 2413; 2414; 2415] [48; 49; 50; 51; 52; 53; 54; 55; 56; 57]
let compiled_z22649_arabic_numerals_to_devanagari_numerals (fuel:nat) (arg0:text) : Tot (kernel_result text) =
  compiled_z14613_replace_character_set fuel arg0 [48; 49; 50; 51; 52; 53; 54; 55; 56; 57] [2406; 2407; 2408; 2409; 2410; 2411; 2412; 2413; 2414; 2415]
let compiled_z27053_digits_to_subscript (fuel:nat) (arg0:text) : Tot (kernel_result text) =
  compiled_z14613_replace_character_set fuel arg0 [48; 49; 50; 51; 52; 53; 54; 55; 56; 57] [8320; 8321; 8322; 8323; 8324; 8325; 8326; 8327; 8328; 8329]
let compiled_z38114_french_contractions (arg0:text) : Tot (kernel_result text) =
  bind_kernel
    (z10075_replace_all_substrings arg0 [100; 101; 32; 108; 101; 115] [100; 101; 115])
    (fun input_0 ->
      z10075_replace_all_substrings input_0 [100; 101; 32; 108; 101] [100; 117])
