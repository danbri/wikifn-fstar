module Wikifn.Model

assume val is_zid : string -> Tot bool
assume val is_zkey : string -> Tot bool
assume val is_digest : string -> Tot bool

type zid = s:string { is_zid s }
type zkey = s:string { is_zkey s }
type digest = s:string { is_digest s }
type revision = nat

type zterm =
  | ZString : string -> zterm
  | ZRef : zid -> zterm
  | ZRecord : list (zkey * zterm) -> zterm

type persistent = {
  id: zid;
  value: zterm
}

type object_version = {
  zid: zid;
  revision: revision;
  persistent: persistent;
  digest: digest
}

type world = zid -> option object_version

assume val structurally_valid : zterm -> Type0
assume val persistent_valid :
  p:persistent ->
  Type0

assume val closed_in_world :
  w:world ->
  t:zterm ->
  Type0

assume val resolve :
  w:world ->
  z:zid ->
  option object_version

type zty =
  | TObject : zty
  | TString : zty
  | TReference : zty
  | TNamed : zid -> zty
  | TComputed : zterm -> zty

assume val has_type :
  w:world ->
  t:zterm ->
  ty:zty ->
  Type0

noeq type checked_object (w:world) = {
  term: zterm;
  structural: structurally_valid term;
  closed: closed_in_world w term
}
