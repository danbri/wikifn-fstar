open Prims
let (devanagari_digits : Wikifn_Primitive_Kernel.text) =
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
let (ascii_digits : Wikifn_Primitive_Kernel.text) =
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
let (z10052_remove_regular_spaces :
  Wikifn_Primitive_Kernel.text ->
    Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun input ->
    Wikifn_Primitive_Kernel.z10075_replace_all_substrings input
      [(Prims.of_int (32))] []
let (z21679_decimal_comma_to_point :
  Wikifn_Primitive_Kernel.text ->
    Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun input ->
    Wikifn_Primitive_Kernel.z10075_replace_all_substrings input
      [(Prims.of_int (44))] [(Prims.of_int (46))]
let (z38114_french_contractions :
  Wikifn_Primitive_Kernel.text ->
    Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun input ->
    Wikifn_Primitive_Kernel.bind_kernel
      (Wikifn_Primitive_Kernel.z10075_replace_all_substrings input
         [(Prims.of_int (100));
         (Prims.of_int (101));
         (Prims.of_int (32));
         (Prims.of_int (108));
         (Prims.of_int (101));
         (Prims.of_int (115))]
         [(Prims.of_int (100)); (Prims.of_int (101)); (Prims.of_int (115))])
      (fun first_pass ->
         Wikifn_Primitive_Kernel.z10075_replace_all_substrings first_pass
           [(Prims.of_int (100));
           (Prims.of_int (101));
           (Prims.of_int (32));
           (Prims.of_int (108));
           (Prims.of_int (101))] [(Prims.of_int (100)); (Prims.of_int (117))])
let rec (z14613_replace_character_set_fuel :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text ->
        Wikifn_Primitive_Kernel.text ->
          Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun fuel ->
    fun input ->
      fun old_alphabet ->
        fun new_alphabet ->
          match fuel with
          | uu___ when uu___ = Prims.int_zero ->
              Wikifn_Primitive_Kernel.KErr
                Wikifn_Primitive_Kernel.KFuelExhausted
          | uu___ ->
              if Wikifn_Primitive_Kernel.z10008_is_empty_string old_alphabet
              then Wikifn_Primitive_Kernel.KOk input
              else
                (let marker =
                   Wikifn_Primitive_Kernel.z36070_first_available_private_use_character
                     input in
                 Wikifn_Primitive_Kernel.bind_kernel
                   (Wikifn_Primitive_Kernel.z10075_replace_all_substrings
                      input
                      (Wikifn_Primitive_Kernel.z10901_get_first_character
                         old_alphabet) marker)
                   (fun marked_input ->
                      Wikifn_Primitive_Kernel.bind_kernel
                        (z14613_replace_character_set_fuel
                           (fuel - Prims.int_one) marked_input
                           (Wikifn_Primitive_Kernel.z14456_remove_first_character
                              old_alphabet)
                           (Wikifn_Primitive_Kernel.z14456_remove_first_character
                              new_alphabet))
                        (fun rest_replaced ->
                           Wikifn_Primitive_Kernel.z10075_replace_all_substrings
                             rest_replaced marker
                             (Wikifn_Primitive_Kernel.z10901_get_first_character
                                new_alphabet))))
let (z22294_devanagari_digits_to_arabic_digits :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text Wikifn_Primitive_Kernel.kernel_result)
  =
  fun fuel ->
    fun input ->
      z14613_replace_character_set_fuel fuel input devanagari_digits
        ascii_digits
