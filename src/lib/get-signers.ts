export async function getSigners() {
  // TODO: open websocket to get network signers
  return new Promise((res, rej) => res([
    { address: "0x920918273498172349812734099817234", value: "75" },
    { address: "0x920918273498172349812734099817234", value: "75" },
    { address: "0x920918273498172349812734099817234", value: "75" },
    { address: "0x920918273498172349812734099817234", value: "75" },
  ]));
}