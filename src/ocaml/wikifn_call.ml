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

let () =
  let argv = Array.to_list Sys.argv |> List.tl in
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
