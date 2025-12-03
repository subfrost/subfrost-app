"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/types/index.ts
var types_exports = {};
__export(types_exports, {
  AssetType: () => AssetType,
  OylTransactionError: () => OylTransactionError
});
module.exports = __toCommonJS(types_exports);
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
//# sourceMappingURL=index.js.map