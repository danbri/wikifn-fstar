open Prims
let (generated_z10077_expr :
  Wikifn_Composition.expr -> Wikifn_Composition.expr) =
  fun z10052k1_0 ->
    Wikifn_Composition.ECall
      (Wikifn_Composition.FZ10075,
        [z10052k1_0;
        Wikifn_Composition.EValue
          (Wikifn_Composition.VText [(Prims.of_int (32))]);
        Wikifn_Composition.EValue (Wikifn_Composition.VText [])])
let (generated_z36070_expr :
  Wikifn_Composition.expr ->
    Wikifn_Composition.expr ->
      Wikifn_Composition.expr -> Wikifn_Composition.expr)
  =
  fun z14613k1_0 ->
    fun z14613k2_1 ->
      fun z14613k3_2 ->
        Wikifn_Composition.ECall
          (Wikifn_Composition.FZ802,
            [Wikifn_Composition.ECall
               (Wikifn_Composition.FZ10008, [z14613k2_1]);
            z14613k1_0;
            Wikifn_Composition.ECall
              (Wikifn_Composition.FZ10075,
                [Wikifn_Composition.ECall
                   (Wikifn_Composition.FZ14613,
                     [Wikifn_Composition.ECall
                        (Wikifn_Composition.FZ10075,
                          [z14613k1_0;
                          Wikifn_Composition.ECall
                            (Wikifn_Composition.FZ10901, [z14613k2_1]);
                          Wikifn_Composition.ECall
                            (Wikifn_Composition.FInternalFreshPrivateUse,
                              [z14613k1_0])]);
                     Wikifn_Composition.ECall
                       (Wikifn_Composition.FZ14456, [z14613k2_1]);
                     Wikifn_Composition.ECall
                       (Wikifn_Composition.FZ14456, [z14613k3_2])]);
                Wikifn_Composition.ECall
                  (Wikifn_Composition.FInternalFreshPrivateUse, [z14613k1_0]);
                Wikifn_Composition.ECall
                  (Wikifn_Composition.FZ10901, [z14613k3_2])])])
let (generated_z21681_expr :
  Wikifn_Composition.expr -> Wikifn_Composition.expr) =
  fun z21679k1_0 ->
    Wikifn_Composition.ECall
      (Wikifn_Composition.FZ10075,
        [z21679k1_0;
        Wikifn_Composition.EValue
          (Wikifn_Composition.VText [(Prims.of_int (44))]);
        Wikifn_Composition.EValue
          (Wikifn_Composition.VText [(Prims.of_int (46))])])
let (generated_z22295_expr :
  Wikifn_Composition.expr -> Wikifn_Composition.expr) =
  fun z22294k1_0 ->
    Wikifn_Composition.ECall
      (Wikifn_Composition.FZ14613,
        [z22294k1_0;
        Wikifn_Composition.EValue
          (Wikifn_Composition.VText
             [(Prims.of_int (2406));
             (Prims.of_int (2407));
             (Prims.of_int (2408));
             (Prims.of_int (2409));
             (Prims.of_int (2410));
             (Prims.of_int (2411));
             (Prims.of_int (2412));
             (Prims.of_int (2413));
             (Prims.of_int (2414));
             (Prims.of_int (2415))]);
        Wikifn_Composition.EValue
          (Wikifn_Composition.VText
             [(Prims.of_int (48));
             (Prims.of_int (49));
             (Prims.of_int (50));
             (Prims.of_int (51));
             (Prims.of_int (52));
             (Prims.of_int (53));
             (Prims.of_int (54));
             (Prims.of_int (55));
             (Prims.of_int (56));
             (Prims.of_int (57))])])
