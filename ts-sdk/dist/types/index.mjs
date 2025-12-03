// src/types/index.ts
var AssetType = /* @__PURE__ */ ((AssetType2) => {
  AssetType2["BRC20"] = "brc20";
  AssetType2["RUNES"] = "runes";
  AssetType2["COLLECTIBLE"] = "collectible";
  AssetType2["ALKANES"] = "alkanes";
  return AssetType2;
})(AssetType || {});
var OylTransactionError = class _OylTransactionError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "OylTransactionError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, _OylTransactionError.prototype);
  }
};
export {
  AssetType,
  OylTransactionError
};
//# sourceMappingURL=index.mjs.map