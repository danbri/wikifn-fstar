open Wikifn_call_common

let parse_int_option value =
  try Some (int_of_string value) with
  | Failure _ -> None

let rec parse_args path fuel positional = function
  | [] -> Ok (path, fuel, List.rev positional)
  | "--list" :: _ -> Error "list"
  | "--mode" :: value :: rest -> begin
      match parse_path value with
      | Some parsed -> parse_args parsed fuel positional rest
      | None -> Error ("unknown mode " ^ value)
    end
  | "--fuel" :: value :: rest -> begin
      match parse_int_option value with
      | Some parsed when parsed >= 0 -> parse_args path parsed positional rest
      | _ -> Error ("invalid fuel " ^ value)
    end
  | option :: _ when String.length option > 0 && option.[0] = '-' ->
      Error ("unknown option " ^ option)
  | value :: rest ->
      parse_args path fuel (value :: positional) rest

let read_all channel =
  let buffer = Buffer.create 4096 in
  (try
     while true do
       Buffer.add_string buffer (input_line channel);
       Buffer.add_char buffer '\n'
     done
   with
   | End_of_file -> ());
  Buffer.contents buffer

let read_file path =
  let channel = open_in_bin path in
  Fun.protect
    ~finally:(fun () -> close_in_noerr channel)
    (fun () -> read_all channel)

let json_text_arg = function
  | "-" -> read_all stdin
  | value when String.length value > 1 && value.[0] = '@' ->
      read_file (String.sub value 1 (String.length value - 1))
  | value -> value

let () =
  let argv = Array.to_list Sys.argv |> List.tl in
  match argv with
  | "--eval-zobject" :: json_arg :: _ ->
      print_endline (evaluate_zobject_text (json_text_arg json_arg))
  | "--eval-zobject" :: [] ->
      print_endline (error_envelope "usage: wikifn_call --eval-zobject <json|-|@file>");
      exit 2
  | "--eval-json" :: json_arg :: _ ->
      print_endline (evaluate_json_ir_text (json_text_arg json_arg))
  | "--eval-json" :: [] ->
      print_endline (error_envelope "usage: wikifn_call --eval-json <json|-|@file>");
      exit 2
  | _ ->
  match parse_args Generated default_fuel [] argv with
  | Error "list" ->
      Printf.printf {|{"ok":true,"supported":%s}|} (supported_json ());
      print_newline ()
  | Error message ->
      print_endline (error_envelope message);
      exit 2
  | Ok (path, fuel, zid :: args) ->
      print_endline (evaluate path zid fuel args)
  | Ok _ ->
      print_endline
        (error_envelope "usage: wikifn_call [--mode generated|compiled|specialized] [--fuel N] <ZID> <text-arg>...");
      exit 2
