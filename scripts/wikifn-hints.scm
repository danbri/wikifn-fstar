;; Hints in names.
;;
;; A Wikifunctions function is identified by its ZID and nothing else. In this
;; listing the ZID is followed by an English label - Z10627_rot13_latin_alphabet
;; - so the text reads as language. That trailing part is a hint for whoever is
;; reading. It carries no meaning to the machine, and it is free to change when
;; someone relabels the function on the wiki.
;;
;; Every definition is bound twice, so both of these already work:
;;
;;   (Z10627 "Hello")
;;   (Z10627_rot13_latin_alphabet "Hello")
;;
;; This file adds the third case: a hint that nobody generated. Write the one
;; that helps you remember, in whatever language, at whatever length.
;;
;;   (wikifn
;;     (Z10627_shift_each_letter_by_13 "Hello, Wikifunctions!"))
;;
;; The macro rewrites every Znnnn_... name in its body down to Znnnn before the
;; code is compiled, so the hint costs nothing at run time. Stripping them from
;; a file outside Scheme is the same one substitution:
;;
;;   s/\(Z[0-9][0-9]*\)_[A-Za-z0-9_]*/\1/g
;;
;; Load order:
;;
;;   (load "wikifn-hints.scm")
;;   (load "wikifn-bundle.scm")
;;
;; One caveat, stated rather than hidden: the rewrite walks the whole body, so a
;; *quoted* symbol that looks like a hinted name is rewritten too. Quoting a
;; symbol spelled like a ZID is not something the generated code does, but if
;; your own code does, keep it outside the macro.

;; Needs syntax-case, which is R6RS and present in Chez, Guile and Racket.
;; syntax-rules on its own cannot take an identifier apart, so a Scheme that has
;; only syntax-rules cannot do this at all; there, bind the hint yourself, which
;; is one line and also costs nothing at run time:
;;
;;   (define Z10627_shift_each_letter_by_13 Z10627)

(define-syntax wikifn
  (lambda (x)
    (syntax-case x ()
      ((k form ...)
       (letrec
           ((zid-of
             ;; "Z10627_rot13" -> "Z10627"; "Z10627" -> "Z10627";
             ;; anything else -> #f.
             (lambda (s)
               (let ((n (string-length s)))
                 (and (> n 1)
                      (char=? (string-ref s 0) #\Z)
                      (let loop ((i 1))
                        (cond ((= i n) s)
                              ((char-numeric? (string-ref s i)) (loop (+ i 1)))
                              ((and (char=? (string-ref s i) #\_) (> i 1))
                               (substring s 0 i))
                              (else #f)))))))
            (walk
             (lambda (d)
               (cond ((symbol? d)
                      (let ((z (zid-of (symbol->string d))))
                        (if z (string->symbol z) d)))
                     ((pair? d) (cons (walk (car d)) (walk (cdr d))))
                     ((vector? d) (list->vector (map walk (vector->list d))))
                     (else d)))))
         (datum->syntax #'k (cons 'begin (walk (syntax->datum #'(form ...))))))))))
