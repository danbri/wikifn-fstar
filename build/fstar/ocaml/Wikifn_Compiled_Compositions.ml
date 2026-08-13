open Prims
let rec (compiled_z14613_replace_character_set :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text ->
        Wikifn_Primitive_Kernel.text ->
          Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun fuel ->
    fun arg0 ->
      fun arg1 ->
        fun arg2 ->
          match fuel with
          | uu___ when uu___ = Prims.int_zero ->
              Wikifn_Primitive_Kernel.KErr
                Wikifn_Primitive_Kernel.KFuelExhausted
          | uu___ ->
              if Wikifn_Primitive_Kernel.z10008_is_empty_string arg1
              then Wikifn_Primitive_Kernel.KOk arg0
              else
                Wikifn_Primitive_Kernel.bind_kernel
                  (Wikifn_Primitive_Kernel.bind_kernel
                     (Wikifn_Primitive_Kernel.z10075_replace_all_substrings
                        arg0
                        (Wikifn_Primitive_Kernel.z10901_get_first_character
                           arg1)
                        (Wikifn_Primitive_Kernel.z36070_first_available_private_use_character
                           arg0))
                     (fun input_0 ->
                        compiled_z14613_replace_character_set
                          (fuel - Prims.int_one) input_0
                          (Wikifn_Primitive_Kernel.z14456_remove_first_character
                             arg1)
                          (Wikifn_Primitive_Kernel.z14456_remove_first_character
                             arg2)))
                  (fun input_1 ->
                     Wikifn_Primitive_Kernel.z10075_replace_all_substrings
                       input_1
                       (Wikifn_Primitive_Kernel.z36070_first_available_private_use_character
                          arg0)
                       (Wikifn_Primitive_Kernel.z10901_get_first_character
                          arg2))
let (compiled_z10052_remove_regular_spaces :
  Wikifn_Primitive_Kernel.text ->
    Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun arg0 ->
    Wikifn_Primitive_Kernel.z10075_replace_all_substrings arg0
      [(Prims.of_int (32))] []
let (compiled_z10627_rot13_latin_alphabet :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun fuel ->
    fun arg0 ->
      compiled_z14613_replace_character_set fuel arg0
        [(Prims.of_int (65));
        (Prims.of_int (66));
        (Prims.of_int (67));
        (Prims.of_int (68));
        (Prims.of_int (69));
        (Prims.of_int (70));
        (Prims.of_int (71));
        (Prims.of_int (72));
        (Prims.of_int (73));
        (Prims.of_int (74));
        (Prims.of_int (75));
        (Prims.of_int (76));
        (Prims.of_int (77));
        (Prims.of_int (78));
        (Prims.of_int (79));
        (Prims.of_int (80));
        (Prims.of_int (81));
        (Prims.of_int (82));
        (Prims.of_int (83));
        (Prims.of_int (84));
        (Prims.of_int (85));
        (Prims.of_int (86));
        (Prims.of_int (87));
        (Prims.of_int (88));
        (Prims.of_int (89));
        (Prims.of_int (90));
        (Prims.of_int (97));
        (Prims.of_int (98));
        (Prims.of_int (99));
        (Prims.of_int (100));
        (Prims.of_int (101));
        (Prims.of_int (102));
        (Prims.of_int (103));
        (Prims.of_int (104));
        (Prims.of_int (105));
        (Prims.of_int (106));
        (Prims.of_int (107));
        (Prims.of_int (108));
        (Prims.of_int (109));
        (Prims.of_int (110));
        (Prims.of_int (111));
        (Prims.of_int (112));
        (Prims.of_int (113));
        (Prims.of_int (114));
        (Prims.of_int (115));
        (Prims.of_int (116));
        (Prims.of_int (117));
        (Prims.of_int (118));
        (Prims.of_int (119));
        (Prims.of_int (120));
        (Prims.of_int (121));
        (Prims.of_int (122))]
        [(Prims.of_int (78));
        (Prims.of_int (79));
        (Prims.of_int (80));
        (Prims.of_int (81));
        (Prims.of_int (82));
        (Prims.of_int (83));
        (Prims.of_int (84));
        (Prims.of_int (85));
        (Prims.of_int (86));
        (Prims.of_int (87));
        (Prims.of_int (88));
        (Prims.of_int (89));
        (Prims.of_int (90));
        (Prims.of_int (65));
        (Prims.of_int (66));
        (Prims.of_int (67));
        (Prims.of_int (68));
        (Prims.of_int (69));
        (Prims.of_int (70));
        (Prims.of_int (71));
        (Prims.of_int (72));
        (Prims.of_int (73));
        (Prims.of_int (74));
        (Prims.of_int (75));
        (Prims.of_int (76));
        (Prims.of_int (77));
        (Prims.of_int (110));
        (Prims.of_int (111));
        (Prims.of_int (112));
        (Prims.of_int (113));
        (Prims.of_int (114));
        (Prims.of_int (115));
        (Prims.of_int (116));
        (Prims.of_int (117));
        (Prims.of_int (118));
        (Prims.of_int (119));
        (Prims.of_int (120));
        (Prims.of_int (121));
        (Prims.of_int (122));
        (Prims.of_int (97));
        (Prims.of_int (98));
        (Prims.of_int (99));
        (Prims.of_int (100));
        (Prims.of_int (101));
        (Prims.of_int (102));
        (Prims.of_int (103));
        (Prims.of_int (104));
        (Prims.of_int (105));
        (Prims.of_int (106));
        (Prims.of_int (107));
        (Prims.of_int (108));
        (Prims.of_int (109))]
let (compiled_z11082_fallback_if_string_is_empty :
  Wikifn_Primitive_Kernel.text ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun arg0 ->
    fun arg1 ->
      if Wikifn_Primitive_Kernel.z10008_is_empty_string arg0
      then Wikifn_Primitive_Kernel.KOk arg1
      else Wikifn_Primitive_Kernel.KOk arg0
let (compiled_z19612_turn_to_superscript :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun fuel ->
    fun arg0 ->
      compiled_z14613_replace_character_set fuel arg0
        [(Prims.of_int (48));
        (Prims.of_int (49));
        (Prims.of_int (50));
        (Prims.of_int (51));
        (Prims.of_int (52));
        (Prims.of_int (53));
        (Prims.of_int (54));
        (Prims.of_int (55));
        (Prims.of_int (56));
        (Prims.of_int (57));
        (Prims.of_int (97));
        (Prims.of_int (98));
        (Prims.of_int (99));
        (Prims.of_int (100));
        (Prims.of_int (101));
        (Prims.of_int (102));
        (Prims.of_int (103));
        (Prims.of_int (104));
        (Prims.of_int (105));
        (Prims.of_int (106));
        (Prims.of_int (107));
        (Prims.of_int (108));
        (Prims.of_int (109));
        (Prims.of_int (110));
        (Prims.of_int (111));
        (Prims.of_int (112));
        (Prims.of_int (113));
        (Prims.of_int (114));
        (Prims.of_int (115));
        (Prims.of_int (116));
        (Prims.of_int (117));
        (Prims.of_int (118));
        (Prims.of_int (119));
        (Prims.of_int (120));
        (Prims.of_int (121));
        (Prims.of_int (122));
        (Prims.of_int (65));
        (Prims.of_int (66));
        (Prims.of_int (67));
        (Prims.of_int (68));
        (Prims.of_int (69));
        (Prims.of_int (70));
        (Prims.of_int (71));
        (Prims.of_int (72));
        (Prims.of_int (73));
        (Prims.of_int (74));
        (Prims.of_int (75));
        (Prims.of_int (76));
        (Prims.of_int (77));
        (Prims.of_int (78));
        (Prims.of_int (79));
        (Prims.of_int (80));
        (Prims.of_int (81));
        (Prims.of_int (82));
        (Prims.of_int (83));
        (Prims.of_int (84));
        (Prims.of_int (85));
        (Prims.of_int (86));
        (Prims.of_int (87));
        (Prims.of_int (88));
        (Prims.of_int (89));
        (Prims.of_int (90));
        (Prims.of_int (43));
        (Prims.of_int (45));
        (Prims.of_int (61));
        (Prims.of_int (40));
        (Prims.of_int (41))]
        [(Prims.of_int (8304));
        (Prims.of_int (185));
        (Prims.of_int (178));
        (Prims.of_int (179));
        (Prims.of_int (8308));
        (Prims.of_int (8309));
        (Prims.of_int (8310));
        (Prims.of_int (8311));
        (Prims.of_int (8312));
        (Prims.of_int (8313));
        (Prims.of_int (7491));
        (Prims.of_int (7495));
        (Prims.of_int (7580));
        (Prims.of_int (7496));
        (Prims.of_int (7497));
        (Prims.of_int (7584));
        (Prims.of_int (7501));
        (Prims.of_int (688));
        (Prims.of_int (7590));
        (Prims.of_int (690));
        (Prims.of_int (7503));
        (Prims.of_int (737));
        (Prims.of_int (7504));
        (Prims.of_int (8319));
        (Prims.of_int (7506));
        (Prims.of_int (7510));
        (Prims.of_int (7520));
        (Prims.of_int (691));
        (Prims.of_int (738));
        (Prims.of_int (7511));
        (Prims.of_int (7512));
        (Prims.of_int (7515));
        (Prims.of_int (695));
        (Prims.of_int (739));
        (Prims.of_int (696));
        (Prims.of_int (7611));
        (Prims.of_int (7468));
        (Prims.of_int (7470));
        (Prims.of_int (7580));
        (Prims.of_int (7472));
        (Prims.of_int (7473));
        (Prims.of_int (7584));
        (Prims.of_int (7475));
        (Prims.of_int (7476));
        (Prims.of_int (7477));
        (Prims.of_int (7478));
        (Prims.of_int (7479));
        (Prims.of_int (7480));
        (Prims.of_int (7481));
        (Prims.of_int (7482));
        (Prims.of_int (7484));
        (Prims.of_int (7486));
        (Prims.of_int (42996));
        (Prims.of_int (7487));
        (Prims.of_int (738));
        (Prims.of_int (7488));
        (Prims.of_int (7489));
        (Prims.of_int (11389));
        (Prims.of_int (7490));
        (Prims.of_int (739));
        (Prims.of_int (696));
        (Prims.of_int (7611));
        (Prims.of_int (8314));
        (Prims.of_int (8315));
        (Prims.of_int (8316));
        (Prims.of_int (8317));
        (Prims.of_int (8318))]
let (compiled_z21679_decimal_comma_to_point :
  Wikifn_Primitive_Kernel.text ->
    Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun arg0 ->
    Wikifn_Primitive_Kernel.z10075_replace_all_substrings arg0
      [(Prims.of_int (44))] [(Prims.of_int (46))]
let (compiled_z22294_devanagari_digits_to_arabic_digits :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun fuel ->
    fun arg0 ->
      compiled_z14613_replace_character_set fuel arg0
        [(Prims.of_int (2406));
        (Prims.of_int (2407));
        (Prims.of_int (2408));
        (Prims.of_int (2409));
        (Prims.of_int (2410));
        (Prims.of_int (2411));
        (Prims.of_int (2412));
        (Prims.of_int (2413));
        (Prims.of_int (2414));
        (Prims.of_int (2415))]
        [(Prims.of_int (48));
        (Prims.of_int (49));
        (Prims.of_int (50));
        (Prims.of_int (51));
        (Prims.of_int (52));
        (Prims.of_int (53));
        (Prims.of_int (54));
        (Prims.of_int (55));
        (Prims.of_int (56));
        (Prims.of_int (57))]
let (compiled_z22649_arabic_numerals_to_devanagari_numerals :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun fuel ->
    fun arg0 ->
      compiled_z14613_replace_character_set fuel arg0
        [(Prims.of_int (48));
        (Prims.of_int (49));
        (Prims.of_int (50));
        (Prims.of_int (51));
        (Prims.of_int (52));
        (Prims.of_int (53));
        (Prims.of_int (54));
        (Prims.of_int (55));
        (Prims.of_int (56));
        (Prims.of_int (57))]
        [(Prims.of_int (2406));
        (Prims.of_int (2407));
        (Prims.of_int (2408));
        (Prims.of_int (2409));
        (Prims.of_int (2410));
        (Prims.of_int (2411));
        (Prims.of_int (2412));
        (Prims.of_int (2413));
        (Prims.of_int (2414));
        (Prims.of_int (2415))]
let (compiled_z27053_digits_to_subscript :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun fuel ->
    fun arg0 ->
      compiled_z14613_replace_character_set fuel arg0
        [(Prims.of_int (48));
        (Prims.of_int (49));
        (Prims.of_int (50));
        (Prims.of_int (51));
        (Prims.of_int (52));
        (Prims.of_int (53));
        (Prims.of_int (54));
        (Prims.of_int (55));
        (Prims.of_int (56));
        (Prims.of_int (57))]
        [(Prims.of_int (8320));
        (Prims.of_int (8321));
        (Prims.of_int (8322));
        (Prims.of_int (8323));
        (Prims.of_int (8324));
        (Prims.of_int (8325));
        (Prims.of_int (8326));
        (Prims.of_int (8327));
        (Prims.of_int (8328));
        (Prims.of_int (8329))]
let (compiled_z38114_french_contractions :
  Wikifn_Primitive_Kernel.text ->
    Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun arg0 ->
    Wikifn_Primitive_Kernel.bind_kernel
      (Wikifn_Primitive_Kernel.z10075_replace_all_substrings arg0
         [(Prims.of_int (100));
         (Prims.of_int (101));
         (Prims.of_int (32));
         (Prims.of_int (108));
         (Prims.of_int (101));
         (Prims.of_int (115))]
         [(Prims.of_int (100)); (Prims.of_int (101)); (Prims.of_int (115))])
      (fun input_0 ->
         Wikifn_Primitive_Kernel.z10075_replace_all_substrings input_0
           [(Prims.of_int (100));
           (Prims.of_int (101));
           (Prims.of_int (32));
           (Prims.of_int (108));
           (Prims.of_int (101))] [(Prims.of_int (100)); (Prims.of_int (117))])
