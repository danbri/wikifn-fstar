module Wikifn.Zid.Laws

open FStar.Mul
open Wikifn.Primitive.Kernel
open Wikifn.Zid

(*
  Reading back what we wrote.

  Identifiers and numbers are text in Wikifunctions: a natural is the string of
  its digits, a key is Z13518K1, a reference is Z6. The evaluator writes those
  spellings and reads them again - Z805 Reify writes them, Z808 Abstract reads
  them - so if writing and reading disagree anywhere, the two functions are not
  inverses and the corpus's own type tests give wrong answers.

  This module proves they agree. Everything here is about Wikifn.Zid alone;
  the round trip over values that depends on it is in Wikifn.Roundtrip.

  The work is one lemma. take_digits reads a leading run of digits with an
  accumulator, and render_nat writes digits with an accumulator, so relating
  them has to be stated over an arbitrary suffix - otherwise the induction
  step, which pushes one more digit onto the suffix, cannot use its own
  hypothesis.
*)

#set-options "--fuel 2 --ifuel 1 --z3rlimit 60"

let rec pow10 (k:nat) : Tot pos (decreases k) =
  if k = 0 then 1 else 10 * pow10 (k - 1)

let rec num_digits (n:nat) : Tot nat (decreases n) =
  if n = 0 then 0 else 1 + num_digits (n / 10)

let num_digits_positive (n:pos) : Lemma (ensures num_digits n > 0) = ()

(* The key lemma. Writing n in front of a suffix and then reading digits is the
   same as reading the suffix with n already folded into the accumulator. *)
let rec take_digits_render_nat (n:nat) (suffix:text) (value:nat) (count:nat)
  : Lemma (ensures take_digits (render_nat n suffix) value count
                == take_digits suffix (value * pow10 (num_digits n) + n) (count + num_digits n))
          (decreases n)
=
  if n = 0 then ()
  else begin
    let d : codepoint = cp_zero + n % 10 in
    // The digit really is one, so take_digits consumes it rather than stopping.
    assert (is_digit d);
    assert (digit_value d == n % 10);
    take_digits_render_nat (n / 10) (d :: suffix) value count;
    // take_digits (d :: suffix) x k unfolds to take_digits suffix (x * 10 + n % 10) (k + 1),
    // and (n / 10) * 10 + n % 10 == n.
    assert (num_digits n == num_digits (n / 10) + 1);
    assert (pow10 (num_digits n) == pow10 (num_digits (n / 10)) * 10);
    FStar.Math.Lemmas.euclidean_division_definition n 10
  end

let take_digits_render_nat_alone (n:nat)
  : Lemma (ensures take_digits (render_nat n []) 0 0 == (n, num_digits n, []))
= take_digits_render_nat n [] 0 0

(* Rendering onto an accumulator is the same as rendering and then appending.
   render_zkey builds a global key by appending, while the digit lemma above is
   stated over the accumulator, so one of the two has to be moved to meet the
   other. *)
let rec render_nat_concat (n:nat) (acc:text) (suffix:text)
  : Lemma (ensures render_nat n (text_concat acc suffix)
                == text_concat (render_nat n acc) suffix)
          (decreases n)
=
  if n = 0 then ()
  else render_nat_concat (n / 10) ((cp_zero + n % 10) :: acc) suffix

let render_nat_append (n:nat) (suffix:text)
  : Lemma (ensures render_nat n suffix == text_concat (render_nat n []) suffix)
= render_nat_concat n [] suffix

(* The leading digit of a positive number is not zero, which is what makes the
   spelling unique and what parse_nat and parse_zid both insist on. *)
let rec render_nat_head_nonzero (n:pos) (suffix:text)
  : Lemma (ensures (match render_nat n suffix with
                    | head :: _ -> is_digit head /\ head <> cp_zero
                    | [] -> False))
          (decreases n)
=
  if n < 10 then ()
  else render_nat_head_nonzero (n / 10) ((cp_zero + n % 10) :: suffix)

(* Over any suffix, because the induction above pushes a digit onto it. Stated
   for the empty suffix separately only because that is how it is used. *)
let render_nat_not_leading_zero (n:pos)
  : Lemma (ensures starts_with_zero (render_nat n []) == false)
= render_nat_head_nonzero n []

(* Written out, a natural reads back as itself. Zero is spelled "0" by every
   caller, because render_nat 0 [] is empty - a number has to have a digit. *)
let parse_render_nat (n:nat)
  : Lemma (ensures parse_nat (if n = 0 then [cp_zero] else render_nat n []) == Some n)
=
  if n = 0 then ()
  else if n < 10 then ()
  else begin
    render_nat_not_leading_zero n;
    take_digits_render_nat_alone n;
    num_digits_positive n;
    // Not a single character, so parse_nat takes the general branch.
    render_nat_head_nonzero n []
  end

(* A ZID reads back as itself. *)
let parse_render_zid (z:zid)
  : Lemma (ensures parse_zid (render_zid z) == Some z)
=
  render_nat_not_leading_zero z;
  take_digits_render_nat_alone z;
  num_digits_positive z

(* And so does a key, in both spellings. A local key is K3; a global one puts
   the owner in front, and reading it has to stop the first run of digits at the
   K rather than running on into the index. *)
let parse_render_zkey (k:zkey)
  : Lemma (ensures parse_zkey (render_zkey k) == Some k)
=
  render_nat_not_leading_zero k.key_index;
  take_digits_render_nat_alone k.key_index;
  num_digits_positive k.key_index;
  match k.key_owner with
  | None -> ()
  | Some owner ->
      let tail = cp_k :: render_nat k.key_index [] in
      render_nat_not_leading_zero owner;
      num_digits_positive owner;
      // render_zkey appends; the digit lemma is about the accumulator.
      render_nat_append owner tail;
      take_digits_render_nat owner tail 0 0;
      render_nat_head_nonzero owner tail