let (generated_z38115_expr :
  Wikifn_Composition.expr -> Wikifn_Composition.expr) =
  fun z38114k1_0 ->
    Wikifn_Composition.ECall
      (Wikifn_Composition.FZ10075,
        [Wikifn_Composition.ECall
           (Wikifn_Composition.FZ10075,
             [z38114k1_0;
             Wikifn_Composition.EValue
               (Wikifn_Composition.VText
                  [(Prims.of_int (100));
                  (Prims.of_int (101));
                  (Prims.of_int (32));
                  (Prims.of_int (108));
                  (Prims.of_int (101));
                  (Prims.of_int (115))]);
             Wikifn_Composition.EValue
               (Wikifn_Composition.VText
                  [(Prims.of_int (100));
                  (Prims.of_int (101));
                  (Prims.of_int (115))])]);
        Wikifn_Composition.EValue
          (Wikifn_Composition.VText
             [(Prims.of_int (100));
             (Prims.of_int (101));
             (Prims.of_int (32));
             (Prims.of_int (108));
             (Prims.of_int (101))]);
        Wikifn_Composition.EValue
          (Wikifn_Composition.VText
             [(Prims.of_int (100)); (Prims.of_int (117))])])
let (generated_policy :
  Wikifn_Composition.function_id ->
    Wikifn_Composition.expr Prims.list -> Wikifn_Composition.body_option)
  =
  fun fid ->
    fun args ->
      match (fid, args) with
      | (Wikifn_Composition.FZ10052, z10052k1_0::[]) ->
          Wikifn_Composition.Body (generated_z10077_expr z10052k1_0)
      | (Wikifn_Composition.FZ14613, z14613k1_0::z14613k2_1::z14613k3_2::[])
          ->
          Wikifn_Composition.Body
            (generated_z36070_expr z14613k1_0 z14613k2_1 z14613k3_2)
      | (Wikifn_Composition.FZ21679, z21679k1_0::[]) ->
          Wikifn_Composition.Body (generated_z21681_expr z21679k1_0)
      | (Wikifn_Composition.FZ22294, z22294k1_0::[]) ->
          Wikifn_Composition.Body (generated_z22295_expr z22294k1_0)
      | (Wikifn_Composition.FZ38114, z38114k1_0::[]) ->
          Wikifn_Composition.Body (generated_z38115_expr z38114k1_0)
      | (uu___, uu___1) -> Wikifn_Composition.NoBody
let (eval_generated_z10052 :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Composition.value Wikifn_Composition.eval_result)
  =
  fun fuel ->
    fun input ->
      Wikifn_Composition.eval_with_policy generated_policy fuel []
        (Wikifn_Composition.ECall
           (Wikifn_Composition.FZ10052,
             [Wikifn_Composition.EValue (Wikifn_Composition.VText input)]))
let (eval_generated_z14613 :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Primitive_Kernel.text ->
        Wikifn_Primitive_Kernel.text ->
          Wikifn_Composition.value Wikifn_Composition.eval_result)
  =
  fun fuel ->
    fun input ->
      fun old_alphabet ->
        fun new_alphabet ->
          Wikifn_Composition.eval_with_policy generated_policy fuel []
            (Wikifn_Composition.ECall
               (Wikifn_Composition.FZ14613,
                 [Wikifn_Composition.EValue (Wikifn_Composition.VText input);
                 Wikifn_Composition.EValue
                   (Wikifn_Composition.VText old_alphabet);
                 Wikifn_Composition.EValue
                   (Wikifn_Composition.VText new_alphabet)]))
let (eval_generated_z21679 :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Composition.value Wikifn_Composition.eval_result)
  =
  fun fuel ->
    fun input ->
      Wikifn_Composition.eval_with_policy generated_policy fuel []
        (Wikifn_Composition.ECall
           (Wikifn_Composition.FZ21679,
             [Wikifn_Composition.EValue (Wikifn_Composition.VText input)]))
let (eval_generated_z22294 :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Composition.value Wikifn_Composition.eval_result)
  =
  fun fuel ->
    fun input ->
      Wikifn_Composition.eval_with_policy generated_policy fuel []
        (Wikifn_Composition.ECall
           (Wikifn_Composition.FZ22294,
             [Wikifn_Composition.EValue (Wikifn_Composition.VText input)]))
let (eval_generated_z38114 :
  Prims.nat ->
    Wikifn_Primitive_Kernel.text ->
      Wikifn_Composition.value Wikifn_Composition.eval_result)
  =
  fun fuel ->
    fun input ->
      Wikifn_Composition.eval_with_policy generated_policy fuel []
        (Wikifn_Composition.ECall
           (Wikifn_Composition.FZ38114,
             [Wikifn_Composition.EValue (Wikifn_Composition.VText input)]))
