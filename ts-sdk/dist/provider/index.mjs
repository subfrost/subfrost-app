var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/bitcoinjs-lib/src/networks.js
var require_networks = __commonJS({
  "node_modules/bitcoinjs-lib/src/networks.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.testnet = exports.regtest = exports.bitcoin = void 0;
    exports.bitcoin = {
      /**
       * The message prefix used for signing Bitcoin messages.
       */
      messagePrefix: "Bitcoin Signed Message:\n",
      /**
       * The Bech32 prefix used for Bitcoin addresses.
       */
      bech32: "bc",
      /**
       * The BIP32 key prefixes for Bitcoin.
       */
      bip32: {
        /**
         * The public key prefix for BIP32 extended public keys.
         */
        public: 76067358,
        /**
         * The private key prefix for BIP32 extended private keys.
         */
        private: 76066276
      },
      /**
       * The prefix for Bitcoin public key hashes.
       */
      pubKeyHash: 0,
      /**
       * The prefix for Bitcoin script hashes.
       */
      scriptHash: 5,
      /**
       * The prefix for Bitcoin Wallet Import Format (WIF) private keys.
       */
      wif: 128
    };
    exports.regtest = {
      messagePrefix: "Bitcoin Signed Message:\n",
      bech32: "bcrt",
      bip32: {
        public: 70617039,
        private: 70615956
      },
      pubKeyHash: 111,
      scriptHash: 196,
      wif: 239
    };
    exports.testnet = {
      messagePrefix: "Bitcoin Signed Message:\n",
      bech32: "tb",
      bip32: {
        public: 70617039,
        private: 70615956
      },
      pubKeyHash: 111,
      scriptHash: 196,
      wif: 239
    };
  }
});

// node_modules/bitcoinjs-lib/src/bip66.js
var require_bip66 = __commonJS({
  "node_modules/bitcoinjs-lib/src/bip66.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.encode = exports.decode = exports.check = void 0;
    function check(buffer) {
      if (buffer.length < 8) return false;
      if (buffer.length > 72) return false;
      if (buffer[0] !== 48) return false;
      if (buffer[1] !== buffer.length - 2) return false;
      if (buffer[2] !== 2) return false;
      const lenR = buffer[3];
      if (lenR === 0) return false;
      if (5 + lenR >= buffer.length) return false;
      if (buffer[4 + lenR] !== 2) return false;
      const lenS = buffer[5 + lenR];
      if (lenS === 0) return false;
      if (6 + lenR + lenS !== buffer.length) return false;
      if (buffer[4] & 128) return false;
      if (lenR > 1 && buffer[4] === 0 && !(buffer[5] & 128)) return false;
      if (buffer[lenR + 6] & 128) return false;
      if (lenS > 1 && buffer[lenR + 6] === 0 && !(buffer[lenR + 7] & 128))
        return false;
      return true;
    }
    exports.check = check;
    function decode(buffer) {
      if (buffer.length < 8) throw new Error("DER sequence length is too short");
      if (buffer.length > 72) throw new Error("DER sequence length is too long");
      if (buffer[0] !== 48) throw new Error("Expected DER sequence");
      if (buffer[1] !== buffer.length - 2)
        throw new Error("DER sequence length is invalid");
      if (buffer[2] !== 2) throw new Error("Expected DER integer");
      const lenR = buffer[3];
      if (lenR === 0) throw new Error("R length is zero");
      if (5 + lenR >= buffer.length) throw new Error("R length is too long");
      if (buffer[4 + lenR] !== 2) throw new Error("Expected DER integer (2)");
      const lenS = buffer[5 + lenR];
      if (lenS === 0) throw new Error("S length is zero");
      if (6 + lenR + lenS !== buffer.length) throw new Error("S length is invalid");
      if (buffer[4] & 128) throw new Error("R value is negative");
      if (lenR > 1 && buffer[4] === 0 && !(buffer[5] & 128))
        throw new Error("R value excessively padded");
      if (buffer[lenR + 6] & 128) throw new Error("S value is negative");
      if (lenS > 1 && buffer[lenR + 6] === 0 && !(buffer[lenR + 7] & 128))
        throw new Error("S value excessively padded");
      return {
        r: buffer.slice(4, 4 + lenR),
        s: buffer.slice(6 + lenR)
      };
    }
    exports.decode = decode;
    function encode(r, s) {
      const lenR = r.length;
      const lenS = s.length;
      if (lenR === 0) throw new Error("R length is zero");
      if (lenS === 0) throw new Error("S length is zero");
      if (lenR > 33) throw new Error("R length is too long");
      if (lenS > 33) throw new Error("S length is too long");
      if (r[0] & 128) throw new Error("R value is negative");
      if (s[0] & 128) throw new Error("S value is negative");
      if (lenR > 1 && r[0] === 0 && !(r[1] & 128))
        throw new Error("R value excessively padded");
      if (lenS > 1 && s[0] === 0 && !(s[1] & 128))
        throw new Error("S value excessively padded");
      const signature = Buffer.allocUnsafe(6 + lenR + lenS);
      signature[0] = 48;
      signature[1] = signature.length - 2;
      signature[2] = 2;
      signature[3] = r.length;
      r.copy(signature, 4);
      signature[4 + lenR] = 2;
      signature[5 + lenR] = s.length;
      s.copy(signature, 6 + lenR);
      return signature;
    }
    exports.encode = encode;
  }
});

// node_modules/bitcoinjs-lib/src/ops.js
var require_ops = __commonJS({
  "node_modules/bitcoinjs-lib/src/ops.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.REVERSE_OPS = exports.OPS = void 0;
    var OPS = {
      OP_FALSE: 0,
      OP_0: 0,
      OP_PUSHDATA1: 76,
      OP_PUSHDATA2: 77,
      OP_PUSHDATA4: 78,
      OP_1NEGATE: 79,
      OP_RESERVED: 80,
      OP_TRUE: 81,
      OP_1: 81,
      OP_2: 82,
      OP_3: 83,
      OP_4: 84,
      OP_5: 85,
      OP_6: 86,
      OP_7: 87,
      OP_8: 88,
      OP_9: 89,
      OP_10: 90,
      OP_11: 91,
      OP_12: 92,
      OP_13: 93,
      OP_14: 94,
      OP_15: 95,
      OP_16: 96,
      OP_NOP: 97,
      OP_VER: 98,
      OP_IF: 99,
      OP_NOTIF: 100,
      OP_VERIF: 101,
      OP_VERNOTIF: 102,
      OP_ELSE: 103,
      OP_ENDIF: 104,
      OP_VERIFY: 105,
      OP_RETURN: 106,
      OP_TOALTSTACK: 107,
      OP_FROMALTSTACK: 108,
      OP_2DROP: 109,
      OP_2DUP: 110,
      OP_3DUP: 111,
      OP_2OVER: 112,
      OP_2ROT: 113,
      OP_2SWAP: 114,
      OP_IFDUP: 115,
      OP_DEPTH: 116,
      OP_DROP: 117,
      OP_DUP: 118,
      OP_NIP: 119,
      OP_OVER: 120,
      OP_PICK: 121,
      OP_ROLL: 122,
      OP_ROT: 123,
      OP_SWAP: 124,
      OP_TUCK: 125,
      OP_CAT: 126,
      OP_SUBSTR: 127,
      OP_LEFT: 128,
      OP_RIGHT: 129,
      OP_SIZE: 130,
      OP_INVERT: 131,
      OP_AND: 132,
      OP_OR: 133,
      OP_XOR: 134,
      OP_EQUAL: 135,
      OP_EQUALVERIFY: 136,
      OP_RESERVED1: 137,
      OP_RESERVED2: 138,
      OP_1ADD: 139,
      OP_1SUB: 140,
      OP_2MUL: 141,
      OP_2DIV: 142,
      OP_NEGATE: 143,
      OP_ABS: 144,
      OP_NOT: 145,
      OP_0NOTEQUAL: 146,
      OP_ADD: 147,
      OP_SUB: 148,
      OP_MUL: 149,
      OP_DIV: 150,
      OP_MOD: 151,
      OP_LSHIFT: 152,
      OP_RSHIFT: 153,
      OP_BOOLAND: 154,
      OP_BOOLOR: 155,
      OP_NUMEQUAL: 156,
      OP_NUMEQUALVERIFY: 157,
      OP_NUMNOTEQUAL: 158,
      OP_LESSTHAN: 159,
      OP_GREATERTHAN: 160,
      OP_LESSTHANOREQUAL: 161,
      OP_GREATERTHANOREQUAL: 162,
      OP_MIN: 163,
      OP_MAX: 164,
      OP_WITHIN: 165,
      OP_RIPEMD160: 166,
      OP_SHA1: 167,
      OP_SHA256: 168,
      OP_HASH160: 169,
      OP_HASH256: 170,
      OP_CODESEPARATOR: 171,
      OP_CHECKSIG: 172,
      OP_CHECKSIGVERIFY: 173,
      OP_CHECKMULTISIG: 174,
      OP_CHECKMULTISIGVERIFY: 175,
      OP_NOP1: 176,
      OP_NOP2: 177,
      OP_CHECKLOCKTIMEVERIFY: 177,
      OP_NOP3: 178,
      OP_CHECKSEQUENCEVERIFY: 178,
      OP_NOP4: 179,
      OP_NOP5: 180,
      OP_NOP6: 181,
      OP_NOP7: 182,
      OP_NOP8: 183,
      OP_NOP9: 184,
      OP_NOP10: 185,
      OP_CHECKSIGADD: 186,
      OP_PUBKEYHASH: 253,
      OP_PUBKEY: 254,
      OP_INVALIDOPCODE: 255
    };
    exports.OPS = OPS;
    var REVERSE_OPS = {};
    exports.REVERSE_OPS = REVERSE_OPS;
    for (const op of Object.keys(OPS)) {
      const code = OPS[op];
      REVERSE_OPS[code] = op;
    }
  }
});

// node_modules/bitcoinjs-lib/src/push_data.js
var require_push_data = __commonJS({
  "node_modules/bitcoinjs-lib/src/push_data.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.decode = exports.encode = exports.encodingLength = void 0;
    var ops_1 = require_ops();
    function encodingLength(i) {
      return i < ops_1.OPS.OP_PUSHDATA1 ? 1 : i <= 255 ? 2 : i <= 65535 ? 3 : 5;
    }
    exports.encodingLength = encodingLength;
    function encode(buffer, num, offset) {
      const size = encodingLength(num);
      if (size === 1) {
        buffer.writeUInt8(num, offset);
      } else if (size === 2) {
        buffer.writeUInt8(ops_1.OPS.OP_PUSHDATA1, offset);
        buffer.writeUInt8(num, offset + 1);
      } else if (size === 3) {
        buffer.writeUInt8(ops_1.OPS.OP_PUSHDATA2, offset);
        buffer.writeUInt16LE(num, offset + 1);
      } else {
        buffer.writeUInt8(ops_1.OPS.OP_PUSHDATA4, offset);
        buffer.writeUInt32LE(num, offset + 1);
      }
      return size;
    }
    exports.encode = encode;
    function decode(buffer, offset) {
      const opcode = buffer.readUInt8(offset);
      let num;
      let size;
      if (opcode < ops_1.OPS.OP_PUSHDATA1) {
        num = opcode;
        size = 1;
      } else if (opcode === ops_1.OPS.OP_PUSHDATA1) {
        if (offset + 2 > buffer.length) return null;
        num = buffer.readUInt8(offset + 1);
        size = 2;
      } else if (opcode === ops_1.OPS.OP_PUSHDATA2) {
        if (offset + 3 > buffer.length) return null;
        num = buffer.readUInt16LE(offset + 1);
        size = 3;
      } else {
        if (offset + 5 > buffer.length) return null;
        if (opcode !== ops_1.OPS.OP_PUSHDATA4) throw new Error("Unexpected opcode");
        num = buffer.readUInt32LE(offset + 1);
        size = 5;
      }
      return {
        opcode,
        number: num,
        size
      };
    }
    exports.decode = decode;
  }
});

// node_modules/bitcoinjs-lib/src/script_number.js
var require_script_number = __commonJS({
  "node_modules/bitcoinjs-lib/src/script_number.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.encode = exports.decode = void 0;
    function decode(buffer, maxLength, minimal) {
      maxLength = maxLength || 4;
      minimal = minimal === void 0 ? true : minimal;
      const length = buffer.length;
      if (length === 0) return 0;
      if (length > maxLength) throw new TypeError("Script number overflow");
      if (minimal) {
        if ((buffer[length - 1] & 127) === 0) {
          if (length <= 1 || (buffer[length - 2] & 128) === 0)
            throw new Error("Non-minimally encoded script number");
        }
      }
      if (length === 5) {
        const a = buffer.readUInt32LE(0);
        const b = buffer.readUInt8(4);
        if (b & 128) return -((b & ~128) * 4294967296 + a);
        return b * 4294967296 + a;
      }
      let result = 0;
      for (let i = 0; i < length; ++i) {
        result |= buffer[i] << 8 * i;
      }
      if (buffer[length - 1] & 128)
        return -(result & ~(128 << 8 * (length - 1)));
      return result;
    }
    exports.decode = decode;
    function scriptNumSize(i) {
      return i > 2147483647 ? 5 : i > 8388607 ? 4 : i > 32767 ? 3 : i > 127 ? 2 : i > 0 ? 1 : 0;
    }
    function encode(_number) {
      let value = Math.abs(_number);
      const size = scriptNumSize(value);
      const buffer = Buffer.allocUnsafe(size);
      const negative = _number < 0;
      for (let i = 0; i < size; ++i) {
        buffer.writeUInt8(value & 255, i);
        value >>= 8;
      }
      if (buffer[size - 1] & 128) {
        buffer.writeUInt8(negative ? 128 : 0, size - 1);
      } else if (negative) {
        buffer[size - 1] |= 128;
      }
      return buffer;
    }
    exports.encode = encode;
  }
});

// ../node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "../node_modules/base64-js/index.js"(exports) {
    "use strict";
    exports.byteLength = byteLength;
    exports.toByteArray = toByteArray;
    exports.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }
    var i;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1) validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i2;
      for (i2 = 0; i2 < len2; i2 += 4) {
        tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num) {
      return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
    }
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i2 = start; i2 < end; i2 += 3) {
        tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
  }
});

// ../node_modules/ieee754/index.js
var require_ieee754 = __commonJS({
  "../node_modules/ieee754/index.js"(exports) {
    "use strict";
    exports.read = function(buffer, offset, isLE, mLen, nBytes) {
      var e, m;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i = isLE ? nBytes - 1 : 0;
      var d = isLE ? -1 : 1;
      var s = buffer[offset + i];
      i += d;
      e = s & (1 << -nBits) - 1;
      s >>= -nBits;
      nBits += eLen;
      for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      m = e & (1 << -nBits) - 1;
      e >>= -nBits;
      nBits += mLen;
      for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : (s ? -1 : 1) * Infinity;
      } else {
        m = m + Math.pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
    };
    exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
      var e, m, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i = isLE ? 0 : nBytes - 1;
      var d = isLE ? 1 : -1;
      var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
      value = Math.abs(value);
      if (isNaN(value) || value === Infinity) {
        m = isNaN(value) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }
        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value * c - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e = 0;
        }
      }
      for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
      }
      e = e << mLen | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
      }
      buffer[offset + i - d] |= s * 128;
    };
  }
});

// ../node_modules/buffer/index.js
var require_buffer = __commonJS({
  "../node_modules/buffer/index.js"(exports) {
    "use strict";
    var base64 = require_base64_js();
    var ieee754 = require_ieee754();
    var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
    exports.Buffer = Buffer2;
    exports.SlowBuffer = SlowBuffer;
    exports.INSPECT_MAX_BYTES = 50;
    var K_MAX_LENGTH = 2147483647;
    exports.kMaxLength = K_MAX_LENGTH;
    Buffer2.TYPED_ARRAY_SUPPORT = typedArraySupport();
    if (!Buffer2.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
      );
    }
    function typedArraySupport() {
      try {
        const arr = new Uint8Array(1);
        const proto = { foo: function() {
          return 42;
        } };
        Object.setPrototypeOf(proto, Uint8Array.prototype);
        Object.setPrototypeOf(arr, proto);
        return arr.foo() === 42;
      } catch (e) {
        return false;
      }
    }
    Object.defineProperty(Buffer2.prototype, "parent", {
      enumerable: true,
      get: function() {
        if (!Buffer2.isBuffer(this)) return void 0;
        return this.buffer;
      }
    });
    Object.defineProperty(Buffer2.prototype, "offset", {
      enumerable: true,
      get: function() {
        if (!Buffer2.isBuffer(this)) return void 0;
        return this.byteOffset;
      }
    });
    function createBuffer(length) {
      if (length > K_MAX_LENGTH) {
        throw new RangeError('The value "' + length + '" is invalid for option "size"');
      }
      const buf = new Uint8Array(length);
      Object.setPrototypeOf(buf, Buffer2.prototype);
      return buf;
    }
    function Buffer2(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        if (typeof encodingOrOffset === "string") {
          throw new TypeError(
            'The "string" argument must be of type string. Received type number'
          );
        }
        return allocUnsafe(arg);
      }
      return from(arg, encodingOrOffset, length);
    }
    Buffer2.poolSize = 8192;
    function from(value, encodingOrOffset, length) {
      if (typeof value === "string") {
        return fromString(value, encodingOrOffset);
      }
      if (ArrayBuffer.isView(value)) {
        return fromArrayView(value);
      }
      if (value == null) {
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof value === "number") {
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number'
        );
      }
      const valueOf = value.valueOf && value.valueOf();
      if (valueOf != null && valueOf !== value) {
        return Buffer2.from(valueOf, encodingOrOffset, length);
      }
      const b = fromObject(value);
      if (b) return b;
      if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
        return Buffer2.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
      }
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
      );
    }
    Buffer2.from = function(value, encodingOrOffset, length) {
      return from(value, encodingOrOffset, length);
    };
    Object.setPrototypeOf(Buffer2.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer2, Uint8Array);
    function assertSize(size) {
      if (typeof size !== "number") {
        throw new TypeError('"size" argument must be of type number');
      } else if (size < 0) {
        throw new RangeError('The value "' + size + '" is invalid for option "size"');
      }
    }
    function alloc(size, fill, encoding) {
      assertSize(size);
      if (size <= 0) {
        return createBuffer(size);
      }
      if (fill !== void 0) {
        return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
      }
      return createBuffer(size);
    }
    Buffer2.alloc = function(size, fill, encoding) {
      return alloc(size, fill, encoding);
    };
    function allocUnsafe(size) {
      assertSize(size);
      return createBuffer(size < 0 ? 0 : checked(size) | 0);
    }
    Buffer2.allocUnsafe = function(size) {
      return allocUnsafe(size);
    };
    Buffer2.allocUnsafeSlow = function(size) {
      return allocUnsafe(size);
    };
    function fromString(string, encoding) {
      if (typeof encoding !== "string" || encoding === "") {
        encoding = "utf8";
      }
      if (!Buffer2.isEncoding(encoding)) {
        throw new TypeError("Unknown encoding: " + encoding);
      }
      const length = byteLength(string, encoding) | 0;
      let buf = createBuffer(length);
      const actual = buf.write(string, encoding);
      if (actual !== length) {
        buf = buf.slice(0, actual);
      }
      return buf;
    }
    function fromArrayLike(array) {
      const length = array.length < 0 ? 0 : checked(array.length) | 0;
      const buf = createBuffer(length);
      for (let i = 0; i < length; i += 1) {
        buf[i] = array[i] & 255;
      }
      return buf;
    }
    function fromArrayView(arrayView) {
      if (isInstance(arrayView, Uint8Array)) {
        const copy = new Uint8Array(arrayView);
        return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
      }
      return fromArrayLike(arrayView);
    }
    function fromArrayBuffer(array, byteOffset, length) {
      if (byteOffset < 0 || array.byteLength < byteOffset) {
        throw new RangeError('"offset" is outside of buffer bounds');
      }
      if (array.byteLength < byteOffset + (length || 0)) {
        throw new RangeError('"length" is outside of buffer bounds');
      }
      let buf;
      if (byteOffset === void 0 && length === void 0) {
        buf = new Uint8Array(array);
      } else if (length === void 0) {
        buf = new Uint8Array(array, byteOffset);
      } else {
        buf = new Uint8Array(array, byteOffset, length);
      }
      Object.setPrototypeOf(buf, Buffer2.prototype);
      return buf;
    }
    function fromObject(obj) {
      if (Buffer2.isBuffer(obj)) {
        const len = checked(obj.length) | 0;
        const buf = createBuffer(len);
        if (buf.length === 0) {
          return buf;
        }
        obj.copy(buf, 0, 0, len);
        return buf;
      }
      if (obj.length !== void 0) {
        if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
          return createBuffer(0);
        }
        return fromArrayLike(obj);
      }
      if (obj.type === "Buffer" && Array.isArray(obj.data)) {
        return fromArrayLike(obj.data);
      }
    }
    function checked(length) {
      if (length >= K_MAX_LENGTH) {
        throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
      }
      return length | 0;
    }
    function SlowBuffer(length) {
      if (+length != length) {
        length = 0;
      }
      return Buffer2.alloc(+length);
    }
    Buffer2.isBuffer = function isBuffer(b) {
      return b != null && b._isBuffer === true && b !== Buffer2.prototype;
    };
    Buffer2.compare = function compare(a, b) {
      if (isInstance(a, Uint8Array)) a = Buffer2.from(a, a.offset, a.byteLength);
      if (isInstance(b, Uint8Array)) b = Buffer2.from(b, b.offset, b.byteLength);
      if (!Buffer2.isBuffer(a) || !Buffer2.isBuffer(b)) {
        throw new TypeError(
          'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
        );
      }
      if (a === b) return 0;
      let x = a.length;
      let y = b.length;
      for (let i = 0, len = Math.min(x, y); i < len; ++i) {
        if (a[i] !== b[i]) {
          x = a[i];
          y = b[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    Buffer2.isEncoding = function isEncoding(encoding) {
      switch (String(encoding).toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "latin1":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return true;
        default:
          return false;
      }
    };
    Buffer2.concat = function concat(list, length) {
      if (!Array.isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return Buffer2.alloc(0);
      }
      let i;
      if (length === void 0) {
        length = 0;
        for (i = 0; i < list.length; ++i) {
          length += list[i].length;
        }
      }
      const buffer = Buffer2.allocUnsafe(length);
      let pos = 0;
      for (i = 0; i < list.length; ++i) {
        let buf = list[i];
        if (isInstance(buf, Uint8Array)) {
          if (pos + buf.length > buffer.length) {
            if (!Buffer2.isBuffer(buf)) buf = Buffer2.from(buf);
            buf.copy(buffer, pos);
          } else {
            Uint8Array.prototype.set.call(
              buffer,
              buf,
              pos
            );
          }
        } else if (!Buffer2.isBuffer(buf)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        } else {
          buf.copy(buffer, pos);
        }
        pos += buf.length;
      }
      return buffer;
    };
    function byteLength(string, encoding) {
      if (Buffer2.isBuffer(string)) {
        return string.length;
      }
      if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
        return string.byteLength;
      }
      if (typeof string !== "string") {
        throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
        );
      }
      const len = string.length;
      const mustMatch = arguments.length > 2 && arguments[2] === true;
      if (!mustMatch && len === 0) return 0;
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "ascii":
          case "latin1":
          case "binary":
            return len;
          case "utf8":
          case "utf-8":
            return utf8ToBytes(string).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return len * 2;
          case "hex":
            return len >>> 1;
          case "base64":
            return base64ToBytes(string).length;
          default:
            if (loweredCase) {
              return mustMatch ? -1 : utf8ToBytes(string).length;
            }
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer2.byteLength = byteLength;
    function slowToString(encoding, start, end) {
      let loweredCase = false;
      if (start === void 0 || start < 0) {
        start = 0;
      }
      if (start > this.length) {
        return "";
      }
      if (end === void 0 || end > this.length) {
        end = this.length;
      }
      if (end <= 0) {
        return "";
      }
      end >>>= 0;
      start >>>= 0;
      if (end <= start) {
        return "";
      }
      if (!encoding) encoding = "utf8";
      while (true) {
        switch (encoding) {
          case "hex":
            return hexSlice(this, start, end);
          case "utf8":
          case "utf-8":
            return utf8Slice(this, start, end);
          case "ascii":
            return asciiSlice(this, start, end);
          case "latin1":
          case "binary":
            return latin1Slice(this, start, end);
          case "base64":
            return base64Slice(this, start, end);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return utf16leSlice(this, start, end);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = (encoding + "").toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer2.prototype._isBuffer = true;
    function swap(b, n, m) {
      const i = b[n];
      b[n] = b[m];
      b[m] = i;
    }
    Buffer2.prototype.swap16 = function swap16() {
      const len = this.length;
      if (len % 2 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      }
      for (let i = 0; i < len; i += 2) {
        swap(this, i, i + 1);
      }
      return this;
    };
    Buffer2.prototype.swap32 = function swap32() {
      const len = this.length;
      if (len % 4 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 32-bits");
      }
      for (let i = 0; i < len; i += 4) {
        swap(this, i, i + 3);
        swap(this, i + 1, i + 2);
      }
      return this;
    };
    Buffer2.prototype.swap64 = function swap64() {
      const len = this.length;
      if (len % 8 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 64-bits");
      }
      for (let i = 0; i < len; i += 8) {
        swap(this, i, i + 7);
        swap(this, i + 1, i + 6);
        swap(this, i + 2, i + 5);
        swap(this, i + 3, i + 4);
      }
      return this;
    };
    Buffer2.prototype.toString = function toString() {
      const length = this.length;
      if (length === 0) return "";
      if (arguments.length === 0) return utf8Slice(this, 0, length);
      return slowToString.apply(this, arguments);
    };
    Buffer2.prototype.toLocaleString = Buffer2.prototype.toString;
    Buffer2.prototype.equals = function equals(b) {
      if (!Buffer2.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
      if (this === b) return true;
      return Buffer2.compare(this, b) === 0;
    };
    Buffer2.prototype.inspect = function inspect() {
      let str = "";
      const max = exports.INSPECT_MAX_BYTES;
      str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
      if (this.length > max) str += " ... ";
      return "<Buffer " + str + ">";
    };
    if (customInspectSymbol) {
      Buffer2.prototype[customInspectSymbol] = Buffer2.prototype.inspect;
    }
    Buffer2.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
      if (isInstance(target, Uint8Array)) {
        target = Buffer2.from(target, target.offset, target.byteLength);
      }
      if (!Buffer2.isBuffer(target)) {
        throw new TypeError(
          'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
        );
      }
      if (start === void 0) {
        start = 0;
      }
      if (end === void 0) {
        end = target ? target.length : 0;
      }
      if (thisStart === void 0) {
        thisStart = 0;
      }
      if (thisEnd === void 0) {
        thisEnd = this.length;
      }
      if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
        throw new RangeError("out of range index");
      }
      if (thisStart >= thisEnd && start >= end) {
        return 0;
      }
      if (thisStart >= thisEnd) {
        return -1;
      }
      if (start >= end) {
        return 1;
      }
      start >>>= 0;
      end >>>= 0;
      thisStart >>>= 0;
      thisEnd >>>= 0;
      if (this === target) return 0;
      let x = thisEnd - thisStart;
      let y = end - start;
      const len = Math.min(x, y);
      const thisCopy = this.slice(thisStart, thisEnd);
      const targetCopy = target.slice(start, end);
      for (let i = 0; i < len; ++i) {
        if (thisCopy[i] !== targetCopy[i]) {
          x = thisCopy[i];
          y = targetCopy[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
      if (buffer.length === 0) return -1;
      if (typeof byteOffset === "string") {
        encoding = byteOffset;
        byteOffset = 0;
      } else if (byteOffset > 2147483647) {
        byteOffset = 2147483647;
      } else if (byteOffset < -2147483648) {
        byteOffset = -2147483648;
      }
      byteOffset = +byteOffset;
      if (numberIsNaN(byteOffset)) {
        byteOffset = dir ? 0 : buffer.length - 1;
      }
      if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
      if (byteOffset >= buffer.length) {
        if (dir) return -1;
        else byteOffset = buffer.length - 1;
      } else if (byteOffset < 0) {
        if (dir) byteOffset = 0;
        else return -1;
      }
      if (typeof val === "string") {
        val = Buffer2.from(val, encoding);
      }
      if (Buffer2.isBuffer(val)) {
        if (val.length === 0) {
          return -1;
        }
        return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
      } else if (typeof val === "number") {
        val = val & 255;
        if (typeof Uint8Array.prototype.indexOf === "function") {
          if (dir) {
            return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
          } else {
            return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
          }
        }
        return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
      }
      throw new TypeError("val must be string, number or Buffer");
    }
    function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
      let indexSize = 1;
      let arrLength = arr.length;
      let valLength = val.length;
      if (encoding !== void 0) {
        encoding = String(encoding).toLowerCase();
        if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
          if (arr.length < 2 || val.length < 2) {
            return -1;
          }
          indexSize = 2;
          arrLength /= 2;
          valLength /= 2;
          byteOffset /= 2;
        }
      }
      function read(buf, i2) {
        if (indexSize === 1) {
          return buf[i2];
        } else {
          return buf.readUInt16BE(i2 * indexSize);
        }
      }
      let i;
      if (dir) {
        let foundIndex = -1;
        for (i = byteOffset; i < arrLength; i++) {
          if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
            if (foundIndex === -1) foundIndex = i;
            if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
          } else {
            if (foundIndex !== -1) i -= i - foundIndex;
            foundIndex = -1;
          }
        }
      } else {
        if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
        for (i = byteOffset; i >= 0; i--) {
          let found = true;
          for (let j = 0; j < valLength; j++) {
            if (read(arr, i + j) !== read(val, j)) {
              found = false;
              break;
            }
          }
          if (found) return i;
        }
      }
      return -1;
    }
    Buffer2.prototype.includes = function includes(val, byteOffset, encoding) {
      return this.indexOf(val, byteOffset, encoding) !== -1;
    };
    Buffer2.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
    };
    Buffer2.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
    };
    function hexWrite(buf, string, offset, length) {
      offset = Number(offset) || 0;
      const remaining = buf.length - offset;
      if (!length) {
        length = remaining;
      } else {
        length = Number(length);
        if (length > remaining) {
          length = remaining;
        }
      }
      const strLen = string.length;
      if (length > strLen / 2) {
        length = strLen / 2;
      }
      let i;
      for (i = 0; i < length; ++i) {
        const parsed = parseInt(string.substr(i * 2, 2), 16);
        if (numberIsNaN(parsed)) return i;
        buf[offset + i] = parsed;
      }
      return i;
    }
    function utf8Write(buf, string, offset, length) {
      return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
    }
    function asciiWrite(buf, string, offset, length) {
      return blitBuffer(asciiToBytes(string), buf, offset, length);
    }
    function base64Write(buf, string, offset, length) {
      return blitBuffer(base64ToBytes(string), buf, offset, length);
    }
    function ucs2Write(buf, string, offset, length) {
      return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
    }
    Buffer2.prototype.write = function write(string, offset, length, encoding) {
      if (offset === void 0) {
        encoding = "utf8";
        length = this.length;
        offset = 0;
      } else if (length === void 0 && typeof offset === "string") {
        encoding = offset;
        length = this.length;
        offset = 0;
      } else if (isFinite(offset)) {
        offset = offset >>> 0;
        if (isFinite(length)) {
          length = length >>> 0;
          if (encoding === void 0) encoding = "utf8";
        } else {
          encoding = length;
          length = void 0;
        }
      } else {
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported"
        );
      }
      const remaining = this.length - offset;
      if (length === void 0 || length > remaining) length = remaining;
      if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
        throw new RangeError("Attempt to write outside buffer bounds");
      }
      if (!encoding) encoding = "utf8";
      let loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "hex":
            return hexWrite(this, string, offset, length);
          case "utf8":
          case "utf-8":
            return utf8Write(this, string, offset, length);
          case "ascii":
          case "latin1":
          case "binary":
            return asciiWrite(this, string, offset, length);
          case "base64":
            return base64Write(this, string, offset, length);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return ucs2Write(this, string, offset, length);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    };
    Buffer2.prototype.toJSON = function toJSON() {
      return {
        type: "Buffer",
        data: Array.prototype.slice.call(this._arr || this, 0)
      };
    };
    function base64Slice(buf, start, end) {
      if (start === 0 && end === buf.length) {
        return base64.fromByteArray(buf);
      } else {
        return base64.fromByteArray(buf.slice(start, end));
      }
    }
    function utf8Slice(buf, start, end) {
      end = Math.min(buf.length, end);
      const res = [];
      let i = start;
      while (i < end) {
        const firstByte = buf[i];
        let codePoint = null;
        let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
        if (i + bytesPerSequence <= end) {
          let secondByte, thirdByte, fourthByte, tempCodePoint;
          switch (bytesPerSequence) {
            case 1:
              if (firstByte < 128) {
                codePoint = firstByte;
              }
              break;
            case 2:
              secondByte = buf[i + 1];
              if ((secondByte & 192) === 128) {
                tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                if (tempCodePoint > 127) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 3:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 4:
              secondByte = buf[i + 1];
              thirdByte = buf[i + 2];
              fourthByte = buf[i + 3];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                  codePoint = tempCodePoint;
                }
              }
          }
        }
        if (codePoint === null) {
          codePoint = 65533;
          bytesPerSequence = 1;
        } else if (codePoint > 65535) {
          codePoint -= 65536;
          res.push(codePoint >>> 10 & 1023 | 55296);
          codePoint = 56320 | codePoint & 1023;
        }
        res.push(codePoint);
        i += bytesPerSequence;
      }
      return decodeCodePointsArray(res);
    }
    var MAX_ARGUMENTS_LENGTH = 4096;
    function decodeCodePointsArray(codePoints) {
      const len = codePoints.length;
      if (len <= MAX_ARGUMENTS_LENGTH) {
        return String.fromCharCode.apply(String, codePoints);
      }
      let res = "";
      let i = 0;
      while (i < len) {
        res += String.fromCharCode.apply(
          String,
          codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
        );
      }
      return res;
    }
    function asciiSlice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i = start; i < end; ++i) {
        ret += String.fromCharCode(buf[i] & 127);
      }
      return ret;
    }
    function latin1Slice(buf, start, end) {
      let ret = "";
      end = Math.min(buf.length, end);
      for (let i = start; i < end; ++i) {
        ret += String.fromCharCode(buf[i]);
      }
      return ret;
    }
    function hexSlice(buf, start, end) {
      const len = buf.length;
      if (!start || start < 0) start = 0;
      if (!end || end < 0 || end > len) end = len;
      let out = "";
      for (let i = start; i < end; ++i) {
        out += hexSliceLookupTable[buf[i]];
      }
      return out;
    }
    function utf16leSlice(buf, start, end) {
      const bytes = buf.slice(start, end);
      let res = "";
      for (let i = 0; i < bytes.length - 1; i += 2) {
        res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
      }
      return res;
    }
    Buffer2.prototype.slice = function slice(start, end) {
      const len = this.length;
      start = ~~start;
      end = end === void 0 ? len : ~~end;
      if (start < 0) {
        start += len;
        if (start < 0) start = 0;
      } else if (start > len) {
        start = len;
      }
      if (end < 0) {
        end += len;
        if (end < 0) end = 0;
      } else if (end > len) {
        end = len;
      }
      if (end < start) end = start;
      const newBuf = this.subarray(start, end);
      Object.setPrototypeOf(newBuf, Buffer2.prototype);
      return newBuf;
    };
    function checkOffset(offset, ext, length) {
      if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
      if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
    }
    Buffer2.prototype.readUintLE = Buffer2.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      return val;
    };
    Buffer2.prototype.readUintBE = Buffer2.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        checkOffset(offset, byteLength2, this.length);
      }
      let val = this[offset + --byteLength2];
      let mul = 1;
      while (byteLength2 > 0 && (mul *= 256)) {
        val += this[offset + --byteLength2] * mul;
      }
      return val;
    };
    Buffer2.prototype.readUint8 = Buffer2.prototype.readUInt8 = function readUInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      return this[offset];
    };
    Buffer2.prototype.readUint16LE = Buffer2.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] | this[offset + 1] << 8;
    };
    Buffer2.prototype.readUint16BE = Buffer2.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] << 8 | this[offset + 1];
    };
    Buffer2.prototype.readUint32LE = Buffer2.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
    };
    Buffer2.prototype.readUint32BE = Buffer2.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
    };
    Buffer2.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
      const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
      return BigInt(lo) + (BigInt(hi) << BigInt(32));
    });
    Buffer2.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
      return (BigInt(hi) << BigInt(32)) + BigInt(lo);
    });
    Buffer2.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let val = this[offset];
      let mul = 1;
      let i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer2.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      let i = byteLength2;
      let mul = 1;
      let val = this[offset + --i];
      while (i > 0 && (mul *= 256)) {
        val += this[offset + --i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer2.prototype.readInt8 = function readInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      if (!(this[offset] & 128)) return this[offset];
      return (255 - this[offset] + 1) * -1;
    };
    Buffer2.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      const val = this[offset] | this[offset + 1] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer2.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      const val = this[offset + 1] | this[offset] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer2.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
    };
    Buffer2.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
    };
    Buffer2.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
      return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
    });
    Buffer2.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
      offset = offset >>> 0;
      validateNumber(offset, "offset");
      const first = this[offset];
      const last = this[offset + 7];
      if (first === void 0 || last === void 0) {
        boundsError(offset, this.length - 8);
      }
      const val = (first << 24) + // Overflow
      this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
      return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
    });
    Buffer2.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, true, 23, 4);
    };
    Buffer2.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754.read(this, offset, false, 23, 4);
    };
    Buffer2.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, true, 52, 8);
    };
    Buffer2.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754.read(this, offset, false, 52, 8);
    };
    function checkInt(buf, value, offset, ext, max, min) {
      if (!Buffer2.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
      if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
    }
    Buffer2.prototype.writeUintLE = Buffer2.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let mul = 1;
      let i = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeUintBE = Buffer2.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength2 = byteLength2 >>> 0;
      if (!noAssert) {
        const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeUint8 = Buffer2.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer2.prototype.writeUint16LE = Buffer2.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer2.prototype.writeUint16BE = Buffer2.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer2.prototype.writeUint32LE = Buffer2.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset + 3] = value >>> 24;
      this[offset + 2] = value >>> 16;
      this[offset + 1] = value >>> 8;
      this[offset] = value & 255;
      return offset + 4;
    };
    Buffer2.prototype.writeUint32BE = Buffer2.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    function wrtBigUInt64LE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      lo = lo >> 8;
      buf[offset++] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      hi = hi >> 8;
      buf[offset++] = hi;
      return offset;
    }
    function wrtBigUInt64BE(buf, value, offset, min, max) {
      checkIntBI(value, min, max, buf, offset, 7);
      let lo = Number(value & BigInt(4294967295));
      buf[offset + 7] = lo;
      lo = lo >> 8;
      buf[offset + 6] = lo;
      lo = lo >> 8;
      buf[offset + 5] = lo;
      lo = lo >> 8;
      buf[offset + 4] = lo;
      let hi = Number(value >> BigInt(32) & BigInt(4294967295));
      buf[offset + 3] = hi;
      hi = hi >> 8;
      buf[offset + 2] = hi;
      hi = hi >> 8;
      buf[offset + 1] = hi;
      hi = hi >> 8;
      buf[offset] = hi;
      return offset + 8;
    }
    Buffer2.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer2.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
    });
    Buffer2.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i = 0;
      let mul = 1;
      let sub = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        const limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      let i = byteLength2 - 1;
      let mul = 1;
      let sub = 0;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
      if (value < 0) value = 255 + value + 1;
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer2.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer2.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer2.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      this[offset + 2] = value >>> 16;
      this[offset + 3] = value >>> 24;
      return offset + 4;
    };
    Buffer2.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (value < 0) value = 4294967295 + value + 1;
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    Buffer2.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
      return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    Buffer2.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
      return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
    });
    function checkIEEE754(buf, value, offset, ext, max, min) {
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
      if (offset < 0) throw new RangeError("Index out of range");
    }
    function writeFloat(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
      }
      ieee754.write(buf, value, offset, littleEndian, 23, 4);
      return offset + 4;
    }
    Buffer2.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
      return writeFloat(this, value, offset, true, noAssert);
    };
    Buffer2.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
      return writeFloat(this, value, offset, false, noAssert);
    };
    function writeDouble(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
      }
      ieee754.write(buf, value, offset, littleEndian, 52, 8);
      return offset + 8;
    }
    Buffer2.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
      return writeDouble(this, value, offset, true, noAssert);
    };
    Buffer2.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
      return writeDouble(this, value, offset, false, noAssert);
    };
    Buffer2.prototype.copy = function copy(target, targetStart, start, end) {
      if (!Buffer2.isBuffer(target)) throw new TypeError("argument should be a Buffer");
      if (!start) start = 0;
      if (!end && end !== 0) end = this.length;
      if (targetStart >= target.length) targetStart = target.length;
      if (!targetStart) targetStart = 0;
      if (end > 0 && end < start) end = start;
      if (end === start) return 0;
      if (target.length === 0 || this.length === 0) return 0;
      if (targetStart < 0) {
        throw new RangeError("targetStart out of bounds");
      }
      if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
      if (end < 0) throw new RangeError("sourceEnd out of bounds");
      if (end > this.length) end = this.length;
      if (target.length - targetStart < end - start) {
        end = target.length - targetStart + start;
      }
      const len = end - start;
      if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
        this.copyWithin(targetStart, start, end);
      } else {
        Uint8Array.prototype.set.call(
          target,
          this.subarray(start, end),
          targetStart
        );
      }
      return len;
    };
    Buffer2.prototype.fill = function fill(val, start, end, encoding) {
      if (typeof val === "string") {
        if (typeof start === "string") {
          encoding = start;
          start = 0;
          end = this.length;
        } else if (typeof end === "string") {
          encoding = end;
          end = this.length;
        }
        if (encoding !== void 0 && typeof encoding !== "string") {
          throw new TypeError("encoding must be a string");
        }
        if (typeof encoding === "string" && !Buffer2.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        if (val.length === 1) {
          const code = val.charCodeAt(0);
          if (encoding === "utf8" && code < 128 || encoding === "latin1") {
            val = code;
          }
        }
      } else if (typeof val === "number") {
        val = val & 255;
      } else if (typeof val === "boolean") {
        val = Number(val);
      }
      if (start < 0 || this.length < start || this.length < end) {
        throw new RangeError("Out of range index");
      }
      if (end <= start) {
        return this;
      }
      start = start >>> 0;
      end = end === void 0 ? this.length : end >>> 0;
      if (!val) val = 0;
      let i;
      if (typeof val === "number") {
        for (i = start; i < end; ++i) {
          this[i] = val;
        }
      } else {
        const bytes = Buffer2.isBuffer(val) ? val : Buffer2.from(val, encoding);
        const len = bytes.length;
        if (len === 0) {
          throw new TypeError('The value "' + val + '" is invalid for argument "value"');
        }
        for (i = 0; i < end - start; ++i) {
          this[i + start] = bytes[i % len];
        }
      }
      return this;
    };
    var errors = {};
    function E(sym, getMessage, Base) {
      errors[sym] = class NodeError extends Base {
        constructor() {
          super();
          Object.defineProperty(this, "message", {
            value: getMessage.apply(this, arguments),
            writable: true,
            configurable: true
          });
          this.name = `${this.name} [${sym}]`;
          this.stack;
          delete this.name;
        }
        get code() {
          return sym;
        }
        set code(value) {
          Object.defineProperty(this, "code", {
            configurable: true,
            enumerable: true,
            value,
            writable: true
          });
        }
        toString() {
          return `${this.name} [${sym}]: ${this.message}`;
        }
      };
    }
    E(
      "ERR_BUFFER_OUT_OF_BOUNDS",
      function(name) {
        if (name) {
          return `${name} is outside of buffer bounds`;
        }
        return "Attempt to access memory outside buffer bounds";
      },
      RangeError
    );
    E(
      "ERR_INVALID_ARG_TYPE",
      function(name, actual) {
        return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
      },
      TypeError
    );
    E(
      "ERR_OUT_OF_RANGE",
      function(str, range, input) {
        let msg = `The value of "${str}" is out of range.`;
        let received = input;
        if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
          received = addNumericalSeparator(String(input));
        } else if (typeof input === "bigint") {
          received = String(input);
          if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
            received = addNumericalSeparator(received);
          }
          received += "n";
        }
        msg += ` It must be ${range}. Received ${received}`;
        return msg;
      },
      RangeError
    );
    function addNumericalSeparator(val) {
      let res = "";
      let i = val.length;
      const start = val[0] === "-" ? 1 : 0;
      for (; i >= start + 4; i -= 3) {
        res = `_${val.slice(i - 3, i)}${res}`;
      }
      return `${val.slice(0, i)}${res}`;
    }
    function checkBounds(buf, offset, byteLength2) {
      validateNumber(offset, "offset");
      if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
        boundsError(offset, buf.length - (byteLength2 + 1));
      }
    }
    function checkIntBI(value, min, max, buf, offset, byteLength2) {
      if (value > max || value < min) {
        const n = typeof min === "bigint" ? "n" : "";
        let range;
        if (byteLength2 > 3) {
          if (min === 0 || min === BigInt(0)) {
            range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
          } else {
            range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
          }
        } else {
          range = `>= ${min}${n} and <= ${max}${n}`;
        }
        throw new errors.ERR_OUT_OF_RANGE("value", range, value);
      }
      checkBounds(buf, offset, byteLength2);
    }
    function validateNumber(value, name) {
      if (typeof value !== "number") {
        throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
      }
    }
    function boundsError(value, length, type) {
      if (Math.floor(value) !== value) {
        validateNumber(value, type);
        throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
      }
      if (length < 0) {
        throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
      }
      throw new errors.ERR_OUT_OF_RANGE(
        type || "offset",
        `>= ${type ? 1 : 0} and <= ${length}`,
        value
      );
    }
    var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
    function base64clean(str) {
      str = str.split("=")[0];
      str = str.trim().replace(INVALID_BASE64_RE, "");
      if (str.length < 2) return "";
      while (str.length % 4 !== 0) {
        str = str + "=";
      }
      return str;
    }
    function utf8ToBytes(string, units) {
      units = units || Infinity;
      let codePoint;
      const length = string.length;
      let leadSurrogate = null;
      const bytes = [];
      for (let i = 0; i < length; ++i) {
        codePoint = string.charCodeAt(i);
        if (codePoint > 55295 && codePoint < 57344) {
          if (!leadSurrogate) {
            if (codePoint > 56319) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            } else if (i + 1 === length) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            }
            leadSurrogate = codePoint;
            continue;
          }
          if (codePoint < 56320) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
            leadSurrogate = codePoint;
            continue;
          }
          codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
        } else if (leadSurrogate) {
          if ((units -= 3) > -1) bytes.push(239, 191, 189);
        }
        leadSurrogate = null;
        if (codePoint < 128) {
          if ((units -= 1) < 0) break;
          bytes.push(codePoint);
        } else if (codePoint < 2048) {
          if ((units -= 2) < 0) break;
          bytes.push(
            codePoint >> 6 | 192,
            codePoint & 63 | 128
          );
        } else if (codePoint < 65536) {
          if ((units -= 3) < 0) break;
          bytes.push(
            codePoint >> 12 | 224,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else if (codePoint < 1114112) {
          if ((units -= 4) < 0) break;
          bytes.push(
            codePoint >> 18 | 240,
            codePoint >> 12 & 63 | 128,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else {
          throw new Error("Invalid code point");
        }
      }
      return bytes;
    }
    function asciiToBytes(str) {
      const byteArray = [];
      for (let i = 0; i < str.length; ++i) {
        byteArray.push(str.charCodeAt(i) & 255);
      }
      return byteArray;
    }
    function utf16leToBytes(str, units) {
      let c, hi, lo;
      const byteArray = [];
      for (let i = 0; i < str.length; ++i) {
        if ((units -= 2) < 0) break;
        c = str.charCodeAt(i);
        hi = c >> 8;
        lo = c % 256;
        byteArray.push(lo);
        byteArray.push(hi);
      }
      return byteArray;
    }
    function base64ToBytes(str) {
      return base64.toByteArray(base64clean(str));
    }
    function blitBuffer(src, dst, offset, length) {
      let i;
      for (i = 0; i < length; ++i) {
        if (i + offset >= dst.length || i >= src.length) break;
        dst[i + offset] = src[i];
      }
      return i;
    }
    function isInstance(obj, type) {
      return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
    }
    function numberIsNaN(obj) {
      return obj !== obj;
    }
    var hexSliceLookupTable = (function() {
      const alphabet = "0123456789abcdef";
      const table = new Array(256);
      for (let i = 0; i < 16; ++i) {
        const i16 = i * 16;
        for (let j = 0; j < 16; ++j) {
          table[i16 + j] = alphabet[i] + alphabet[j];
        }
      }
      return table;
    })();
    function defineBigIntMethod(fn) {
      return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
    }
    function BufferBigIntNotDefined() {
      throw new Error("BigInt not supported");
    }
  }
});

// ../node_modules/typeforce/native.js
var require_native = __commonJS({
  "../node_modules/typeforce/native.js"(exports, module) {
    "use strict";
    var types = {
      Array: function(value) {
        return value !== null && value !== void 0 && value.constructor === Array;
      },
      Boolean: function(value) {
        return typeof value === "boolean";
      },
      Function: function(value) {
        return typeof value === "function";
      },
      Nil: function(value) {
        return value === void 0 || value === null;
      },
      Number: function(value) {
        return typeof value === "number";
      },
      Object: function(value) {
        return typeof value === "object";
      },
      String: function(value) {
        return typeof value === "string";
      },
      "": function() {
        return true;
      }
    };
    types.Null = types.Nil;
    for (typeName in types) {
      types[typeName].toJSON = function(t) {
        return t;
      }.bind(null, typeName);
    }
    var typeName;
    module.exports = types;
  }
});

// ../node_modules/typeforce/errors.js
var require_errors = __commonJS({
  "../node_modules/typeforce/errors.js"(exports, module) {
    "use strict";
    var native = require_native();
    function getTypeName(fn) {
      return fn.name || fn.toString().match(/function (.*?)\s*\(/)[1];
    }
    function getValueTypeName(value) {
      return native.Nil(value) ? "" : getTypeName(value.constructor);
    }
    function getValue(value) {
      if (native.Function(value)) return "";
      if (native.String(value)) return JSON.stringify(value);
      if (value && native.Object(value)) return "";
      return value;
    }
    function captureStackTrace(e, t) {
      if (Error.captureStackTrace) {
        Error.captureStackTrace(e, t);
      }
    }
    function tfJSON(type) {
      if (native.Function(type)) return type.toJSON ? type.toJSON() : getTypeName(type);
      if (native.Array(type)) return "Array";
      if (type && native.Object(type)) return "Object";
      return type !== void 0 ? type : "";
    }
    function tfErrorString(type, value, valueTypeName) {
      var valueJson = getValue(value);
      return "Expected " + tfJSON(type) + ", got" + (valueTypeName !== "" ? " " + valueTypeName : "") + (valueJson !== "" ? " " + valueJson : "");
    }
    function TfTypeError(type, value, valueTypeName) {
      valueTypeName = valueTypeName || getValueTypeName(value);
      this.message = tfErrorString(type, value, valueTypeName);
      captureStackTrace(this, TfTypeError);
      this.__type = type;
      this.__value = value;
      this.__valueTypeName = valueTypeName;
    }
    TfTypeError.prototype = Object.create(Error.prototype);
    TfTypeError.prototype.constructor = TfTypeError;
    function tfPropertyErrorString(type, label, name, value, valueTypeName) {
      var description = '" of type ';
      if (label === "key") description = '" with key type ';
      return tfErrorString('property "' + tfJSON(name) + description + tfJSON(type), value, valueTypeName);
    }
    function TfPropertyTypeError(type, property, label, value, valueTypeName) {
      if (type) {
        valueTypeName = valueTypeName || getValueTypeName(value);
        this.message = tfPropertyErrorString(type, label, property, value, valueTypeName);
      } else {
        this.message = 'Unexpected property "' + property + '"';
      }
      captureStackTrace(this, TfTypeError);
      this.__label = label;
      this.__property = property;
      this.__type = type;
      this.__value = value;
      this.__valueTypeName = valueTypeName;
    }
    TfPropertyTypeError.prototype = Object.create(Error.prototype);
    TfPropertyTypeError.prototype.constructor = TfTypeError;
    function tfCustomError(expected, actual) {
      return new TfTypeError(expected, {}, actual);
    }
    function tfSubError(e, property, label) {
      if (e instanceof TfPropertyTypeError) {
        property = property + "." + e.__property;
        e = new TfPropertyTypeError(
          e.__type,
          property,
          e.__label,
          e.__value,
          e.__valueTypeName
        );
      } else if (e instanceof TfTypeError) {
        e = new TfPropertyTypeError(
          e.__type,
          property,
          label,
          e.__value,
          e.__valueTypeName
        );
      }
      captureStackTrace(e);
      return e;
    }
    module.exports = {
      TfTypeError,
      TfPropertyTypeError,
      tfCustomError,
      tfSubError,
      tfJSON,
      getValueTypeName
    };
  }
});

// ../node_modules/typeforce/extra.js
var require_extra = __commonJS({
  "../node_modules/typeforce/extra.js"(exports, module) {
    "use strict";
    var NATIVE = require_native();
    var ERRORS = require_errors();
    function _Buffer(value) {
      return Buffer.isBuffer(value);
    }
    function Hex(value) {
      return typeof value === "string" && /^([0-9a-f]{2})+$/i.test(value);
    }
    function _LengthN(type, length) {
      var name = type.toJSON();
      function Length(value) {
        if (!type(value)) return false;
        if (value.length === length) return true;
        throw ERRORS.tfCustomError(name + "(Length: " + length + ")", name + "(Length: " + value.length + ")");
      }
      Length.toJSON = function() {
        return name;
      };
      return Length;
    }
    var _ArrayN = _LengthN.bind(null, NATIVE.Array);
    var _BufferN = _LengthN.bind(null, _Buffer);
    var _HexN = _LengthN.bind(null, Hex);
    var _StringN = _LengthN.bind(null, NATIVE.String);
    function Range(a, b, f) {
      f = f || NATIVE.Number;
      function _range(value, strict) {
        return f(value, strict) && value > a && value < b;
      }
      _range.toJSON = function() {
        return `${f.toJSON()} between [${a}, ${b}]`;
      };
      return _range;
    }
    var INT53_MAX = Math.pow(2, 53) - 1;
    function Finite(value) {
      return typeof value === "number" && isFinite(value);
    }
    function Int8(value) {
      return value << 24 >> 24 === value;
    }
    function Int16(value) {
      return value << 16 >> 16 === value;
    }
    function Int32(value) {
      return (value | 0) === value;
    }
    function Int53(value) {
      return typeof value === "number" && value >= -INT53_MAX && value <= INT53_MAX && Math.floor(value) === value;
    }
    function UInt8(value) {
      return (value & 255) === value;
    }
    function UInt16(value) {
      return (value & 65535) === value;
    }
    function UInt32(value) {
      return value >>> 0 === value;
    }
    function UInt53(value) {
      return typeof value === "number" && value >= 0 && value <= INT53_MAX && Math.floor(value) === value;
    }
    var types = {
      ArrayN: _ArrayN,
      Buffer: _Buffer,
      BufferN: _BufferN,
      Finite,
      Hex,
      HexN: _HexN,
      Int8,
      Int16,
      Int32,
      Int53,
      Range,
      StringN: _StringN,
      UInt8,
      UInt16,
      UInt32,
      UInt53
    };
    for (typeName in types) {
      types[typeName].toJSON = function(t) {
        return t;
      }.bind(null, typeName);
    }
    var typeName;
    module.exports = types;
  }
});

// ../node_modules/typeforce/index.js
var require_typeforce = __commonJS({
  "../node_modules/typeforce/index.js"(exports, module) {
    "use strict";
    var ERRORS = require_errors();
    var NATIVE = require_native();
    var tfJSON = ERRORS.tfJSON;
    var TfTypeError = ERRORS.TfTypeError;
    var TfPropertyTypeError = ERRORS.TfPropertyTypeError;
    var tfSubError = ERRORS.tfSubError;
    var getValueTypeName = ERRORS.getValueTypeName;
    var TYPES = {
      arrayOf: function arrayOf(type, options) {
        type = compile(type);
        options = options || {};
        function _arrayOf(array, strict) {
          if (!NATIVE.Array(array)) return false;
          if (NATIVE.Nil(array)) return false;
          if (options.minLength !== void 0 && array.length < options.minLength) return false;
          if (options.maxLength !== void 0 && array.length > options.maxLength) return false;
          if (options.length !== void 0 && array.length !== options.length) return false;
          return array.every(function(value, i) {
            try {
              return typeforce(type, value, strict);
            } catch (e) {
              throw tfSubError(e, i);
            }
          });
        }
        _arrayOf.toJSON = function() {
          var str = "[" + tfJSON(type) + "]";
          if (options.length !== void 0) {
            str += "{" + options.length + "}";
          } else if (options.minLength !== void 0 || options.maxLength !== void 0) {
            str += "{" + (options.minLength === void 0 ? 0 : options.minLength) + "," + (options.maxLength === void 0 ? Infinity : options.maxLength) + "}";
          }
          return str;
        };
        return _arrayOf;
      },
      maybe: function maybe(type) {
        type = compile(type);
        function _maybe(value, strict) {
          return NATIVE.Nil(value) || type(value, strict, maybe);
        }
        _maybe.toJSON = function() {
          return "?" + tfJSON(type);
        };
        return _maybe;
      },
      map: function map(propertyType, propertyKeyType) {
        propertyType = compile(propertyType);
        if (propertyKeyType) propertyKeyType = compile(propertyKeyType);
        function _map(value, strict) {
          if (!NATIVE.Object(value)) return false;
          if (NATIVE.Nil(value)) return false;
          for (var propertyName in value) {
            try {
              if (propertyKeyType) {
                typeforce(propertyKeyType, propertyName, strict);
              }
            } catch (e) {
              throw tfSubError(e, propertyName, "key");
            }
            try {
              var propertyValue = value[propertyName];
              typeforce(propertyType, propertyValue, strict);
            } catch (e) {
              throw tfSubError(e, propertyName);
            }
          }
          return true;
        }
        if (propertyKeyType) {
          _map.toJSON = function() {
            return "{" + tfJSON(propertyKeyType) + ": " + tfJSON(propertyType) + "}";
          };
        } else {
          _map.toJSON = function() {
            return "{" + tfJSON(propertyType) + "}";
          };
        }
        return _map;
      },
      object: function object(uncompiled) {
        var type = {};
        for (var typePropertyName in uncompiled) {
          type[typePropertyName] = compile(uncompiled[typePropertyName]);
        }
        function _object(value, strict) {
          if (!NATIVE.Object(value)) return false;
          if (NATIVE.Nil(value)) return false;
          var propertyName;
          try {
            for (propertyName in type) {
              var propertyType = type[propertyName];
              var propertyValue = value[propertyName];
              typeforce(propertyType, propertyValue, strict);
            }
          } catch (e) {
            throw tfSubError(e, propertyName);
          }
          if (strict) {
            for (propertyName in value) {
              if (type[propertyName]) continue;
              throw new TfPropertyTypeError(void 0, propertyName);
            }
          }
          return true;
        }
        _object.toJSON = function() {
          return tfJSON(type);
        };
        return _object;
      },
      anyOf: function anyOf() {
        var types = [].slice.call(arguments).map(compile);
        function _anyOf(value, strict) {
          return types.some(function(type) {
            try {
              return typeforce(type, value, strict);
            } catch (e) {
              return false;
            }
          });
        }
        _anyOf.toJSON = function() {
          return types.map(tfJSON).join("|");
        };
        return _anyOf;
      },
      allOf: function allOf() {
        var types = [].slice.call(arguments).map(compile);
        function _allOf(value, strict) {
          return types.every(function(type) {
            try {
              return typeforce(type, value, strict);
            } catch (e) {
              return false;
            }
          });
        }
        _allOf.toJSON = function() {
          return types.map(tfJSON).join(" & ");
        };
        return _allOf;
      },
      quacksLike: function quacksLike(type) {
        function _quacksLike(value) {
          return type === getValueTypeName(value);
        }
        _quacksLike.toJSON = function() {
          return type;
        };
        return _quacksLike;
      },
      tuple: function tuple() {
        var types = [].slice.call(arguments).map(compile);
        function _tuple(values, strict) {
          if (NATIVE.Nil(values)) return false;
          if (NATIVE.Nil(values.length)) return false;
          if (strict && values.length !== types.length) return false;
          return types.every(function(type, i) {
            try {
              return typeforce(type, values[i], strict);
            } catch (e) {
              throw tfSubError(e, i);
            }
          });
        }
        _tuple.toJSON = function() {
          return "(" + types.map(tfJSON).join(", ") + ")";
        };
        return _tuple;
      },
      value: function value(expected) {
        function _value(actual) {
          return actual === expected;
        }
        _value.toJSON = function() {
          return expected;
        };
        return _value;
      }
    };
    TYPES.oneOf = TYPES.anyOf;
    function compile(type) {
      if (NATIVE.String(type)) {
        if (type[0] === "?") return TYPES.maybe(type.slice(1));
        return NATIVE[type] || TYPES.quacksLike(type);
      } else if (type && NATIVE.Object(type)) {
        if (NATIVE.Array(type)) {
          if (type.length !== 1) throw new TypeError("Expected compile() parameter of type Array of length 1");
          return TYPES.arrayOf(type[0]);
        }
        return TYPES.object(type);
      } else if (NATIVE.Function(type)) {
        return type;
      }
      return TYPES.value(type);
    }
    function typeforce(type, value, strict, surrogate) {
      if (NATIVE.Function(type)) {
        if (type(value, strict)) return true;
        throw new TfTypeError(surrogate || type, value);
      }
      return typeforce(compile(type), value, strict);
    }
    for (typeName in NATIVE) {
      typeforce[typeName] = NATIVE[typeName];
    }
    var typeName;
    for (typeName in TYPES) {
      typeforce[typeName] = TYPES[typeName];
    }
    var EXTRA = require_extra();
    for (typeName in EXTRA) {
      typeforce[typeName] = EXTRA[typeName];
    }
    typeforce.compile = compile;
    typeforce.TfTypeError = TfTypeError;
    typeforce.TfPropertyTypeError = TfPropertyTypeError;
    module.exports = typeforce;
  }
});

// node_modules/bitcoinjs-lib/src/types.js
var require_types = __commonJS({
  "node_modules/bitcoinjs-lib/src/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.oneOf = exports.Null = exports.BufferN = exports.Function = exports.UInt32 = exports.UInt8 = exports.tuple = exports.maybe = exports.Hex = exports.Buffer = exports.String = exports.Boolean = exports.Array = exports.Number = exports.Hash256bit = exports.Hash160bit = exports.Buffer256bit = exports.isTaptree = exports.isTapleaf = exports.TAPLEAF_VERSION_MASK = exports.Satoshi = exports.isPoint = exports.stacksEqual = exports.typeforce = void 0;
    var buffer_1 = require_buffer();
    exports.typeforce = require_typeforce();
    var ZERO32 = buffer_1.Buffer.alloc(32, 0);
    var EC_P = buffer_1.Buffer.from(
      "fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f",
      "hex"
    );
    function stacksEqual(a, b) {
      if (a.length !== b.length) return false;
      return a.every((x, i) => {
        return x.equals(b[i]);
      });
    }
    exports.stacksEqual = stacksEqual;
    function isPoint(p) {
      if (!buffer_1.Buffer.isBuffer(p)) return false;
      if (p.length < 33) return false;
      const t = p[0];
      const x = p.slice(1, 33);
      if (x.compare(ZERO32) === 0) return false;
      if (x.compare(EC_P) >= 0) return false;
      if ((t === 2 || t === 3) && p.length === 33) {
        return true;
      }
      const y = p.slice(33);
      if (y.compare(ZERO32) === 0) return false;
      if (y.compare(EC_P) >= 0) return false;
      if (t === 4 && p.length === 65) return true;
      return false;
    }
    exports.isPoint = isPoint;
    var SATOSHI_MAX = 21 * 1e14;
    function Satoshi(value) {
      return exports.typeforce.UInt53(value) && value <= SATOSHI_MAX;
    }
    exports.Satoshi = Satoshi;
    exports.TAPLEAF_VERSION_MASK = 254;
    function isTapleaf(o) {
      if (!o || !("output" in o)) return false;
      if (!buffer_1.Buffer.isBuffer(o.output)) return false;
      if (o.version !== void 0)
        return (o.version & exports.TAPLEAF_VERSION_MASK) === o.version;
      return true;
    }
    exports.isTapleaf = isTapleaf;
    function isTaptree(scriptTree) {
      if (!(0, exports.Array)(scriptTree)) return isTapleaf(scriptTree);
      if (scriptTree.length !== 2) return false;
      return scriptTree.every((t) => isTaptree(t));
    }
    exports.isTaptree = isTaptree;
    exports.Buffer256bit = exports.typeforce.BufferN(32);
    exports.Hash160bit = exports.typeforce.BufferN(20);
    exports.Hash256bit = exports.typeforce.BufferN(32);
    exports.Number = exports.typeforce.Number;
    exports.Array = exports.typeforce.Array;
    exports.Boolean = exports.typeforce.Boolean;
    exports.String = exports.typeforce.String;
    exports.Buffer = exports.typeforce.Buffer;
    exports.Hex = exports.typeforce.Hex;
    exports.maybe = exports.typeforce.maybe;
    exports.tuple = exports.typeforce.tuple;
    exports.UInt8 = exports.typeforce.UInt8;
    exports.UInt32 = exports.typeforce.UInt32;
    exports.Function = exports.typeforce.Function;
    exports.BufferN = exports.typeforce.BufferN;
    exports.Null = exports.typeforce.Null;
    exports.oneOf = exports.typeforce.oneOf;
  }
});

// node_modules/bitcoinjs-lib/src/script_signature.js
var require_script_signature = __commonJS({
  "node_modules/bitcoinjs-lib/src/script_signature.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.encode = exports.decode = void 0;
    var bip66 = require_bip66();
    var script_1 = require_script();
    var types = require_types();
    var { typeforce } = types;
    var ZERO = Buffer.alloc(1, 0);
    function toDER(x) {
      let i = 0;
      while (x[i] === 0) ++i;
      if (i === x.length) return ZERO;
      x = x.slice(i);
      if (x[0] & 128) return Buffer.concat([ZERO, x], 1 + x.length);
      return x;
    }
    function fromDER(x) {
      if (x[0] === 0) x = x.slice(1);
      const buffer = Buffer.alloc(32, 0);
      const bstart = Math.max(0, 32 - x.length);
      x.copy(buffer, bstart);
      return buffer;
    }
    function decode(buffer) {
      const hashType = buffer.readUInt8(buffer.length - 1);
      if (!(0, script_1.isDefinedHashType)(hashType)) {
        throw new Error("Invalid hashType " + hashType);
      }
      const decoded = bip66.decode(buffer.slice(0, -1));
      const r = fromDER(decoded.r);
      const s = fromDER(decoded.s);
      const signature = Buffer.concat([r, s], 64);
      return { signature, hashType };
    }
    exports.decode = decode;
    function encode(signature, hashType) {
      typeforce(
        {
          signature: types.BufferN(64),
          hashType: types.UInt8
        },
        { signature, hashType }
      );
      if (!(0, script_1.isDefinedHashType)(hashType)) {
        throw new Error("Invalid hashType " + hashType);
      }
      const hashTypeBuffer = Buffer.allocUnsafe(1);
      hashTypeBuffer.writeUInt8(hashType, 0);
      const r = toDER(signature.slice(0, 32));
      const s = toDER(signature.slice(32, 64));
      return Buffer.concat([bip66.encode(r, s), hashTypeBuffer]);
    }
    exports.encode = encode;
  }
});

// node_modules/bitcoinjs-lib/src/script.js
var require_script = __commonJS({
  "node_modules/bitcoinjs-lib/src/script.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.signature = exports.number = exports.isCanonicalScriptSignature = exports.isDefinedHashType = exports.isCanonicalPubKey = exports.toStack = exports.fromASM = exports.toASM = exports.decompile = exports.compile = exports.countNonPushOnlyOPs = exports.isPushOnly = exports.OPS = void 0;
    var bip66 = require_bip66();
    var ops_1 = require_ops();
    Object.defineProperty(exports, "OPS", {
      enumerable: true,
      get: function() {
        return ops_1.OPS;
      }
    });
    var pushdata = require_push_data();
    var scriptNumber = require_script_number();
    var scriptSignature = require_script_signature();
    var types = require_types();
    var { typeforce } = types;
    var OP_INT_BASE = ops_1.OPS.OP_RESERVED;
    function isOPInt(value) {
      return types.Number(value) && (value === ops_1.OPS.OP_0 || value >= ops_1.OPS.OP_1 && value <= ops_1.OPS.OP_16 || value === ops_1.OPS.OP_1NEGATE);
    }
    function isPushOnlyChunk(value) {
      return types.Buffer(value) || isOPInt(value);
    }
    function isPushOnly(value) {
      return types.Array(value) && value.every(isPushOnlyChunk);
    }
    exports.isPushOnly = isPushOnly;
    function countNonPushOnlyOPs(value) {
      return value.length - value.filter(isPushOnlyChunk).length;
    }
    exports.countNonPushOnlyOPs = countNonPushOnlyOPs;
    function asMinimalOP(buffer) {
      if (buffer.length === 0) return ops_1.OPS.OP_0;
      if (buffer.length !== 1) return;
      if (buffer[0] >= 1 && buffer[0] <= 16) return OP_INT_BASE + buffer[0];
      if (buffer[0] === 129) return ops_1.OPS.OP_1NEGATE;
    }
    function chunksIsBuffer(buf) {
      return Buffer.isBuffer(buf);
    }
    function chunksIsArray(buf) {
      return types.Array(buf);
    }
    function singleChunkIsBuffer(buf) {
      return Buffer.isBuffer(buf);
    }
    function compile(chunks) {
      if (chunksIsBuffer(chunks)) return chunks;
      typeforce(types.Array, chunks);
      const bufferSize = chunks.reduce((accum, chunk) => {
        if (singleChunkIsBuffer(chunk)) {
          if (chunk.length === 1 && asMinimalOP(chunk) !== void 0) {
            return accum + 1;
          }
          return accum + pushdata.encodingLength(chunk.length) + chunk.length;
        }
        return accum + 1;
      }, 0);
      const buffer = Buffer.allocUnsafe(bufferSize);
      let offset = 0;
      chunks.forEach((chunk) => {
        if (singleChunkIsBuffer(chunk)) {
          const opcode = asMinimalOP(chunk);
          if (opcode !== void 0) {
            buffer.writeUInt8(opcode, offset);
            offset += 1;
            return;
          }
          offset += pushdata.encode(buffer, chunk.length, offset);
          chunk.copy(buffer, offset);
          offset += chunk.length;
        } else {
          buffer.writeUInt8(chunk, offset);
          offset += 1;
        }
      });
      if (offset !== buffer.length) throw new Error("Could not decode chunks");
      return buffer;
    }
    exports.compile = compile;
    function decompile(buffer) {
      if (chunksIsArray(buffer)) return buffer;
      typeforce(types.Buffer, buffer);
      const chunks = [];
      let i = 0;
      while (i < buffer.length) {
        const opcode = buffer[i];
        if (opcode > ops_1.OPS.OP_0 && opcode <= ops_1.OPS.OP_PUSHDATA4) {
          const d = pushdata.decode(buffer, i);
          if (d === null) return null;
          i += d.size;
          if (i + d.number > buffer.length) return null;
          const data = buffer.slice(i, i + d.number);
          i += d.number;
          const op = asMinimalOP(data);
          if (op !== void 0) {
            chunks.push(op);
          } else {
            chunks.push(data);
          }
        } else {
          chunks.push(opcode);
          i += 1;
        }
      }
      return chunks;
    }
    exports.decompile = decompile;
    function toASM(chunks) {
      if (chunksIsBuffer(chunks)) {
        chunks = decompile(chunks);
      }
      if (!chunks) {
        throw new Error("Could not convert invalid chunks to ASM");
      }
      return chunks.map((chunk) => {
        if (singleChunkIsBuffer(chunk)) {
          const op = asMinimalOP(chunk);
          if (op === void 0) return chunk.toString("hex");
          chunk = op;
        }
        return ops_1.REVERSE_OPS[chunk];
      }).join(" ");
    }
    exports.toASM = toASM;
    function fromASM(asm) {
      typeforce(types.String, asm);
      return compile(
        asm.split(" ").map((chunkStr) => {
          if (ops_1.OPS[chunkStr] !== void 0) return ops_1.OPS[chunkStr];
          typeforce(types.Hex, chunkStr);
          return Buffer.from(chunkStr, "hex");
        })
      );
    }
    exports.fromASM = fromASM;
    function toStack(chunks) {
      chunks = decompile(chunks);
      typeforce(isPushOnly, chunks);
      return chunks.map((op) => {
        if (singleChunkIsBuffer(op)) return op;
        if (op === ops_1.OPS.OP_0) return Buffer.allocUnsafe(0);
        return scriptNumber.encode(op - OP_INT_BASE);
      });
    }
    exports.toStack = toStack;
    function isCanonicalPubKey(buffer) {
      return types.isPoint(buffer);
    }
    exports.isCanonicalPubKey = isCanonicalPubKey;
    function isDefinedHashType(hashType) {
      const hashTypeMod = hashType & ~128;
      return hashTypeMod > 0 && hashTypeMod < 4;
    }
    exports.isDefinedHashType = isDefinedHashType;
    function isCanonicalScriptSignature(buffer) {
      if (!Buffer.isBuffer(buffer)) return false;
      if (!isDefinedHashType(buffer[buffer.length - 1])) return false;
      return bip66.check(buffer.slice(0, -1));
    }
    exports.isCanonicalScriptSignature = isCanonicalScriptSignature;
    exports.number = scriptNumber;
    exports.signature = scriptSignature;
  }
});

// node_modules/bitcoinjs-lib/src/payments/lazy.js
var require_lazy = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/lazy.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.value = exports.prop = void 0;
    function prop(object, name, f) {
      Object.defineProperty(object, name, {
        configurable: true,
        enumerable: true,
        get() {
          const _value = f.call(this);
          this[name] = _value;
          return _value;
        },
        set(_value) {
          Object.defineProperty(this, name, {
            configurable: true,
            enumerable: true,
            value: _value,
            writable: true
          });
        }
      });
    }
    exports.prop = prop;
    function value(f) {
      let _value;
      return () => {
        if (_value !== void 0) return _value;
        _value = f();
        return _value;
      };
    }
    exports.value = value;
  }
});

// node_modules/bitcoinjs-lib/src/payments/embed.js
var require_embed = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/embed.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2data = void 0;
    var networks_1 = require_networks();
    var bscript = require_script();
    var types_1 = require_types();
    var lazy = require_lazy();
    var OPS = bscript.OPS;
    function p2data(a, opts) {
      if (!a.data && !a.output) throw new TypeError("Not enough data");
      opts = Object.assign({ validate: true }, opts || {});
      (0, types_1.typeforce)(
        {
          network: types_1.typeforce.maybe(types_1.typeforce.Object),
          output: types_1.typeforce.maybe(types_1.typeforce.Buffer),
          data: types_1.typeforce.maybe(
            types_1.typeforce.arrayOf(types_1.typeforce.Buffer)
          )
        },
        a
      );
      const network = a.network || networks_1.bitcoin;
      const o = { name: "embed", network };
      lazy.prop(o, "output", () => {
        if (!a.data) return;
        return bscript.compile([OPS.OP_RETURN].concat(a.data));
      });
      lazy.prop(o, "data", () => {
        if (!a.output) return;
        return bscript.decompile(a.output).slice(1);
      });
      if (opts.validate) {
        if (a.output) {
          const chunks = bscript.decompile(a.output);
          if (chunks[0] !== OPS.OP_RETURN) throw new TypeError("Output is invalid");
          if (!chunks.slice(1).every(types_1.typeforce.Buffer))
            throw new TypeError("Output is invalid");
          if (a.data && !(0, types_1.stacksEqual)(a.data, o.data))
            throw new TypeError("Data mismatch");
        }
      }
      return Object.assign(o, a);
    }
    exports.p2data = p2data;
  }
});

// node_modules/bitcoinjs-lib/src/payments/p2ms.js
var require_p2ms = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/p2ms.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2ms = void 0;
    var networks_1 = require_networks();
    var bscript = require_script();
    var types_1 = require_types();
    var lazy = require_lazy();
    var OPS = bscript.OPS;
    var OP_INT_BASE = OPS.OP_RESERVED;
    function p2ms(a, opts) {
      if (!a.input && !a.output && !(a.pubkeys && a.m !== void 0) && !a.signatures)
        throw new TypeError("Not enough data");
      opts = Object.assign({ validate: true }, opts || {});
      function isAcceptableSignature(x) {
        return bscript.isCanonicalScriptSignature(x) || (opts.allowIncomplete && x === OPS.OP_0) !== void 0;
      }
      (0, types_1.typeforce)(
        {
          network: types_1.typeforce.maybe(types_1.typeforce.Object),
          m: types_1.typeforce.maybe(types_1.typeforce.Number),
          n: types_1.typeforce.maybe(types_1.typeforce.Number),
          output: types_1.typeforce.maybe(types_1.typeforce.Buffer),
          pubkeys: types_1.typeforce.maybe(
            types_1.typeforce.arrayOf(types_1.isPoint)
          ),
          signatures: types_1.typeforce.maybe(
            types_1.typeforce.arrayOf(isAcceptableSignature)
          ),
          input: types_1.typeforce.maybe(types_1.typeforce.Buffer)
        },
        a
      );
      const network = a.network || networks_1.bitcoin;
      const o = { network };
      let chunks = [];
      let decoded = false;
      function decode(output) {
        if (decoded) return;
        decoded = true;
        chunks = bscript.decompile(output);
        o.m = chunks[0] - OP_INT_BASE;
        o.n = chunks[chunks.length - 2] - OP_INT_BASE;
        o.pubkeys = chunks.slice(1, -2);
      }
      lazy.prop(o, "output", () => {
        if (!a.m) return;
        if (!o.n) return;
        if (!a.pubkeys) return;
        return bscript.compile(
          [].concat(
            OP_INT_BASE + a.m,
            a.pubkeys,
            OP_INT_BASE + o.n,
            OPS.OP_CHECKMULTISIG
          )
        );
      });
      lazy.prop(o, "m", () => {
        if (!o.output) return;
        decode(o.output);
        return o.m;
      });
      lazy.prop(o, "n", () => {
        if (!o.pubkeys) return;
        return o.pubkeys.length;
      });
      lazy.prop(o, "pubkeys", () => {
        if (!a.output) return;
        decode(a.output);
        return o.pubkeys;
      });
      lazy.prop(o, "signatures", () => {
        if (!a.input) return;
        return bscript.decompile(a.input).slice(1);
      });
      lazy.prop(o, "input", () => {
        if (!a.signatures) return;
        return bscript.compile([OPS.OP_0].concat(a.signatures));
      });
      lazy.prop(o, "witness", () => {
        if (!o.input) return;
        return [];
      });
      lazy.prop(o, "name", () => {
        if (!o.m || !o.n) return;
        return `p2ms(${o.m} of ${o.n})`;
      });
      if (opts.validate) {
        if (a.output) {
          decode(a.output);
          if (!types_1.typeforce.Number(chunks[0]))
            throw new TypeError("Output is invalid");
          if (!types_1.typeforce.Number(chunks[chunks.length - 2]))
            throw new TypeError("Output is invalid");
          if (chunks[chunks.length - 1] !== OPS.OP_CHECKMULTISIG)
            throw new TypeError("Output is invalid");
          if (o.m <= 0 || o.n > 16 || o.m > o.n || o.n !== chunks.length - 3)
            throw new TypeError("Output is invalid");
          if (!o.pubkeys.every((x) => (0, types_1.isPoint)(x)))
            throw new TypeError("Output is invalid");
          if (a.m !== void 0 && a.m !== o.m) throw new TypeError("m mismatch");
          if (a.n !== void 0 && a.n !== o.n) throw new TypeError("n mismatch");
          if (a.pubkeys && !(0, types_1.stacksEqual)(a.pubkeys, o.pubkeys))
            throw new TypeError("Pubkeys mismatch");
        }
        if (a.pubkeys) {
          if (a.n !== void 0 && a.n !== a.pubkeys.length)
            throw new TypeError("Pubkey count mismatch");
          o.n = a.pubkeys.length;
          if (o.n < o.m) throw new TypeError("Pubkey count cannot be less than m");
        }
        if (a.signatures) {
          if (a.signatures.length < o.m)
            throw new TypeError("Not enough signatures provided");
          if (a.signatures.length > o.m)
            throw new TypeError("Too many signatures provided");
        }
        if (a.input) {
          if (a.input[0] !== OPS.OP_0) throw new TypeError("Input is invalid");
          if (o.signatures.length === 0 || !o.signatures.every(isAcceptableSignature))
            throw new TypeError("Input has invalid signature(s)");
          if (a.signatures && !(0, types_1.stacksEqual)(a.signatures, o.signatures))
            throw new TypeError("Signature mismatch");
          if (a.m !== void 0 && a.m !== a.signatures.length)
            throw new TypeError("Signature count mismatch");
        }
      }
      return Object.assign(o, a);
    }
    exports.p2ms = p2ms;
  }
});

// node_modules/bitcoinjs-lib/src/payments/p2pk.js
var require_p2pk = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/p2pk.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2pk = void 0;
    var networks_1 = require_networks();
    var bscript = require_script();
    var types_1 = require_types();
    var lazy = require_lazy();
    var OPS = bscript.OPS;
    function p2pk(a, opts) {
      if (!a.input && !a.output && !a.pubkey && !a.input && !a.signature)
        throw new TypeError("Not enough data");
      opts = Object.assign({ validate: true }, opts || {});
      (0, types_1.typeforce)(
        {
          network: types_1.typeforce.maybe(types_1.typeforce.Object),
          output: types_1.typeforce.maybe(types_1.typeforce.Buffer),
          pubkey: types_1.typeforce.maybe(types_1.isPoint),
          signature: types_1.typeforce.maybe(bscript.isCanonicalScriptSignature),
          input: types_1.typeforce.maybe(types_1.typeforce.Buffer)
        },
        a
      );
      const _chunks = lazy.value(() => {
        return bscript.decompile(a.input);
      });
      const network = a.network || networks_1.bitcoin;
      const o = { name: "p2pk", network };
      lazy.prop(o, "output", () => {
        if (!a.pubkey) return;
        return bscript.compile([a.pubkey, OPS.OP_CHECKSIG]);
      });
      lazy.prop(o, "pubkey", () => {
        if (!a.output) return;
        return a.output.slice(1, -1);
      });
      lazy.prop(o, "signature", () => {
        if (!a.input) return;
        return _chunks()[0];
      });
      lazy.prop(o, "input", () => {
        if (!a.signature) return;
        return bscript.compile([a.signature]);
      });
      lazy.prop(o, "witness", () => {
        if (!o.input) return;
        return [];
      });
      if (opts.validate) {
        if (a.output) {
          if (a.output[a.output.length - 1] !== OPS.OP_CHECKSIG)
            throw new TypeError("Output is invalid");
          if (!(0, types_1.isPoint)(o.pubkey))
            throw new TypeError("Output pubkey is invalid");
          if (a.pubkey && !a.pubkey.equals(o.pubkey))
            throw new TypeError("Pubkey mismatch");
        }
        if (a.signature) {
          if (a.input && !a.input.equals(o.input))
            throw new TypeError("Signature mismatch");
        }
        if (a.input) {
          if (_chunks().length !== 1) throw new TypeError("Input is invalid");
          if (!bscript.isCanonicalScriptSignature(o.signature))
            throw new TypeError("Input has invalid signature");
        }
      }
      return Object.assign(o, a);
    }
    exports.p2pk = p2pk;
  }
});

// node_modules/@noble/hashes/crypto.js
var require_crypto = __commonJS({
  "node_modules/@noble/hashes/crypto.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.crypto = void 0;
    exports.crypto = typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
  }
});

// node_modules/@noble/hashes/utils.js
var require_utils = __commonJS({
  "node_modules/@noble/hashes/utils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.wrapXOFConstructorWithOpts = exports.wrapConstructorWithOpts = exports.wrapConstructor = exports.Hash = exports.nextTick = exports.swap32IfBE = exports.byteSwapIfBE = exports.swap8IfBE = exports.isLE = void 0;
    exports.isBytes = isBytes;
    exports.anumber = anumber;
    exports.abytes = abytes;
    exports.ahash = ahash;
    exports.aexists = aexists;
    exports.aoutput = aoutput;
    exports.u8 = u8;
    exports.u32 = u32;
    exports.clean = clean;
    exports.createView = createView;
    exports.rotr = rotr;
    exports.rotl = rotl;
    exports.byteSwap = byteSwap;
    exports.byteSwap32 = byteSwap32;
    exports.bytesToHex = bytesToHex;
    exports.hexToBytes = hexToBytes;
    exports.asyncLoop = asyncLoop;
    exports.utf8ToBytes = utf8ToBytes;
    exports.bytesToUtf8 = bytesToUtf8;
    exports.toBytes = toBytes;
    exports.kdfInputToBytes = kdfInputToBytes;
    exports.concatBytes = concatBytes;
    exports.checkOpts = checkOpts;
    exports.createHasher = createHasher;
    exports.createOptHasher = createOptHasher;
    exports.createXOFer = createXOFer;
    exports.randomBytes = randomBytes;
    var crypto_1 = require_crypto();
    function isBytes(a) {
      return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
    }
    function anumber(n) {
      if (!Number.isSafeInteger(n) || n < 0)
        throw new Error("positive integer expected, got " + n);
    }
    function abytes(b, ...lengths) {
      if (!isBytes(b))
        throw new Error("Uint8Array expected");
      if (lengths.length > 0 && !lengths.includes(b.length))
        throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
    }
    function ahash(h) {
      if (typeof h !== "function" || typeof h.create !== "function")
        throw new Error("Hash should be wrapped by utils.createHasher");
      anumber(h.outputLen);
      anumber(h.blockLen);
    }
    function aexists(instance, checkFinished = true) {
      if (instance.destroyed)
        throw new Error("Hash instance has been destroyed");
      if (checkFinished && instance.finished)
        throw new Error("Hash#digest() has already been called");
    }
    function aoutput(out, instance) {
      abytes(out);
      const min = instance.outputLen;
      if (out.length < min) {
        throw new Error("digestInto() expects output buffer of length at least " + min);
      }
    }
    function u8(arr) {
      return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    }
    function u32(arr) {
      return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
    }
    function clean(...arrays) {
      for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
      }
    }
    function createView(arr) {
      return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    }
    function rotr(word, shift) {
      return word << 32 - shift | word >>> shift;
    }
    function rotl(word, shift) {
      return word << shift | word >>> 32 - shift >>> 0;
    }
    exports.isLE = (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
    function byteSwap(word) {
      return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
    }
    exports.swap8IfBE = exports.isLE ? (n) => n : (n) => byteSwap(n);
    exports.byteSwapIfBE = exports.swap8IfBE;
    function byteSwap32(arr) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = byteSwap(arr[i]);
      }
      return arr;
    }
    exports.swap32IfBE = exports.isLE ? (u) => u : byteSwap32;
    var hasHexBuiltin = /* @__PURE__ */ (() => (
      // @ts-ignore
      typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
    ))();
    var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    function bytesToHex(bytes) {
      abytes(bytes);
      if (hasHexBuiltin)
        return bytes.toHex();
      let hex = "";
      for (let i = 0; i < bytes.length; i++) {
        hex += hexes[bytes[i]];
      }
      return hex;
    }
    var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    function asciiToBase16(ch) {
      if (ch >= asciis._0 && ch <= asciis._9)
        return ch - asciis._0;
      if (ch >= asciis.A && ch <= asciis.F)
        return ch - (asciis.A - 10);
      if (ch >= asciis.a && ch <= asciis.f)
        return ch - (asciis.a - 10);
      return;
    }
    function hexToBytes(hex) {
      if (typeof hex !== "string")
        throw new Error("hex string expected, got " + typeof hex);
      if (hasHexBuiltin)
        return Uint8Array.fromHex(hex);
      const hl = hex.length;
      const al = hl / 2;
      if (hl % 2)
        throw new Error("hex string expected, got unpadded hex of length " + hl);
      const array = new Uint8Array(al);
      for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
        const n1 = asciiToBase16(hex.charCodeAt(hi));
        const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
        if (n1 === void 0 || n2 === void 0) {
          const char = hex[hi] + hex[hi + 1];
          throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
        }
        array[ai] = n1 * 16 + n2;
      }
      return array;
    }
    var nextTick = async () => {
    };
    exports.nextTick = nextTick;
    async function asyncLoop(iters, tick, cb) {
      let ts = Date.now();
      for (let i = 0; i < iters; i++) {
        cb(i);
        const diff = Date.now() - ts;
        if (diff >= 0 && diff < tick)
          continue;
        await (0, exports.nextTick)();
        ts += diff;
      }
    }
    function utf8ToBytes(str) {
      if (typeof str !== "string")
        throw new Error("string expected");
      return new Uint8Array(new TextEncoder().encode(str));
    }
    function bytesToUtf8(bytes) {
      return new TextDecoder().decode(bytes);
    }
    function toBytes(data) {
      if (typeof data === "string")
        data = utf8ToBytes(data);
      abytes(data);
      return data;
    }
    function kdfInputToBytes(data) {
      if (typeof data === "string")
        data = utf8ToBytes(data);
      abytes(data);
      return data;
    }
    function concatBytes(...arrays) {
      let sum = 0;
      for (let i = 0; i < arrays.length; i++) {
        const a = arrays[i];
        abytes(a);
        sum += a.length;
      }
      const res = new Uint8Array(sum);
      for (let i = 0, pad = 0; i < arrays.length; i++) {
        const a = arrays[i];
        res.set(a, pad);
        pad += a.length;
      }
      return res;
    }
    function checkOpts(defaults, opts) {
      if (opts !== void 0 && {}.toString.call(opts) !== "[object Object]")
        throw new Error("options should be object or undefined");
      const merged = Object.assign(defaults, opts);
      return merged;
    }
    var Hash = class {
    };
    exports.Hash = Hash;
    function createHasher(hashCons) {
      const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
      const tmp = hashCons();
      hashC.outputLen = tmp.outputLen;
      hashC.blockLen = tmp.blockLen;
      hashC.create = () => hashCons();
      return hashC;
    }
    function createOptHasher(hashCons) {
      const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
      const tmp = hashCons({});
      hashC.outputLen = tmp.outputLen;
      hashC.blockLen = tmp.blockLen;
      hashC.create = (opts) => hashCons(opts);
      return hashC;
    }
    function createXOFer(hashCons) {
      const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
      const tmp = hashCons({});
      hashC.outputLen = tmp.outputLen;
      hashC.blockLen = tmp.blockLen;
      hashC.create = (opts) => hashCons(opts);
      return hashC;
    }
    exports.wrapConstructor = createHasher;
    exports.wrapConstructorWithOpts = createOptHasher;
    exports.wrapXOFConstructorWithOpts = createXOFer;
    function randomBytes(bytesLength = 32) {
      if (crypto_1.crypto && typeof crypto_1.crypto.getRandomValues === "function") {
        return crypto_1.crypto.getRandomValues(new Uint8Array(bytesLength));
      }
      if (crypto_1.crypto && typeof crypto_1.crypto.randomBytes === "function") {
        return Uint8Array.from(crypto_1.crypto.randomBytes(bytesLength));
      }
      throw new Error("crypto.getRandomValues must be defined");
    }
  }
});

// node_modules/@noble/hashes/_md.js
var require_md = __commonJS({
  "node_modules/@noble/hashes/_md.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SHA512_IV = exports.SHA384_IV = exports.SHA224_IV = exports.SHA256_IV = exports.HashMD = void 0;
    exports.setBigUint64 = setBigUint64;
    exports.Chi = Chi;
    exports.Maj = Maj;
    var utils_ts_1 = require_utils();
    function setBigUint64(view, byteOffset, value, isLE) {
      if (typeof view.setBigUint64 === "function")
        return view.setBigUint64(byteOffset, value, isLE);
      const _32n = BigInt(32);
      const _u32_max = BigInt(4294967295);
      const wh = Number(value >> _32n & _u32_max);
      const wl = Number(value & _u32_max);
      const h = isLE ? 4 : 0;
      const l = isLE ? 0 : 4;
      view.setUint32(byteOffset + h, wh, isLE);
      view.setUint32(byteOffset + l, wl, isLE);
    }
    function Chi(a, b, c) {
      return a & b ^ ~a & c;
    }
    function Maj(a, b, c) {
      return a & b ^ a & c ^ b & c;
    }
    var HashMD = class extends utils_ts_1.Hash {
      constructor(blockLen, outputLen, padOffset, isLE) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = (0, utils_ts_1.createView)(this.buffer);
      }
      update(data) {
        (0, utils_ts_1.aexists)(this);
        data = (0, utils_ts_1.toBytes)(data);
        (0, utils_ts_1.abytes)(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = (0, utils_ts_1.createView)(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
          }
        }
        this.length += data.length;
        this.roundClean();
        return this;
      }
      digestInto(out) {
        (0, utils_ts_1.aexists)(this);
        (0, utils_ts_1.aoutput)(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        (0, utils_ts_1.clean)(this.buffer.subarray(pos));
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          pos = 0;
        }
        for (let i = pos; i < blockLen; i++)
          buffer[i] = 0;
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
        this.process(view, 0);
        const oview = (0, utils_ts_1.createView)(out);
        const len = this.outputLen;
        if (len % 4)
          throw new Error("_sha2: outputLen should be aligned to 32bit");
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
          throw new Error("_sha2: outputLen bigger than state");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    exports.HashMD = HashMD;
    exports.SHA256_IV = Uint32Array.from([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
    exports.SHA224_IV = Uint32Array.from([
      3238371032,
      914150663,
      812702999,
      4144912697,
      4290775857,
      1750603025,
      1694076839,
      3204075428
    ]);
    exports.SHA384_IV = Uint32Array.from([
      3418070365,
      3238371032,
      1654270250,
      914150663,
      2438529370,
      812702999,
      355462360,
      4144912697,
      1731405415,
      4290775857,
      2394180231,
      1750603025,
      3675008525,
      1694076839,
      1203062813,
      3204075428
    ]);
    exports.SHA512_IV = Uint32Array.from([
      1779033703,
      4089235720,
      3144134277,
      2227873595,
      1013904242,
      4271175723,
      2773480762,
      1595750129,
      1359893119,
      2917565137,
      2600822924,
      725511199,
      528734635,
      4215389547,
      1541459225,
      327033209
    ]);
  }
});

// node_modules/@noble/hashes/legacy.js
var require_legacy = __commonJS({
  "node_modules/@noble/hashes/legacy.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ripemd160 = exports.RIPEMD160 = exports.md5 = exports.MD5 = exports.sha1 = exports.SHA1 = void 0;
    var _md_ts_1 = require_md();
    var utils_ts_1 = require_utils();
    var SHA1_IV = /* @__PURE__ */ Uint32Array.from([
      1732584193,
      4023233417,
      2562383102,
      271733878,
      3285377520
    ]);
    var SHA1_W = /* @__PURE__ */ new Uint32Array(80);
    var SHA1 = class extends _md_ts_1.HashMD {
      constructor() {
        super(64, 20, 8, false);
        this.A = SHA1_IV[0] | 0;
        this.B = SHA1_IV[1] | 0;
        this.C = SHA1_IV[2] | 0;
        this.D = SHA1_IV[3] | 0;
        this.E = SHA1_IV[4] | 0;
      }
      get() {
        const { A, B, C, D, E } = this;
        return [A, B, C, D, E];
      }
      set(A, B, C, D, E) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA1_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 80; i++)
          SHA1_W[i] = (0, utils_ts_1.rotl)(SHA1_W[i - 3] ^ SHA1_W[i - 8] ^ SHA1_W[i - 14] ^ SHA1_W[i - 16], 1);
        let { A, B, C, D, E } = this;
        for (let i = 0; i < 80; i++) {
          let F, K2;
          if (i < 20) {
            F = (0, _md_ts_1.Chi)(B, C, D);
            K2 = 1518500249;
          } else if (i < 40) {
            F = B ^ C ^ D;
            K2 = 1859775393;
          } else if (i < 60) {
            F = (0, _md_ts_1.Maj)(B, C, D);
            K2 = 2400959708;
          } else {
            F = B ^ C ^ D;
            K2 = 3395469782;
          }
          const T = (0, utils_ts_1.rotl)(A, 5) + F + E + K2 + SHA1_W[i] | 0;
          E = D;
          D = C;
          C = (0, utils_ts_1.rotl)(B, 30);
          B = A;
          A = T;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        this.set(A, B, C, D, E);
      }
      roundClean() {
        (0, utils_ts_1.clean)(SHA1_W);
      }
      destroy() {
        this.set(0, 0, 0, 0, 0);
        (0, utils_ts_1.clean)(this.buffer);
      }
    };
    exports.SHA1 = SHA1;
    exports.sha1 = (0, utils_ts_1.createHasher)(() => new SHA1());
    var p32 = /* @__PURE__ */ Math.pow(2, 32);
    var K = /* @__PURE__ */ Array.from({ length: 64 }, (_, i) => Math.floor(p32 * Math.abs(Math.sin(i + 1))));
    var MD5_IV = /* @__PURE__ */ SHA1_IV.slice(0, 4);
    var MD5_W = /* @__PURE__ */ new Uint32Array(16);
    var MD5 = class extends _md_ts_1.HashMD {
      constructor() {
        super(64, 16, 8, true);
        this.A = MD5_IV[0] | 0;
        this.B = MD5_IV[1] | 0;
        this.C = MD5_IV[2] | 0;
        this.D = MD5_IV[3] | 0;
      }
      get() {
        const { A, B, C, D } = this;
        return [A, B, C, D];
      }
      set(A, B, C, D) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          MD5_W[i] = view.getUint32(offset, true);
        let { A, B, C, D } = this;
        for (let i = 0; i < 64; i++) {
          let F, g, s;
          if (i < 16) {
            F = (0, _md_ts_1.Chi)(B, C, D);
            g = i;
            s = [7, 12, 17, 22];
          } else if (i < 32) {
            F = (0, _md_ts_1.Chi)(D, B, C);
            g = (5 * i + 1) % 16;
            s = [5, 9, 14, 20];
          } else if (i < 48) {
            F = B ^ C ^ D;
            g = (3 * i + 5) % 16;
            s = [4, 11, 16, 23];
          } else {
            F = C ^ (B | ~D);
            g = 7 * i % 16;
            s = [6, 10, 15, 21];
          }
          F = F + A + K[i] + MD5_W[g];
          A = D;
          D = C;
          C = B;
          B = B + (0, utils_ts_1.rotl)(F, s[i % 4]);
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        this.set(A, B, C, D);
      }
      roundClean() {
        (0, utils_ts_1.clean)(MD5_W);
      }
      destroy() {
        this.set(0, 0, 0, 0);
        (0, utils_ts_1.clean)(this.buffer);
      }
    };
    exports.MD5 = MD5;
    exports.md5 = (0, utils_ts_1.createHasher)(() => new MD5());
    var Rho160 = /* @__PURE__ */ Uint8Array.from([
      7,
      4,
      13,
      1,
      10,
      6,
      15,
      3,
      12,
      0,
      9,
      5,
      2,
      14,
      11,
      8
    ]);
    var Id160 = /* @__PURE__ */ (() => Uint8Array.from(new Array(16).fill(0).map((_, i) => i)))();
    var Pi160 = /* @__PURE__ */ (() => Id160.map((i) => (9 * i + 5) % 16))();
    var idxLR = /* @__PURE__ */ (() => {
      const L = [Id160];
      const R = [Pi160];
      const res = [L, R];
      for (let i = 0; i < 4; i++)
        for (let j of res)
          j.push(j[i].map((k) => Rho160[k]));
      return res;
    })();
    var idxL = /* @__PURE__ */ (() => idxLR[0])();
    var idxR = /* @__PURE__ */ (() => idxLR[1])();
    var shifts160 = /* @__PURE__ */ [
      [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
      [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
      [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
      [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
      [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
    ].map((i) => Uint8Array.from(i));
    var shiftsL160 = /* @__PURE__ */ idxL.map((idx, i) => idx.map((j) => shifts160[i][j]));
    var shiftsR160 = /* @__PURE__ */ idxR.map((idx, i) => idx.map((j) => shifts160[i][j]));
    var Kl160 = /* @__PURE__ */ Uint32Array.from([
      0,
      1518500249,
      1859775393,
      2400959708,
      2840853838
    ]);
    var Kr160 = /* @__PURE__ */ Uint32Array.from([
      1352829926,
      1548603684,
      1836072691,
      2053994217,
      0
    ]);
    function ripemd_f(group, x, y, z) {
      if (group === 0)
        return x ^ y ^ z;
      if (group === 1)
        return x & y | ~x & z;
      if (group === 2)
        return (x | ~y) ^ z;
      if (group === 3)
        return x & z | y & ~z;
      return x ^ (y | ~z);
    }
    var BUF_160 = /* @__PURE__ */ new Uint32Array(16);
    var RIPEMD160 = class extends _md_ts_1.HashMD {
      constructor() {
        super(64, 20, 8, true);
        this.h0 = 1732584193 | 0;
        this.h1 = 4023233417 | 0;
        this.h2 = 2562383102 | 0;
        this.h3 = 271733878 | 0;
        this.h4 = 3285377520 | 0;
      }
      get() {
        const { h0, h1, h2, h3, h4 } = this;
        return [h0, h1, h2, h3, h4];
      }
      set(h0, h1, h2, h3, h4) {
        this.h0 = h0 | 0;
        this.h1 = h1 | 0;
        this.h2 = h2 | 0;
        this.h3 = h3 | 0;
        this.h4 = h4 | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          BUF_160[i] = view.getUint32(offset, true);
        let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
        for (let group = 0; group < 5; group++) {
          const rGroup = 4 - group;
          const hbl = Kl160[group], hbr = Kr160[group];
          const rl = idxL[group], rr = idxR[group];
          const sl = shiftsL160[group], sr = shiftsR160[group];
          for (let i = 0; i < 16; i++) {
            const tl = (0, utils_ts_1.rotl)(al + ripemd_f(group, bl, cl, dl) + BUF_160[rl[i]] + hbl, sl[i]) + el | 0;
            al = el, el = dl, dl = (0, utils_ts_1.rotl)(cl, 10) | 0, cl = bl, bl = tl;
          }
          for (let i = 0; i < 16; i++) {
            const tr = (0, utils_ts_1.rotl)(ar + ripemd_f(rGroup, br, cr, dr) + BUF_160[rr[i]] + hbr, sr[i]) + er | 0;
            ar = er, er = dr, dr = (0, utils_ts_1.rotl)(cr, 10) | 0, cr = br, br = tr;
          }
        }
        this.set(this.h1 + cl + dr | 0, this.h2 + dl + er | 0, this.h3 + el + ar | 0, this.h4 + al + br | 0, this.h0 + bl + cr | 0);
      }
      roundClean() {
        (0, utils_ts_1.clean)(BUF_160);
      }
      destroy() {
        this.destroyed = true;
        (0, utils_ts_1.clean)(this.buffer);
        this.set(0, 0, 0, 0, 0);
      }
    };
    exports.RIPEMD160 = RIPEMD160;
    exports.ripemd160 = (0, utils_ts_1.createHasher)(() => new RIPEMD160());
  }
});

// node_modules/@noble/hashes/ripemd160.js
var require_ripemd160 = __commonJS({
  "node_modules/@noble/hashes/ripemd160.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ripemd160 = exports.RIPEMD160 = void 0;
    var legacy_ts_1 = require_legacy();
    exports.RIPEMD160 = legacy_ts_1.RIPEMD160;
    exports.ripemd160 = legacy_ts_1.ripemd160;
  }
});

// node_modules/@noble/hashes/sha1.js
var require_sha1 = __commonJS({
  "node_modules/@noble/hashes/sha1.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sha1 = exports.SHA1 = void 0;
    var legacy_ts_1 = require_legacy();
    exports.SHA1 = legacy_ts_1.SHA1;
    exports.sha1 = legacy_ts_1.sha1;
  }
});

// node_modules/@noble/hashes/_u64.js
var require_u64 = __commonJS({
  "node_modules/@noble/hashes/_u64.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.toBig = exports.shrSL = exports.shrSH = exports.rotrSL = exports.rotrSH = exports.rotrBL = exports.rotrBH = exports.rotr32L = exports.rotr32H = exports.rotlSL = exports.rotlSH = exports.rotlBL = exports.rotlBH = exports.add5L = exports.add5H = exports.add4L = exports.add4H = exports.add3L = exports.add3H = void 0;
    exports.add = add;
    exports.fromBig = fromBig;
    exports.split = split;
    var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
    var _32n = /* @__PURE__ */ BigInt(32);
    function fromBig(n, le = false) {
      if (le)
        return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
      return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
    }
    function split(lst, le = false) {
      const len = lst.length;
      let Ah = new Uint32Array(len);
      let Al = new Uint32Array(len);
      for (let i = 0; i < len; i++) {
        const { h, l } = fromBig(lst[i], le);
        [Ah[i], Al[i]] = [h, l];
      }
      return [Ah, Al];
    }
    var toBig = (h, l) => BigInt(h >>> 0) << _32n | BigInt(l >>> 0);
    exports.toBig = toBig;
    var shrSH = (h, _l, s) => h >>> s;
    exports.shrSH = shrSH;
    var shrSL = (h, l, s) => h << 32 - s | l >>> s;
    exports.shrSL = shrSL;
    var rotrSH = (h, l, s) => h >>> s | l << 32 - s;
    exports.rotrSH = rotrSH;
    var rotrSL = (h, l, s) => h << 32 - s | l >>> s;
    exports.rotrSL = rotrSL;
    var rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
    exports.rotrBH = rotrBH;
    var rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
    exports.rotrBL = rotrBL;
    var rotr32H = (_h, l) => l;
    exports.rotr32H = rotr32H;
    var rotr32L = (h, _l) => h;
    exports.rotr32L = rotr32L;
    var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
    exports.rotlSH = rotlSH;
    var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
    exports.rotlSL = rotlSL;
    var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
    exports.rotlBH = rotlBH;
    var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
    exports.rotlBL = rotlBL;
    function add(Ah, Al, Bh, Bl) {
      const l = (Al >>> 0) + (Bl >>> 0);
      return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
    }
    var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    exports.add3L = add3L;
    var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
    exports.add3H = add3H;
    var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    exports.add4L = add4L;
    var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
    exports.add4H = add4H;
    var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    exports.add5L = add5L;
    var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;
    exports.add5H = add5H;
    var u64 = {
      fromBig,
      split,
      toBig,
      shrSH,
      shrSL,
      rotrSH,
      rotrSL,
      rotrBH,
      rotrBL,
      rotr32H,
      rotr32L,
      rotlSH,
      rotlSL,
      rotlBH,
      rotlBL,
      add,
      add3L,
      add3H,
      add4L,
      add4H,
      add5H,
      add5L
    };
    exports.default = u64;
  }
});

// node_modules/@noble/hashes/sha2.js
var require_sha2 = __commonJS({
  "node_modules/@noble/hashes/sha2.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sha512_224 = exports.sha512_256 = exports.sha384 = exports.sha512 = exports.sha224 = exports.sha256 = exports.SHA512_256 = exports.SHA512_224 = exports.SHA384 = exports.SHA512 = exports.SHA224 = exports.SHA256 = void 0;
    var _md_ts_1 = require_md();
    var u64 = require_u64();
    var utils_ts_1 = require_utils();
    var SHA256_K = /* @__PURE__ */ Uint32Array.from([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    var SHA256 = class extends _md_ts_1.HashMD {
      constructor(outputLen = 32) {
        super(64, outputLen, 8, false);
        this.A = _md_ts_1.SHA256_IV[0] | 0;
        this.B = _md_ts_1.SHA256_IV[1] | 0;
        this.C = _md_ts_1.SHA256_IV[2] | 0;
        this.D = _md_ts_1.SHA256_IV[3] | 0;
        this.E = _md_ts_1.SHA256_IV[4] | 0;
        this.F = _md_ts_1.SHA256_IV[5] | 0;
        this.G = _md_ts_1.SHA256_IV[6] | 0;
        this.H = _md_ts_1.SHA256_IV[7] | 0;
      }
      get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
      }
      // prettier-ignore
      set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const W15 = SHA256_W[i - 15];
          const W2 = SHA256_W[i - 2];
          const s0 = (0, utils_ts_1.rotr)(W15, 7) ^ (0, utils_ts_1.rotr)(W15, 18) ^ W15 >>> 3;
          const s1 = (0, utils_ts_1.rotr)(W2, 17) ^ (0, utils_ts_1.rotr)(W2, 19) ^ W2 >>> 10;
          SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
        }
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
          const sigma1 = (0, utils_ts_1.rotr)(E, 6) ^ (0, utils_ts_1.rotr)(E, 11) ^ (0, utils_ts_1.rotr)(E, 25);
          const T1 = H + sigma1 + (0, _md_ts_1.Chi)(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
          const sigma0 = (0, utils_ts_1.rotr)(A, 2) ^ (0, utils_ts_1.rotr)(A, 13) ^ (0, utils_ts_1.rotr)(A, 22);
          const T2 = sigma0 + (0, _md_ts_1.Maj)(A, B, C) | 0;
          H = G;
          G = F;
          F = E;
          E = D + T1 | 0;
          D = C;
          C = B;
          B = A;
          A = T1 + T2 | 0;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        F = F + this.F | 0;
        G = G + this.G | 0;
        H = H + this.H | 0;
        this.set(A, B, C, D, E, F, G, H);
      }
      roundClean() {
        (0, utils_ts_1.clean)(SHA256_W);
      }
      destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        (0, utils_ts_1.clean)(this.buffer);
      }
    };
    exports.SHA256 = SHA256;
    var SHA224 = class extends SHA256 {
      constructor() {
        super(28);
        this.A = _md_ts_1.SHA224_IV[0] | 0;
        this.B = _md_ts_1.SHA224_IV[1] | 0;
        this.C = _md_ts_1.SHA224_IV[2] | 0;
        this.D = _md_ts_1.SHA224_IV[3] | 0;
        this.E = _md_ts_1.SHA224_IV[4] | 0;
        this.F = _md_ts_1.SHA224_IV[5] | 0;
        this.G = _md_ts_1.SHA224_IV[6] | 0;
        this.H = _md_ts_1.SHA224_IV[7] | 0;
      }
    };
    exports.SHA224 = SHA224;
    var K512 = /* @__PURE__ */ (() => u64.split([
      "0x428a2f98d728ae22",
      "0x7137449123ef65cd",
      "0xb5c0fbcfec4d3b2f",
      "0xe9b5dba58189dbbc",
      "0x3956c25bf348b538",
      "0x59f111f1b605d019",
      "0x923f82a4af194f9b",
      "0xab1c5ed5da6d8118",
      "0xd807aa98a3030242",
      "0x12835b0145706fbe",
      "0x243185be4ee4b28c",
      "0x550c7dc3d5ffb4e2",
      "0x72be5d74f27b896f",
      "0x80deb1fe3b1696b1",
      "0x9bdc06a725c71235",
      "0xc19bf174cf692694",
      "0xe49b69c19ef14ad2",
      "0xefbe4786384f25e3",
      "0x0fc19dc68b8cd5b5",
      "0x240ca1cc77ac9c65",
      "0x2de92c6f592b0275",
      "0x4a7484aa6ea6e483",
      "0x5cb0a9dcbd41fbd4",
      "0x76f988da831153b5",
      "0x983e5152ee66dfab",
      "0xa831c66d2db43210",
      "0xb00327c898fb213f",
      "0xbf597fc7beef0ee4",
      "0xc6e00bf33da88fc2",
      "0xd5a79147930aa725",
      "0x06ca6351e003826f",
      "0x142929670a0e6e70",
      "0x27b70a8546d22ffc",
      "0x2e1b21385c26c926",
      "0x4d2c6dfc5ac42aed",
      "0x53380d139d95b3df",
      "0x650a73548baf63de",
      "0x766a0abb3c77b2a8",
      "0x81c2c92e47edaee6",
      "0x92722c851482353b",
      "0xa2bfe8a14cf10364",
      "0xa81a664bbc423001",
      "0xc24b8b70d0f89791",
      "0xc76c51a30654be30",
      "0xd192e819d6ef5218",
      "0xd69906245565a910",
      "0xf40e35855771202a",
      "0x106aa07032bbd1b8",
      "0x19a4c116b8d2d0c8",
      "0x1e376c085141ab53",
      "0x2748774cdf8eeb99",
      "0x34b0bcb5e19b48a8",
      "0x391c0cb3c5c95a63",
      "0x4ed8aa4ae3418acb",
      "0x5b9cca4f7763e373",
      "0x682e6ff3d6b2b8a3",
      "0x748f82ee5defb2fc",
      "0x78a5636f43172f60",
      "0x84c87814a1f0ab72",
      "0x8cc702081a6439ec",
      "0x90befffa23631e28",
      "0xa4506cebde82bde9",
      "0xbef9a3f7b2c67915",
      "0xc67178f2e372532b",
      "0xca273eceea26619c",
      "0xd186b8c721c0c207",
      "0xeada7dd6cde0eb1e",
      "0xf57d4f7fee6ed178",
      "0x06f067aa72176fba",
      "0x0a637dc5a2c898a6",
      "0x113f9804bef90dae",
      "0x1b710b35131c471b",
      "0x28db77f523047d84",
      "0x32caab7b40c72493",
      "0x3c9ebe0a15c9bebc",
      "0x431d67c49c100d4c",
      "0x4cc5d4becb3e42b6",
      "0x597f299cfc657e2a",
      "0x5fcb6fab3ad6faec",
      "0x6c44198c4a475817"
    ].map((n) => BigInt(n))))();
    var SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
    var SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
    var SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
    var SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
    var SHA512 = class extends _md_ts_1.HashMD {
      constructor(outputLen = 64) {
        super(128, outputLen, 16, false);
        this.Ah = _md_ts_1.SHA512_IV[0] | 0;
        this.Al = _md_ts_1.SHA512_IV[1] | 0;
        this.Bh = _md_ts_1.SHA512_IV[2] | 0;
        this.Bl = _md_ts_1.SHA512_IV[3] | 0;
        this.Ch = _md_ts_1.SHA512_IV[4] | 0;
        this.Cl = _md_ts_1.SHA512_IV[5] | 0;
        this.Dh = _md_ts_1.SHA512_IV[6] | 0;
        this.Dl = _md_ts_1.SHA512_IV[7] | 0;
        this.Eh = _md_ts_1.SHA512_IV[8] | 0;
        this.El = _md_ts_1.SHA512_IV[9] | 0;
        this.Fh = _md_ts_1.SHA512_IV[10] | 0;
        this.Fl = _md_ts_1.SHA512_IV[11] | 0;
        this.Gh = _md_ts_1.SHA512_IV[12] | 0;
        this.Gl = _md_ts_1.SHA512_IV[13] | 0;
        this.Hh = _md_ts_1.SHA512_IV[14] | 0;
        this.Hl = _md_ts_1.SHA512_IV[15] | 0;
      }
      // prettier-ignore
      get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
      }
      // prettier-ignore
      set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4) {
          SHA512_W_H[i] = view.getUint32(offset);
          SHA512_W_L[i] = view.getUint32(offset += 4);
        }
        for (let i = 16; i < 80; i++) {
          const W15h = SHA512_W_H[i - 15] | 0;
          const W15l = SHA512_W_L[i - 15] | 0;
          const s0h = u64.rotrSH(W15h, W15l, 1) ^ u64.rotrSH(W15h, W15l, 8) ^ u64.shrSH(W15h, W15l, 7);
          const s0l = u64.rotrSL(W15h, W15l, 1) ^ u64.rotrSL(W15h, W15l, 8) ^ u64.shrSL(W15h, W15l, 7);
          const W2h = SHA512_W_H[i - 2] | 0;
          const W2l = SHA512_W_L[i - 2] | 0;
          const s1h = u64.rotrSH(W2h, W2l, 19) ^ u64.rotrBH(W2h, W2l, 61) ^ u64.shrSH(W2h, W2l, 6);
          const s1l = u64.rotrSL(W2h, W2l, 19) ^ u64.rotrBL(W2h, W2l, 61) ^ u64.shrSL(W2h, W2l, 6);
          const SUMl = u64.add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
          const SUMh = u64.add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
          SHA512_W_H[i] = SUMh | 0;
          SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        for (let i = 0; i < 80; i++) {
          const sigma1h = u64.rotrSH(Eh, El, 14) ^ u64.rotrSH(Eh, El, 18) ^ u64.rotrBH(Eh, El, 41);
          const sigma1l = u64.rotrSL(Eh, El, 14) ^ u64.rotrSL(Eh, El, 18) ^ u64.rotrBL(Eh, El, 41);
          const CHIh = Eh & Fh ^ ~Eh & Gh;
          const CHIl = El & Fl ^ ~El & Gl;
          const T1ll = u64.add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
          const T1h = u64.add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
          const T1l = T1ll | 0;
          const sigma0h = u64.rotrSH(Ah, Al, 28) ^ u64.rotrBH(Ah, Al, 34) ^ u64.rotrBH(Ah, Al, 39);
          const sigma0l = u64.rotrSL(Ah, Al, 28) ^ u64.rotrBL(Ah, Al, 34) ^ u64.rotrBL(Ah, Al, 39);
          const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
          const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
          Hh = Gh | 0;
          Hl = Gl | 0;
          Gh = Fh | 0;
          Gl = Fl | 0;
          Fh = Eh | 0;
          Fl = El | 0;
          ({ h: Eh, l: El } = u64.add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
          Dh = Ch | 0;
          Dl = Cl | 0;
          Ch = Bh | 0;
          Cl = Bl | 0;
          Bh = Ah | 0;
          Bl = Al | 0;
          const All = u64.add3L(T1l, sigma0l, MAJl);
          Ah = u64.add3H(All, T1h, sigma0h, MAJh);
          Al = All | 0;
        }
        ({ h: Ah, l: Al } = u64.add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = u64.add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = u64.add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = u64.add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = u64.add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = u64.add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = u64.add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = u64.add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
      }
      roundClean() {
        (0, utils_ts_1.clean)(SHA512_W_H, SHA512_W_L);
      }
      destroy() {
        (0, utils_ts_1.clean)(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    };
    exports.SHA512 = SHA512;
    var SHA384 = class extends SHA512 {
      constructor() {
        super(48);
        this.Ah = _md_ts_1.SHA384_IV[0] | 0;
        this.Al = _md_ts_1.SHA384_IV[1] | 0;
        this.Bh = _md_ts_1.SHA384_IV[2] | 0;
        this.Bl = _md_ts_1.SHA384_IV[3] | 0;
        this.Ch = _md_ts_1.SHA384_IV[4] | 0;
        this.Cl = _md_ts_1.SHA384_IV[5] | 0;
        this.Dh = _md_ts_1.SHA384_IV[6] | 0;
        this.Dl = _md_ts_1.SHA384_IV[7] | 0;
        this.Eh = _md_ts_1.SHA384_IV[8] | 0;
        this.El = _md_ts_1.SHA384_IV[9] | 0;
        this.Fh = _md_ts_1.SHA384_IV[10] | 0;
        this.Fl = _md_ts_1.SHA384_IV[11] | 0;
        this.Gh = _md_ts_1.SHA384_IV[12] | 0;
        this.Gl = _md_ts_1.SHA384_IV[13] | 0;
        this.Hh = _md_ts_1.SHA384_IV[14] | 0;
        this.Hl = _md_ts_1.SHA384_IV[15] | 0;
      }
    };
    exports.SHA384 = SHA384;
    var T224_IV = /* @__PURE__ */ Uint32Array.from([
      2352822216,
      424955298,
      1944164710,
      2312950998,
      502970286,
      855612546,
      1738396948,
      1479516111,
      258812777,
      2077511080,
      2011393907,
      79989058,
      1067287976,
      1780299464,
      286451373,
      2446758561
    ]);
    var T256_IV = /* @__PURE__ */ Uint32Array.from([
      573645204,
      4230739756,
      2673172387,
      3360449730,
      596883563,
      1867755857,
      2520282905,
      1497426621,
      2519219938,
      2827943907,
      3193839141,
      1401305490,
      721525244,
      746961066,
      246885852,
      2177182882
    ]);
    var SHA512_224 = class extends SHA512 {
      constructor() {
        super(28);
        this.Ah = T224_IV[0] | 0;
        this.Al = T224_IV[1] | 0;
        this.Bh = T224_IV[2] | 0;
        this.Bl = T224_IV[3] | 0;
        this.Ch = T224_IV[4] | 0;
        this.Cl = T224_IV[5] | 0;
        this.Dh = T224_IV[6] | 0;
        this.Dl = T224_IV[7] | 0;
        this.Eh = T224_IV[8] | 0;
        this.El = T224_IV[9] | 0;
        this.Fh = T224_IV[10] | 0;
        this.Fl = T224_IV[11] | 0;
        this.Gh = T224_IV[12] | 0;
        this.Gl = T224_IV[13] | 0;
        this.Hh = T224_IV[14] | 0;
        this.Hl = T224_IV[15] | 0;
      }
    };
    exports.SHA512_224 = SHA512_224;
    var SHA512_256 = class extends SHA512 {
      constructor() {
        super(32);
        this.Ah = T256_IV[0] | 0;
        this.Al = T256_IV[1] | 0;
        this.Bh = T256_IV[2] | 0;
        this.Bl = T256_IV[3] | 0;
        this.Ch = T256_IV[4] | 0;
        this.Cl = T256_IV[5] | 0;
        this.Dh = T256_IV[6] | 0;
        this.Dl = T256_IV[7] | 0;
        this.Eh = T256_IV[8] | 0;
        this.El = T256_IV[9] | 0;
        this.Fh = T256_IV[10] | 0;
        this.Fl = T256_IV[11] | 0;
        this.Gh = T256_IV[12] | 0;
        this.Gl = T256_IV[13] | 0;
        this.Hh = T256_IV[14] | 0;
        this.Hl = T256_IV[15] | 0;
      }
    };
    exports.SHA512_256 = SHA512_256;
    exports.sha256 = (0, utils_ts_1.createHasher)(() => new SHA256());
    exports.sha224 = (0, utils_ts_1.createHasher)(() => new SHA224());
    exports.sha512 = (0, utils_ts_1.createHasher)(() => new SHA512());
    exports.sha384 = (0, utils_ts_1.createHasher)(() => new SHA384());
    exports.sha512_256 = (0, utils_ts_1.createHasher)(() => new SHA512_256());
    exports.sha512_224 = (0, utils_ts_1.createHasher)(() => new SHA512_224());
  }
});

// node_modules/@noble/hashes/sha256.js
var require_sha256 = __commonJS({
  "node_modules/@noble/hashes/sha256.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sha224 = exports.SHA224 = exports.sha256 = exports.SHA256 = void 0;
    var sha2_ts_1 = require_sha2();
    exports.SHA256 = sha2_ts_1.SHA256;
    exports.sha256 = sha2_ts_1.sha256;
    exports.SHA224 = sha2_ts_1.SHA224;
    exports.sha224 = sha2_ts_1.sha224;
  }
});

// node_modules/bitcoinjs-lib/src/crypto.js
var require_crypto2 = __commonJS({
  "node_modules/bitcoinjs-lib/src/crypto.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.taggedHash = exports.TAGGED_HASH_PREFIXES = exports.TAGS = exports.hash256 = exports.hash160 = exports.sha256 = exports.sha1 = exports.ripemd160 = void 0;
    var ripemd160_1 = require_ripemd160();
    var sha1_1 = require_sha1();
    var sha256_1 = require_sha256();
    function ripemd160(buffer) {
      return Buffer.from((0, ripemd160_1.ripemd160)(Uint8Array.from(buffer)));
    }
    exports.ripemd160 = ripemd160;
    function sha1(buffer) {
      return Buffer.from((0, sha1_1.sha1)(Uint8Array.from(buffer)));
    }
    exports.sha1 = sha1;
    function sha256(buffer) {
      return Buffer.from((0, sha256_1.sha256)(Uint8Array.from(buffer)));
    }
    exports.sha256 = sha256;
    function hash160(buffer) {
      return Buffer.from(
        (0, ripemd160_1.ripemd160)((0, sha256_1.sha256)(Uint8Array.from(buffer)))
      );
    }
    exports.hash160 = hash160;
    function hash256(buffer) {
      return Buffer.from(
        (0, sha256_1.sha256)((0, sha256_1.sha256)(Uint8Array.from(buffer)))
      );
    }
    exports.hash256 = hash256;
    exports.TAGS = [
      "BIP0340/challenge",
      "BIP0340/aux",
      "BIP0340/nonce",
      "TapLeaf",
      "TapBranch",
      "TapSighash",
      "TapTweak",
      "KeyAgg list",
      "KeyAgg coefficient"
    ];
    exports.TAGGED_HASH_PREFIXES = {
      "BIP0340/challenge": Buffer.from([
        123,
        181,
        45,
        122,
        159,
        239,
        88,
        50,
        62,
        177,
        191,
        122,
        64,
        125,
        179,
        130,
        210,
        243,
        242,
        216,
        27,
        177,
        34,
        79,
        73,
        254,
        81,
        143,
        109,
        72,
        211,
        124,
        123,
        181,
        45,
        122,
        159,
        239,
        88,
        50,
        62,
        177,
        191,
        122,
        64,
        125,
        179,
        130,
        210,
        243,
        242,
        216,
        27,
        177,
        34,
        79,
        73,
        254,
        81,
        143,
        109,
        72,
        211,
        124
      ]),
      "BIP0340/aux": Buffer.from([
        241,
        239,
        78,
        94,
        192,
        99,
        202,
        218,
        109,
        148,
        202,
        250,
        157,
        152,
        126,
        160,
        105,
        38,
        88,
        57,
        236,
        193,
        31,
        151,
        45,
        119,
        165,
        46,
        216,
        193,
        204,
        144,
        241,
        239,
        78,
        94,
        192,
        99,
        202,
        218,
        109,
        148,
        202,
        250,
        157,
        152,
        126,
        160,
        105,
        38,
        88,
        57,
        236,
        193,
        31,
        151,
        45,
        119,
        165,
        46,
        216,
        193,
        204,
        144
      ]),
      "BIP0340/nonce": Buffer.from([
        7,
        73,
        119,
        52,
        167,
        155,
        203,
        53,
        91,
        155,
        140,
        125,
        3,
        79,
        18,
        28,
        244,
        52,
        215,
        62,
        247,
        45,
        218,
        25,
        135,
        0,
        97,
        251,
        82,
        191,
        235,
        47,
        7,
        73,
        119,
        52,
        167,
        155,
        203,
        53,
        91,
        155,
        140,
        125,
        3,
        79,
        18,
        28,
        244,
        52,
        215,
        62,
        247,
        45,
        218,
        25,
        135,
        0,
        97,
        251,
        82,
        191,
        235,
        47
      ]),
      TapLeaf: Buffer.from([
        174,
        234,
        143,
        220,
        66,
        8,
        152,
        49,
        5,
        115,
        75,
        88,
        8,
        29,
        30,
        38,
        56,
        211,
        95,
        28,
        181,
        64,
        8,
        212,
        211,
        87,
        202,
        3,
        190,
        120,
        233,
        238,
        174,
        234,
        143,
        220,
        66,
        8,
        152,
        49,
        5,
        115,
        75,
        88,
        8,
        29,
        30,
        38,
        56,
        211,
        95,
        28,
        181,
        64,
        8,
        212,
        211,
        87,
        202,
        3,
        190,
        120,
        233,
        238
      ]),
      TapBranch: Buffer.from([
        25,
        65,
        161,
        242,
        229,
        110,
        185,
        95,
        162,
        169,
        241,
        148,
        190,
        92,
        1,
        247,
        33,
        111,
        51,
        237,
        130,
        176,
        145,
        70,
        52,
        144,
        208,
        91,
        245,
        22,
        160,
        21,
        25,
        65,
        161,
        242,
        229,
        110,
        185,
        95,
        162,
        169,
        241,
        148,
        190,
        92,
        1,
        247,
        33,
        111,
        51,
        237,
        130,
        176,
        145,
        70,
        52,
        144,
        208,
        91,
        245,
        22,
        160,
        21
      ]),
      TapSighash: Buffer.from([
        244,
        10,
        72,
        223,
        75,
        42,
        112,
        200,
        180,
        146,
        75,
        242,
        101,
        70,
        97,
        237,
        61,
        149,
        253,
        102,
        163,
        19,
        235,
        135,
        35,
        117,
        151,
        198,
        40,
        228,
        160,
        49,
        244,
        10,
        72,
        223,
        75,
        42,
        112,
        200,
        180,
        146,
        75,
        242,
        101,
        70,
        97,
        237,
        61,
        149,
        253,
        102,
        163,
        19,
        235,
        135,
        35,
        117,
        151,
        198,
        40,
        228,
        160,
        49
      ]),
      TapTweak: Buffer.from([
        232,
        15,
        225,
        99,
        156,
        156,
        160,
        80,
        227,
        175,
        27,
        57,
        193,
        67,
        198,
        62,
        66,
        156,
        188,
        235,
        21,
        217,
        64,
        251,
        181,
        197,
        161,
        244,
        175,
        87,
        197,
        233,
        232,
        15,
        225,
        99,
        156,
        156,
        160,
        80,
        227,
        175,
        27,
        57,
        193,
        67,
        198,
        62,
        66,
        156,
        188,
        235,
        21,
        217,
        64,
        251,
        181,
        197,
        161,
        244,
        175,
        87,
        197,
        233
      ]),
      "KeyAgg list": Buffer.from([
        72,
        28,
        151,
        28,
        60,
        11,
        70,
        215,
        240,
        178,
        117,
        174,
        89,
        141,
        78,
        44,
        126,
        215,
        49,
        156,
        89,
        74,
        92,
        110,
        199,
        158,
        160,
        212,
        153,
        2,
        148,
        240,
        72,
        28,
        151,
        28,
        60,
        11,
        70,
        215,
        240,
        178,
        117,
        174,
        89,
        141,
        78,
        44,
        126,
        215,
        49,
        156,
        89,
        74,
        92,
        110,
        199,
        158,
        160,
        212,
        153,
        2,
        148,
        240
      ]),
      "KeyAgg coefficient": Buffer.from([
        191,
        201,
        4,
        3,
        77,
        28,
        136,
        232,
        200,
        14,
        34,
        229,
        61,
        36,
        86,
        109,
        100,
        130,
        78,
        214,
        66,
        114,
        129,
        192,
        145,
        0,
        249,
        77,
        205,
        82,
        201,
        129,
        191,
        201,
        4,
        3,
        77,
        28,
        136,
        232,
        200,
        14,
        34,
        229,
        61,
        36,
        86,
        109,
        100,
        130,
        78,
        214,
        66,
        114,
        129,
        192,
        145,
        0,
        249,
        77,
        205,
        82,
        201,
        129
      ])
    };
    function taggedHash(prefix, data) {
      return sha256(Buffer.concat([exports.TAGGED_HASH_PREFIXES[prefix], data]));
    }
    exports.taggedHash = taggedHash;
  }
});

// node_modules/base-x/src/index.js
var require_src = __commonJS({
  "node_modules/base-x/src/index.js"(exports, module) {
    "use strict";
    function base(ALPHABET) {
      if (ALPHABET.length >= 255) {
        throw new TypeError("Alphabet too long");
      }
      var BASE_MAP = new Uint8Array(256);
      for (var j = 0; j < BASE_MAP.length; j++) {
        BASE_MAP[j] = 255;
      }
      for (var i = 0; i < ALPHABET.length; i++) {
        var x = ALPHABET.charAt(i);
        var xc = x.charCodeAt(0);
        if (BASE_MAP[xc] !== 255) {
          throw new TypeError(x + " is ambiguous");
        }
        BASE_MAP[xc] = i;
      }
      var BASE = ALPHABET.length;
      var LEADER = ALPHABET.charAt(0);
      var FACTOR = Math.log(BASE) / Math.log(256);
      var iFACTOR = Math.log(256) / Math.log(BASE);
      function encode(source) {
        if (source instanceof Uint8Array) {
        } else if (ArrayBuffer.isView(source)) {
          source = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        } else if (Array.isArray(source)) {
          source = Uint8Array.from(source);
        }
        if (!(source instanceof Uint8Array)) {
          throw new TypeError("Expected Uint8Array");
        }
        if (source.length === 0) {
          return "";
        }
        var zeroes = 0;
        var length = 0;
        var pbegin = 0;
        var pend = source.length;
        while (pbegin !== pend && source[pbegin] === 0) {
          pbegin++;
          zeroes++;
        }
        var size = (pend - pbegin) * iFACTOR + 1 >>> 0;
        var b58 = new Uint8Array(size);
        while (pbegin !== pend) {
          var carry = source[pbegin];
          var i2 = 0;
          for (var it1 = size - 1; (carry !== 0 || i2 < length) && it1 !== -1; it1--, i2++) {
            carry += 256 * b58[it1] >>> 0;
            b58[it1] = carry % BASE >>> 0;
            carry = carry / BASE >>> 0;
          }
          if (carry !== 0) {
            throw new Error("Non-zero carry");
          }
          length = i2;
          pbegin++;
        }
        var it2 = size - length;
        while (it2 !== size && b58[it2] === 0) {
          it2++;
        }
        var str = LEADER.repeat(zeroes);
        for (; it2 < size; ++it2) {
          str += ALPHABET.charAt(b58[it2]);
        }
        return str;
      }
      function decodeUnsafe(source) {
        if (typeof source !== "string") {
          throw new TypeError("Expected String");
        }
        if (source.length === 0) {
          return new Uint8Array();
        }
        var psz = 0;
        var zeroes = 0;
        var length = 0;
        while (source[psz] === LEADER) {
          zeroes++;
          psz++;
        }
        var size = (source.length - psz) * FACTOR + 1 >>> 0;
        var b256 = new Uint8Array(size);
        while (source[psz]) {
          var charCode = source.charCodeAt(psz);
          if (charCode > 255) {
            return;
          }
          var carry = BASE_MAP[charCode];
          if (carry === 255) {
            return;
          }
          var i2 = 0;
          for (var it3 = size - 1; (carry !== 0 || i2 < length) && it3 !== -1; it3--, i2++) {
            carry += BASE * b256[it3] >>> 0;
            b256[it3] = carry % 256 >>> 0;
            carry = carry / 256 >>> 0;
          }
          if (carry !== 0) {
            throw new Error("Non-zero carry");
          }
          length = i2;
          psz++;
        }
        var it4 = size - length;
        while (it4 !== size && b256[it4] === 0) {
          it4++;
        }
        var vch = new Uint8Array(zeroes + (size - it4));
        var j2 = zeroes;
        while (it4 !== size) {
          vch[j2++] = b256[it4++];
        }
        return vch;
      }
      function decode(string) {
        var buffer = decodeUnsafe(string);
        if (buffer) {
          return buffer;
        }
        throw new Error("Non-base" + BASE + " character");
      }
      return {
        encode,
        decodeUnsafe,
        decode
      };
    }
    module.exports = base;
  }
});

// node_modules/bs58/index.js
var require_bs58 = __commonJS({
  "node_modules/bs58/index.js"(exports, module) {
    "use strict";
    var basex = require_src();
    var ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    module.exports = basex(ALPHABET);
  }
});

// node_modules/bs58check/base.js
var require_base = __commonJS({
  "node_modules/bs58check/base.js"(exports, module) {
    "use strict";
    var base58 = require_bs58();
    module.exports = function(checksumFn) {
      function encode(payload) {
        var payloadU8 = Uint8Array.from(payload);
        var checksum = checksumFn(payloadU8);
        var length = payloadU8.length + 4;
        var both = new Uint8Array(length);
        both.set(payloadU8, 0);
        both.set(checksum.subarray(0, 4), payloadU8.length);
        return base58.encode(both, length);
      }
      function decodeRaw(buffer) {
        var payload = buffer.slice(0, -4);
        var checksum = buffer.slice(-4);
        var newChecksum = checksumFn(payload);
        if (checksum[0] ^ newChecksum[0] | checksum[1] ^ newChecksum[1] | checksum[2] ^ newChecksum[2] | checksum[3] ^ newChecksum[3]) return;
        return payload;
      }
      function decodeUnsafe(string) {
        var buffer = base58.decodeUnsafe(string);
        if (!buffer) return;
        return decodeRaw(buffer);
      }
      function decode(string) {
        var buffer = base58.decode(string);
        var payload = decodeRaw(buffer, checksumFn);
        if (!payload) throw new Error("Invalid checksum");
        return payload;
      }
      return {
        encode,
        decode,
        decodeUnsafe
      };
    };
  }
});

// node_modules/bs58check/index.js
var require_bs58check = __commonJS({
  "node_modules/bs58check/index.js"(exports, module) {
    "use strict";
    var { sha256 } = require_sha256();
    var bs58checkBase = require_base();
    function sha256x2(buffer) {
      return sha256(sha256(buffer));
    }
    module.exports = bs58checkBase(sha256x2);
  }
});

// node_modules/bitcoinjs-lib/src/payments/p2pkh.js
var require_p2pkh = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/p2pkh.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2pkh = void 0;
    var bcrypto = require_crypto2();
    var networks_1 = require_networks();
    var bscript = require_script();
    var types_1 = require_types();
    var lazy = require_lazy();
    var bs58check = require_bs58check();
    var OPS = bscript.OPS;
    function p2pkh(a, opts) {
      if (!a.address && !a.hash && !a.output && !a.pubkey && !a.input)
        throw new TypeError("Not enough data");
      opts = Object.assign({ validate: true }, opts || {});
      (0, types_1.typeforce)(
        {
          network: types_1.typeforce.maybe(types_1.typeforce.Object),
          address: types_1.typeforce.maybe(types_1.typeforce.String),
          hash: types_1.typeforce.maybe(types_1.typeforce.BufferN(20)),
          output: types_1.typeforce.maybe(types_1.typeforce.BufferN(25)),
          pubkey: types_1.typeforce.maybe(types_1.isPoint),
          signature: types_1.typeforce.maybe(bscript.isCanonicalScriptSignature),
          input: types_1.typeforce.maybe(types_1.typeforce.Buffer)
        },
        a
      );
      const _address = lazy.value(() => {
        const payload = Buffer.from(bs58check.decode(a.address));
        const version = payload.readUInt8(0);
        const hash = payload.slice(1);
        return { version, hash };
      });
      const _chunks = lazy.value(() => {
        return bscript.decompile(a.input);
      });
      const network = a.network || networks_1.bitcoin;
      const o = { name: "p2pkh", network };
      lazy.prop(o, "address", () => {
        if (!o.hash) return;
        const payload = Buffer.allocUnsafe(21);
        payload.writeUInt8(network.pubKeyHash, 0);
        o.hash.copy(payload, 1);
        return bs58check.encode(payload);
      });
      lazy.prop(o, "hash", () => {
        if (a.output) return a.output.slice(3, 23);
        if (a.address) return _address().hash;
        if (a.pubkey || o.pubkey) return bcrypto.hash160(a.pubkey || o.pubkey);
      });
      lazy.prop(o, "output", () => {
        if (!o.hash) return;
        return bscript.compile([
          OPS.OP_DUP,
          OPS.OP_HASH160,
          o.hash,
          OPS.OP_EQUALVERIFY,
          OPS.OP_CHECKSIG
        ]);
      });
      lazy.prop(o, "pubkey", () => {
        if (!a.input) return;
        return _chunks()[1];
      });
      lazy.prop(o, "signature", () => {
        if (!a.input) return;
        return _chunks()[0];
      });
      lazy.prop(o, "input", () => {
        if (!a.pubkey) return;
        if (!a.signature) return;
        return bscript.compile([a.signature, a.pubkey]);
      });
      lazy.prop(o, "witness", () => {
        if (!o.input) return;
        return [];
      });
      if (opts.validate) {
        let hash = Buffer.from([]);
        if (a.address) {
          if (_address().version !== network.pubKeyHash)
            throw new TypeError("Invalid version or Network mismatch");
          if (_address().hash.length !== 20) throw new TypeError("Invalid address");
          hash = _address().hash;
        }
        if (a.hash) {
          if (hash.length > 0 && !hash.equals(a.hash))
            throw new TypeError("Hash mismatch");
          else hash = a.hash;
        }
        if (a.output) {
          if (a.output.length !== 25 || a.output[0] !== OPS.OP_DUP || a.output[1] !== OPS.OP_HASH160 || a.output[2] !== 20 || a.output[23] !== OPS.OP_EQUALVERIFY || a.output[24] !== OPS.OP_CHECKSIG)
            throw new TypeError("Output is invalid");
          const hash2 = a.output.slice(3, 23);
          if (hash.length > 0 && !hash.equals(hash2))
            throw new TypeError("Hash mismatch");
          else hash = hash2;
        }
        if (a.pubkey) {
          const pkh = bcrypto.hash160(a.pubkey);
          if (hash.length > 0 && !hash.equals(pkh))
            throw new TypeError("Hash mismatch");
          else hash = pkh;
        }
        if (a.input) {
          const chunks = _chunks();
          if (chunks.length !== 2) throw new TypeError("Input is invalid");
          if (!bscript.isCanonicalScriptSignature(chunks[0]))
            throw new TypeError("Input has invalid signature");
          if (!(0, types_1.isPoint)(chunks[1]))
            throw new TypeError("Input has invalid pubkey");
          if (a.signature && !a.signature.equals(chunks[0]))
            throw new TypeError("Signature mismatch");
          if (a.pubkey && !a.pubkey.equals(chunks[1]))
            throw new TypeError("Pubkey mismatch");
          const pkh = bcrypto.hash160(chunks[1]);
          if (hash.length > 0 && !hash.equals(pkh))
            throw new TypeError("Hash mismatch");
        }
      }
      return Object.assign(o, a);
    }
    exports.p2pkh = p2pkh;
  }
});

// node_modules/bitcoinjs-lib/src/payments/p2sh.js
var require_p2sh = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/p2sh.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2sh = void 0;
    var bcrypto = require_crypto2();
    var networks_1 = require_networks();
    var bscript = require_script();
    var types_1 = require_types();
    var lazy = require_lazy();
    var bs58check = require_bs58check();
    var OPS = bscript.OPS;
    function p2sh(a, opts) {
      if (!a.address && !a.hash && !a.output && !a.redeem && !a.input)
        throw new TypeError("Not enough data");
      opts = Object.assign({ validate: true }, opts || {});
      (0, types_1.typeforce)(
        {
          network: types_1.typeforce.maybe(types_1.typeforce.Object),
          address: types_1.typeforce.maybe(types_1.typeforce.String),
          hash: types_1.typeforce.maybe(types_1.typeforce.BufferN(20)),
          output: types_1.typeforce.maybe(types_1.typeforce.BufferN(23)),
          redeem: types_1.typeforce.maybe({
            network: types_1.typeforce.maybe(types_1.typeforce.Object),
            output: types_1.typeforce.maybe(types_1.typeforce.Buffer),
            input: types_1.typeforce.maybe(types_1.typeforce.Buffer),
            witness: types_1.typeforce.maybe(
              types_1.typeforce.arrayOf(types_1.typeforce.Buffer)
            )
          }),
          input: types_1.typeforce.maybe(types_1.typeforce.Buffer),
          witness: types_1.typeforce.maybe(
            types_1.typeforce.arrayOf(types_1.typeforce.Buffer)
          )
        },
        a
      );
      let network = a.network;
      if (!network) {
        network = a.redeem && a.redeem.network || networks_1.bitcoin;
      }
      const o = { network };
      const _address = lazy.value(() => {
        const payload = Buffer.from(bs58check.decode(a.address));
        const version = payload.readUInt8(0);
        const hash = payload.slice(1);
        return { version, hash };
      });
      const _chunks = lazy.value(() => {
        return bscript.decompile(a.input);
      });
      const _redeem = lazy.value(() => {
        const chunks = _chunks();
        const lastChunk = chunks[chunks.length - 1];
        return {
          network,
          output: lastChunk === OPS.OP_FALSE ? Buffer.from([]) : lastChunk,
          input: bscript.compile(chunks.slice(0, -1)),
          witness: a.witness || []
        };
      });
      lazy.prop(o, "address", () => {
        if (!o.hash) return;
        const payload = Buffer.allocUnsafe(21);
        payload.writeUInt8(o.network.scriptHash, 0);
        o.hash.copy(payload, 1);
        return bs58check.encode(payload);
      });
      lazy.prop(o, "hash", () => {
        if (a.output) return a.output.slice(2, 22);
        if (a.address) return _address().hash;
        if (o.redeem && o.redeem.output) return bcrypto.hash160(o.redeem.output);
      });
      lazy.prop(o, "output", () => {
        if (!o.hash) return;
        return bscript.compile([OPS.OP_HASH160, o.hash, OPS.OP_EQUAL]);
      });
      lazy.prop(o, "redeem", () => {
        if (!a.input) return;
        return _redeem();
      });
      lazy.prop(o, "input", () => {
        if (!a.redeem || !a.redeem.input || !a.redeem.output) return;
        return bscript.compile(
          [].concat(bscript.decompile(a.redeem.input), a.redeem.output)
        );
      });
      lazy.prop(o, "witness", () => {
        if (o.redeem && o.redeem.witness) return o.redeem.witness;
        if (o.input) return [];
      });
      lazy.prop(o, "name", () => {
        const nameParts = ["p2sh"];
        if (o.redeem !== void 0 && o.redeem.name !== void 0)
          nameParts.push(o.redeem.name);
        return nameParts.join("-");
      });
      if (opts.validate) {
        let hash = Buffer.from([]);
        if (a.address) {
          if (_address().version !== network.scriptHash)
            throw new TypeError("Invalid version or Network mismatch");
          if (_address().hash.length !== 20) throw new TypeError("Invalid address");
          hash = _address().hash;
        }
        if (a.hash) {
          if (hash.length > 0 && !hash.equals(a.hash))
            throw new TypeError("Hash mismatch");
          else hash = a.hash;
        }
        if (a.output) {
          if (a.output.length !== 23 || a.output[0] !== OPS.OP_HASH160 || a.output[1] !== 20 || a.output[22] !== OPS.OP_EQUAL)
            throw new TypeError("Output is invalid");
          const hash2 = a.output.slice(2, 22);
          if (hash.length > 0 && !hash.equals(hash2))
            throw new TypeError("Hash mismatch");
          else hash = hash2;
        }
        const checkRedeem = (redeem) => {
          if (redeem.output) {
            const decompile = bscript.decompile(redeem.output);
            if (!decompile || decompile.length < 1)
              throw new TypeError("Redeem.output too short");
            if (redeem.output.byteLength > 520)
              throw new TypeError(
                "Redeem.output unspendable if larger than 520 bytes"
              );
            if (bscript.countNonPushOnlyOPs(decompile) > 201)
              throw new TypeError(
                "Redeem.output unspendable with more than 201 non-push ops"
              );
            const hash2 = bcrypto.hash160(redeem.output);
            if (hash.length > 0 && !hash.equals(hash2))
              throw new TypeError("Hash mismatch");
            else hash = hash2;
          }
          if (redeem.input) {
            const hasInput = redeem.input.length > 0;
            const hasWitness = redeem.witness && redeem.witness.length > 0;
            if (!hasInput && !hasWitness) throw new TypeError("Empty input");
            if (hasInput && hasWitness)
              throw new TypeError("Input and witness provided");
            if (hasInput) {
              const richunks = bscript.decompile(redeem.input);
              if (!bscript.isPushOnly(richunks))
                throw new TypeError("Non push-only scriptSig");
            }
          }
        };
        if (a.input) {
          const chunks = _chunks();
          if (!chunks || chunks.length < 1) throw new TypeError("Input too short");
          if (!Buffer.isBuffer(_redeem().output))
            throw new TypeError("Input is invalid");
          checkRedeem(_redeem());
        }
        if (a.redeem) {
          if (a.redeem.network && a.redeem.network !== network)
            throw new TypeError("Network mismatch");
          if (a.input) {
            const redeem = _redeem();
            if (a.redeem.output && !a.redeem.output.equals(redeem.output))
              throw new TypeError("Redeem.output mismatch");
            if (a.redeem.input && !a.redeem.input.equals(redeem.input))
              throw new TypeError("Redeem.input mismatch");
          }
          checkRedeem(a.redeem);
        }
        if (a.witness) {
          if (a.redeem && a.redeem.witness && !(0, types_1.stacksEqual)(a.redeem.witness, a.witness))
            throw new TypeError("Witness and redeem.witness mismatch");
        }
      }
      return Object.assign(o, a);
    }
    exports.p2sh = p2sh;
  }
});

// ../node_modules/bech32/dist/index.js
var require_dist = __commonJS({
  "../node_modules/bech32/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.bech32m = exports.bech32 = void 0;
    var ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    var ALPHABET_MAP = {};
    for (let z = 0; z < ALPHABET.length; z++) {
      const x = ALPHABET.charAt(z);
      ALPHABET_MAP[x] = z;
    }
    function polymodStep(pre) {
      const b = pre >> 25;
      return (pre & 33554431) << 5 ^ -(b >> 0 & 1) & 996825010 ^ -(b >> 1 & 1) & 642813549 ^ -(b >> 2 & 1) & 513874426 ^ -(b >> 3 & 1) & 1027748829 ^ -(b >> 4 & 1) & 705979059;
    }
    function prefixChk(prefix) {
      let chk = 1;
      for (let i = 0; i < prefix.length; ++i) {
        const c = prefix.charCodeAt(i);
        if (c < 33 || c > 126)
          return "Invalid prefix (" + prefix + ")";
        chk = polymodStep(chk) ^ c >> 5;
      }
      chk = polymodStep(chk);
      for (let i = 0; i < prefix.length; ++i) {
        const v = prefix.charCodeAt(i);
        chk = polymodStep(chk) ^ v & 31;
      }
      return chk;
    }
    function convert(data, inBits, outBits, pad) {
      let value = 0;
      let bits = 0;
      const maxV = (1 << outBits) - 1;
      const result = [];
      for (let i = 0; i < data.length; ++i) {
        value = value << inBits | data[i];
        bits += inBits;
        while (bits >= outBits) {
          bits -= outBits;
          result.push(value >> bits & maxV);
        }
      }
      if (pad) {
        if (bits > 0) {
          result.push(value << outBits - bits & maxV);
        }
      } else {
        if (bits >= inBits)
          return "Excess padding";
        if (value << outBits - bits & maxV)
          return "Non-zero padding";
      }
      return result;
    }
    function toWords(bytes) {
      return convert(bytes, 8, 5, true);
    }
    function fromWordsUnsafe(words) {
      const res = convert(words, 5, 8, false);
      if (Array.isArray(res))
        return res;
    }
    function fromWords(words) {
      const res = convert(words, 5, 8, false);
      if (Array.isArray(res))
        return res;
      throw new Error(res);
    }
    function getLibraryFromEncoding(encoding) {
      let ENCODING_CONST;
      if (encoding === "bech32") {
        ENCODING_CONST = 1;
      } else {
        ENCODING_CONST = 734539939;
      }
      function encode(prefix, words, LIMIT) {
        LIMIT = LIMIT || 90;
        if (prefix.length + 7 + words.length > LIMIT)
          throw new TypeError("Exceeds length limit");
        prefix = prefix.toLowerCase();
        let chk = prefixChk(prefix);
        if (typeof chk === "string")
          throw new Error(chk);
        let result = prefix + "1";
        for (let i = 0; i < words.length; ++i) {
          const x = words[i];
          if (x >> 5 !== 0)
            throw new Error("Non 5-bit word");
          chk = polymodStep(chk) ^ x;
          result += ALPHABET.charAt(x);
        }
        for (let i = 0; i < 6; ++i) {
          chk = polymodStep(chk);
        }
        chk ^= ENCODING_CONST;
        for (let i = 0; i < 6; ++i) {
          const v = chk >> (5 - i) * 5 & 31;
          result += ALPHABET.charAt(v);
        }
        return result;
      }
      function __decode(str, LIMIT) {
        LIMIT = LIMIT || 90;
        if (str.length < 8)
          return str + " too short";
        if (str.length > LIMIT)
          return "Exceeds length limit";
        const lowered = str.toLowerCase();
        const uppered = str.toUpperCase();
        if (str !== lowered && str !== uppered)
          return "Mixed-case string " + str;
        str = lowered;
        const split = str.lastIndexOf("1");
        if (split === -1)
          return "No separator character for " + str;
        if (split === 0)
          return "Missing prefix for " + str;
        const prefix = str.slice(0, split);
        const wordChars = str.slice(split + 1);
        if (wordChars.length < 6)
          return "Data too short";
        let chk = prefixChk(prefix);
        if (typeof chk === "string")
          return chk;
        const words = [];
        for (let i = 0; i < wordChars.length; ++i) {
          const c = wordChars.charAt(i);
          const v = ALPHABET_MAP[c];
          if (v === void 0)
            return "Unknown character " + c;
          chk = polymodStep(chk) ^ v;
          if (i + 6 >= wordChars.length)
            continue;
          words.push(v);
        }
        if (chk !== ENCODING_CONST)
          return "Invalid checksum for " + str;
        return { prefix, words };
      }
      function decodeUnsafe(str, LIMIT) {
        const res = __decode(str, LIMIT);
        if (typeof res === "object")
          return res;
      }
      function decode(str, LIMIT) {
        const res = __decode(str, LIMIT);
        if (typeof res === "object")
          return res;
        throw new Error(res);
      }
      return {
        decodeUnsafe,
        decode,
        encode,
        toWords,
        fromWordsUnsafe,
        fromWords
      };
    }
    exports.bech32 = getLibraryFromEncoding("bech32");
    exports.bech32m = getLibraryFromEncoding("bech32m");
  }
});

// node_modules/bitcoinjs-lib/src/payments/p2wpkh.js
var require_p2wpkh = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/p2wpkh.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2wpkh = void 0;
    var bcrypto = require_crypto2();
    var networks_1 = require_networks();
    var bscript = require_script();
    var types_1 = require_types();
    var lazy = require_lazy();
    var bech32_1 = require_dist();
    var OPS = bscript.OPS;
    var EMPTY_BUFFER = Buffer.alloc(0);
    function p2wpkh(a, opts) {
      if (!a.address && !a.hash && !a.output && !a.pubkey && !a.witness)
        throw new TypeError("Not enough data");
      opts = Object.assign({ validate: true }, opts || {});
      (0, types_1.typeforce)(
        {
          address: types_1.typeforce.maybe(types_1.typeforce.String),
          hash: types_1.typeforce.maybe(types_1.typeforce.BufferN(20)),
          input: types_1.typeforce.maybe(types_1.typeforce.BufferN(0)),
          network: types_1.typeforce.maybe(types_1.typeforce.Object),
          output: types_1.typeforce.maybe(types_1.typeforce.BufferN(22)),
          pubkey: types_1.typeforce.maybe(types_1.isPoint),
          signature: types_1.typeforce.maybe(bscript.isCanonicalScriptSignature),
          witness: types_1.typeforce.maybe(
            types_1.typeforce.arrayOf(types_1.typeforce.Buffer)
          )
        },
        a
      );
      const _address = lazy.value(() => {
        const result = bech32_1.bech32.decode(a.address);
        const version = result.words.shift();
        const data = bech32_1.bech32.fromWords(result.words);
        return {
          version,
          prefix: result.prefix,
          data: Buffer.from(data)
        };
      });
      const network = a.network || networks_1.bitcoin;
      const o = { name: "p2wpkh", network };
      lazy.prop(o, "address", () => {
        if (!o.hash) return;
        const words = bech32_1.bech32.toWords(o.hash);
        words.unshift(0);
        return bech32_1.bech32.encode(network.bech32, words);
      });
      lazy.prop(o, "hash", () => {
        if (a.output) return a.output.slice(2, 22);
        if (a.address) return _address().data;
        if (a.pubkey || o.pubkey) return bcrypto.hash160(a.pubkey || o.pubkey);
      });
      lazy.prop(o, "output", () => {
        if (!o.hash) return;
        return bscript.compile([OPS.OP_0, o.hash]);
      });
      lazy.prop(o, "pubkey", () => {
        if (a.pubkey) return a.pubkey;
        if (!a.witness) return;
        return a.witness[1];
      });
      lazy.prop(o, "signature", () => {
        if (!a.witness) return;
        return a.witness[0];
      });
      lazy.prop(o, "input", () => {
        if (!o.witness) return;
        return EMPTY_BUFFER;
      });
      lazy.prop(o, "witness", () => {
        if (!a.pubkey) return;
        if (!a.signature) return;
        return [a.signature, a.pubkey];
      });
      if (opts.validate) {
        let hash = Buffer.from([]);
        if (a.address) {
          if (network && network.bech32 !== _address().prefix)
            throw new TypeError("Invalid prefix or Network mismatch");
          if (_address().version !== 0)
            throw new TypeError("Invalid address version");
          if (_address().data.length !== 20)
            throw new TypeError("Invalid address data");
          hash = _address().data;
        }
        if (a.hash) {
          if (hash.length > 0 && !hash.equals(a.hash))
            throw new TypeError("Hash mismatch");
          else hash = a.hash;
        }
        if (a.output) {
          if (a.output.length !== 22 || a.output[0] !== OPS.OP_0 || a.output[1] !== 20)
            throw new TypeError("Output is invalid");
          if (hash.length > 0 && !hash.equals(a.output.slice(2)))
            throw new TypeError("Hash mismatch");
          else hash = a.output.slice(2);
        }
        if (a.pubkey) {
          const pkh = bcrypto.hash160(a.pubkey);
          if (hash.length > 0 && !hash.equals(pkh))
            throw new TypeError("Hash mismatch");
          else hash = pkh;
          if (!(0, types_1.isPoint)(a.pubkey) || a.pubkey.length !== 33)
            throw new TypeError("Invalid pubkey for p2wpkh");
        }
        if (a.witness) {
          if (a.witness.length !== 2) throw new TypeError("Witness is invalid");
          if (!bscript.isCanonicalScriptSignature(a.witness[0]))
            throw new TypeError("Witness has invalid signature");
          if (!(0, types_1.isPoint)(a.witness[1]) || a.witness[1].length !== 33)
            throw new TypeError("Witness has invalid pubkey");
          if (a.signature && !a.signature.equals(a.witness[0]))
            throw new TypeError("Signature mismatch");
          if (a.pubkey && !a.pubkey.equals(a.witness[1]))
            throw new TypeError("Pubkey mismatch");
          const pkh = bcrypto.hash160(a.witness[1]);
          if (hash.length > 0 && !hash.equals(pkh))
            throw new TypeError("Hash mismatch");
        }
      }
      return Object.assign(o, a);
    }
    exports.p2wpkh = p2wpkh;
  }
});

// node_modules/bitcoinjs-lib/src/payments/p2wsh.js
var require_p2wsh = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/p2wsh.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2wsh = void 0;
    var bcrypto = require_crypto2();
    var networks_1 = require_networks();
    var bscript = require_script();
    var types_1 = require_types();
    var lazy = require_lazy();
    var bech32_1 = require_dist();
    var OPS = bscript.OPS;
    var EMPTY_BUFFER = Buffer.alloc(0);
    function chunkHasUncompressedPubkey(chunk) {
      if (Buffer.isBuffer(chunk) && chunk.length === 65 && chunk[0] === 4 && (0, types_1.isPoint)(chunk)) {
        return true;
      } else {
        return false;
      }
    }
    function p2wsh(a, opts) {
      if (!a.address && !a.hash && !a.output && !a.redeem && !a.witness)
        throw new TypeError("Not enough data");
      opts = Object.assign({ validate: true }, opts || {});
      (0, types_1.typeforce)(
        {
          network: types_1.typeforce.maybe(types_1.typeforce.Object),
          address: types_1.typeforce.maybe(types_1.typeforce.String),
          hash: types_1.typeforce.maybe(types_1.typeforce.BufferN(32)),
          output: types_1.typeforce.maybe(types_1.typeforce.BufferN(34)),
          redeem: types_1.typeforce.maybe({
            input: types_1.typeforce.maybe(types_1.typeforce.Buffer),
            network: types_1.typeforce.maybe(types_1.typeforce.Object),
            output: types_1.typeforce.maybe(types_1.typeforce.Buffer),
            witness: types_1.typeforce.maybe(
              types_1.typeforce.arrayOf(types_1.typeforce.Buffer)
            )
          }),
          input: types_1.typeforce.maybe(types_1.typeforce.BufferN(0)),
          witness: types_1.typeforce.maybe(
            types_1.typeforce.arrayOf(types_1.typeforce.Buffer)
          )
        },
        a
      );
      const _address = lazy.value(() => {
        const result = bech32_1.bech32.decode(a.address);
        const version = result.words.shift();
        const data = bech32_1.bech32.fromWords(result.words);
        return {
          version,
          prefix: result.prefix,
          data: Buffer.from(data)
        };
      });
      const _rchunks = lazy.value(() => {
        return bscript.decompile(a.redeem.input);
      });
      let network = a.network;
      if (!network) {
        network = a.redeem && a.redeem.network || networks_1.bitcoin;
      }
      const o = { network };
      lazy.prop(o, "address", () => {
        if (!o.hash) return;
        const words = bech32_1.bech32.toWords(o.hash);
        words.unshift(0);
        return bech32_1.bech32.encode(network.bech32, words);
      });
      lazy.prop(o, "hash", () => {
        if (a.output) return a.output.slice(2);
        if (a.address) return _address().data;
        if (o.redeem && o.redeem.output) return bcrypto.sha256(o.redeem.output);
      });
      lazy.prop(o, "output", () => {
        if (!o.hash) return;
        return bscript.compile([OPS.OP_0, o.hash]);
      });
      lazy.prop(o, "redeem", () => {
        if (!a.witness) return;
        return {
          output: a.witness[a.witness.length - 1],
          input: EMPTY_BUFFER,
          witness: a.witness.slice(0, -1)
        };
      });
      lazy.prop(o, "input", () => {
        if (!o.witness) return;
        return EMPTY_BUFFER;
      });
      lazy.prop(o, "witness", () => {
        if (a.redeem && a.redeem.input && a.redeem.input.length > 0 && a.redeem.output && a.redeem.output.length > 0) {
          const stack = bscript.toStack(_rchunks());
          o.redeem = Object.assign({ witness: stack }, a.redeem);
          o.redeem.input = EMPTY_BUFFER;
          return [].concat(stack, a.redeem.output);
        }
        if (!a.redeem) return;
        if (!a.redeem.output) return;
        if (!a.redeem.witness) return;
        return [].concat(a.redeem.witness, a.redeem.output);
      });
      lazy.prop(o, "name", () => {
        const nameParts = ["p2wsh"];
        if (o.redeem !== void 0 && o.redeem.name !== void 0)
          nameParts.push(o.redeem.name);
        return nameParts.join("-");
      });
      if (opts.validate) {
        let hash = Buffer.from([]);
        if (a.address) {
          if (_address().prefix !== network.bech32)
            throw new TypeError("Invalid prefix or Network mismatch");
          if (_address().version !== 0)
            throw new TypeError("Invalid address version");
          if (_address().data.length !== 32)
            throw new TypeError("Invalid address data");
          hash = _address().data;
        }
        if (a.hash) {
          if (hash.length > 0 && !hash.equals(a.hash))
            throw new TypeError("Hash mismatch");
          else hash = a.hash;
        }
        if (a.output) {
          if (a.output.length !== 34 || a.output[0] !== OPS.OP_0 || a.output[1] !== 32)
            throw new TypeError("Output is invalid");
          const hash2 = a.output.slice(2);
          if (hash.length > 0 && !hash.equals(hash2))
            throw new TypeError("Hash mismatch");
          else hash = hash2;
        }
        if (a.redeem) {
          if (a.redeem.network && a.redeem.network !== network)
            throw new TypeError("Network mismatch");
          if (a.redeem.input && a.redeem.input.length > 0 && a.redeem.witness && a.redeem.witness.length > 0)
            throw new TypeError("Ambiguous witness source");
          if (a.redeem.output) {
            const decompile = bscript.decompile(a.redeem.output);
            if (!decompile || decompile.length < 1)
              throw new TypeError("Redeem.output is invalid");
            if (a.redeem.output.byteLength > 3600)
              throw new TypeError(
                "Redeem.output unspendable if larger than 3600 bytes"
              );
            if (bscript.countNonPushOnlyOPs(decompile) > 201)
              throw new TypeError(
                "Redeem.output unspendable with more than 201 non-push ops"
              );
            const hash2 = bcrypto.sha256(a.redeem.output);
            if (hash.length > 0 && !hash.equals(hash2))
              throw new TypeError("Hash mismatch");
            else hash = hash2;
          }
          if (a.redeem.input && !bscript.isPushOnly(_rchunks()))
            throw new TypeError("Non push-only scriptSig");
          if (a.witness && a.redeem.witness && !(0, types_1.stacksEqual)(a.witness, a.redeem.witness))
            throw new TypeError("Witness and redeem.witness mismatch");
          if (a.redeem.input && _rchunks().some(chunkHasUncompressedPubkey) || a.redeem.output && (bscript.decompile(a.redeem.output) || []).some(
            chunkHasUncompressedPubkey
          )) {
            throw new TypeError(
              "redeem.input or redeem.output contains uncompressed pubkey"
            );
          }
        }
        if (a.witness && a.witness.length > 0) {
          const wScript = a.witness[a.witness.length - 1];
          if (a.redeem && a.redeem.output && !a.redeem.output.equals(wScript))
            throw new TypeError("Witness and redeem.output mismatch");
          if (a.witness.some(chunkHasUncompressedPubkey) || (bscript.decompile(wScript) || []).some(chunkHasUncompressedPubkey))
            throw new TypeError("Witness contains uncompressed pubkey");
        }
      }
      return Object.assign(o, a);
    }
    exports.p2wsh = p2wsh;
  }
});

// node_modules/bitcoinjs-lib/src/ecc_lib.js
var require_ecc_lib = __commonJS({
  "node_modules/bitcoinjs-lib/src/ecc_lib.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getEccLib = exports.initEccLib = void 0;
    var _ECCLIB_CACHE = {};
    function initEccLib(eccLib, opts) {
      if (!eccLib) {
        _ECCLIB_CACHE.eccLib = eccLib;
      } else if (eccLib !== _ECCLIB_CACHE.eccLib) {
        if (!opts?.DANGER_DO_NOT_VERIFY_ECCLIB)
          verifyEcc(eccLib);
        _ECCLIB_CACHE.eccLib = eccLib;
      }
    }
    exports.initEccLib = initEccLib;
    function getEccLib() {
      if (!_ECCLIB_CACHE.eccLib)
        throw new Error(
          "No ECC Library provided. You must call initEccLib() with a valid TinySecp256k1Interface instance"
        );
      return _ECCLIB_CACHE.eccLib;
    }
    exports.getEccLib = getEccLib;
    var h = (hex) => Buffer.from(hex, "hex");
    function verifyEcc(ecc) {
      assert(typeof ecc.isXOnlyPoint === "function");
      assert(
        ecc.isXOnlyPoint(
          h("79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
        )
      );
      assert(
        ecc.isXOnlyPoint(
          h("fffffffffffffffffffffffffffffffffffffffffffffffffffffffeeffffc2e")
        )
      );
      assert(
        ecc.isXOnlyPoint(
          h("f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9")
        )
      );
      assert(
        ecc.isXOnlyPoint(
          h("0000000000000000000000000000000000000000000000000000000000000001")
        )
      );
      assert(
        !ecc.isXOnlyPoint(
          h("0000000000000000000000000000000000000000000000000000000000000000")
        )
      );
      assert(
        !ecc.isXOnlyPoint(
          h("fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f")
        )
      );
      assert(typeof ecc.xOnlyPointAddTweak === "function");
      tweakAddVectors.forEach((t) => {
        const r = ecc.xOnlyPointAddTweak(h(t.pubkey), h(t.tweak));
        if (t.result === null) {
          assert(r === null);
        } else {
          assert(r !== null);
          assert(r.parity === t.parity);
          assert(Buffer.from(r.xOnlyPubkey).equals(h(t.result)));
        }
      });
    }
    function assert(bool) {
      if (!bool) throw new Error("ecc library invalid");
    }
    var tweakAddVectors = [
      {
        pubkey: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
        tweak: "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140",
        parity: -1,
        result: null
      },
      {
        pubkey: "1617d38ed8d8657da4d4761e8057bc396ea9e4b9d29776d4be096016dbd2509b",
        tweak: "a8397a935f0dfceba6ba9618f6451ef4d80637abf4e6af2669fbc9de6a8fd2ac",
        parity: 1,
        result: "e478f99dab91052ab39a33ea35fd5e6e4933f4d28023cd597c9a1f6760346adf"
      },
      {
        pubkey: "2c0b7cf95324a07d05398b240174dc0c2be444d96b159aa6c7f7b1e668680991",
        tweak: "823c3cd2142744b075a87eade7e1b8678ba308d566226a0056ca2b7a76f86b47",
        parity: 0,
        result: "9534f8dc8c6deda2dc007655981c78b49c5d96c778fbf363462a11ec9dfd948c"
      }
    ];
  }
});

// ../node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "../node_modules/safe-buffer/index.js"(exports, module) {
    "use strict";
    var buffer = require_buffer();
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer2.prototype);
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// node_modules/varuint-bitcoin/index.js
var require_varuint_bitcoin = __commonJS({
  "node_modules/varuint-bitcoin/index.js"(exports, module) {
    "use strict";
    var Buffer2 = require_safe_buffer().Buffer;
    var MAX_SAFE_INTEGER = 9007199254740991;
    function checkUInt53(n) {
      if (n < 0 || n > MAX_SAFE_INTEGER || n % 1 !== 0) throw new RangeError("value out of range");
    }
    function encode(number, buffer, offset) {
      checkUInt53(number);
      if (!buffer) buffer = Buffer2.allocUnsafe(encodingLength(number));
      if (!Buffer2.isBuffer(buffer)) throw new TypeError("buffer must be a Buffer instance");
      if (!offset) offset = 0;
      if (number < 253) {
        buffer.writeUInt8(number, offset);
        encode.bytes = 1;
      } else if (number <= 65535) {
        buffer.writeUInt8(253, offset);
        buffer.writeUInt16LE(number, offset + 1);
        encode.bytes = 3;
      } else if (number <= 4294967295) {
        buffer.writeUInt8(254, offset);
        buffer.writeUInt32LE(number, offset + 1);
        encode.bytes = 5;
      } else {
        buffer.writeUInt8(255, offset);
        buffer.writeUInt32LE(number >>> 0, offset + 1);
        buffer.writeUInt32LE(number / 4294967296 | 0, offset + 5);
        encode.bytes = 9;
      }
      return buffer;
    }
    function decode(buffer, offset) {
      if (!Buffer2.isBuffer(buffer)) throw new TypeError("buffer must be a Buffer instance");
      if (!offset) offset = 0;
      var first = buffer.readUInt8(offset);
      if (first < 253) {
        decode.bytes = 1;
        return first;
      } else if (first === 253) {
        decode.bytes = 3;
        return buffer.readUInt16LE(offset + 1);
      } else if (first === 254) {
        decode.bytes = 5;
        return buffer.readUInt32LE(offset + 1);
      } else {
        decode.bytes = 9;
        var lo = buffer.readUInt32LE(offset + 1);
        var hi = buffer.readUInt32LE(offset + 5);
        var number = hi * 4294967296 + lo;
        checkUInt53(number);
        return number;
      }
    }
    function encodingLength(number) {
      checkUInt53(number);
      return number < 253 ? 1 : number <= 65535 ? 3 : number <= 4294967295 ? 5 : 9;
    }
    module.exports = { encode, decode, encodingLength };
  }
});

// node_modules/bitcoinjs-lib/src/bufferutils.js
var require_bufferutils = __commonJS({
  "node_modules/bitcoinjs-lib/src/bufferutils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BufferReader = exports.BufferWriter = exports.cloneBuffer = exports.reverseBuffer = exports.writeUInt64LE = exports.readUInt64LE = exports.varuint = void 0;
    var types = require_types();
    var { typeforce } = types;
    var varuint = require_varuint_bitcoin();
    exports.varuint = varuint;
    function verifuint(value, max) {
      if (typeof value !== "number")
        throw new Error("cannot write a non-number as a number");
      if (value < 0)
        throw new Error("specified a negative value for writing an unsigned value");
      if (value > max) throw new Error("RangeError: value out of range");
      if (Math.floor(value) !== value)
        throw new Error("value has a fractional component");
    }
    function readUInt64LE(buffer, offset) {
      const a = buffer.readUInt32LE(offset);
      let b = buffer.readUInt32LE(offset + 4);
      b *= 4294967296;
      verifuint(b + a, 9007199254740991);
      return b + a;
    }
    exports.readUInt64LE = readUInt64LE;
    function writeUInt64LE(buffer, value, offset) {
      verifuint(value, 9007199254740991);
      buffer.writeInt32LE(value & -1, offset);
      buffer.writeUInt32LE(Math.floor(value / 4294967296), offset + 4);
      return offset + 8;
    }
    exports.writeUInt64LE = writeUInt64LE;
    function reverseBuffer(buffer) {
      if (buffer.length < 1) return buffer;
      let j = buffer.length - 1;
      let tmp = 0;
      for (let i = 0; i < buffer.length / 2; i++) {
        tmp = buffer[i];
        buffer[i] = buffer[j];
        buffer[j] = tmp;
        j--;
      }
      return buffer;
    }
    exports.reverseBuffer = reverseBuffer;
    function cloneBuffer(buffer) {
      const clone = Buffer.allocUnsafe(buffer.length);
      buffer.copy(clone);
      return clone;
    }
    exports.cloneBuffer = cloneBuffer;
    var BufferWriter = class _BufferWriter {
      static withCapacity(size) {
        return new _BufferWriter(Buffer.alloc(size));
      }
      constructor(buffer, offset = 0) {
        this.buffer = buffer;
        this.offset = offset;
        typeforce(types.tuple(types.Buffer, types.UInt32), [buffer, offset]);
      }
      writeUInt8(i) {
        this.offset = this.buffer.writeUInt8(i, this.offset);
      }
      writeInt32(i) {
        this.offset = this.buffer.writeInt32LE(i, this.offset);
      }
      writeUInt32(i) {
        this.offset = this.buffer.writeUInt32LE(i, this.offset);
      }
      writeUInt64(i) {
        this.offset = writeUInt64LE(this.buffer, i, this.offset);
      }
      writeVarInt(i) {
        varuint.encode(i, this.buffer, this.offset);
        this.offset += varuint.encode.bytes;
      }
      writeSlice(slice) {
        if (this.buffer.length < this.offset + slice.length) {
          throw new Error("Cannot write slice out of bounds");
        }
        this.offset += slice.copy(this.buffer, this.offset);
      }
      writeVarSlice(slice) {
        this.writeVarInt(slice.length);
        this.writeSlice(slice);
      }
      writeVector(vector) {
        this.writeVarInt(vector.length);
        vector.forEach((buf) => this.writeVarSlice(buf));
      }
      end() {
        if (this.buffer.length === this.offset) {
          return this.buffer;
        }
        throw new Error(`buffer size ${this.buffer.length}, offset ${this.offset}`);
      }
    };
    exports.BufferWriter = BufferWriter;
    var BufferReader = class {
      constructor(buffer, offset = 0) {
        this.buffer = buffer;
        this.offset = offset;
        typeforce(types.tuple(types.Buffer, types.UInt32), [buffer, offset]);
      }
      readUInt8() {
        const result = this.buffer.readUInt8(this.offset);
        this.offset++;
        return result;
      }
      readInt32() {
        const result = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return result;
      }
      readUInt32() {
        const result = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return result;
      }
      readUInt64() {
        const result = readUInt64LE(this.buffer, this.offset);
        this.offset += 8;
        return result;
      }
      readVarInt() {
        const vi = varuint.decode(this.buffer, this.offset);
        this.offset += varuint.decode.bytes;
        return vi;
      }
      readSlice(n) {
        if (this.buffer.length < this.offset + n) {
          throw new Error("Cannot read slice out of bounds");
        }
        const result = this.buffer.slice(this.offset, this.offset + n);
        this.offset += n;
        return result;
      }
      readVarSlice() {
        return this.readSlice(this.readVarInt());
      }
      readVector() {
        const count = this.readVarInt();
        const vector = [];
        for (let i = 0; i < count; i++) vector.push(this.readVarSlice());
        return vector;
      }
    };
    exports.BufferReader = BufferReader;
  }
});

// node_modules/bitcoinjs-lib/src/payments/bip341.js
var require_bip341 = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/bip341.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.tweakKey = exports.tapTweakHash = exports.tapleafHash = exports.findScriptPath = exports.toHashTree = exports.rootHashFromPath = exports.MAX_TAPTREE_DEPTH = exports.LEAF_VERSION_TAPSCRIPT = void 0;
    var buffer_1 = require_buffer();
    var ecc_lib_1 = require_ecc_lib();
    var bcrypto = require_crypto2();
    var bufferutils_1 = require_bufferutils();
    var types_1 = require_types();
    exports.LEAF_VERSION_TAPSCRIPT = 192;
    exports.MAX_TAPTREE_DEPTH = 128;
    var isHashBranch = (ht) => "left" in ht && "right" in ht;
    function rootHashFromPath(controlBlock, leafHash) {
      if (controlBlock.length < 33)
        throw new TypeError(
          `The control-block length is too small. Got ${controlBlock.length}, expected min 33.`
        );
      const m = (controlBlock.length - 33) / 32;
      let kj = leafHash;
      for (let j = 0; j < m; j++) {
        const ej = controlBlock.slice(33 + 32 * j, 65 + 32 * j);
        if (kj.compare(ej) < 0) {
          kj = tapBranchHash(kj, ej);
        } else {
          kj = tapBranchHash(ej, kj);
        }
      }
      return kj;
    }
    exports.rootHashFromPath = rootHashFromPath;
    function toHashTree(scriptTree) {
      if ((0, types_1.isTapleaf)(scriptTree))
        return { hash: tapleafHash(scriptTree) };
      const hashes = [toHashTree(scriptTree[0]), toHashTree(scriptTree[1])];
      hashes.sort((a, b) => a.hash.compare(b.hash));
      const [left, right] = hashes;
      return {
        hash: tapBranchHash(left.hash, right.hash),
        left,
        right
      };
    }
    exports.toHashTree = toHashTree;
    function findScriptPath(node, hash) {
      if (isHashBranch(node)) {
        const leftPath = findScriptPath(node.left, hash);
        if (leftPath !== void 0) return [...leftPath, node.right.hash];
        const rightPath = findScriptPath(node.right, hash);
        if (rightPath !== void 0) return [...rightPath, node.left.hash];
      } else if (node.hash.equals(hash)) {
        return [];
      }
      return void 0;
    }
    exports.findScriptPath = findScriptPath;
    function tapleafHash(leaf) {
      const version = leaf.version || exports.LEAF_VERSION_TAPSCRIPT;
      return bcrypto.taggedHash(
        "TapLeaf",
        buffer_1.Buffer.concat([
          buffer_1.Buffer.from([version]),
          serializeScript(leaf.output)
        ])
      );
    }
    exports.tapleafHash = tapleafHash;
    function tapTweakHash(pubKey, h) {
      return bcrypto.taggedHash(
        "TapTweak",
        buffer_1.Buffer.concat(h ? [pubKey, h] : [pubKey])
      );
    }
    exports.tapTweakHash = tapTweakHash;
    function tweakKey(pubKey, h) {
      if (!buffer_1.Buffer.isBuffer(pubKey)) return null;
      if (pubKey.length !== 32) return null;
      if (h && h.length !== 32) return null;
      const tweakHash = tapTweakHash(pubKey, h);
      const res = (0, ecc_lib_1.getEccLib)().xOnlyPointAddTweak(pubKey, tweakHash);
      if (!res || res.xOnlyPubkey === null) return null;
      return {
        parity: res.parity,
        x: buffer_1.Buffer.from(res.xOnlyPubkey)
      };
    }
    exports.tweakKey = tweakKey;
    function tapBranchHash(a, b) {
      return bcrypto.taggedHash("TapBranch", buffer_1.Buffer.concat([a, b]));
    }
    function serializeScript(s) {
      const varintLen = bufferutils_1.varuint.encodingLength(s.length);
      const buffer = buffer_1.Buffer.allocUnsafe(varintLen);
      bufferutils_1.varuint.encode(s.length, buffer);
      return buffer_1.Buffer.concat([buffer, s]);
    }
  }
});

// node_modules/bitcoinjs-lib/src/payments/p2tr.js
var require_p2tr = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/p2tr.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2tr = void 0;
    var buffer_1 = require_buffer();
    var networks_1 = require_networks();
    var bscript = require_script();
    var types_1 = require_types();
    var ecc_lib_1 = require_ecc_lib();
    var bip341_1 = require_bip341();
    var lazy = require_lazy();
    var bech32_1 = require_dist();
    var address_1 = require_address();
    var OPS = bscript.OPS;
    var TAPROOT_WITNESS_VERSION = 1;
    var ANNEX_PREFIX = 80;
    function p2tr(a, opts) {
      if (!a.address && !a.output && !a.pubkey && !a.internalPubkey && !(a.witness && a.witness.length > 1))
        throw new TypeError("Not enough data");
      opts = Object.assign({ validate: true }, opts || {});
      (0, types_1.typeforce)(
        {
          address: types_1.typeforce.maybe(types_1.typeforce.String),
          input: types_1.typeforce.maybe(types_1.typeforce.BufferN(0)),
          network: types_1.typeforce.maybe(types_1.typeforce.Object),
          output: types_1.typeforce.maybe(types_1.typeforce.BufferN(34)),
          internalPubkey: types_1.typeforce.maybe(types_1.typeforce.BufferN(32)),
          hash: types_1.typeforce.maybe(types_1.typeforce.BufferN(32)),
          pubkey: types_1.typeforce.maybe(types_1.typeforce.BufferN(32)),
          signature: types_1.typeforce.maybe(
            types_1.typeforce.anyOf(
              types_1.typeforce.BufferN(64),
              types_1.typeforce.BufferN(65)
            )
          ),
          witness: types_1.typeforce.maybe(
            types_1.typeforce.arrayOf(types_1.typeforce.Buffer)
          ),
          scriptTree: types_1.typeforce.maybe(types_1.isTaptree),
          redeem: types_1.typeforce.maybe({
            output: types_1.typeforce.maybe(types_1.typeforce.Buffer),
            redeemVersion: types_1.typeforce.maybe(types_1.typeforce.Number),
            witness: types_1.typeforce.maybe(
              types_1.typeforce.arrayOf(types_1.typeforce.Buffer)
            )
          }),
          redeemVersion: types_1.typeforce.maybe(types_1.typeforce.Number)
        },
        a
      );
      const _address = lazy.value(() => {
        return (0, address_1.fromBech32)(a.address);
      });
      const _witness = lazy.value(() => {
        if (!a.witness || !a.witness.length) return;
        if (a.witness.length >= 2 && a.witness[a.witness.length - 1][0] === ANNEX_PREFIX) {
          return a.witness.slice(0, -1);
        }
        return a.witness.slice();
      });
      const _hashTree = lazy.value(() => {
        if (a.scriptTree) return (0, bip341_1.toHashTree)(a.scriptTree);
        if (a.hash) return { hash: a.hash };
        return;
      });
      const network = a.network || networks_1.bitcoin;
      const o = { name: "p2tr", network };
      lazy.prop(o, "address", () => {
        if (!o.pubkey) return;
        const words = bech32_1.bech32m.toWords(o.pubkey);
        words.unshift(TAPROOT_WITNESS_VERSION);
        return bech32_1.bech32m.encode(network.bech32, words);
      });
      lazy.prop(o, "hash", () => {
        const hashTree = _hashTree();
        if (hashTree) return hashTree.hash;
        const w = _witness();
        if (w && w.length > 1) {
          const controlBlock = w[w.length - 1];
          const leafVersion = controlBlock[0] & types_1.TAPLEAF_VERSION_MASK;
          const script = w[w.length - 2];
          const leafHash = (0, bip341_1.tapleafHash)({
            output: script,
            version: leafVersion
          });
          return (0, bip341_1.rootHashFromPath)(controlBlock, leafHash);
        }
        return null;
      });
      lazy.prop(o, "output", () => {
        if (!o.pubkey) return;
        return bscript.compile([OPS.OP_1, o.pubkey]);
      });
      lazy.prop(o, "redeemVersion", () => {
        if (a.redeemVersion) return a.redeemVersion;
        if (a.redeem && a.redeem.redeemVersion !== void 0 && a.redeem.redeemVersion !== null) {
          return a.redeem.redeemVersion;
        }
        return bip341_1.LEAF_VERSION_TAPSCRIPT;
      });
      lazy.prop(o, "redeem", () => {
        const witness = _witness();
        if (!witness || witness.length < 2) return;
        return {
          output: witness[witness.length - 2],
          witness: witness.slice(0, -2),
          redeemVersion: witness[witness.length - 1][0] & types_1.TAPLEAF_VERSION_MASK
        };
      });
      lazy.prop(o, "pubkey", () => {
        if (a.pubkey) return a.pubkey;
        if (a.output) return a.output.slice(2);
        if (a.address) return _address().data;
        if (o.internalPubkey) {
          const tweakedKey = (0, bip341_1.tweakKey)(o.internalPubkey, o.hash);
          if (tweakedKey) return tweakedKey.x;
        }
      });
      lazy.prop(o, "internalPubkey", () => {
        if (a.internalPubkey) return a.internalPubkey;
        const witness = _witness();
        if (witness && witness.length > 1)
          return witness[witness.length - 1].slice(1, 33);
      });
      lazy.prop(o, "signature", () => {
        if (a.signature) return a.signature;
        const witness = _witness();
        if (!witness || witness.length !== 1) return;
        return witness[0];
      });
      lazy.prop(o, "witness", () => {
        if (a.witness) return a.witness;
        const hashTree = _hashTree();
        if (hashTree && a.redeem && a.redeem.output && a.internalPubkey) {
          const leafHash = (0, bip341_1.tapleafHash)({
            output: a.redeem.output,
            version: o.redeemVersion
          });
          const path = (0, bip341_1.findScriptPath)(hashTree, leafHash);
          if (!path) return;
          const outputKey = (0, bip341_1.tweakKey)(a.internalPubkey, hashTree.hash);
          if (!outputKey) return;
          const controlBock = buffer_1.Buffer.concat(
            [
              buffer_1.Buffer.from([o.redeemVersion | outputKey.parity]),
              a.internalPubkey
            ].concat(path)
          );
          return [a.redeem.output, controlBock];
        }
        if (a.signature) return [a.signature];
      });
      if (opts.validate) {
        let pubkey = buffer_1.Buffer.from([]);
        if (a.address) {
          if (network && network.bech32 !== _address().prefix)
            throw new TypeError("Invalid prefix or Network mismatch");
          if (_address().version !== TAPROOT_WITNESS_VERSION)
            throw new TypeError("Invalid address version");
          if (_address().data.length !== 32)
            throw new TypeError("Invalid address data");
          pubkey = _address().data;
        }
        if (a.pubkey) {
          if (pubkey.length > 0 && !pubkey.equals(a.pubkey))
            throw new TypeError("Pubkey mismatch");
          else pubkey = a.pubkey;
        }
        if (a.output) {
          if (a.output.length !== 34 || a.output[0] !== OPS.OP_1 || a.output[1] !== 32)
            throw new TypeError("Output is invalid");
          if (pubkey.length > 0 && !pubkey.equals(a.output.slice(2)))
            throw new TypeError("Pubkey mismatch");
          else pubkey = a.output.slice(2);
        }
        if (a.internalPubkey) {
          const tweakedKey = (0, bip341_1.tweakKey)(a.internalPubkey, o.hash);
          if (pubkey.length > 0 && !pubkey.equals(tweakedKey.x))
            throw new TypeError("Pubkey mismatch");
          else pubkey = tweakedKey.x;
        }
        if (pubkey && pubkey.length) {
          if (!(0, ecc_lib_1.getEccLib)().isXOnlyPoint(pubkey))
            throw new TypeError("Invalid pubkey for p2tr");
        }
        const hashTree = _hashTree();
        if (a.hash && hashTree) {
          if (!a.hash.equals(hashTree.hash)) throw new TypeError("Hash mismatch");
        }
        if (a.redeem && a.redeem.output && hashTree) {
          const leafHash = (0, bip341_1.tapleafHash)({
            output: a.redeem.output,
            version: o.redeemVersion
          });
          if (!(0, bip341_1.findScriptPath)(hashTree, leafHash))
            throw new TypeError("Redeem script not in tree");
        }
        const witness = _witness();
        if (a.redeem && o.redeem) {
          if (a.redeem.redeemVersion) {
            if (a.redeem.redeemVersion !== o.redeem.redeemVersion)
              throw new TypeError("Redeem.redeemVersion and witness mismatch");
          }
          if (a.redeem.output) {
            if (bscript.decompile(a.redeem.output).length === 0)
              throw new TypeError("Redeem.output is invalid");
            if (o.redeem.output && !a.redeem.output.equals(o.redeem.output))
              throw new TypeError("Redeem.output and witness mismatch");
          }
          if (a.redeem.witness) {
            if (o.redeem.witness && !(0, types_1.stacksEqual)(a.redeem.witness, o.redeem.witness))
              throw new TypeError("Redeem.witness and witness mismatch");
          }
        }
        if (witness && witness.length) {
          if (witness.length === 1) {
            if (a.signature && !a.signature.equals(witness[0]))
              throw new TypeError("Signature mismatch");
          } else {
            const controlBlock = witness[witness.length - 1];
            if (controlBlock.length < 33)
              throw new TypeError(
                `The control-block length is too small. Got ${controlBlock.length}, expected min 33.`
              );
            if ((controlBlock.length - 33) % 32 !== 0)
              throw new TypeError(
                `The control-block length of ${controlBlock.length} is incorrect!`
              );
            const m = (controlBlock.length - 33) / 32;
            if (m > 128)
              throw new TypeError(
                `The script path is too long. Got ${m}, expected max 128.`
              );
            const internalPubkey = controlBlock.slice(1, 33);
            if (a.internalPubkey && !a.internalPubkey.equals(internalPubkey))
              throw new TypeError("Internal pubkey mismatch");
            if (!(0, ecc_lib_1.getEccLib)().isXOnlyPoint(internalPubkey))
              throw new TypeError("Invalid internalPubkey for p2tr witness");
            const leafVersion = controlBlock[0] & types_1.TAPLEAF_VERSION_MASK;
            const script = witness[witness.length - 2];
            const leafHash = (0, bip341_1.tapleafHash)({
              output: script,
              version: leafVersion
            });
            const hash = (0, bip341_1.rootHashFromPath)(controlBlock, leafHash);
            const outputKey = (0, bip341_1.tweakKey)(internalPubkey, hash);
            if (!outputKey)
              throw new TypeError("Invalid outputKey for p2tr witness");
            if (pubkey.length && !pubkey.equals(outputKey.x))
              throw new TypeError("Pubkey mismatch for p2tr witness");
            if (outputKey.parity !== (controlBlock[0] & 1))
              throw new Error("Incorrect parity");
          }
        }
      }
      return Object.assign(o, a);
    }
    exports.p2tr = p2tr;
  }
});

// node_modules/bitcoinjs-lib/src/payments/index.js
var require_payments = __commonJS({
  "node_modules/bitcoinjs-lib/src/payments/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.p2tr = exports.p2wsh = exports.p2wpkh = exports.p2sh = exports.p2pkh = exports.p2pk = exports.p2ms = exports.embed = void 0;
    var embed_1 = require_embed();
    Object.defineProperty(exports, "embed", {
      enumerable: true,
      get: function() {
        return embed_1.p2data;
      }
    });
    var p2ms_1 = require_p2ms();
    Object.defineProperty(exports, "p2ms", {
      enumerable: true,
      get: function() {
        return p2ms_1.p2ms;
      }
    });
    var p2pk_1 = require_p2pk();
    Object.defineProperty(exports, "p2pk", {
      enumerable: true,
      get: function() {
        return p2pk_1.p2pk;
      }
    });
    var p2pkh_1 = require_p2pkh();
    Object.defineProperty(exports, "p2pkh", {
      enumerable: true,
      get: function() {
        return p2pkh_1.p2pkh;
      }
    });
    var p2sh_1 = require_p2sh();
    Object.defineProperty(exports, "p2sh", {
      enumerable: true,
      get: function() {
        return p2sh_1.p2sh;
      }
    });
    var p2wpkh_1 = require_p2wpkh();
    Object.defineProperty(exports, "p2wpkh", {
      enumerable: true,
      get: function() {
        return p2wpkh_1.p2wpkh;
      }
    });
    var p2wsh_1 = require_p2wsh();
    Object.defineProperty(exports, "p2wsh", {
      enumerable: true,
      get: function() {
        return p2wsh_1.p2wsh;
      }
    });
    var p2tr_1 = require_p2tr();
    Object.defineProperty(exports, "p2tr", {
      enumerable: true,
      get: function() {
        return p2tr_1.p2tr;
      }
    });
  }
});

// node_modules/bitcoinjs-lib/src/address.js
var require_address = __commonJS({
  "node_modules/bitcoinjs-lib/src/address.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.toOutputScript = exports.fromOutputScript = exports.toBech32 = exports.toBase58Check = exports.fromBech32 = exports.fromBase58Check = void 0;
    var networks = require_networks();
    var payments = require_payments();
    var bscript = require_script();
    var types_1 = require_types();
    var bech32_1 = require_dist();
    var bs58check = require_bs58check();
    var FUTURE_SEGWIT_MAX_SIZE = 40;
    var FUTURE_SEGWIT_MIN_SIZE = 2;
    var FUTURE_SEGWIT_MAX_VERSION = 16;
    var FUTURE_SEGWIT_MIN_VERSION = 2;
    var FUTURE_SEGWIT_VERSION_DIFF = 80;
    var FUTURE_SEGWIT_VERSION_WARNING = "WARNING: Sending to a future segwit version address can lead to loss of funds. End users MUST be warned carefully in the GUI and asked if they wish to proceed with caution. Wallets should verify the segwit version from the output of fromBech32, then decide when it is safe to use which version of segwit.";
    function _toFutureSegwitAddress(output, network) {
      const data = output.slice(2);
      if (data.length < FUTURE_SEGWIT_MIN_SIZE || data.length > FUTURE_SEGWIT_MAX_SIZE)
        throw new TypeError("Invalid program length for segwit address");
      const version = output[0] - FUTURE_SEGWIT_VERSION_DIFF;
      if (version < FUTURE_SEGWIT_MIN_VERSION || version > FUTURE_SEGWIT_MAX_VERSION)
        throw new TypeError("Invalid version for segwit address");
      if (output[1] !== data.length)
        throw new TypeError("Invalid script for segwit address");
      console.warn(FUTURE_SEGWIT_VERSION_WARNING);
      return toBech32(data, version, network.bech32);
    }
    function fromBase58Check(address) {
      const payload = Buffer.from(bs58check.decode(address));
      if (payload.length < 21) throw new TypeError(address + " is too short");
      if (payload.length > 21) throw new TypeError(address + " is too long");
      const version = payload.readUInt8(0);
      const hash = payload.slice(1);
      return { version, hash };
    }
    exports.fromBase58Check = fromBase58Check;
    function fromBech32(address) {
      let result;
      let version;
      try {
        result = bech32_1.bech32.decode(address);
      } catch (e) {
      }
      if (result) {
        version = result.words[0];
        if (version !== 0) throw new TypeError(address + " uses wrong encoding");
      } else {
        result = bech32_1.bech32m.decode(address);
        version = result.words[0];
        if (version === 0) throw new TypeError(address + " uses wrong encoding");
      }
      const data = bech32_1.bech32.fromWords(result.words.slice(1));
      return {
        version,
        prefix: result.prefix,
        data: Buffer.from(data)
      };
    }
    exports.fromBech32 = fromBech32;
    function toBase58Check(hash, version) {
      (0, types_1.typeforce)(
        (0, types_1.tuple)(types_1.Hash160bit, types_1.UInt8),
        arguments
      );
      const payload = Buffer.allocUnsafe(21);
      payload.writeUInt8(version, 0);
      hash.copy(payload, 1);
      return bs58check.encode(payload);
    }
    exports.toBase58Check = toBase58Check;
    function toBech32(data, version, prefix) {
      const words = bech32_1.bech32.toWords(data);
      words.unshift(version);
      return version === 0 ? bech32_1.bech32.encode(prefix, words) : bech32_1.bech32m.encode(prefix, words);
    }
    exports.toBech32 = toBech32;
    function fromOutputScript(output, network) {
      network = network || networks.bitcoin;
      try {
        return payments.p2pkh({ output, network }).address;
      } catch (e) {
      }
      try {
        return payments.p2sh({ output, network }).address;
      } catch (e) {
      }
      try {
        return payments.p2wpkh({ output, network }).address;
      } catch (e) {
      }
      try {
        return payments.p2wsh({ output, network }).address;
      } catch (e) {
      }
      try {
        return payments.p2tr({ output, network }).address;
      } catch (e) {
      }
      try {
        return _toFutureSegwitAddress(output, network);
      } catch (e) {
      }
      throw new Error(bscript.toASM(output) + " has no matching Address");
    }
    exports.fromOutputScript = fromOutputScript;
    function toOutputScript(address, network) {
      network = network || networks.bitcoin;
      let decodeBase58;
      let decodeBech32;
      try {
        decodeBase58 = fromBase58Check(address);
      } catch (e) {
      }
      if (decodeBase58) {
        if (decodeBase58.version === network.pubKeyHash)
          return payments.p2pkh({ hash: decodeBase58.hash }).output;
        if (decodeBase58.version === network.scriptHash)
          return payments.p2sh({ hash: decodeBase58.hash }).output;
      } else {
        try {
          decodeBech32 = fromBech32(address);
        } catch (e) {
        }
        if (decodeBech32) {
          if (decodeBech32.prefix !== network.bech32)
            throw new Error(address + " has an invalid prefix");
          if (decodeBech32.version === 0) {
            if (decodeBech32.data.length === 20)
              return payments.p2wpkh({ hash: decodeBech32.data }).output;
            if (decodeBech32.data.length === 32)
              return payments.p2wsh({ hash: decodeBech32.data }).output;
          } else if (decodeBech32.version === 1) {
            if (decodeBech32.data.length === 32)
              return payments.p2tr({ pubkey: decodeBech32.data }).output;
          } else if (decodeBech32.version >= FUTURE_SEGWIT_MIN_VERSION && decodeBech32.version <= FUTURE_SEGWIT_MAX_VERSION && decodeBech32.data.length >= FUTURE_SEGWIT_MIN_SIZE && decodeBech32.data.length <= FUTURE_SEGWIT_MAX_SIZE) {
            console.warn(FUTURE_SEGWIT_VERSION_WARNING);
            return bscript.compile([
              decodeBech32.version + FUTURE_SEGWIT_VERSION_DIFF,
              decodeBech32.data
            ]);
          }
        }
      }
      throw new Error(address + " has no matching Script");
    }
    exports.toOutputScript = toOutputScript;
  }
});

// node_modules/bitcoinjs-lib/src/merkle.js
var require_merkle = __commonJS({
  "node_modules/bitcoinjs-lib/src/merkle.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fastMerkleRoot = void 0;
    function fastMerkleRoot(values, digestFn) {
      if (!Array.isArray(values)) throw TypeError("Expected values Array");
      if (typeof digestFn !== "function")
        throw TypeError("Expected digest Function");
      let length = values.length;
      const results = values.concat();
      while (length > 1) {
        let j = 0;
        for (let i = 0; i < length; i += 2, ++j) {
          const left = results[i];
          const right = i + 1 === length ? left : results[i + 1];
          const data = Buffer.concat([left, right]);
          results[j] = digestFn(data);
        }
        length = j;
      }
      return results[0];
    }
    exports.fastMerkleRoot = fastMerkleRoot;
  }
});

// node_modules/bitcoinjs-lib/src/transaction.js
var require_transaction = __commonJS({
  "node_modules/bitcoinjs-lib/src/transaction.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Transaction = void 0;
    var bufferutils_1 = require_bufferutils();
    var bcrypto = require_crypto2();
    var bscript = require_script();
    var script_1 = require_script();
    var types = require_types();
    var { typeforce } = types;
    function varSliceSize(someScript) {
      const length = someScript.length;
      return bufferutils_1.varuint.encodingLength(length) + length;
    }
    function vectorSize(someVector) {
      const length = someVector.length;
      return bufferutils_1.varuint.encodingLength(length) + someVector.reduce((sum, witness) => {
        return sum + varSliceSize(witness);
      }, 0);
    }
    var EMPTY_BUFFER = Buffer.allocUnsafe(0);
    var EMPTY_WITNESS = [];
    var ZERO = Buffer.from(
      "0000000000000000000000000000000000000000000000000000000000000000",
      "hex"
    );
    var ONE = Buffer.from(
      "0000000000000000000000000000000000000000000000000000000000000001",
      "hex"
    );
    var VALUE_UINT64_MAX = Buffer.from("ffffffffffffffff", "hex");
    var BLANK_OUTPUT = {
      script: EMPTY_BUFFER,
      valueBuffer: VALUE_UINT64_MAX
    };
    function isOutput(out) {
      return out.value !== void 0;
    }
    var Transaction = class _Transaction {
      constructor() {
        this.version = 1;
        this.locktime = 0;
        this.ins = [];
        this.outs = [];
      }
      static fromBuffer(buffer, _NO_STRICT) {
        const bufferReader = new bufferutils_1.BufferReader(buffer);
        const tx = new _Transaction();
        tx.version = bufferReader.readInt32();
        const marker = bufferReader.readUInt8();
        const flag = bufferReader.readUInt8();
        let hasWitnesses = false;
        if (marker === _Transaction.ADVANCED_TRANSACTION_MARKER && flag === _Transaction.ADVANCED_TRANSACTION_FLAG) {
          hasWitnesses = true;
        } else {
          bufferReader.offset -= 2;
        }
        const vinLen = bufferReader.readVarInt();
        for (let i = 0; i < vinLen; ++i) {
          tx.ins.push({
            hash: bufferReader.readSlice(32),
            index: bufferReader.readUInt32(),
            script: bufferReader.readVarSlice(),
            sequence: bufferReader.readUInt32(),
            witness: EMPTY_WITNESS
          });
        }
        const voutLen = bufferReader.readVarInt();
        for (let i = 0; i < voutLen; ++i) {
          tx.outs.push({
            value: bufferReader.readUInt64(),
            script: bufferReader.readVarSlice()
          });
        }
        if (hasWitnesses) {
          for (let i = 0; i < vinLen; ++i) {
            tx.ins[i].witness = bufferReader.readVector();
          }
          if (!tx.hasWitnesses())
            throw new Error("Transaction has superfluous witness data");
        }
        tx.locktime = bufferReader.readUInt32();
        if (_NO_STRICT) return tx;
        if (bufferReader.offset !== buffer.length)
          throw new Error("Transaction has unexpected data");
        return tx;
      }
      static fromHex(hex) {
        return _Transaction.fromBuffer(Buffer.from(hex, "hex"), false);
      }
      static isCoinbaseHash(buffer) {
        typeforce(types.Hash256bit, buffer);
        for (let i = 0; i < 32; ++i) {
          if (buffer[i] !== 0) return false;
        }
        return true;
      }
      isCoinbase() {
        return this.ins.length === 1 && _Transaction.isCoinbaseHash(this.ins[0].hash);
      }
      addInput(hash, index, sequence, scriptSig) {
        typeforce(
          types.tuple(
            types.Hash256bit,
            types.UInt32,
            types.maybe(types.UInt32),
            types.maybe(types.Buffer)
          ),
          arguments
        );
        if (types.Null(sequence)) {
          sequence = _Transaction.DEFAULT_SEQUENCE;
        }
        return this.ins.push({
          hash,
          index,
          script: scriptSig || EMPTY_BUFFER,
          sequence,
          witness: EMPTY_WITNESS
        }) - 1;
      }
      addOutput(scriptPubKey, value) {
        typeforce(types.tuple(types.Buffer, types.Satoshi), arguments);
        return this.outs.push({
          script: scriptPubKey,
          value
        }) - 1;
      }
      hasWitnesses() {
        return this.ins.some((x) => {
          return x.witness.length !== 0;
        });
      }
      stripWitnesses() {
        this.ins.forEach((input) => {
          input.witness = EMPTY_WITNESS;
        });
      }
      weight() {
        const base = this.byteLength(false);
        const total = this.byteLength(true);
        return base * 3 + total;
      }
      virtualSize() {
        return Math.ceil(this.weight() / 4);
      }
      byteLength(_ALLOW_WITNESS = true) {
        const hasWitnesses = _ALLOW_WITNESS && this.hasWitnesses();
        return (hasWitnesses ? 10 : 8) + bufferutils_1.varuint.encodingLength(this.ins.length) + bufferutils_1.varuint.encodingLength(this.outs.length) + this.ins.reduce((sum, input) => {
          return sum + 40 + varSliceSize(input.script);
        }, 0) + this.outs.reduce((sum, output) => {
          return sum + 8 + varSliceSize(output.script);
        }, 0) + (hasWitnesses ? this.ins.reduce((sum, input) => {
          return sum + vectorSize(input.witness);
        }, 0) : 0);
      }
      clone() {
        const newTx = new _Transaction();
        newTx.version = this.version;
        newTx.locktime = this.locktime;
        newTx.ins = this.ins.map((txIn) => {
          return {
            hash: txIn.hash,
            index: txIn.index,
            script: txIn.script,
            sequence: txIn.sequence,
            witness: txIn.witness
          };
        });
        newTx.outs = this.outs.map((txOut) => {
          return {
            script: txOut.script,
            value: txOut.value
          };
        });
        return newTx;
      }
      /**
       * Hash transaction for signing a specific input.
       *
       * Bitcoin uses a different hash for each signed transaction input.
       * This method copies the transaction, makes the necessary changes based on the
       * hashType, and then hashes the result.
       * This hash can then be used to sign the provided transaction input.
       */
      hashForSignature(inIndex, prevOutScript, hashType) {
        typeforce(
          types.tuple(
            types.UInt32,
            types.Buffer,
            /* types.UInt8 */
            types.Number
          ),
          arguments
        );
        if (inIndex >= this.ins.length) return ONE;
        const ourScript = bscript.compile(
          bscript.decompile(prevOutScript).filter((x) => {
            return x !== script_1.OPS.OP_CODESEPARATOR;
          })
        );
        const txTmp = this.clone();
        if ((hashType & 31) === _Transaction.SIGHASH_NONE) {
          txTmp.outs = [];
          txTmp.ins.forEach((input, i) => {
            if (i === inIndex) return;
            input.sequence = 0;
          });
        } else if ((hashType & 31) === _Transaction.SIGHASH_SINGLE) {
          if (inIndex >= this.outs.length) return ONE;
          txTmp.outs.length = inIndex + 1;
          for (let i = 0; i < inIndex; i++) {
            txTmp.outs[i] = BLANK_OUTPUT;
          }
          txTmp.ins.forEach((input, y) => {
            if (y === inIndex) return;
            input.sequence = 0;
          });
        }
        if (hashType & _Transaction.SIGHASH_ANYONECANPAY) {
          txTmp.ins = [txTmp.ins[inIndex]];
          txTmp.ins[0].script = ourScript;
        } else {
          txTmp.ins.forEach((input) => {
            input.script = EMPTY_BUFFER;
          });
          txTmp.ins[inIndex].script = ourScript;
        }
        const buffer = Buffer.allocUnsafe(txTmp.byteLength(false) + 4);
        buffer.writeInt32LE(hashType, buffer.length - 4);
        txTmp.__toBuffer(buffer, 0, false);
        return bcrypto.hash256(buffer);
      }
      hashForWitnessV1(inIndex, prevOutScripts, values, hashType, leafHash, annex) {
        typeforce(
          types.tuple(
            types.UInt32,
            typeforce.arrayOf(types.Buffer),
            typeforce.arrayOf(types.Satoshi),
            types.UInt32
          ),
          arguments
        );
        if (values.length !== this.ins.length || prevOutScripts.length !== this.ins.length) {
          throw new Error("Must supply prevout script and value for all inputs");
        }
        const outputType = hashType === _Transaction.SIGHASH_DEFAULT ? _Transaction.SIGHASH_ALL : hashType & _Transaction.SIGHASH_OUTPUT_MASK;
        const inputType = hashType & _Transaction.SIGHASH_INPUT_MASK;
        const isAnyoneCanPay = inputType === _Transaction.SIGHASH_ANYONECANPAY;
        const isNone = outputType === _Transaction.SIGHASH_NONE;
        const isSingle = outputType === _Transaction.SIGHASH_SINGLE;
        let hashPrevouts = EMPTY_BUFFER;
        let hashAmounts = EMPTY_BUFFER;
        let hashScriptPubKeys = EMPTY_BUFFER;
        let hashSequences = EMPTY_BUFFER;
        let hashOutputs = EMPTY_BUFFER;
        if (!isAnyoneCanPay) {
          let bufferWriter = bufferutils_1.BufferWriter.withCapacity(
            36 * this.ins.length
          );
          this.ins.forEach((txIn) => {
            bufferWriter.writeSlice(txIn.hash);
            bufferWriter.writeUInt32(txIn.index);
          });
          hashPrevouts = bcrypto.sha256(bufferWriter.end());
          bufferWriter = bufferutils_1.BufferWriter.withCapacity(
            8 * this.ins.length
          );
          values.forEach((value) => bufferWriter.writeUInt64(value));
          hashAmounts = bcrypto.sha256(bufferWriter.end());
          bufferWriter = bufferutils_1.BufferWriter.withCapacity(
            prevOutScripts.map(varSliceSize).reduce((a, b) => a + b)
          );
          prevOutScripts.forEach(
            (prevOutScript) => bufferWriter.writeVarSlice(prevOutScript)
          );
          hashScriptPubKeys = bcrypto.sha256(bufferWriter.end());
          bufferWriter = bufferutils_1.BufferWriter.withCapacity(
            4 * this.ins.length
          );
          this.ins.forEach((txIn) => bufferWriter.writeUInt32(txIn.sequence));
          hashSequences = bcrypto.sha256(bufferWriter.end());
        }
        if (!(isNone || isSingle)) {
          const txOutsSize = this.outs.map((output) => 8 + varSliceSize(output.script)).reduce((a, b) => a + b);
          const bufferWriter = bufferutils_1.BufferWriter.withCapacity(txOutsSize);
          this.outs.forEach((out) => {
            bufferWriter.writeUInt64(out.value);
            bufferWriter.writeVarSlice(out.script);
          });
          hashOutputs = bcrypto.sha256(bufferWriter.end());
        } else if (isSingle && inIndex < this.outs.length) {
          const output = this.outs[inIndex];
          const bufferWriter = bufferutils_1.BufferWriter.withCapacity(
            8 + varSliceSize(output.script)
          );
          bufferWriter.writeUInt64(output.value);
          bufferWriter.writeVarSlice(output.script);
          hashOutputs = bcrypto.sha256(bufferWriter.end());
        }
        const spendType = (leafHash ? 2 : 0) + (annex ? 1 : 0);
        const sigMsgSize = 174 - (isAnyoneCanPay ? 49 : 0) - (isNone ? 32 : 0) + (annex ? 32 : 0) + (leafHash ? 37 : 0);
        const sigMsgWriter = bufferutils_1.BufferWriter.withCapacity(sigMsgSize);
        sigMsgWriter.writeUInt8(hashType);
        sigMsgWriter.writeInt32(this.version);
        sigMsgWriter.writeUInt32(this.locktime);
        sigMsgWriter.writeSlice(hashPrevouts);
        sigMsgWriter.writeSlice(hashAmounts);
        sigMsgWriter.writeSlice(hashScriptPubKeys);
        sigMsgWriter.writeSlice(hashSequences);
        if (!(isNone || isSingle)) {
          sigMsgWriter.writeSlice(hashOutputs);
        }
        sigMsgWriter.writeUInt8(spendType);
        if (isAnyoneCanPay) {
          const input = this.ins[inIndex];
          sigMsgWriter.writeSlice(input.hash);
          sigMsgWriter.writeUInt32(input.index);
          sigMsgWriter.writeUInt64(values[inIndex]);
          sigMsgWriter.writeVarSlice(prevOutScripts[inIndex]);
          sigMsgWriter.writeUInt32(input.sequence);
        } else {
          sigMsgWriter.writeUInt32(inIndex);
        }
        if (annex) {
          const bufferWriter = bufferutils_1.BufferWriter.withCapacity(
            varSliceSize(annex)
          );
          bufferWriter.writeVarSlice(annex);
          sigMsgWriter.writeSlice(bcrypto.sha256(bufferWriter.end()));
        }
        if (isSingle) {
          sigMsgWriter.writeSlice(hashOutputs);
        }
        if (leafHash) {
          sigMsgWriter.writeSlice(leafHash);
          sigMsgWriter.writeUInt8(0);
          sigMsgWriter.writeUInt32(4294967295);
        }
        return bcrypto.taggedHash(
          "TapSighash",
          Buffer.concat([Buffer.from([0]), sigMsgWriter.end()])
        );
      }
      hashForWitnessV0(inIndex, prevOutScript, value, hashType) {
        typeforce(
          types.tuple(types.UInt32, types.Buffer, types.Satoshi, types.UInt32),
          arguments
        );
        let tbuffer = Buffer.from([]);
        let bufferWriter;
        let hashOutputs = ZERO;
        let hashPrevouts = ZERO;
        let hashSequence = ZERO;
        if (!(hashType & _Transaction.SIGHASH_ANYONECANPAY)) {
          tbuffer = Buffer.allocUnsafe(36 * this.ins.length);
          bufferWriter = new bufferutils_1.BufferWriter(tbuffer, 0);
          this.ins.forEach((txIn) => {
            bufferWriter.writeSlice(txIn.hash);
            bufferWriter.writeUInt32(txIn.index);
          });
          hashPrevouts = bcrypto.hash256(tbuffer);
        }
        if (!(hashType & _Transaction.SIGHASH_ANYONECANPAY) && (hashType & 31) !== _Transaction.SIGHASH_SINGLE && (hashType & 31) !== _Transaction.SIGHASH_NONE) {
          tbuffer = Buffer.allocUnsafe(4 * this.ins.length);
          bufferWriter = new bufferutils_1.BufferWriter(tbuffer, 0);
          this.ins.forEach((txIn) => {
            bufferWriter.writeUInt32(txIn.sequence);
          });
          hashSequence = bcrypto.hash256(tbuffer);
        }
        if ((hashType & 31) !== _Transaction.SIGHASH_SINGLE && (hashType & 31) !== _Transaction.SIGHASH_NONE) {
          const txOutsSize = this.outs.reduce((sum, output) => {
            return sum + 8 + varSliceSize(output.script);
          }, 0);
          tbuffer = Buffer.allocUnsafe(txOutsSize);
          bufferWriter = new bufferutils_1.BufferWriter(tbuffer, 0);
          this.outs.forEach((out) => {
            bufferWriter.writeUInt64(out.value);
            bufferWriter.writeVarSlice(out.script);
          });
          hashOutputs = bcrypto.hash256(tbuffer);
        } else if ((hashType & 31) === _Transaction.SIGHASH_SINGLE && inIndex < this.outs.length) {
          const output = this.outs[inIndex];
          tbuffer = Buffer.allocUnsafe(8 + varSliceSize(output.script));
          bufferWriter = new bufferutils_1.BufferWriter(tbuffer, 0);
          bufferWriter.writeUInt64(output.value);
          bufferWriter.writeVarSlice(output.script);
          hashOutputs = bcrypto.hash256(tbuffer);
        }
        tbuffer = Buffer.allocUnsafe(156 + varSliceSize(prevOutScript));
        bufferWriter = new bufferutils_1.BufferWriter(tbuffer, 0);
        const input = this.ins[inIndex];
        bufferWriter.writeInt32(this.version);
        bufferWriter.writeSlice(hashPrevouts);
        bufferWriter.writeSlice(hashSequence);
        bufferWriter.writeSlice(input.hash);
        bufferWriter.writeUInt32(input.index);
        bufferWriter.writeVarSlice(prevOutScript);
        bufferWriter.writeUInt64(value);
        bufferWriter.writeUInt32(input.sequence);
        bufferWriter.writeSlice(hashOutputs);
        bufferWriter.writeUInt32(this.locktime);
        bufferWriter.writeUInt32(hashType);
        return bcrypto.hash256(tbuffer);
      }
      getHash(forWitness) {
        if (forWitness && this.isCoinbase()) return Buffer.alloc(32, 0);
        return bcrypto.hash256(this.__toBuffer(void 0, void 0, forWitness));
      }
      getId() {
        return (0, bufferutils_1.reverseBuffer)(this.getHash(false)).toString(
          "hex"
        );
      }
      toBuffer(buffer, initialOffset) {
        return this.__toBuffer(buffer, initialOffset, true);
      }
      toHex() {
        return this.toBuffer(void 0, void 0).toString("hex");
      }
      setInputScript(index, scriptSig) {
        typeforce(types.tuple(types.Number, types.Buffer), arguments);
        this.ins[index].script = scriptSig;
      }
      setWitness(index, witness) {
        typeforce(types.tuple(types.Number, [types.Buffer]), arguments);
        this.ins[index].witness = witness;
      }
      __toBuffer(buffer, initialOffset, _ALLOW_WITNESS = false) {
        if (!buffer) buffer = Buffer.allocUnsafe(this.byteLength(_ALLOW_WITNESS));
        const bufferWriter = new bufferutils_1.BufferWriter(
          buffer,
          initialOffset || 0
        );
        bufferWriter.writeInt32(this.version);
        const hasWitnesses = _ALLOW_WITNESS && this.hasWitnesses();
        if (hasWitnesses) {
          bufferWriter.writeUInt8(_Transaction.ADVANCED_TRANSACTION_MARKER);
          bufferWriter.writeUInt8(_Transaction.ADVANCED_TRANSACTION_FLAG);
        }
        bufferWriter.writeVarInt(this.ins.length);
        this.ins.forEach((txIn) => {
          bufferWriter.writeSlice(txIn.hash);
          bufferWriter.writeUInt32(txIn.index);
          bufferWriter.writeVarSlice(txIn.script);
          bufferWriter.writeUInt32(txIn.sequence);
        });
        bufferWriter.writeVarInt(this.outs.length);
        this.outs.forEach((txOut) => {
          if (isOutput(txOut)) {
            bufferWriter.writeUInt64(txOut.value);
          } else {
            bufferWriter.writeSlice(txOut.valueBuffer);
          }
          bufferWriter.writeVarSlice(txOut.script);
        });
        if (hasWitnesses) {
          this.ins.forEach((input) => {
            bufferWriter.writeVector(input.witness);
          });
        }
        bufferWriter.writeUInt32(this.locktime);
        if (initialOffset !== void 0)
          return buffer.slice(initialOffset, bufferWriter.offset);
        return buffer;
      }
    };
    exports.Transaction = Transaction;
    Transaction.DEFAULT_SEQUENCE = 4294967295;
    Transaction.SIGHASH_DEFAULT = 0;
    Transaction.SIGHASH_ALL = 1;
    Transaction.SIGHASH_NONE = 2;
    Transaction.SIGHASH_SINGLE = 3;
    Transaction.SIGHASH_ANYONECANPAY = 128;
    Transaction.SIGHASH_OUTPUT_MASK = 3;
    Transaction.SIGHASH_INPUT_MASK = 128;
    Transaction.ADVANCED_TRANSACTION_MARKER = 0;
    Transaction.ADVANCED_TRANSACTION_FLAG = 1;
  }
});

// node_modules/bitcoinjs-lib/src/block.js
var require_block = __commonJS({
  "node_modules/bitcoinjs-lib/src/block.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Block = void 0;
    var bufferutils_1 = require_bufferutils();
    var bcrypto = require_crypto2();
    var merkle_1 = require_merkle();
    var transaction_1 = require_transaction();
    var types = require_types();
    var { typeforce } = types;
    var errorMerkleNoTxes = new TypeError(
      "Cannot compute merkle root for zero transactions"
    );
    var errorWitnessNotSegwit = new TypeError(
      "Cannot compute witness commit for non-segwit block"
    );
    var Block = class _Block {
      constructor() {
        this.version = 1;
        this.prevHash = void 0;
        this.merkleRoot = void 0;
        this.timestamp = 0;
        this.witnessCommit = void 0;
        this.bits = 0;
        this.nonce = 0;
        this.transactions = void 0;
      }
      static fromBuffer(buffer) {
        if (buffer.length < 80) throw new Error("Buffer too small (< 80 bytes)");
        const bufferReader = new bufferutils_1.BufferReader(buffer);
        const block = new _Block();
        block.version = bufferReader.readInt32();
        block.prevHash = bufferReader.readSlice(32);
        block.merkleRoot = bufferReader.readSlice(32);
        block.timestamp = bufferReader.readUInt32();
        block.bits = bufferReader.readUInt32();
        block.nonce = bufferReader.readUInt32();
        if (buffer.length === 80) return block;
        const readTransaction = () => {
          const tx = transaction_1.Transaction.fromBuffer(
            bufferReader.buffer.slice(bufferReader.offset),
            true
          );
          bufferReader.offset += tx.byteLength();
          return tx;
        };
        const nTransactions = bufferReader.readVarInt();
        block.transactions = [];
        for (let i = 0; i < nTransactions; ++i) {
          const tx = readTransaction();
          block.transactions.push(tx);
        }
        const witnessCommit = block.getWitnessCommit();
        if (witnessCommit) block.witnessCommit = witnessCommit;
        return block;
      }
      static fromHex(hex) {
        return _Block.fromBuffer(Buffer.from(hex, "hex"));
      }
      static calculateTarget(bits) {
        const exponent = ((bits & 4278190080) >> 24) - 3;
        const mantissa = bits & 8388607;
        const target = Buffer.alloc(32, 0);
        target.writeUIntBE(mantissa, 29 - exponent, 3);
        return target;
      }
      static calculateMerkleRoot(transactions, forWitness) {
        typeforce([{ getHash: types.Function }], transactions);
        if (transactions.length === 0) throw errorMerkleNoTxes;
        if (forWitness && !txesHaveWitnessCommit(transactions))
          throw errorWitnessNotSegwit;
        const hashes = transactions.map(
          (transaction) => transaction.getHash(forWitness)
        );
        const rootHash = (0, merkle_1.fastMerkleRoot)(hashes, bcrypto.hash256);
        return forWitness ? bcrypto.hash256(
          Buffer.concat([rootHash, transactions[0].ins[0].witness[0]])
        ) : rootHash;
      }
      getWitnessCommit() {
        if (!txesHaveWitnessCommit(this.transactions)) return null;
        const witnessCommits = this.transactions[0].outs.filter(
          (out) => out.script.slice(0, 6).equals(Buffer.from("6a24aa21a9ed", "hex"))
        ).map((out) => out.script.slice(6, 38));
        if (witnessCommits.length === 0) return null;
        const result = witnessCommits[witnessCommits.length - 1];
        if (!(result instanceof Buffer && result.length === 32)) return null;
        return result;
      }
      hasWitnessCommit() {
        if (this.witnessCommit instanceof Buffer && this.witnessCommit.length === 32)
          return true;
        if (this.getWitnessCommit() !== null) return true;
        return false;
      }
      hasWitness() {
        return anyTxHasWitness(this.transactions);
      }
      weight() {
        const base = this.byteLength(false, false);
        const total = this.byteLength(false, true);
        return base * 3 + total;
      }
      byteLength(headersOnly, allowWitness = true) {
        if (headersOnly || !this.transactions) return 80;
        return 80 + bufferutils_1.varuint.encodingLength(this.transactions.length) + this.transactions.reduce((a, x) => a + x.byteLength(allowWitness), 0);
      }
      getHash() {
        return bcrypto.hash256(this.toBuffer(true));
      }
      getId() {
        return (0, bufferutils_1.reverseBuffer)(this.getHash()).toString("hex");
      }
      getUTCDate() {
        const date = /* @__PURE__ */ new Date(0);
        date.setUTCSeconds(this.timestamp);
        return date;
      }
      // TODO: buffer, offset compatibility
      toBuffer(headersOnly) {
        const buffer = Buffer.allocUnsafe(this.byteLength(headersOnly));
        const bufferWriter = new bufferutils_1.BufferWriter(buffer);
        bufferWriter.writeInt32(this.version);
        bufferWriter.writeSlice(this.prevHash);
        bufferWriter.writeSlice(this.merkleRoot);
        bufferWriter.writeUInt32(this.timestamp);
        bufferWriter.writeUInt32(this.bits);
        bufferWriter.writeUInt32(this.nonce);
        if (headersOnly || !this.transactions) return buffer;
        bufferutils_1.varuint.encode(
          this.transactions.length,
          buffer,
          bufferWriter.offset
        );
        bufferWriter.offset += bufferutils_1.varuint.encode.bytes;
        this.transactions.forEach((tx) => {
          const txSize = tx.byteLength();
          tx.toBuffer(buffer, bufferWriter.offset);
          bufferWriter.offset += txSize;
        });
        return buffer;
      }
      toHex(headersOnly) {
        return this.toBuffer(headersOnly).toString("hex");
      }
      checkTxRoots() {
        const hasWitnessCommit = this.hasWitnessCommit();
        if (!hasWitnessCommit && this.hasWitness()) return false;
        return this.__checkMerkleRoot() && (hasWitnessCommit ? this.__checkWitnessCommit() : true);
      }
      checkProofOfWork() {
        const hash = (0, bufferutils_1.reverseBuffer)(this.getHash());
        const target = _Block.calculateTarget(this.bits);
        return hash.compare(target) <= 0;
      }
      __checkMerkleRoot() {
        if (!this.transactions) throw errorMerkleNoTxes;
        const actualMerkleRoot = _Block.calculateMerkleRoot(this.transactions);
        return this.merkleRoot.compare(actualMerkleRoot) === 0;
      }
      __checkWitnessCommit() {
        if (!this.transactions) throw errorMerkleNoTxes;
        if (!this.hasWitnessCommit()) throw errorWitnessNotSegwit;
        const actualWitnessCommit = _Block.calculateMerkleRoot(
          this.transactions,
          true
        );
        return this.witnessCommit.compare(actualWitnessCommit) === 0;
      }
    };
    exports.Block = Block;
    function txesHaveWitnessCommit(transactions) {
      return transactions instanceof Array && transactions[0] && transactions[0].ins && transactions[0].ins instanceof Array && transactions[0].ins[0] && transactions[0].ins[0].witness && transactions[0].ins[0].witness instanceof Array && transactions[0].ins[0].witness.length > 0;
    }
    function anyTxHasWitness(transactions) {
      return transactions instanceof Array && transactions.some(
        (tx) => typeof tx === "object" && tx.ins instanceof Array && tx.ins.some(
          (input) => typeof input === "object" && input.witness instanceof Array && input.witness.length > 0
        )
      );
    }
  }
});

// node_modules/bip174/src/lib/typeFields.js
var require_typeFields = __commonJS({
  "node_modules/bip174/src/lib/typeFields.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var GlobalTypes;
    (function(GlobalTypes2) {
      GlobalTypes2[GlobalTypes2["UNSIGNED_TX"] = 0] = "UNSIGNED_TX";
      GlobalTypes2[GlobalTypes2["GLOBAL_XPUB"] = 1] = "GLOBAL_XPUB";
    })(GlobalTypes = exports.GlobalTypes || (exports.GlobalTypes = {}));
    exports.GLOBAL_TYPE_NAMES = ["unsignedTx", "globalXpub"];
    var InputTypes;
    (function(InputTypes2) {
      InputTypes2[InputTypes2["NON_WITNESS_UTXO"] = 0] = "NON_WITNESS_UTXO";
      InputTypes2[InputTypes2["WITNESS_UTXO"] = 1] = "WITNESS_UTXO";
      InputTypes2[InputTypes2["PARTIAL_SIG"] = 2] = "PARTIAL_SIG";
      InputTypes2[InputTypes2["SIGHASH_TYPE"] = 3] = "SIGHASH_TYPE";
      InputTypes2[InputTypes2["REDEEM_SCRIPT"] = 4] = "REDEEM_SCRIPT";
      InputTypes2[InputTypes2["WITNESS_SCRIPT"] = 5] = "WITNESS_SCRIPT";
      InputTypes2[InputTypes2["BIP32_DERIVATION"] = 6] = "BIP32_DERIVATION";
      InputTypes2[InputTypes2["FINAL_SCRIPTSIG"] = 7] = "FINAL_SCRIPTSIG";
      InputTypes2[InputTypes2["FINAL_SCRIPTWITNESS"] = 8] = "FINAL_SCRIPTWITNESS";
      InputTypes2[InputTypes2["POR_COMMITMENT"] = 9] = "POR_COMMITMENT";
      InputTypes2[InputTypes2["TAP_KEY_SIG"] = 19] = "TAP_KEY_SIG";
      InputTypes2[InputTypes2["TAP_SCRIPT_SIG"] = 20] = "TAP_SCRIPT_SIG";
      InputTypes2[InputTypes2["TAP_LEAF_SCRIPT"] = 21] = "TAP_LEAF_SCRIPT";
      InputTypes2[InputTypes2["TAP_BIP32_DERIVATION"] = 22] = "TAP_BIP32_DERIVATION";
      InputTypes2[InputTypes2["TAP_INTERNAL_KEY"] = 23] = "TAP_INTERNAL_KEY";
      InputTypes2[InputTypes2["TAP_MERKLE_ROOT"] = 24] = "TAP_MERKLE_ROOT";
    })(InputTypes = exports.InputTypes || (exports.InputTypes = {}));
    exports.INPUT_TYPE_NAMES = [
      "nonWitnessUtxo",
      "witnessUtxo",
      "partialSig",
      "sighashType",
      "redeemScript",
      "witnessScript",
      "bip32Derivation",
      "finalScriptSig",
      "finalScriptWitness",
      "porCommitment",
      "tapKeySig",
      "tapScriptSig",
      "tapLeafScript",
      "tapBip32Derivation",
      "tapInternalKey",
      "tapMerkleRoot"
    ];
    var OutputTypes;
    (function(OutputTypes2) {
      OutputTypes2[OutputTypes2["REDEEM_SCRIPT"] = 0] = "REDEEM_SCRIPT";
      OutputTypes2[OutputTypes2["WITNESS_SCRIPT"] = 1] = "WITNESS_SCRIPT";
      OutputTypes2[OutputTypes2["BIP32_DERIVATION"] = 2] = "BIP32_DERIVATION";
      OutputTypes2[OutputTypes2["TAP_INTERNAL_KEY"] = 5] = "TAP_INTERNAL_KEY";
      OutputTypes2[OutputTypes2["TAP_TREE"] = 6] = "TAP_TREE";
      OutputTypes2[OutputTypes2["TAP_BIP32_DERIVATION"] = 7] = "TAP_BIP32_DERIVATION";
    })(OutputTypes = exports.OutputTypes || (exports.OutputTypes = {}));
    exports.OUTPUT_TYPE_NAMES = [
      "redeemScript",
      "witnessScript",
      "bip32Derivation",
      "tapInternalKey",
      "tapTree",
      "tapBip32Derivation"
    ];
  }
});

// node_modules/bip174/src/lib/converter/global/globalXpub.js
var require_globalXpub = __commonJS({
  "node_modules/bip174/src/lib/converter/global/globalXpub.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    var range = (n) => [...Array(n).keys()];
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.GlobalTypes.GLOBAL_XPUB) {
        throw new Error(
          "Decode Error: could not decode globalXpub with key 0x" + keyVal.key.toString("hex")
        );
      }
      if (keyVal.key.length !== 79 || ![2, 3].includes(keyVal.key[46])) {
        throw new Error(
          "Decode Error: globalXpub has invalid extended pubkey in key 0x" + keyVal.key.toString("hex")
        );
      }
      if (keyVal.value.length / 4 % 1 !== 0) {
        throw new Error(
          "Decode Error: Global GLOBAL_XPUB value length should be multiple of 4"
        );
      }
      const extendedPubkey = keyVal.key.slice(1);
      const data = {
        masterFingerprint: keyVal.value.slice(0, 4),
        extendedPubkey,
        path: "m"
      };
      for (const i of range(keyVal.value.length / 4 - 1)) {
        const val = keyVal.value.readUInt32LE(i * 4 + 4);
        const isHard = !!(val & 2147483648);
        const idx = val & 2147483647;
        data.path += "/" + idx.toString(10) + (isHard ? "'" : "");
      }
      return data;
    }
    exports.decode = decode;
    function encode(data) {
      const head = Buffer.from([typeFields_1.GlobalTypes.GLOBAL_XPUB]);
      const key = Buffer.concat([head, data.extendedPubkey]);
      const splitPath = data.path.split("/");
      const value = Buffer.allocUnsafe(splitPath.length * 4);
      data.masterFingerprint.copy(value, 0);
      let offset = 4;
      splitPath.slice(1).forEach((level) => {
        const isHard = level.slice(-1) === "'";
        let num = 2147483647 & parseInt(isHard ? level.slice(0, -1) : level, 10);
        if (isHard) num += 2147483648;
        value.writeUInt32LE(num, offset);
        offset += 4;
      });
      return {
        key,
        value
      };
    }
    exports.encode = encode;
    exports.expected = "{ masterFingerprint: Buffer; extendedPubkey: Buffer; path: string; }";
    function check(data) {
      const epk = data.extendedPubkey;
      const mfp = data.masterFingerprint;
      const p = data.path;
      return Buffer.isBuffer(epk) && epk.length === 78 && [2, 3].indexOf(epk[45]) > -1 && Buffer.isBuffer(mfp) && mfp.length === 4 && typeof p === "string" && !!p.match(/^m(\/\d+'?)*$/);
    }
    exports.check = check;
    function canAddToArray(array, item, dupeSet) {
      const dupeString = item.extendedPubkey.toString("hex");
      if (dupeSet.has(dupeString)) return false;
      dupeSet.add(dupeString);
      return array.filter((v) => v.extendedPubkey.equals(item.extendedPubkey)).length === 0;
    }
    exports.canAddToArray = canAddToArray;
  }
});

// node_modules/bip174/src/lib/converter/global/unsignedTx.js
var require_unsignedTx = __commonJS({
  "node_modules/bip174/src/lib/converter/global/unsignedTx.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function encode(data) {
      return {
        key: Buffer.from([typeFields_1.GlobalTypes.UNSIGNED_TX]),
        value: data.toBuffer()
      };
    }
    exports.encode = encode;
  }
});

// node_modules/bip174/src/lib/converter/input/finalScriptSig.js
var require_finalScriptSig = __commonJS({
  "node_modules/bip174/src/lib/converter/input/finalScriptSig.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.FINAL_SCRIPTSIG) {
        throw new Error(
          "Decode Error: could not decode finalScriptSig with key 0x" + keyVal.key.toString("hex")
        );
      }
      return keyVal.value;
    }
    exports.decode = decode;
    function encode(data) {
      const key = Buffer.from([typeFields_1.InputTypes.FINAL_SCRIPTSIG]);
      return {
        key,
        value: data
      };
    }
    exports.encode = encode;
    exports.expected = "Buffer";
    function check(data) {
      return Buffer.isBuffer(data);
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.finalScriptSig === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/input/finalScriptWitness.js
var require_finalScriptWitness = __commonJS({
  "node_modules/bip174/src/lib/converter/input/finalScriptWitness.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.FINAL_SCRIPTWITNESS) {
        throw new Error(
          "Decode Error: could not decode finalScriptWitness with key 0x" + keyVal.key.toString("hex")
        );
      }
      return keyVal.value;
    }
    exports.decode = decode;
    function encode(data) {
      const key = Buffer.from([typeFields_1.InputTypes.FINAL_SCRIPTWITNESS]);
      return {
        key,
        value: data
      };
    }
    exports.encode = encode;
    exports.expected = "Buffer";
    function check(data) {
      return Buffer.isBuffer(data);
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.finalScriptWitness === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/input/nonWitnessUtxo.js
var require_nonWitnessUtxo = __commonJS({
  "node_modules/bip174/src/lib/converter/input/nonWitnessUtxo.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.NON_WITNESS_UTXO) {
        throw new Error(
          "Decode Error: could not decode nonWitnessUtxo with key 0x" + keyVal.key.toString("hex")
        );
      }
      return keyVal.value;
    }
    exports.decode = decode;
    function encode(data) {
      return {
        key: Buffer.from([typeFields_1.InputTypes.NON_WITNESS_UTXO]),
        value: data
      };
    }
    exports.encode = encode;
    exports.expected = "Buffer";
    function check(data) {
      return Buffer.isBuffer(data);
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.nonWitnessUtxo === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/input/partialSig.js
var require_partialSig = __commonJS({
  "node_modules/bip174/src/lib/converter/input/partialSig.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.PARTIAL_SIG) {
        throw new Error(
          "Decode Error: could not decode partialSig with key 0x" + keyVal.key.toString("hex")
        );
      }
      if (!(keyVal.key.length === 34 || keyVal.key.length === 66) || ![2, 3, 4].includes(keyVal.key[1])) {
        throw new Error(
          "Decode Error: partialSig has invalid pubkey in key 0x" + keyVal.key.toString("hex")
        );
      }
      const pubkey = keyVal.key.slice(1);
      return {
        pubkey,
        signature: keyVal.value
      };
    }
    exports.decode = decode;
    function encode(pSig) {
      const head = Buffer.from([typeFields_1.InputTypes.PARTIAL_SIG]);
      return {
        key: Buffer.concat([head, pSig.pubkey]),
        value: pSig.signature
      };
    }
    exports.encode = encode;
    exports.expected = "{ pubkey: Buffer; signature: Buffer; }";
    function check(data) {
      return Buffer.isBuffer(data.pubkey) && Buffer.isBuffer(data.signature) && [33, 65].includes(data.pubkey.length) && [2, 3, 4].includes(data.pubkey[0]) && isDerSigWithSighash(data.signature);
    }
    exports.check = check;
    function isDerSigWithSighash(buf) {
      if (!Buffer.isBuffer(buf) || buf.length < 9) return false;
      if (buf[0] !== 48) return false;
      if (buf.length !== buf[1] + 3) return false;
      if (buf[2] !== 2) return false;
      const rLen = buf[3];
      if (rLen > 33 || rLen < 1) return false;
      if (buf[3 + rLen + 1] !== 2) return false;
      const sLen = buf[3 + rLen + 2];
      if (sLen > 33 || sLen < 1) return false;
      if (buf.length !== 3 + rLen + 2 + sLen + 2) return false;
      return true;
    }
    function canAddToArray(array, item, dupeSet) {
      const dupeString = item.pubkey.toString("hex");
      if (dupeSet.has(dupeString)) return false;
      dupeSet.add(dupeString);
      return array.filter((v) => v.pubkey.equals(item.pubkey)).length === 0;
    }
    exports.canAddToArray = canAddToArray;
  }
});

// node_modules/bip174/src/lib/converter/input/porCommitment.js
var require_porCommitment = __commonJS({
  "node_modules/bip174/src/lib/converter/input/porCommitment.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.POR_COMMITMENT) {
        throw new Error(
          "Decode Error: could not decode porCommitment with key 0x" + keyVal.key.toString("hex")
        );
      }
      return keyVal.value.toString("utf8");
    }
    exports.decode = decode;
    function encode(data) {
      const key = Buffer.from([typeFields_1.InputTypes.POR_COMMITMENT]);
      return {
        key,
        value: Buffer.from(data, "utf8")
      };
    }
    exports.encode = encode;
    exports.expected = "string";
    function check(data) {
      return typeof data === "string";
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.porCommitment === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/input/sighashType.js
var require_sighashType = __commonJS({
  "node_modules/bip174/src/lib/converter/input/sighashType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.SIGHASH_TYPE) {
        throw new Error(
          "Decode Error: could not decode sighashType with key 0x" + keyVal.key.toString("hex")
        );
      }
      return keyVal.value.readUInt32LE(0);
    }
    exports.decode = decode;
    function encode(data) {
      const key = Buffer.from([typeFields_1.InputTypes.SIGHASH_TYPE]);
      const value = Buffer.allocUnsafe(4);
      value.writeUInt32LE(data, 0);
      return {
        key,
        value
      };
    }
    exports.encode = encode;
    exports.expected = "number";
    function check(data) {
      return typeof data === "number";
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.sighashType === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/input/tapKeySig.js
var require_tapKeySig = __commonJS({
  "node_modules/bip174/src/lib/converter/input/tapKeySig.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.TAP_KEY_SIG || keyVal.key.length !== 1) {
        throw new Error(
          "Decode Error: could not decode tapKeySig with key 0x" + keyVal.key.toString("hex")
        );
      }
      if (!check(keyVal.value)) {
        throw new Error(
          "Decode Error: tapKeySig not a valid 64-65-byte BIP340 signature"
        );
      }
      return keyVal.value;
    }
    exports.decode = decode;
    function encode(value) {
      const key = Buffer.from([typeFields_1.InputTypes.TAP_KEY_SIG]);
      return { key, value };
    }
    exports.encode = encode;
    exports.expected = "Buffer";
    function check(data) {
      return Buffer.isBuffer(data) && (data.length === 64 || data.length === 65);
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.tapKeySig === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/input/tapLeafScript.js
var require_tapLeafScript = __commonJS({
  "node_modules/bip174/src/lib/converter/input/tapLeafScript.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.TAP_LEAF_SCRIPT) {
        throw new Error(
          "Decode Error: could not decode tapLeafScript with key 0x" + keyVal.key.toString("hex")
        );
      }
      if ((keyVal.key.length - 2) % 32 !== 0) {
        throw new Error(
          "Decode Error: tapLeafScript has invalid control block in key 0x" + keyVal.key.toString("hex")
        );
      }
      const leafVersion = keyVal.value[keyVal.value.length - 1];
      if ((keyVal.key[1] & 254) !== leafVersion) {
        throw new Error(
          "Decode Error: tapLeafScript bad leaf version in key 0x" + keyVal.key.toString("hex")
        );
      }
      const script = keyVal.value.slice(0, -1);
      const controlBlock = keyVal.key.slice(1);
      return { controlBlock, script, leafVersion };
    }
    exports.decode = decode;
    function encode(tScript) {
      const head = Buffer.from([typeFields_1.InputTypes.TAP_LEAF_SCRIPT]);
      const verBuf = Buffer.from([tScript.leafVersion]);
      return {
        key: Buffer.concat([head, tScript.controlBlock]),
        value: Buffer.concat([tScript.script, verBuf])
      };
    }
    exports.encode = encode;
    exports.expected = "{ controlBlock: Buffer; leafVersion: number, script: Buffer; }";
    function check(data) {
      return Buffer.isBuffer(data.controlBlock) && (data.controlBlock.length - 1) % 32 === 0 && (data.controlBlock[0] & 254) === data.leafVersion && Buffer.isBuffer(data.script);
    }
    exports.check = check;
    function canAddToArray(array, item, dupeSet) {
      const dupeString = item.controlBlock.toString("hex");
      if (dupeSet.has(dupeString)) return false;
      dupeSet.add(dupeString);
      return array.filter((v) => v.controlBlock.equals(item.controlBlock)).length === 0;
    }
    exports.canAddToArray = canAddToArray;
  }
});

// node_modules/bip174/src/lib/converter/input/tapMerkleRoot.js
var require_tapMerkleRoot = __commonJS({
  "node_modules/bip174/src/lib/converter/input/tapMerkleRoot.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.TAP_MERKLE_ROOT || keyVal.key.length !== 1) {
        throw new Error(
          "Decode Error: could not decode tapMerkleRoot with key 0x" + keyVal.key.toString("hex")
        );
      }
      if (!check(keyVal.value)) {
        throw new Error("Decode Error: tapMerkleRoot not a 32-byte hash");
      }
      return keyVal.value;
    }
    exports.decode = decode;
    function encode(value) {
      const key = Buffer.from([typeFields_1.InputTypes.TAP_MERKLE_ROOT]);
      return { key, value };
    }
    exports.encode = encode;
    exports.expected = "Buffer";
    function check(data) {
      return Buffer.isBuffer(data) && data.length === 32;
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.tapMerkleRoot === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/input/tapScriptSig.js
var require_tapScriptSig = __commonJS({
  "node_modules/bip174/src/lib/converter/input/tapScriptSig.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.TAP_SCRIPT_SIG) {
        throw new Error(
          "Decode Error: could not decode tapScriptSig with key 0x" + keyVal.key.toString("hex")
        );
      }
      if (keyVal.key.length !== 65) {
        throw new Error(
          "Decode Error: tapScriptSig has invalid key 0x" + keyVal.key.toString("hex")
        );
      }
      if (keyVal.value.length !== 64 && keyVal.value.length !== 65) {
        throw new Error(
          "Decode Error: tapScriptSig has invalid signature in key 0x" + keyVal.key.toString("hex")
        );
      }
      const pubkey = keyVal.key.slice(1, 33);
      const leafHash = keyVal.key.slice(33);
      return {
        pubkey,
        leafHash,
        signature: keyVal.value
      };
    }
    exports.decode = decode;
    function encode(tSig) {
      const head = Buffer.from([typeFields_1.InputTypes.TAP_SCRIPT_SIG]);
      return {
        key: Buffer.concat([head, tSig.pubkey, tSig.leafHash]),
        value: tSig.signature
      };
    }
    exports.encode = encode;
    exports.expected = "{ pubkey: Buffer; leafHash: Buffer; signature: Buffer; }";
    function check(data) {
      return Buffer.isBuffer(data.pubkey) && Buffer.isBuffer(data.leafHash) && Buffer.isBuffer(data.signature) && data.pubkey.length === 32 && data.leafHash.length === 32 && (data.signature.length === 64 || data.signature.length === 65);
    }
    exports.check = check;
    function canAddToArray(array, item, dupeSet) {
      const dupeString = item.pubkey.toString("hex") + item.leafHash.toString("hex");
      if (dupeSet.has(dupeString)) return false;
      dupeSet.add(dupeString);
      return array.filter(
        (v) => v.pubkey.equals(item.pubkey) && v.leafHash.equals(item.leafHash)
      ).length === 0;
    }
    exports.canAddToArray = canAddToArray;
  }
});

// node_modules/bip174/src/lib/converter/varint.js
var require_varint = __commonJS({
  "node_modules/bip174/src/lib/converter/varint.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var MAX_SAFE_INTEGER = 9007199254740991;
    function checkUInt53(n) {
      if (n < 0 || n > MAX_SAFE_INTEGER || n % 1 !== 0)
        throw new RangeError("value out of range");
    }
    function encode(_number, buffer, offset) {
      checkUInt53(_number);
      if (!buffer) buffer = Buffer.allocUnsafe(encodingLength(_number));
      if (!Buffer.isBuffer(buffer))
        throw new TypeError("buffer must be a Buffer instance");
      if (!offset) offset = 0;
      if (_number < 253) {
        buffer.writeUInt8(_number, offset);
        Object.assign(encode, { bytes: 1 });
      } else if (_number <= 65535) {
        buffer.writeUInt8(253, offset);
        buffer.writeUInt16LE(_number, offset + 1);
        Object.assign(encode, { bytes: 3 });
      } else if (_number <= 4294967295) {
        buffer.writeUInt8(254, offset);
        buffer.writeUInt32LE(_number, offset + 1);
        Object.assign(encode, { bytes: 5 });
      } else {
        buffer.writeUInt8(255, offset);
        buffer.writeUInt32LE(_number >>> 0, offset + 1);
        buffer.writeUInt32LE(_number / 4294967296 | 0, offset + 5);
        Object.assign(encode, { bytes: 9 });
      }
      return buffer;
    }
    exports.encode = encode;
    function decode(buffer, offset) {
      if (!Buffer.isBuffer(buffer))
        throw new TypeError("buffer must be a Buffer instance");
      if (!offset) offset = 0;
      const first = buffer.readUInt8(offset);
      if (first < 253) {
        Object.assign(decode, { bytes: 1 });
        return first;
      } else if (first === 253) {
        Object.assign(decode, { bytes: 3 });
        return buffer.readUInt16LE(offset + 1);
      } else if (first === 254) {
        Object.assign(decode, { bytes: 5 });
        return buffer.readUInt32LE(offset + 1);
      } else {
        Object.assign(decode, { bytes: 9 });
        const lo = buffer.readUInt32LE(offset + 1);
        const hi = buffer.readUInt32LE(offset + 5);
        const _number = hi * 4294967296 + lo;
        checkUInt53(_number);
        return _number;
      }
    }
    exports.decode = decode;
    function encodingLength(_number) {
      checkUInt53(_number);
      return _number < 253 ? 1 : _number <= 65535 ? 3 : _number <= 4294967295 ? 5 : 9;
    }
    exports.encodingLength = encodingLength;
  }
});

// node_modules/bip174/src/lib/converter/tools.js
var require_tools = __commonJS({
  "node_modules/bip174/src/lib/converter/tools.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var varuint = require_varint();
    exports.range = (n) => [...Array(n).keys()];
    function reverseBuffer(buffer) {
      if (buffer.length < 1) return buffer;
      let j = buffer.length - 1;
      let tmp = 0;
      for (let i = 0; i < buffer.length / 2; i++) {
        tmp = buffer[i];
        buffer[i] = buffer[j];
        buffer[j] = tmp;
        j--;
      }
      return buffer;
    }
    exports.reverseBuffer = reverseBuffer;
    function keyValsToBuffer(keyVals) {
      const buffers = keyVals.map(keyValToBuffer);
      buffers.push(Buffer.from([0]));
      return Buffer.concat(buffers);
    }
    exports.keyValsToBuffer = keyValsToBuffer;
    function keyValToBuffer(keyVal) {
      const keyLen = keyVal.key.length;
      const valLen = keyVal.value.length;
      const keyVarIntLen = varuint.encodingLength(keyLen);
      const valVarIntLen = varuint.encodingLength(valLen);
      const buffer = Buffer.allocUnsafe(
        keyVarIntLen + keyLen + valVarIntLen + valLen
      );
      varuint.encode(keyLen, buffer, 0);
      keyVal.key.copy(buffer, keyVarIntLen);
      varuint.encode(valLen, buffer, keyVarIntLen + keyLen);
      keyVal.value.copy(buffer, keyVarIntLen + keyLen + valVarIntLen);
      return buffer;
    }
    exports.keyValToBuffer = keyValToBuffer;
    function verifuint(value, max) {
      if (typeof value !== "number")
        throw new Error("cannot write a non-number as a number");
      if (value < 0)
        throw new Error("specified a negative value for writing an unsigned value");
      if (value > max) throw new Error("RangeError: value out of range");
      if (Math.floor(value) !== value)
        throw new Error("value has a fractional component");
    }
    function readUInt64LE(buffer, offset) {
      const a = buffer.readUInt32LE(offset);
      let b = buffer.readUInt32LE(offset + 4);
      b *= 4294967296;
      verifuint(b + a, 9007199254740991);
      return b + a;
    }
    exports.readUInt64LE = readUInt64LE;
    function writeUInt64LE(buffer, value, offset) {
      verifuint(value, 9007199254740991);
      buffer.writeInt32LE(value & -1, offset);
      buffer.writeUInt32LE(Math.floor(value / 4294967296), offset + 4);
      return offset + 8;
    }
    exports.writeUInt64LE = writeUInt64LE;
  }
});

// node_modules/bip174/src/lib/converter/input/witnessUtxo.js
var require_witnessUtxo = __commonJS({
  "node_modules/bip174/src/lib/converter/input/witnessUtxo.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    var tools_1 = require_tools();
    var varuint = require_varint();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.InputTypes.WITNESS_UTXO) {
        throw new Error(
          "Decode Error: could not decode witnessUtxo with key 0x" + keyVal.key.toString("hex")
        );
      }
      const value = tools_1.readUInt64LE(keyVal.value, 0);
      let _offset = 8;
      const scriptLen = varuint.decode(keyVal.value, _offset);
      _offset += varuint.encodingLength(scriptLen);
      const script = keyVal.value.slice(_offset);
      if (script.length !== scriptLen) {
        throw new Error("Decode Error: WITNESS_UTXO script is not proper length");
      }
      return {
        script,
        value
      };
    }
    exports.decode = decode;
    function encode(data) {
      const { script, value } = data;
      const varintLen = varuint.encodingLength(script.length);
      const result = Buffer.allocUnsafe(8 + varintLen + script.length);
      tools_1.writeUInt64LE(result, value, 0);
      varuint.encode(script.length, result, 8);
      script.copy(result, 8 + varintLen);
      return {
        key: Buffer.from([typeFields_1.InputTypes.WITNESS_UTXO]),
        value: result
      };
    }
    exports.encode = encode;
    exports.expected = "{ script: Buffer; value: number; }";
    function check(data) {
      return Buffer.isBuffer(data.script) && typeof data.value === "number";
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.witnessUtxo === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/output/tapTree.js
var require_tapTree = __commonJS({
  "node_modules/bip174/src/lib/converter/output/tapTree.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    var varuint = require_varint();
    function decode(keyVal) {
      if (keyVal.key[0] !== typeFields_1.OutputTypes.TAP_TREE || keyVal.key.length !== 1) {
        throw new Error(
          "Decode Error: could not decode tapTree with key 0x" + keyVal.key.toString("hex")
        );
      }
      let _offset = 0;
      const data = [];
      while (_offset < keyVal.value.length) {
        const depth = keyVal.value[_offset++];
        const leafVersion = keyVal.value[_offset++];
        const scriptLen = varuint.decode(keyVal.value, _offset);
        _offset += varuint.encodingLength(scriptLen);
        data.push({
          depth,
          leafVersion,
          script: keyVal.value.slice(_offset, _offset + scriptLen)
        });
        _offset += scriptLen;
      }
      return { leaves: data };
    }
    exports.decode = decode;
    function encode(tree) {
      const key = Buffer.from([typeFields_1.OutputTypes.TAP_TREE]);
      const bufs = [].concat(
        ...tree.leaves.map((tapLeaf) => [
          Buffer.of(tapLeaf.depth, tapLeaf.leafVersion),
          varuint.encode(tapLeaf.script.length),
          tapLeaf.script
        ])
      );
      return {
        key,
        value: Buffer.concat(bufs)
      };
    }
    exports.encode = encode;
    exports.expected = "{ leaves: [{ depth: number; leafVersion: number, script: Buffer; }] }";
    function check(data) {
      return Array.isArray(data.leaves) && data.leaves.every(
        (tapLeaf) => tapLeaf.depth >= 0 && tapLeaf.depth <= 128 && (tapLeaf.leafVersion & 254) === tapLeaf.leafVersion && Buffer.isBuffer(tapLeaf.script)
      );
    }
    exports.check = check;
    function canAdd(currentData, newData) {
      return !!currentData && !!newData && currentData.tapTree === void 0;
    }
    exports.canAdd = canAdd;
  }
});

// node_modules/bip174/src/lib/converter/shared/bip32Derivation.js
var require_bip32Derivation = __commonJS({
  "node_modules/bip174/src/lib/converter/shared/bip32Derivation.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var range = (n) => [...Array(n).keys()];
    var isValidDERKey = (pubkey) => pubkey.length === 33 && [2, 3].includes(pubkey[0]) || pubkey.length === 65 && 4 === pubkey[0];
    function makeConverter(TYPE_BYTE, isValidPubkey = isValidDERKey) {
      function decode(keyVal) {
        if (keyVal.key[0] !== TYPE_BYTE) {
          throw new Error(
            "Decode Error: could not decode bip32Derivation with key 0x" + keyVal.key.toString("hex")
          );
        }
        const pubkey = keyVal.key.slice(1);
        if (!isValidPubkey(pubkey)) {
          throw new Error(
            "Decode Error: bip32Derivation has invalid pubkey in key 0x" + keyVal.key.toString("hex")
          );
        }
        if (keyVal.value.length / 4 % 1 !== 0) {
          throw new Error(
            "Decode Error: Input BIP32_DERIVATION value length should be multiple of 4"
          );
        }
        const data = {
          masterFingerprint: keyVal.value.slice(0, 4),
          pubkey,
          path: "m"
        };
        for (const i of range(keyVal.value.length / 4 - 1)) {
          const val = keyVal.value.readUInt32LE(i * 4 + 4);
          const isHard = !!(val & 2147483648);
          const idx = val & 2147483647;
          data.path += "/" + idx.toString(10) + (isHard ? "'" : "");
        }
        return data;
      }
      function encode(data) {
        const head = Buffer.from([TYPE_BYTE]);
        const key = Buffer.concat([head, data.pubkey]);
        const splitPath = data.path.split("/");
        const value = Buffer.allocUnsafe(splitPath.length * 4);
        data.masterFingerprint.copy(value, 0);
        let offset = 4;
        splitPath.slice(1).forEach((level) => {
          const isHard = level.slice(-1) === "'";
          let num = 2147483647 & parseInt(isHard ? level.slice(0, -1) : level, 10);
          if (isHard) num += 2147483648;
          value.writeUInt32LE(num, offset);
          offset += 4;
        });
        return {
          key,
          value
        };
      }
      const expected = "{ masterFingerprint: Buffer; pubkey: Buffer; path: string; }";
      function check(data) {
        return Buffer.isBuffer(data.pubkey) && Buffer.isBuffer(data.masterFingerprint) && typeof data.path === "string" && isValidPubkey(data.pubkey) && data.masterFingerprint.length === 4;
      }
      function canAddToArray(array, item, dupeSet) {
        const dupeString = item.pubkey.toString("hex");
        if (dupeSet.has(dupeString)) return false;
        dupeSet.add(dupeString);
        return array.filter((v) => v.pubkey.equals(item.pubkey)).length === 0;
      }
      return {
        decode,
        encode,
        check,
        expected,
        canAddToArray
      };
    }
    exports.makeConverter = makeConverter;
  }
});

// node_modules/bip174/src/lib/converter/shared/checkPubkey.js
var require_checkPubkey = __commonJS({
  "node_modules/bip174/src/lib/converter/shared/checkPubkey.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function makeChecker(pubkeyTypes) {
      return checkPubkey;
      function checkPubkey(keyVal) {
        let pubkey;
        if (pubkeyTypes.includes(keyVal.key[0])) {
          pubkey = keyVal.key.slice(1);
          if (!(pubkey.length === 33 || pubkey.length === 65) || ![2, 3, 4].includes(pubkey[0])) {
            throw new Error(
              "Format Error: invalid pubkey in key 0x" + keyVal.key.toString("hex")
            );
          }
        }
        return pubkey;
      }
    }
    exports.makeChecker = makeChecker;
  }
});

// node_modules/bip174/src/lib/converter/shared/redeemScript.js
var require_redeemScript = __commonJS({
  "node_modules/bip174/src/lib/converter/shared/redeemScript.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function makeConverter(TYPE_BYTE) {
      function decode(keyVal) {
        if (keyVal.key[0] !== TYPE_BYTE) {
          throw new Error(
            "Decode Error: could not decode redeemScript with key 0x" + keyVal.key.toString("hex")
          );
        }
        return keyVal.value;
      }
      function encode(data) {
        const key = Buffer.from([TYPE_BYTE]);
        return {
          key,
          value: data
        };
      }
      const expected = "Buffer";
      function check(data) {
        return Buffer.isBuffer(data);
      }
      function canAdd(currentData, newData) {
        return !!currentData && !!newData && currentData.redeemScript === void 0;
      }
      return {
        decode,
        encode,
        check,
        expected,
        canAdd
      };
    }
    exports.makeConverter = makeConverter;
  }
});

// node_modules/bip174/src/lib/converter/shared/tapBip32Derivation.js
var require_tapBip32Derivation = __commonJS({
  "node_modules/bip174/src/lib/converter/shared/tapBip32Derivation.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var varuint = require_varint();
    var bip32Derivation = require_bip32Derivation();
    var isValidBIP340Key = (pubkey) => pubkey.length === 32;
    function makeConverter(TYPE_BYTE) {
      const parent = bip32Derivation.makeConverter(TYPE_BYTE, isValidBIP340Key);
      function decode(keyVal) {
        const nHashes = varuint.decode(keyVal.value);
        const nHashesLen = varuint.encodingLength(nHashes);
        const base = parent.decode({
          key: keyVal.key,
          value: keyVal.value.slice(nHashesLen + nHashes * 32)
        });
        const leafHashes = new Array(nHashes);
        for (let i = 0, _offset = nHashesLen; i < nHashes; i++, _offset += 32) {
          leafHashes[i] = keyVal.value.slice(_offset, _offset + 32);
        }
        return Object.assign({}, base, { leafHashes });
      }
      function encode(data) {
        const base = parent.encode(data);
        const nHashesLen = varuint.encodingLength(data.leafHashes.length);
        const nHashesBuf = Buffer.allocUnsafe(nHashesLen);
        varuint.encode(data.leafHashes.length, nHashesBuf);
        const value = Buffer.concat([nHashesBuf, ...data.leafHashes, base.value]);
        return Object.assign({}, base, { value });
      }
      const expected = "{ masterFingerprint: Buffer; pubkey: Buffer; path: string; leafHashes: Buffer[]; }";
      function check(data) {
        return Array.isArray(data.leafHashes) && data.leafHashes.every(
          (leafHash) => Buffer.isBuffer(leafHash) && leafHash.length === 32
        ) && parent.check(data);
      }
      return {
        decode,
        encode,
        check,
        expected,
        canAddToArray: parent.canAddToArray
      };
    }
    exports.makeConverter = makeConverter;
  }
});

// node_modules/bip174/src/lib/converter/shared/tapInternalKey.js
var require_tapInternalKey = __commonJS({
  "node_modules/bip174/src/lib/converter/shared/tapInternalKey.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function makeConverter(TYPE_BYTE) {
      function decode(keyVal) {
        if (keyVal.key[0] !== TYPE_BYTE || keyVal.key.length !== 1) {
          throw new Error(
            "Decode Error: could not decode tapInternalKey with key 0x" + keyVal.key.toString("hex")
          );
        }
        if (keyVal.value.length !== 32) {
          throw new Error(
            "Decode Error: tapInternalKey not a 32-byte x-only pubkey"
          );
        }
        return keyVal.value;
      }
      function encode(value) {
        const key = Buffer.from([TYPE_BYTE]);
        return { key, value };
      }
      const expected = "Buffer";
      function check(data) {
        return Buffer.isBuffer(data) && data.length === 32;
      }
      function canAdd(currentData, newData) {
        return !!currentData && !!newData && currentData.tapInternalKey === void 0;
      }
      return {
        decode,
        encode,
        check,
        expected,
        canAdd
      };
    }
    exports.makeConverter = makeConverter;
  }
});

// node_modules/bip174/src/lib/converter/shared/witnessScript.js
var require_witnessScript = __commonJS({
  "node_modules/bip174/src/lib/converter/shared/witnessScript.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function makeConverter(TYPE_BYTE) {
      function decode(keyVal) {
        if (keyVal.key[0] !== TYPE_BYTE) {
          throw new Error(
            "Decode Error: could not decode witnessScript with key 0x" + keyVal.key.toString("hex")
          );
        }
        return keyVal.value;
      }
      function encode(data) {
        const key = Buffer.from([TYPE_BYTE]);
        return {
          key,
          value: data
        };
      }
      const expected = "Buffer";
      function check(data) {
        return Buffer.isBuffer(data);
      }
      function canAdd(currentData, newData) {
        return !!currentData && !!newData && currentData.witnessScript === void 0;
      }
      return {
        decode,
        encode,
        check,
        expected,
        canAdd
      };
    }
    exports.makeConverter = makeConverter;
  }
});

// node_modules/bip174/src/lib/converter/index.js
var require_converter = __commonJS({
  "node_modules/bip174/src/lib/converter/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typeFields_1 = require_typeFields();
    var globalXpub = require_globalXpub();
    var unsignedTx = require_unsignedTx();
    var finalScriptSig = require_finalScriptSig();
    var finalScriptWitness = require_finalScriptWitness();
    var nonWitnessUtxo = require_nonWitnessUtxo();
    var partialSig = require_partialSig();
    var porCommitment = require_porCommitment();
    var sighashType = require_sighashType();
    var tapKeySig = require_tapKeySig();
    var tapLeafScript = require_tapLeafScript();
    var tapMerkleRoot = require_tapMerkleRoot();
    var tapScriptSig = require_tapScriptSig();
    var witnessUtxo = require_witnessUtxo();
    var tapTree = require_tapTree();
    var bip32Derivation = require_bip32Derivation();
    var checkPubkey = require_checkPubkey();
    var redeemScript = require_redeemScript();
    var tapBip32Derivation = require_tapBip32Derivation();
    var tapInternalKey = require_tapInternalKey();
    var witnessScript = require_witnessScript();
    var globals = {
      unsignedTx,
      globalXpub,
      // pass an Array of key bytes that require pubkey beside the key
      checkPubkey: checkPubkey.makeChecker([])
    };
    exports.globals = globals;
    var inputs = {
      nonWitnessUtxo,
      partialSig,
      sighashType,
      finalScriptSig,
      finalScriptWitness,
      porCommitment,
      witnessUtxo,
      bip32Derivation: bip32Derivation.makeConverter(
        typeFields_1.InputTypes.BIP32_DERIVATION
      ),
      redeemScript: redeemScript.makeConverter(
        typeFields_1.InputTypes.REDEEM_SCRIPT
      ),
      witnessScript: witnessScript.makeConverter(
        typeFields_1.InputTypes.WITNESS_SCRIPT
      ),
      checkPubkey: checkPubkey.makeChecker([
        typeFields_1.InputTypes.PARTIAL_SIG,
        typeFields_1.InputTypes.BIP32_DERIVATION
      ]),
      tapKeySig,
      tapScriptSig,
      tapLeafScript,
      tapBip32Derivation: tapBip32Derivation.makeConverter(
        typeFields_1.InputTypes.TAP_BIP32_DERIVATION
      ),
      tapInternalKey: tapInternalKey.makeConverter(
        typeFields_1.InputTypes.TAP_INTERNAL_KEY
      ),
      tapMerkleRoot
    };
    exports.inputs = inputs;
    var outputs = {
      bip32Derivation: bip32Derivation.makeConverter(
        typeFields_1.OutputTypes.BIP32_DERIVATION
      ),
      redeemScript: redeemScript.makeConverter(
        typeFields_1.OutputTypes.REDEEM_SCRIPT
      ),
      witnessScript: witnessScript.makeConverter(
        typeFields_1.OutputTypes.WITNESS_SCRIPT
      ),
      checkPubkey: checkPubkey.makeChecker([
        typeFields_1.OutputTypes.BIP32_DERIVATION
      ]),
      tapBip32Derivation: tapBip32Derivation.makeConverter(
        typeFields_1.OutputTypes.TAP_BIP32_DERIVATION
      ),
      tapTree,
      tapInternalKey: tapInternalKey.makeConverter(
        typeFields_1.OutputTypes.TAP_INTERNAL_KEY
      )
    };
    exports.outputs = outputs;
  }
});

// node_modules/bip174/src/lib/parser/fromBuffer.js
var require_fromBuffer = __commonJS({
  "node_modules/bip174/src/lib/parser/fromBuffer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var convert = require_converter();
    var tools_1 = require_tools();
    var varuint = require_varint();
    var typeFields_1 = require_typeFields();
    function psbtFromBuffer(buffer, txGetter) {
      let offset = 0;
      function varSlice() {
        const keyLen = varuint.decode(buffer, offset);
        offset += varuint.encodingLength(keyLen);
        const key = buffer.slice(offset, offset + keyLen);
        offset += keyLen;
        return key;
      }
      function readUInt32BE() {
        const num = buffer.readUInt32BE(offset);
        offset += 4;
        return num;
      }
      function readUInt8() {
        const num = buffer.readUInt8(offset);
        offset += 1;
        return num;
      }
      function getKeyValue() {
        const key = varSlice();
        const value = varSlice();
        return {
          key,
          value
        };
      }
      function checkEndOfKeyValPairs() {
        if (offset >= buffer.length) {
          throw new Error("Format Error: Unexpected End of PSBT");
        }
        const isEnd = buffer.readUInt8(offset) === 0;
        if (isEnd) {
          offset++;
        }
        return isEnd;
      }
      if (readUInt32BE() !== 1886610036) {
        throw new Error("Format Error: Invalid Magic Number");
      }
      if (readUInt8() !== 255) {
        throw new Error(
          "Format Error: Magic Number must be followed by 0xff separator"
        );
      }
      const globalMapKeyVals = [];
      const globalKeyIndex = {};
      while (!checkEndOfKeyValPairs()) {
        const keyVal = getKeyValue();
        const hexKey = keyVal.key.toString("hex");
        if (globalKeyIndex[hexKey]) {
          throw new Error(
            "Format Error: Keys must be unique for global keymap: key " + hexKey
          );
        }
        globalKeyIndex[hexKey] = 1;
        globalMapKeyVals.push(keyVal);
      }
      const unsignedTxMaps = globalMapKeyVals.filter(
        (keyVal) => keyVal.key[0] === typeFields_1.GlobalTypes.UNSIGNED_TX
      );
      if (unsignedTxMaps.length !== 1) {
        throw new Error("Format Error: Only one UNSIGNED_TX allowed");
      }
      const unsignedTx = txGetter(unsignedTxMaps[0].value);
      const { inputCount, outputCount } = unsignedTx.getInputOutputCounts();
      const inputKeyVals = [];
      const outputKeyVals = [];
      for (const index of tools_1.range(inputCount)) {
        const inputKeyIndex = {};
        const input = [];
        while (!checkEndOfKeyValPairs()) {
          const keyVal = getKeyValue();
          const hexKey = keyVal.key.toString("hex");
          if (inputKeyIndex[hexKey]) {
            throw new Error(
              "Format Error: Keys must be unique for each input: input index " + index + " key " + hexKey
            );
          }
          inputKeyIndex[hexKey] = 1;
          input.push(keyVal);
        }
        inputKeyVals.push(input);
      }
      for (const index of tools_1.range(outputCount)) {
        const outputKeyIndex = {};
        const output = [];
        while (!checkEndOfKeyValPairs()) {
          const keyVal = getKeyValue();
          const hexKey = keyVal.key.toString("hex");
          if (outputKeyIndex[hexKey]) {
            throw new Error(
              "Format Error: Keys must be unique for each output: output index " + index + " key " + hexKey
            );
          }
          outputKeyIndex[hexKey] = 1;
          output.push(keyVal);
        }
        outputKeyVals.push(output);
      }
      return psbtFromKeyVals(unsignedTx, {
        globalMapKeyVals,
        inputKeyVals,
        outputKeyVals
      });
    }
    exports.psbtFromBuffer = psbtFromBuffer;
    function checkKeyBuffer(type, keyBuf, keyNum) {
      if (!keyBuf.equals(Buffer.from([keyNum]))) {
        throw new Error(
          `Format Error: Invalid ${type} key: ${keyBuf.toString("hex")}`
        );
      }
    }
    exports.checkKeyBuffer = checkKeyBuffer;
    function psbtFromKeyVals(unsignedTx, { globalMapKeyVals, inputKeyVals, outputKeyVals }) {
      const globalMap = {
        unsignedTx
      };
      let txCount = 0;
      for (const keyVal of globalMapKeyVals) {
        switch (keyVal.key[0]) {
          case typeFields_1.GlobalTypes.UNSIGNED_TX:
            checkKeyBuffer(
              "global",
              keyVal.key,
              typeFields_1.GlobalTypes.UNSIGNED_TX
            );
            if (txCount > 0) {
              throw new Error("Format Error: GlobalMap has multiple UNSIGNED_TX");
            }
            txCount++;
            break;
          case typeFields_1.GlobalTypes.GLOBAL_XPUB:
            if (globalMap.globalXpub === void 0) {
              globalMap.globalXpub = [];
            }
            globalMap.globalXpub.push(convert.globals.globalXpub.decode(keyVal));
            break;
          default:
            if (!globalMap.unknownKeyVals) globalMap.unknownKeyVals = [];
            globalMap.unknownKeyVals.push(keyVal);
        }
      }
      const inputCount = inputKeyVals.length;
      const outputCount = outputKeyVals.length;
      const inputs = [];
      const outputs = [];
      for (const index of tools_1.range(inputCount)) {
        const input = {};
        for (const keyVal of inputKeyVals[index]) {
          convert.inputs.checkPubkey(keyVal);
          switch (keyVal.key[0]) {
            case typeFields_1.InputTypes.NON_WITNESS_UTXO:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.NON_WITNESS_UTXO
              );
              if (input.nonWitnessUtxo !== void 0) {
                throw new Error(
                  "Format Error: Input has multiple NON_WITNESS_UTXO"
                );
              }
              input.nonWitnessUtxo = convert.inputs.nonWitnessUtxo.decode(keyVal);
              break;
            case typeFields_1.InputTypes.WITNESS_UTXO:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.WITNESS_UTXO
              );
              if (input.witnessUtxo !== void 0) {
                throw new Error("Format Error: Input has multiple WITNESS_UTXO");
              }
              input.witnessUtxo = convert.inputs.witnessUtxo.decode(keyVal);
              break;
            case typeFields_1.InputTypes.PARTIAL_SIG:
              if (input.partialSig === void 0) {
                input.partialSig = [];
              }
              input.partialSig.push(convert.inputs.partialSig.decode(keyVal));
              break;
            case typeFields_1.InputTypes.SIGHASH_TYPE:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.SIGHASH_TYPE
              );
              if (input.sighashType !== void 0) {
                throw new Error("Format Error: Input has multiple SIGHASH_TYPE");
              }
              input.sighashType = convert.inputs.sighashType.decode(keyVal);
              break;
            case typeFields_1.InputTypes.REDEEM_SCRIPT:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.REDEEM_SCRIPT
              );
              if (input.redeemScript !== void 0) {
                throw new Error("Format Error: Input has multiple REDEEM_SCRIPT");
              }
              input.redeemScript = convert.inputs.redeemScript.decode(keyVal);
              break;
            case typeFields_1.InputTypes.WITNESS_SCRIPT:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.WITNESS_SCRIPT
              );
              if (input.witnessScript !== void 0) {
                throw new Error("Format Error: Input has multiple WITNESS_SCRIPT");
              }
              input.witnessScript = convert.inputs.witnessScript.decode(keyVal);
              break;
            case typeFields_1.InputTypes.BIP32_DERIVATION:
              if (input.bip32Derivation === void 0) {
                input.bip32Derivation = [];
              }
              input.bip32Derivation.push(
                convert.inputs.bip32Derivation.decode(keyVal)
              );
              break;
            case typeFields_1.InputTypes.FINAL_SCRIPTSIG:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.FINAL_SCRIPTSIG
              );
              input.finalScriptSig = convert.inputs.finalScriptSig.decode(keyVal);
              break;
            case typeFields_1.InputTypes.FINAL_SCRIPTWITNESS:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.FINAL_SCRIPTWITNESS
              );
              input.finalScriptWitness = convert.inputs.finalScriptWitness.decode(
                keyVal
              );
              break;
            case typeFields_1.InputTypes.POR_COMMITMENT:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.POR_COMMITMENT
              );
              input.porCommitment = convert.inputs.porCommitment.decode(keyVal);
              break;
            case typeFields_1.InputTypes.TAP_KEY_SIG:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.TAP_KEY_SIG
              );
              input.tapKeySig = convert.inputs.tapKeySig.decode(keyVal);
              break;
            case typeFields_1.InputTypes.TAP_SCRIPT_SIG:
              if (input.tapScriptSig === void 0) {
                input.tapScriptSig = [];
              }
              input.tapScriptSig.push(convert.inputs.tapScriptSig.decode(keyVal));
              break;
            case typeFields_1.InputTypes.TAP_LEAF_SCRIPT:
              if (input.tapLeafScript === void 0) {
                input.tapLeafScript = [];
              }
              input.tapLeafScript.push(convert.inputs.tapLeafScript.decode(keyVal));
              break;
            case typeFields_1.InputTypes.TAP_BIP32_DERIVATION:
              if (input.tapBip32Derivation === void 0) {
                input.tapBip32Derivation = [];
              }
              input.tapBip32Derivation.push(
                convert.inputs.tapBip32Derivation.decode(keyVal)
              );
              break;
            case typeFields_1.InputTypes.TAP_INTERNAL_KEY:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.TAP_INTERNAL_KEY
              );
              input.tapInternalKey = convert.inputs.tapInternalKey.decode(keyVal);
              break;
            case typeFields_1.InputTypes.TAP_MERKLE_ROOT:
              checkKeyBuffer(
                "input",
                keyVal.key,
                typeFields_1.InputTypes.TAP_MERKLE_ROOT
              );
              input.tapMerkleRoot = convert.inputs.tapMerkleRoot.decode(keyVal);
              break;
            default:
              if (!input.unknownKeyVals) input.unknownKeyVals = [];
              input.unknownKeyVals.push(keyVal);
          }
        }
        inputs.push(input);
      }
      for (const index of tools_1.range(outputCount)) {
        const output = {};
        for (const keyVal of outputKeyVals[index]) {
          convert.outputs.checkPubkey(keyVal);
          switch (keyVal.key[0]) {
            case typeFields_1.OutputTypes.REDEEM_SCRIPT:
              checkKeyBuffer(
                "output",
                keyVal.key,
                typeFields_1.OutputTypes.REDEEM_SCRIPT
              );
              if (output.redeemScript !== void 0) {
                throw new Error("Format Error: Output has multiple REDEEM_SCRIPT");
              }
              output.redeemScript = convert.outputs.redeemScript.decode(keyVal);
              break;
            case typeFields_1.OutputTypes.WITNESS_SCRIPT:
              checkKeyBuffer(
                "output",
                keyVal.key,
                typeFields_1.OutputTypes.WITNESS_SCRIPT
              );
              if (output.witnessScript !== void 0) {
                throw new Error("Format Error: Output has multiple WITNESS_SCRIPT");
              }
              output.witnessScript = convert.outputs.witnessScript.decode(keyVal);
              break;
            case typeFields_1.OutputTypes.BIP32_DERIVATION:
              if (output.bip32Derivation === void 0) {
                output.bip32Derivation = [];
              }
              output.bip32Derivation.push(
                convert.outputs.bip32Derivation.decode(keyVal)
              );
              break;
            case typeFields_1.OutputTypes.TAP_INTERNAL_KEY:
              checkKeyBuffer(
                "output",
                keyVal.key,
                typeFields_1.OutputTypes.TAP_INTERNAL_KEY
              );
              output.tapInternalKey = convert.outputs.tapInternalKey.decode(keyVal);
              break;
            case typeFields_1.OutputTypes.TAP_TREE:
              checkKeyBuffer(
                "output",
                keyVal.key,
                typeFields_1.OutputTypes.TAP_TREE
              );
              output.tapTree = convert.outputs.tapTree.decode(keyVal);
              break;
            case typeFields_1.OutputTypes.TAP_BIP32_DERIVATION:
              if (output.tapBip32Derivation === void 0) {
                output.tapBip32Derivation = [];
              }
              output.tapBip32Derivation.push(
                convert.outputs.tapBip32Derivation.decode(keyVal)
              );
              break;
            default:
              if (!output.unknownKeyVals) output.unknownKeyVals = [];
              output.unknownKeyVals.push(keyVal);
          }
        }
        outputs.push(output);
      }
      return { globalMap, inputs, outputs };
    }
    exports.psbtFromKeyVals = psbtFromKeyVals;
  }
});

// node_modules/bip174/src/lib/parser/toBuffer.js
var require_toBuffer = __commonJS({
  "node_modules/bip174/src/lib/parser/toBuffer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var convert = require_converter();
    var tools_1 = require_tools();
    function psbtToBuffer({ globalMap, inputs, outputs }) {
      const { globalKeyVals, inputKeyVals, outputKeyVals } = psbtToKeyVals({
        globalMap,
        inputs,
        outputs
      });
      const globalBuffer = tools_1.keyValsToBuffer(globalKeyVals);
      const keyValsOrEmptyToBuffer = (keyVals) => keyVals.length === 0 ? [Buffer.from([0])] : keyVals.map(tools_1.keyValsToBuffer);
      const inputBuffers = keyValsOrEmptyToBuffer(inputKeyVals);
      const outputBuffers = keyValsOrEmptyToBuffer(outputKeyVals);
      const header = Buffer.allocUnsafe(5);
      header.writeUIntBE(482972169471, 0, 5);
      return Buffer.concat(
        [header, globalBuffer].concat(inputBuffers, outputBuffers)
      );
    }
    exports.psbtToBuffer = psbtToBuffer;
    var sortKeyVals = (a, b) => {
      return a.key.compare(b.key);
    };
    function keyValsFromMap(keyValMap, converterFactory) {
      const keyHexSet = /* @__PURE__ */ new Set();
      const keyVals = Object.entries(keyValMap).reduce((result, [key, value]) => {
        if (key === "unknownKeyVals") return result;
        const converter = converterFactory[key];
        if (converter === void 0) return result;
        const encodedKeyVals = (Array.isArray(value) ? value : [value]).map(
          converter.encode
        );
        const keyHexes = encodedKeyVals.map((kv) => kv.key.toString("hex"));
        keyHexes.forEach((hex) => {
          if (keyHexSet.has(hex))
            throw new Error("Serialize Error: Duplicate key: " + hex);
          keyHexSet.add(hex);
        });
        return result.concat(encodedKeyVals);
      }, []);
      const otherKeyVals = keyValMap.unknownKeyVals ? keyValMap.unknownKeyVals.filter((keyVal) => {
        return !keyHexSet.has(keyVal.key.toString("hex"));
      }) : [];
      return keyVals.concat(otherKeyVals).sort(sortKeyVals);
    }
    function psbtToKeyVals({ globalMap, inputs, outputs }) {
      return {
        globalKeyVals: keyValsFromMap(globalMap, convert.globals),
        inputKeyVals: inputs.map((i) => keyValsFromMap(i, convert.inputs)),
        outputKeyVals: outputs.map((o) => keyValsFromMap(o, convert.outputs))
      };
    }
    exports.psbtToKeyVals = psbtToKeyVals;
  }
});

// node_modules/bip174/src/lib/parser/index.js
var require_parser = __commonJS({
  "node_modules/bip174/src/lib/parser/index.js"(exports) {
    "use strict";
    function __export(m) {
      for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    __export(require_fromBuffer());
    __export(require_toBuffer());
  }
});

// node_modules/bip174/src/lib/combiner/index.js
var require_combiner = __commonJS({
  "node_modules/bip174/src/lib/combiner/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var parser_1 = require_parser();
    function combine(psbts) {
      const self = psbts[0];
      const selfKeyVals = parser_1.psbtToKeyVals(self);
      const others = psbts.slice(1);
      if (others.length === 0) throw new Error("Combine: Nothing to combine");
      const selfTx = getTx(self);
      if (selfTx === void 0) {
        throw new Error("Combine: Self missing transaction");
      }
      const selfGlobalSet = getKeySet(selfKeyVals.globalKeyVals);
      const selfInputSets = selfKeyVals.inputKeyVals.map(getKeySet);
      const selfOutputSets = selfKeyVals.outputKeyVals.map(getKeySet);
      for (const other of others) {
        const otherTx = getTx(other);
        if (otherTx === void 0 || !otherTx.toBuffer().equals(selfTx.toBuffer())) {
          throw new Error(
            "Combine: One of the Psbts does not have the same transaction."
          );
        }
        const otherKeyVals = parser_1.psbtToKeyVals(other);
        const otherGlobalSet = getKeySet(otherKeyVals.globalKeyVals);
        otherGlobalSet.forEach(
          keyPusher(
            selfGlobalSet,
            selfKeyVals.globalKeyVals,
            otherKeyVals.globalKeyVals
          )
        );
        const otherInputSets = otherKeyVals.inputKeyVals.map(getKeySet);
        otherInputSets.forEach(
          (inputSet, idx) => inputSet.forEach(
            keyPusher(
              selfInputSets[idx],
              selfKeyVals.inputKeyVals[idx],
              otherKeyVals.inputKeyVals[idx]
            )
          )
        );
        const otherOutputSets = otherKeyVals.outputKeyVals.map(getKeySet);
        otherOutputSets.forEach(
          (outputSet, idx) => outputSet.forEach(
            keyPusher(
              selfOutputSets[idx],
              selfKeyVals.outputKeyVals[idx],
              otherKeyVals.outputKeyVals[idx]
            )
          )
        );
      }
      return parser_1.psbtFromKeyVals(selfTx, {
        globalMapKeyVals: selfKeyVals.globalKeyVals,
        inputKeyVals: selfKeyVals.inputKeyVals,
        outputKeyVals: selfKeyVals.outputKeyVals
      });
    }
    exports.combine = combine;
    function keyPusher(selfSet, selfKeyVals, otherKeyVals) {
      return (key) => {
        if (selfSet.has(key)) return;
        const newKv = otherKeyVals.filter((kv) => kv.key.toString("hex") === key)[0];
        selfKeyVals.push(newKv);
        selfSet.add(key);
      };
    }
    function getTx(psbt) {
      return psbt.globalMap.unsignedTx;
    }
    function getKeySet(keyVals) {
      const set = /* @__PURE__ */ new Set();
      keyVals.forEach((keyVal) => {
        const hex = keyVal.key.toString("hex");
        if (set.has(hex))
          throw new Error("Combine: KeyValue Map keys should be unique");
        set.add(hex);
      });
      return set;
    }
  }
});

// node_modules/bip174/src/lib/utils.js
var require_utils2 = __commonJS({
  "node_modules/bip174/src/lib/utils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var converter = require_converter();
    function checkForInput(inputs, inputIndex) {
      const input = inputs[inputIndex];
      if (input === void 0) throw new Error(`No input #${inputIndex}`);
      return input;
    }
    exports.checkForInput = checkForInput;
    function checkForOutput(outputs, outputIndex) {
      const output = outputs[outputIndex];
      if (output === void 0) throw new Error(`No output #${outputIndex}`);
      return output;
    }
    exports.checkForOutput = checkForOutput;
    function checkHasKey(checkKeyVal, keyVals, enumLength) {
      if (checkKeyVal.key[0] < enumLength) {
        throw new Error(
          `Use the method for your specific key instead of addUnknownKeyVal*`
        );
      }
      if (keyVals && keyVals.filter((kv) => kv.key.equals(checkKeyVal.key)).length !== 0) {
        throw new Error(`Duplicate Key: ${checkKeyVal.key.toString("hex")}`);
      }
    }
    exports.checkHasKey = checkHasKey;
    function getEnumLength(myenum) {
      let count = 0;
      Object.keys(myenum).forEach((val) => {
        if (Number(isNaN(Number(val)))) {
          count++;
        }
      });
      return count;
    }
    exports.getEnumLength = getEnumLength;
    function inputCheckUncleanFinalized(inputIndex, input) {
      let result = false;
      if (input.nonWitnessUtxo || input.witnessUtxo) {
        const needScriptSig = !!input.redeemScript;
        const needWitnessScript = !!input.witnessScript;
        const scriptSigOK = !needScriptSig || !!input.finalScriptSig;
        const witnessScriptOK = !needWitnessScript || !!input.finalScriptWitness;
        const hasOneFinal = !!input.finalScriptSig || !!input.finalScriptWitness;
        result = scriptSigOK && witnessScriptOK && hasOneFinal;
      }
      if (result === false) {
        throw new Error(
          `Input #${inputIndex} has too much or too little data to clean`
        );
      }
    }
    exports.inputCheckUncleanFinalized = inputCheckUncleanFinalized;
    function throwForUpdateMaker(typeName, name, expected, data) {
      throw new Error(
        `Data for ${typeName} key ${name} is incorrect: Expected ${expected} and got ${JSON.stringify(data)}`
      );
    }
    function updateMaker(typeName) {
      return (updateData, mainData) => {
        for (const name of Object.keys(updateData)) {
          const data = updateData[name];
          const { canAdd, canAddToArray, check, expected } = (
            // @ts-ignore
            converter[typeName + "s"][name] || {}
          );
          const isArray = !!canAddToArray;
          if (check) {
            if (isArray) {
              if (!Array.isArray(data) || // @ts-ignore
              mainData[name] && !Array.isArray(mainData[name])) {
                throw new Error(`Key type ${name} must be an array`);
              }
              if (!data.every(check)) {
                throwForUpdateMaker(typeName, name, expected, data);
              }
              const arr = mainData[name] || [];
              const dupeCheckSet = /* @__PURE__ */ new Set();
              if (!data.every((v) => canAddToArray(arr, v, dupeCheckSet))) {
                throw new Error("Can not add duplicate data to array");
              }
              mainData[name] = arr.concat(data);
            } else {
              if (!check(data)) {
                throwForUpdateMaker(typeName, name, expected, data);
              }
              if (!canAdd(mainData, data)) {
                throw new Error(`Can not add duplicate data to ${typeName}`);
              }
              mainData[name] = data;
            }
          }
        }
      };
    }
    exports.updateGlobal = updateMaker("global");
    exports.updateInput = updateMaker("input");
    exports.updateOutput = updateMaker("output");
    function addInputAttributes(inputs, data) {
      const index = inputs.length - 1;
      const input = checkForInput(inputs, index);
      exports.updateInput(data, input);
    }
    exports.addInputAttributes = addInputAttributes;
    function addOutputAttributes(outputs, data) {
      const index = outputs.length - 1;
      const output = checkForOutput(outputs, index);
      exports.updateOutput(data, output);
    }
    exports.addOutputAttributes = addOutputAttributes;
    function defaultVersionSetter(version, txBuf) {
      if (!Buffer.isBuffer(txBuf) || txBuf.length < 4) {
        throw new Error("Set Version: Invalid Transaction");
      }
      txBuf.writeUInt32LE(version, 0);
      return txBuf;
    }
    exports.defaultVersionSetter = defaultVersionSetter;
    function defaultLocktimeSetter(locktime, txBuf) {
      if (!Buffer.isBuffer(txBuf) || txBuf.length < 4) {
        throw new Error("Set Locktime: Invalid Transaction");
      }
      txBuf.writeUInt32LE(locktime, txBuf.length - 4);
      return txBuf;
    }
    exports.defaultLocktimeSetter = defaultLocktimeSetter;
  }
});

// node_modules/bip174/src/lib/psbt.js
var require_psbt = __commonJS({
  "node_modules/bip174/src/lib/psbt.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var combiner_1 = require_combiner();
    var parser_1 = require_parser();
    var typeFields_1 = require_typeFields();
    var utils_1 = require_utils2();
    var Psbt2 = class {
      constructor(tx) {
        this.inputs = [];
        this.outputs = [];
        this.globalMap = {
          unsignedTx: tx
        };
      }
      static fromBase64(data, txFromBuffer) {
        const buffer = Buffer.from(data, "base64");
        return this.fromBuffer(buffer, txFromBuffer);
      }
      static fromHex(data, txFromBuffer) {
        const buffer = Buffer.from(data, "hex");
        return this.fromBuffer(buffer, txFromBuffer);
      }
      static fromBuffer(buffer, txFromBuffer) {
        const results = parser_1.psbtFromBuffer(buffer, txFromBuffer);
        const psbt = new this(results.globalMap.unsignedTx);
        Object.assign(psbt, results);
        return psbt;
      }
      toBase64() {
        const buffer = this.toBuffer();
        return buffer.toString("base64");
      }
      toHex() {
        const buffer = this.toBuffer();
        return buffer.toString("hex");
      }
      toBuffer() {
        return parser_1.psbtToBuffer(this);
      }
      updateGlobal(updateData) {
        utils_1.updateGlobal(updateData, this.globalMap);
        return this;
      }
      updateInput(inputIndex, updateData) {
        const input = utils_1.checkForInput(this.inputs, inputIndex);
        utils_1.updateInput(updateData, input);
        return this;
      }
      updateOutput(outputIndex, updateData) {
        const output = utils_1.checkForOutput(this.outputs, outputIndex);
        utils_1.updateOutput(updateData, output);
        return this;
      }
      addUnknownKeyValToGlobal(keyVal) {
        utils_1.checkHasKey(
          keyVal,
          this.globalMap.unknownKeyVals,
          utils_1.getEnumLength(typeFields_1.GlobalTypes)
        );
        if (!this.globalMap.unknownKeyVals) this.globalMap.unknownKeyVals = [];
        this.globalMap.unknownKeyVals.push(keyVal);
        return this;
      }
      addUnknownKeyValToInput(inputIndex, keyVal) {
        const input = utils_1.checkForInput(this.inputs, inputIndex);
        utils_1.checkHasKey(
          keyVal,
          input.unknownKeyVals,
          utils_1.getEnumLength(typeFields_1.InputTypes)
        );
        if (!input.unknownKeyVals) input.unknownKeyVals = [];
        input.unknownKeyVals.push(keyVal);
        return this;
      }
      addUnknownKeyValToOutput(outputIndex, keyVal) {
        const output = utils_1.checkForOutput(this.outputs, outputIndex);
        utils_1.checkHasKey(
          keyVal,
          output.unknownKeyVals,
          utils_1.getEnumLength(typeFields_1.OutputTypes)
        );
        if (!output.unknownKeyVals) output.unknownKeyVals = [];
        output.unknownKeyVals.push(keyVal);
        return this;
      }
      addInput(inputData) {
        this.globalMap.unsignedTx.addInput(inputData);
        this.inputs.push({
          unknownKeyVals: []
        });
        const addKeyVals = inputData.unknownKeyVals || [];
        const inputIndex = this.inputs.length - 1;
        if (!Array.isArray(addKeyVals)) {
          throw new Error("unknownKeyVals must be an Array");
        }
        addKeyVals.forEach(
          (keyVal) => this.addUnknownKeyValToInput(inputIndex, keyVal)
        );
        utils_1.addInputAttributes(this.inputs, inputData);
        return this;
      }
      addOutput(outputData) {
        this.globalMap.unsignedTx.addOutput(outputData);
        this.outputs.push({
          unknownKeyVals: []
        });
        const addKeyVals = outputData.unknownKeyVals || [];
        const outputIndex = this.outputs.length - 1;
        if (!Array.isArray(addKeyVals)) {
          throw new Error("unknownKeyVals must be an Array");
        }
        addKeyVals.forEach(
          (keyVal) => this.addUnknownKeyValToOutput(outputIndex, keyVal)
        );
        utils_1.addOutputAttributes(this.outputs, outputData);
        return this;
      }
      clearFinalizedInput(inputIndex) {
        const input = utils_1.checkForInput(this.inputs, inputIndex);
        utils_1.inputCheckUncleanFinalized(inputIndex, input);
        for (const key of Object.keys(input)) {
          if (![
            "witnessUtxo",
            "nonWitnessUtxo",
            "finalScriptSig",
            "finalScriptWitness",
            "unknownKeyVals"
          ].includes(key)) {
            delete input[key];
          }
        }
        return this;
      }
      combine(...those) {
        const result = combiner_1.combine([this].concat(those));
        Object.assign(this, result);
        return this;
      }
      getTransaction() {
        return this.globalMap.unsignedTx.toBuffer();
      }
    };
    exports.Psbt = Psbt2;
  }
});

// node_modules/bitcoinjs-lib/src/psbt/psbtutils.js
var require_psbtutils = __commonJS({
  "node_modules/bitcoinjs-lib/src/psbt/psbtutils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.signatureBlocksAction = exports.checkInputForSig = exports.pubkeyInScript = exports.pubkeyPositionInScript = exports.witnessStackToScriptWitness = exports.isP2TR = exports.isP2SHScript = exports.isP2WSHScript = exports.isP2WPKH = exports.isP2PKH = exports.isP2PK = exports.isP2MS = void 0;
    var varuint = require_varint();
    var bscript = require_script();
    var transaction_1 = require_transaction();
    var crypto_1 = require_crypto2();
    var payments = require_payments();
    function isPaymentFactory(payment) {
      return (script) => {
        try {
          payment({ output: script });
          return true;
        } catch (err) {
          return false;
        }
      };
    }
    exports.isP2MS = isPaymentFactory(payments.p2ms);
    exports.isP2PK = isPaymentFactory(payments.p2pk);
    exports.isP2PKH = isPaymentFactory(payments.p2pkh);
    exports.isP2WPKH = isPaymentFactory(payments.p2wpkh);
    exports.isP2WSHScript = isPaymentFactory(payments.p2wsh);
    exports.isP2SHScript = isPaymentFactory(payments.p2sh);
    exports.isP2TR = isPaymentFactory(payments.p2tr);
    function witnessStackToScriptWitness(witness) {
      let buffer = Buffer.allocUnsafe(0);
      function writeSlice(slice) {
        buffer = Buffer.concat([buffer, Buffer.from(slice)]);
      }
      function writeVarInt(i) {
        const currentLen = buffer.length;
        const varintLen = varuint.encodingLength(i);
        buffer = Buffer.concat([buffer, Buffer.allocUnsafe(varintLen)]);
        varuint.encode(i, buffer, currentLen);
      }
      function writeVarSlice(slice) {
        writeVarInt(slice.length);
        writeSlice(slice);
      }
      function writeVector(vector) {
        writeVarInt(vector.length);
        vector.forEach(writeVarSlice);
      }
      writeVector(witness);
      return buffer;
    }
    exports.witnessStackToScriptWitness = witnessStackToScriptWitness;
    function pubkeyPositionInScript(pubkey, script) {
      const pubkeyHash = (0, crypto_1.hash160)(pubkey);
      const pubkeyXOnly = pubkey.slice(1, 33);
      const decompiled = bscript.decompile(script);
      if (decompiled === null) throw new Error("Unknown script error");
      return decompiled.findIndex((element) => {
        if (typeof element === "number") return false;
        return element.equals(pubkey) || element.equals(pubkeyHash) || element.equals(pubkeyXOnly);
      });
    }
    exports.pubkeyPositionInScript = pubkeyPositionInScript;
    function pubkeyInScript(pubkey, script) {
      return pubkeyPositionInScript(pubkey, script) !== -1;
    }
    exports.pubkeyInScript = pubkeyInScript;
    function checkInputForSig(input, action) {
      const pSigs = extractPartialSigs(input);
      return pSigs.some(
        (pSig) => signatureBlocksAction(pSig, bscript.signature.decode, action)
      );
    }
    exports.checkInputForSig = checkInputForSig;
    function signatureBlocksAction(signature, signatureDecodeFn, action) {
      const { hashType } = signatureDecodeFn(signature);
      const whitelist = [];
      const isAnyoneCanPay = hashType & transaction_1.Transaction.SIGHASH_ANYONECANPAY;
      if (isAnyoneCanPay) whitelist.push("addInput");
      const hashMod = hashType & 31;
      switch (hashMod) {
        case transaction_1.Transaction.SIGHASH_ALL:
          break;
        case transaction_1.Transaction.SIGHASH_SINGLE:
        case transaction_1.Transaction.SIGHASH_NONE:
          whitelist.push("addOutput");
          whitelist.push("setInputSequence");
          break;
      }
      if (whitelist.indexOf(action) === -1) {
        return true;
      }
      return false;
    }
    exports.signatureBlocksAction = signatureBlocksAction;
    function extractPartialSigs(input) {
      let pSigs = [];
      if ((input.partialSig || []).length === 0) {
        if (!input.finalScriptSig && !input.finalScriptWitness) return [];
        pSigs = getPsigsFromInputFinalScripts(input);
      } else {
        pSigs = input.partialSig;
      }
      return pSigs.map((p) => p.signature);
    }
    function getPsigsFromInputFinalScripts(input) {
      const scriptItems = !input.finalScriptSig ? [] : bscript.decompile(input.finalScriptSig) || [];
      const witnessItems = !input.finalScriptWitness ? [] : bscript.decompile(input.finalScriptWitness) || [];
      return scriptItems.concat(witnessItems).filter((item) => {
        return Buffer.isBuffer(item) && bscript.isCanonicalScriptSignature(item);
      }).map((sig) => ({ signature: sig }));
    }
  }
});

// node_modules/bitcoinjs-lib/src/psbt/bip371.js
var require_bip371 = __commonJS({
  "node_modules/bitcoinjs-lib/src/psbt/bip371.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkTaprootInputForSigs = exports.tapTreeFromList = exports.tapTreeToList = exports.tweakInternalPubKey = exports.checkTaprootOutputFields = exports.checkTaprootInputFields = exports.isTaprootOutput = exports.isTaprootInput = exports.serializeTaprootSignature = exports.tapScriptFinalizer = exports.toXOnly = void 0;
    var types_1 = require_types();
    var transaction_1 = require_transaction();
    var psbtutils_1 = require_psbtutils();
    var bip341_1 = require_bip341();
    var payments_1 = require_payments();
    var psbtutils_2 = require_psbtutils();
    var toXOnly = (pubKey) => pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);
    exports.toXOnly = toXOnly;
    function tapScriptFinalizer(inputIndex, input, tapLeafHashToFinalize) {
      const tapLeaf = findTapLeafToFinalize(
        input,
        inputIndex,
        tapLeafHashToFinalize
      );
      try {
        const sigs = sortSignatures(input, tapLeaf);
        const witness = sigs.concat(tapLeaf.script).concat(tapLeaf.controlBlock);
        return {
          finalScriptWitness: (0, psbtutils_1.witnessStackToScriptWitness)(witness)
        };
      } catch (err) {
        throw new Error(`Can not finalize taproot input #${inputIndex}: ${err}`);
      }
    }
    exports.tapScriptFinalizer = tapScriptFinalizer;
    function serializeTaprootSignature(sig, sighashType) {
      const sighashTypeByte = sighashType ? Buffer.from([sighashType]) : Buffer.from([]);
      return Buffer.concat([sig, sighashTypeByte]);
    }
    exports.serializeTaprootSignature = serializeTaprootSignature;
    function isTaprootInput(input) {
      return input && !!(input.tapInternalKey || input.tapMerkleRoot || input.tapLeafScript && input.tapLeafScript.length || input.tapBip32Derivation && input.tapBip32Derivation.length || input.witnessUtxo && (0, psbtutils_1.isP2TR)(input.witnessUtxo.script));
    }
    exports.isTaprootInput = isTaprootInput;
    function isTaprootOutput(output, script) {
      return output && !!(output.tapInternalKey || output.tapTree || output.tapBip32Derivation && output.tapBip32Derivation.length || script && (0, psbtutils_1.isP2TR)(script));
    }
    exports.isTaprootOutput = isTaprootOutput;
    function checkTaprootInputFields(inputData, newInputData, action) {
      checkMixedTaprootAndNonTaprootInputFields(inputData, newInputData, action);
      checkIfTapLeafInTree(inputData, newInputData, action);
    }
    exports.checkTaprootInputFields = checkTaprootInputFields;
    function checkTaprootOutputFields(outputData, newOutputData, action) {
      checkMixedTaprootAndNonTaprootOutputFields(outputData, newOutputData, action);
      checkTaprootScriptPubkey(outputData, newOutputData);
    }
    exports.checkTaprootOutputFields = checkTaprootOutputFields;
    function checkTaprootScriptPubkey(outputData, newOutputData) {
      if (!newOutputData.tapTree && !newOutputData.tapInternalKey) return;
      const tapInternalKey = newOutputData.tapInternalKey || outputData.tapInternalKey;
      const tapTree = newOutputData.tapTree || outputData.tapTree;
      if (tapInternalKey) {
        const { script: scriptPubkey } = outputData;
        const script = getTaprootScripPubkey(tapInternalKey, tapTree);
        if (scriptPubkey && !scriptPubkey.equals(script))
          throw new Error("Error adding output. Script or address missmatch.");
      }
    }
    function getTaprootScripPubkey(tapInternalKey, tapTree) {
      const scriptTree = tapTree && tapTreeFromList(tapTree.leaves);
      const { output } = (0, payments_1.p2tr)({
        internalPubkey: tapInternalKey,
        scriptTree
      });
      return output;
    }
    function tweakInternalPubKey(inputIndex, input) {
      const tapInternalKey = input.tapInternalKey;
      const outputKey = tapInternalKey && (0, bip341_1.tweakKey)(tapInternalKey, input.tapMerkleRoot);
      if (!outputKey)
        throw new Error(
          `Cannot tweak tap internal key for input #${inputIndex}. Public key: ${tapInternalKey && tapInternalKey.toString("hex")}`
        );
      return outputKey.x;
    }
    exports.tweakInternalPubKey = tweakInternalPubKey;
    function tapTreeToList(tree) {
      if (!(0, types_1.isTaptree)(tree))
        throw new Error(
          "Cannot convert taptree to tapleaf list. Expecting a tapree structure."
        );
      return _tapTreeToList(tree);
    }
    exports.tapTreeToList = tapTreeToList;
    function tapTreeFromList(leaves = []) {
      if (leaves.length === 1 && leaves[0].depth === 0)
        return {
          output: leaves[0].script,
          version: leaves[0].leafVersion
        };
      return instertLeavesInTree(leaves);
    }
    exports.tapTreeFromList = tapTreeFromList;
    function checkTaprootInputForSigs(input, action) {
      const sigs = extractTaprootSigs(input);
      return sigs.some(
        (sig) => (0, psbtutils_2.signatureBlocksAction)(sig, decodeSchnorrSignature, action)
      );
    }
    exports.checkTaprootInputForSigs = checkTaprootInputForSigs;
    function decodeSchnorrSignature(signature) {
      return {
        signature: signature.slice(0, 64),
        hashType: signature.slice(64)[0] || transaction_1.Transaction.SIGHASH_DEFAULT
      };
    }
    function extractTaprootSigs(input) {
      const sigs = [];
      if (input.tapKeySig) sigs.push(input.tapKeySig);
      if (input.tapScriptSig)
        sigs.push(...input.tapScriptSig.map((s) => s.signature));
      if (!sigs.length) {
        const finalTapKeySig = getTapKeySigFromWithness(input.finalScriptWitness);
        if (finalTapKeySig) sigs.push(finalTapKeySig);
      }
      return sigs;
    }
    function getTapKeySigFromWithness(finalScriptWitness) {
      if (!finalScriptWitness) return;
      const witness = finalScriptWitness.slice(2);
      if (witness.length === 64 || witness.length === 65) return witness;
    }
    function _tapTreeToList(tree, leaves = [], depth = 0) {
      if (depth > bip341_1.MAX_TAPTREE_DEPTH)
        throw new Error("Max taptree depth exceeded.");
      if (!tree) return [];
      if ((0, types_1.isTapleaf)(tree)) {
        leaves.push({
          depth,
          leafVersion: tree.version || bip341_1.LEAF_VERSION_TAPSCRIPT,
          script: tree.output
        });
        return leaves;
      }
      if (tree[0]) _tapTreeToList(tree[0], leaves, depth + 1);
      if (tree[1]) _tapTreeToList(tree[1], leaves, depth + 1);
      return leaves;
    }
    function instertLeavesInTree(leaves) {
      let tree;
      for (const leaf of leaves) {
        tree = instertLeafInTree(leaf, tree);
        if (!tree) throw new Error(`No room left to insert tapleaf in tree`);
      }
      return tree;
    }
    function instertLeafInTree(leaf, tree, depth = 0) {
      if (depth > bip341_1.MAX_TAPTREE_DEPTH)
        throw new Error("Max taptree depth exceeded.");
      if (leaf.depth === depth) {
        if (!tree)
          return {
            output: leaf.script,
            version: leaf.leafVersion
          };
        return;
      }
      if ((0, types_1.isTapleaf)(tree)) return;
      const leftSide = instertLeafInTree(leaf, tree && tree[0], depth + 1);
      if (leftSide) return [leftSide, tree && tree[1]];
      const rightSide = instertLeafInTree(leaf, tree && tree[1], depth + 1);
      if (rightSide) return [tree && tree[0], rightSide];
    }
    function checkMixedTaprootAndNonTaprootInputFields(inputData, newInputData, action) {
      const isBadTaprootUpdate = isTaprootInput(inputData) && hasNonTaprootFields(newInputData);
      const isBadNonTaprootUpdate = hasNonTaprootFields(inputData) && isTaprootInput(newInputData);
      const hasMixedFields = inputData === newInputData && isTaprootInput(newInputData) && hasNonTaprootFields(newInputData);
      if (isBadTaprootUpdate || isBadNonTaprootUpdate || hasMixedFields)
        throw new Error(
          `Invalid arguments for Psbt.${action}. Cannot use both taproot and non-taproot fields.`
        );
    }
    function checkMixedTaprootAndNonTaprootOutputFields(inputData, newInputData, action) {
      const isBadTaprootUpdate = isTaprootOutput(inputData) && hasNonTaprootFields(newInputData);
      const isBadNonTaprootUpdate = hasNonTaprootFields(inputData) && isTaprootOutput(newInputData);
      const hasMixedFields = inputData === newInputData && isTaprootOutput(newInputData) && hasNonTaprootFields(newInputData);
      if (isBadTaprootUpdate || isBadNonTaprootUpdate || hasMixedFields)
        throw new Error(
          `Invalid arguments for Psbt.${action}. Cannot use both taproot and non-taproot fields.`
        );
    }
    function checkIfTapLeafInTree(inputData, newInputData, action) {
      if (newInputData.tapMerkleRoot) {
        const newLeafsInTree = (newInputData.tapLeafScript || []).every(
          (l) => isTapLeafInTree(l, newInputData.tapMerkleRoot)
        );
        const oldLeafsInTree = (inputData.tapLeafScript || []).every(
          (l) => isTapLeafInTree(l, newInputData.tapMerkleRoot)
        );
        if (!newLeafsInTree || !oldLeafsInTree)
          throw new Error(
            `Invalid arguments for Psbt.${action}. Tapleaf not part of taptree.`
          );
      } else if (inputData.tapMerkleRoot) {
        const newLeafsInTree = (newInputData.tapLeafScript || []).every(
          (l) => isTapLeafInTree(l, inputData.tapMerkleRoot)
        );
        if (!newLeafsInTree)
          throw new Error(
            `Invalid arguments for Psbt.${action}. Tapleaf not part of taptree.`
          );
      }
    }
    function isTapLeafInTree(tapLeaf, merkleRoot) {
      if (!merkleRoot) return true;
      const leafHash = (0, bip341_1.tapleafHash)({
        output: tapLeaf.script,
        version: tapLeaf.leafVersion
      });
      const rootHash = (0, bip341_1.rootHashFromPath)(
        tapLeaf.controlBlock,
        leafHash
      );
      return rootHash.equals(merkleRoot);
    }
    function sortSignatures(input, tapLeaf) {
      const leafHash = (0, bip341_1.tapleafHash)({
        output: tapLeaf.script,
        version: tapLeaf.leafVersion
      });
      return (input.tapScriptSig || []).filter((tss) => tss.leafHash.equals(leafHash)).map((tss) => addPubkeyPositionInScript(tapLeaf.script, tss)).sort((t1, t2) => t2.positionInScript - t1.positionInScript).map((t) => t.signature);
    }
    function addPubkeyPositionInScript(script, tss) {
      return Object.assign(
        {
          positionInScript: (0, psbtutils_1.pubkeyPositionInScript)(
            tss.pubkey,
            script
          )
        },
        tss
      );
    }
    function findTapLeafToFinalize(input, inputIndex, leafHashToFinalize) {
      if (!input.tapScriptSig || !input.tapScriptSig.length)
        throw new Error(
          `Can not finalize taproot input #${inputIndex}. No tapleaf script signature provided.`
        );
      const tapLeaf = (input.tapLeafScript || []).sort((a, b) => a.controlBlock.length - b.controlBlock.length).find(
        (leaf) => canFinalizeLeaf(leaf, input.tapScriptSig, leafHashToFinalize)
      );
      if (!tapLeaf)
        throw new Error(
          `Can not finalize taproot input #${inputIndex}. Signature for tapleaf script not found.`
        );
      return tapLeaf;
    }
    function canFinalizeLeaf(leaf, tapScriptSig, hash) {
      const leafHash = (0, bip341_1.tapleafHash)({
        output: leaf.script,
        version: leaf.leafVersion
      });
      const whiteListedHash = !hash || hash.equals(leafHash);
      return whiteListedHash && tapScriptSig.find((tss) => tss.leafHash.equals(leafHash)) !== void 0;
    }
    function hasNonTaprootFields(io) {
      return io && !!(io.redeemScript || io.witnessScript || io.bip32Derivation && io.bip32Derivation.length);
    }
  }
});

// node_modules/bitcoinjs-lib/src/psbt.js
var require_psbt2 = __commonJS({
  "node_modules/bitcoinjs-lib/src/psbt.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Psbt = void 0;
    var bip174_1 = require_psbt();
    var varuint = require_varint();
    var utils_1 = require_utils2();
    var address_1 = require_address();
    var bufferutils_1 = require_bufferutils();
    var networks_1 = require_networks();
    var payments = require_payments();
    var bip341_1 = require_bip341();
    var bscript = require_script();
    var transaction_1 = require_transaction();
    var bip371_1 = require_bip371();
    var psbtutils_1 = require_psbtutils();
    var DEFAULT_OPTS = {
      /**
       * A bitcoinjs Network object. This is only used if you pass an `address`
       * parameter to addOutput. Otherwise it is not needed and can be left default.
       */
      network: networks_1.bitcoin,
      /**
       * When extractTransaction is called, the fee rate is checked.
       * THIS IS NOT TO BE RELIED ON.
       * It is only here as a last ditch effort to prevent sending a 500 BTC fee etc.
       */
      maximumFeeRate: 5e3
      // satoshi per byte
    };
    var Psbt2 = class _Psbt {
      static fromBase64(data, opts = {}) {
        const buffer = Buffer.from(data, "base64");
        return this.fromBuffer(buffer, opts);
      }
      static fromHex(data, opts = {}) {
        const buffer = Buffer.from(data, "hex");
        return this.fromBuffer(buffer, opts);
      }
      static fromBuffer(buffer, opts = {}) {
        const psbtBase = bip174_1.Psbt.fromBuffer(buffer, transactionFromBuffer);
        const psbt = new _Psbt(opts, psbtBase);
        checkTxForDupeIns(psbt.__CACHE.__TX, psbt.__CACHE);
        return psbt;
      }
      constructor(opts = {}, data = new bip174_1.Psbt(new PsbtTransaction())) {
        this.data = data;
        this.opts = Object.assign({}, DEFAULT_OPTS, opts);
        this.__CACHE = {
          __NON_WITNESS_UTXO_TX_CACHE: [],
          __NON_WITNESS_UTXO_BUF_CACHE: [],
          __TX_IN_CACHE: {},
          __TX: this.data.globalMap.unsignedTx.tx,
          // Psbt's predecessor (TransactionBuilder - now removed) behavior
          // was to not confirm input values  before signing.
          // Even though we highly encourage people to get
          // the full parent transaction to verify values, the ability to
          // sign non-segwit inputs without the full transaction was often
          // requested. So the only way to activate is to use @ts-ignore.
          // We will disable exporting the Psbt when unsafe sign is active.
          // because it is not BIP174 compliant.
          __UNSAFE_SIGN_NONSEGWIT: false
        };
        if (this.data.inputs.length === 0) this.setVersion(2);
        const dpew = (obj, attr, enumerable, writable) => Object.defineProperty(obj, attr, {
          enumerable,
          writable
        });
        dpew(this, "__CACHE", false, true);
        dpew(this, "opts", false, true);
      }
      get inputCount() {
        return this.data.inputs.length;
      }
      get version() {
        return this.__CACHE.__TX.version;
      }
      set version(version) {
        this.setVersion(version);
      }
      get locktime() {
        return this.__CACHE.__TX.locktime;
      }
      set locktime(locktime) {
        this.setLocktime(locktime);
      }
      get txInputs() {
        return this.__CACHE.__TX.ins.map((input) => ({
          hash: (0, bufferutils_1.cloneBuffer)(input.hash),
          index: input.index,
          sequence: input.sequence
        }));
      }
      get txOutputs() {
        return this.__CACHE.__TX.outs.map((output) => {
          let address;
          try {
            address = (0, address_1.fromOutputScript)(
              output.script,
              this.opts.network
            );
          } catch (_) {
          }
          return {
            script: (0, bufferutils_1.cloneBuffer)(output.script),
            value: output.value,
            address
          };
        });
      }
      combine(...those) {
        this.data.combine(...those.map((o) => o.data));
        return this;
      }
      clone() {
        const res = _Psbt.fromBuffer(this.data.toBuffer());
        res.opts = JSON.parse(JSON.stringify(this.opts));
        return res;
      }
      setMaximumFeeRate(satoshiPerByte) {
        check32Bit(satoshiPerByte);
        this.opts.maximumFeeRate = satoshiPerByte;
      }
      setVersion(version) {
        check32Bit(version);
        checkInputsForPartialSig(this.data.inputs, "setVersion");
        const c = this.__CACHE;
        c.__TX.version = version;
        c.__EXTRACTED_TX = void 0;
        return this;
      }
      setLocktime(locktime) {
        check32Bit(locktime);
        checkInputsForPartialSig(this.data.inputs, "setLocktime");
        const c = this.__CACHE;
        c.__TX.locktime = locktime;
        c.__EXTRACTED_TX = void 0;
        return this;
      }
      setInputSequence(inputIndex, sequence) {
        check32Bit(sequence);
        checkInputsForPartialSig(this.data.inputs, "setInputSequence");
        const c = this.__CACHE;
        if (c.__TX.ins.length <= inputIndex) {
          throw new Error("Input index too high");
        }
        c.__TX.ins[inputIndex].sequence = sequence;
        c.__EXTRACTED_TX = void 0;
        return this;
      }
      addInputs(inputDatas) {
        inputDatas.forEach((inputData) => this.addInput(inputData));
        return this;
      }
      addInput(inputData) {
        if (arguments.length > 1 || !inputData || inputData.hash === void 0 || inputData.index === void 0) {
          throw new Error(
            `Invalid arguments for Psbt.addInput. Requires single object with at least [hash] and [index]`
          );
        }
        (0, bip371_1.checkTaprootInputFields)(inputData, inputData, "addInput");
        checkInputsForPartialSig(this.data.inputs, "addInput");
        if (inputData.witnessScript) checkInvalidP2WSH(inputData.witnessScript);
        const c = this.__CACHE;
        this.data.addInput(inputData);
        const txIn = c.__TX.ins[c.__TX.ins.length - 1];
        checkTxInputCache(c, txIn);
        const inputIndex = this.data.inputs.length - 1;
        const input = this.data.inputs[inputIndex];
        if (input.nonWitnessUtxo) {
          addNonWitnessTxCache(this.__CACHE, input, inputIndex);
        }
        c.__FEE = void 0;
        c.__FEE_RATE = void 0;
        c.__EXTRACTED_TX = void 0;
        return this;
      }
      addOutputs(outputDatas) {
        outputDatas.forEach((outputData) => this.addOutput(outputData));
        return this;
      }
      addOutput(outputData) {
        if (arguments.length > 1 || !outputData || outputData.value === void 0 || outputData.address === void 0 && outputData.script === void 0) {
          throw new Error(
            `Invalid arguments for Psbt.addOutput. Requires single object with at least [script or address] and [value]`
          );
        }
        checkInputsForPartialSig(this.data.inputs, "addOutput");
        const { address } = outputData;
        if (typeof address === "string") {
          const { network } = this.opts;
          const script = (0, address_1.toOutputScript)(address, network);
          outputData = Object.assign({}, outputData, { script });
        }
        (0, bip371_1.checkTaprootOutputFields)(outputData, outputData, "addOutput");
        const c = this.__CACHE;
        this.data.addOutput(outputData);
        c.__FEE = void 0;
        c.__FEE_RATE = void 0;
        c.__EXTRACTED_TX = void 0;
        return this;
      }
      extractTransaction(disableFeeCheck) {
        if (!this.data.inputs.every(isFinalized)) throw new Error("Not finalized");
        const c = this.__CACHE;
        if (!disableFeeCheck) {
          checkFees(this, c, this.opts);
        }
        if (c.__EXTRACTED_TX) return c.__EXTRACTED_TX;
        const tx = c.__TX.clone();
        inputFinalizeGetAmts(this.data.inputs, tx, c, true);
        return tx;
      }
      getFeeRate() {
        return getTxCacheValue(
          "__FEE_RATE",
          "fee rate",
          this.data.inputs,
          this.__CACHE
        );
      }
      getFee() {
        return getTxCacheValue("__FEE", "fee", this.data.inputs, this.__CACHE);
      }
      finalizeAllInputs() {
        (0, utils_1.checkForInput)(this.data.inputs, 0);
        range(this.data.inputs.length).forEach((idx) => this.finalizeInput(idx));
        return this;
      }
      finalizeInput(inputIndex, finalScriptsFunc) {
        const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
        if ((0, bip371_1.isTaprootInput)(input))
          return this._finalizeTaprootInput(
            inputIndex,
            input,
            void 0,
            finalScriptsFunc
          );
        return this._finalizeInput(inputIndex, input, finalScriptsFunc);
      }
      finalizeTaprootInput(inputIndex, tapLeafHashToFinalize, finalScriptsFunc = bip371_1.tapScriptFinalizer) {
        const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
        if ((0, bip371_1.isTaprootInput)(input))
          return this._finalizeTaprootInput(
            inputIndex,
            input,
            tapLeafHashToFinalize,
            finalScriptsFunc
          );
        throw new Error(`Cannot finalize input #${inputIndex}. Not Taproot.`);
      }
      _finalizeInput(inputIndex, input, finalScriptsFunc = getFinalScripts) {
        const { script, isP2SH, isP2WSH, isSegwit } = getScriptFromInput(
          inputIndex,
          input,
          this.__CACHE
        );
        if (!script) throw new Error(`No script found for input #${inputIndex}`);
        checkPartialSigSighashes(input);
        const { finalScriptSig, finalScriptWitness } = finalScriptsFunc(
          inputIndex,
          input,
          script,
          isSegwit,
          isP2SH,
          isP2WSH
        );
        if (finalScriptSig) this.data.updateInput(inputIndex, { finalScriptSig });
        if (finalScriptWitness)
          this.data.updateInput(inputIndex, { finalScriptWitness });
        if (!finalScriptSig && !finalScriptWitness)
          throw new Error(`Unknown error finalizing input #${inputIndex}`);
        this.data.clearFinalizedInput(inputIndex);
        return this;
      }
      _finalizeTaprootInput(inputIndex, input, tapLeafHashToFinalize, finalScriptsFunc = bip371_1.tapScriptFinalizer) {
        if (!input.witnessUtxo)
          throw new Error(
            `Cannot finalize input #${inputIndex}. Missing withness utxo.`
          );
        if (input.tapKeySig) {
          const payment = payments.p2tr({
            output: input.witnessUtxo.script,
            signature: input.tapKeySig
          });
          const finalScriptWitness = (0, psbtutils_1.witnessStackToScriptWitness)(
            payment.witness
          );
          this.data.updateInput(inputIndex, { finalScriptWitness });
        } else {
          const { finalScriptWitness } = finalScriptsFunc(
            inputIndex,
            input,
            tapLeafHashToFinalize
          );
          this.data.updateInput(inputIndex, { finalScriptWitness });
        }
        this.data.clearFinalizedInput(inputIndex);
        return this;
      }
      getInputType(inputIndex) {
        const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
        const script = getScriptFromUtxo(inputIndex, input, this.__CACHE);
        const result = getMeaningfulScript(
          script,
          inputIndex,
          "input",
          input.redeemScript || redeemFromFinalScriptSig(input.finalScriptSig),
          input.witnessScript || redeemFromFinalWitnessScript(input.finalScriptWitness)
        );
        const type = result.type === "raw" ? "" : result.type + "-";
        const mainType = classifyScript(result.meaningfulScript);
        return type + mainType;
      }
      inputHasPubkey(inputIndex, pubkey) {
        const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
        return pubkeyInInput(pubkey, input, inputIndex, this.__CACHE);
      }
      inputHasHDKey(inputIndex, root) {
        const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
        const derivationIsMine = bip32DerivationIsMine(root);
        return !!input.bip32Derivation && input.bip32Derivation.some(derivationIsMine);
      }
      outputHasPubkey(outputIndex, pubkey) {
        const output = (0, utils_1.checkForOutput)(this.data.outputs, outputIndex);
        return pubkeyInOutput(pubkey, output, outputIndex, this.__CACHE);
      }
      outputHasHDKey(outputIndex, root) {
        const output = (0, utils_1.checkForOutput)(this.data.outputs, outputIndex);
        const derivationIsMine = bip32DerivationIsMine(root);
        return !!output.bip32Derivation && output.bip32Derivation.some(derivationIsMine);
      }
      validateSignaturesOfAllInputs(validator) {
        (0, utils_1.checkForInput)(this.data.inputs, 0);
        const results = range(this.data.inputs.length).map(
          (idx) => this.validateSignaturesOfInput(idx, validator)
        );
        return results.reduce((final, res) => res === true && final, true);
      }
      validateSignaturesOfInput(inputIndex, validator, pubkey) {
        const input = this.data.inputs[inputIndex];
        if ((0, bip371_1.isTaprootInput)(input))
          return this.validateSignaturesOfTaprootInput(
            inputIndex,
            validator,
            pubkey
          );
        return this._validateSignaturesOfInput(inputIndex, validator, pubkey);
      }
      _validateSignaturesOfInput(inputIndex, validator, pubkey) {
        const input = this.data.inputs[inputIndex];
        const partialSig = (input || {}).partialSig;
        if (!input || !partialSig || partialSig.length < 1)
          throw new Error("No signatures to validate");
        if (typeof validator !== "function")
          throw new Error("Need validator function to validate signatures");
        const mySigs = pubkey ? partialSig.filter((sig) => sig.pubkey.equals(pubkey)) : partialSig;
        if (mySigs.length < 1) throw new Error("No signatures for this pubkey");
        const results = [];
        let hashCache;
        let scriptCache;
        let sighashCache;
        for (const pSig of mySigs) {
          const sig = bscript.signature.decode(pSig.signature);
          const { hash, script } = sighashCache !== sig.hashType ? getHashForSig(
            inputIndex,
            Object.assign({}, input, { sighashType: sig.hashType }),
            this.__CACHE,
            true
          ) : { hash: hashCache, script: scriptCache };
          sighashCache = sig.hashType;
          hashCache = hash;
          scriptCache = script;
          checkScriptForPubkey(pSig.pubkey, script, "verify");
          results.push(validator(pSig.pubkey, hash, sig.signature));
        }
        return results.every((res) => res === true);
      }
      validateSignaturesOfTaprootInput(inputIndex, validator, pubkey) {
        const input = this.data.inputs[inputIndex];
        const tapKeySig = (input || {}).tapKeySig;
        const tapScriptSig = (input || {}).tapScriptSig;
        if (!input && !tapKeySig && !(tapScriptSig && !tapScriptSig.length))
          throw new Error("No signatures to validate");
        if (typeof validator !== "function")
          throw new Error("Need validator function to validate signatures");
        pubkey = pubkey && (0, bip371_1.toXOnly)(pubkey);
        const allHashses = pubkey ? getTaprootHashesForSig(
          inputIndex,
          input,
          this.data.inputs,
          pubkey,
          this.__CACHE
        ) : getAllTaprootHashesForSig(
          inputIndex,
          input,
          this.data.inputs,
          this.__CACHE
        );
        if (!allHashses.length) throw new Error("No signatures for this pubkey");
        const tapKeyHash = allHashses.find((h) => !h.leafHash);
        let validationResultCount = 0;
        if (tapKeySig && tapKeyHash) {
          const isValidTapkeySig = validator(
            tapKeyHash.pubkey,
            tapKeyHash.hash,
            trimTaprootSig(tapKeySig)
          );
          if (!isValidTapkeySig) return false;
          validationResultCount++;
        }
        if (tapScriptSig) {
          for (const tapSig of tapScriptSig) {
            const tapSigHash = allHashses.find((h) => tapSig.pubkey.equals(h.pubkey));
            if (tapSigHash) {
              const isValidTapScriptSig = validator(
                tapSig.pubkey,
                tapSigHash.hash,
                trimTaprootSig(tapSig.signature)
              );
              if (!isValidTapScriptSig) return false;
              validationResultCount++;
            }
          }
        }
        return validationResultCount > 0;
      }
      signAllInputsHD(hdKeyPair, sighashTypes = [transaction_1.Transaction.SIGHASH_ALL]) {
        if (!hdKeyPair || !hdKeyPair.publicKey || !hdKeyPair.fingerprint) {
          throw new Error("Need HDSigner to sign input");
        }
        const results = [];
        for (const i of range(this.data.inputs.length)) {
          try {
            this.signInputHD(i, hdKeyPair, sighashTypes);
            results.push(true);
          } catch (err) {
            results.push(false);
          }
        }
        if (results.every((v) => v === false)) {
          throw new Error("No inputs were signed");
        }
        return this;
      }
      signAllInputsHDAsync(hdKeyPair, sighashTypes = [transaction_1.Transaction.SIGHASH_ALL]) {
        return new Promise((resolve, reject) => {
          if (!hdKeyPair || !hdKeyPair.publicKey || !hdKeyPair.fingerprint) {
            return reject(new Error("Need HDSigner to sign input"));
          }
          const results = [];
          const promises = [];
          for (const i of range(this.data.inputs.length)) {
            promises.push(
              this.signInputHDAsync(i, hdKeyPair, sighashTypes).then(
                () => {
                  results.push(true);
                },
                () => {
                  results.push(false);
                }
              )
            );
          }
          return Promise.all(promises).then(() => {
            if (results.every((v) => v === false)) {
              return reject(new Error("No inputs were signed"));
            }
            resolve();
          });
        });
      }
      signInputHD(inputIndex, hdKeyPair, sighashTypes = [transaction_1.Transaction.SIGHASH_ALL]) {
        if (!hdKeyPair || !hdKeyPair.publicKey || !hdKeyPair.fingerprint) {
          throw new Error("Need HDSigner to sign input");
        }
        const signers = getSignersFromHD(inputIndex, this.data.inputs, hdKeyPair);
        signers.forEach((signer) => this.signInput(inputIndex, signer, sighashTypes));
        return this;
      }
      signInputHDAsync(inputIndex, hdKeyPair, sighashTypes = [transaction_1.Transaction.SIGHASH_ALL]) {
        return new Promise((resolve, reject) => {
          if (!hdKeyPair || !hdKeyPair.publicKey || !hdKeyPair.fingerprint) {
            return reject(new Error("Need HDSigner to sign input"));
          }
          const signers = getSignersFromHD(inputIndex, this.data.inputs, hdKeyPair);
          const promises = signers.map(
            (signer) => this.signInputAsync(inputIndex, signer, sighashTypes)
          );
          return Promise.all(promises).then(() => {
            resolve();
          }).catch(reject);
        });
      }
      signAllInputs(keyPair, sighashTypes) {
        if (!keyPair || !keyPair.publicKey)
          throw new Error("Need Signer to sign input");
        const results = [];
        for (const i of range(this.data.inputs.length)) {
          try {
            this.signInput(i, keyPair, sighashTypes);
            results.push(true);
          } catch (err) {
            results.push(false);
          }
        }
        if (results.every((v) => v === false)) {
          throw new Error("No inputs were signed");
        }
        return this;
      }
      signAllInputsAsync(keyPair, sighashTypes) {
        return new Promise((resolve, reject) => {
          if (!keyPair || !keyPair.publicKey)
            return reject(new Error("Need Signer to sign input"));
          const results = [];
          const promises = [];
          for (const [i] of this.data.inputs.entries()) {
            promises.push(
              this.signInputAsync(i, keyPair, sighashTypes).then(
                () => {
                  results.push(true);
                },
                () => {
                  results.push(false);
                }
              )
            );
          }
          return Promise.all(promises).then(() => {
            if (results.every((v) => v === false)) {
              return reject(new Error("No inputs were signed"));
            }
            resolve();
          });
        });
      }
      signInput(inputIndex, keyPair, sighashTypes) {
        if (!keyPair || !keyPair.publicKey)
          throw new Error("Need Signer to sign input");
        const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
        if ((0, bip371_1.isTaprootInput)(input)) {
          return this._signTaprootInput(
            inputIndex,
            input,
            keyPair,
            void 0,
            sighashTypes
          );
        }
        return this._signInput(inputIndex, keyPair, sighashTypes);
      }
      signTaprootInput(inputIndex, keyPair, tapLeafHashToSign, sighashTypes) {
        if (!keyPair || !keyPair.publicKey)
          throw new Error("Need Signer to sign input");
        const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
        if ((0, bip371_1.isTaprootInput)(input))
          return this._signTaprootInput(
            inputIndex,
            input,
            keyPair,
            tapLeafHashToSign,
            sighashTypes
          );
        throw new Error(`Input #${inputIndex} is not of type Taproot.`);
      }
      _signInput(inputIndex, keyPair, sighashTypes = [transaction_1.Transaction.SIGHASH_ALL]) {
        const { hash, sighashType } = getHashAndSighashType(
          this.data.inputs,
          inputIndex,
          keyPair.publicKey,
          this.__CACHE,
          sighashTypes
        );
        const partialSig = [
          {
            pubkey: keyPair.publicKey,
            signature: bscript.signature.encode(keyPair.sign(hash), sighashType)
          }
        ];
        this.data.updateInput(inputIndex, { partialSig });
        return this;
      }
      _signTaprootInput(inputIndex, input, keyPair, tapLeafHashToSign, allowedSighashTypes = [transaction_1.Transaction.SIGHASH_DEFAULT]) {
        const hashesForSig = this.checkTaprootHashesForSig(
          inputIndex,
          input,
          keyPair,
          tapLeafHashToSign,
          allowedSighashTypes
        );
        const tapKeySig = hashesForSig.filter((h) => !h.leafHash).map(
          (h) => (0, bip371_1.serializeTaprootSignature)(
            keyPair.signSchnorr(h.hash),
            input.sighashType
          )
        )[0];
        const tapScriptSig = hashesForSig.filter((h) => !!h.leafHash).map((h) => ({
          pubkey: (0, bip371_1.toXOnly)(keyPair.publicKey),
          signature: (0, bip371_1.serializeTaprootSignature)(
            keyPair.signSchnorr(h.hash),
            input.sighashType
          ),
          leafHash: h.leafHash
        }));
        if (tapKeySig) {
          this.data.updateInput(inputIndex, { tapKeySig });
        }
        if (tapScriptSig.length) {
          this.data.updateInput(inputIndex, { tapScriptSig });
        }
        return this;
      }
      signInputAsync(inputIndex, keyPair, sighashTypes) {
        return Promise.resolve().then(() => {
          if (!keyPair || !keyPair.publicKey)
            throw new Error("Need Signer to sign input");
          const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
          if ((0, bip371_1.isTaprootInput)(input))
            return this._signTaprootInputAsync(
              inputIndex,
              input,
              keyPair,
              void 0,
              sighashTypes
            );
          return this._signInputAsync(inputIndex, keyPair, sighashTypes);
        });
      }
      signTaprootInputAsync(inputIndex, keyPair, tapLeafHash, sighashTypes) {
        return Promise.resolve().then(() => {
          if (!keyPair || !keyPair.publicKey)
            throw new Error("Need Signer to sign input");
          const input = (0, utils_1.checkForInput)(this.data.inputs, inputIndex);
          if ((0, bip371_1.isTaprootInput)(input))
            return this._signTaprootInputAsync(
              inputIndex,
              input,
              keyPair,
              tapLeafHash,
              sighashTypes
            );
          throw new Error(`Input #${inputIndex} is not of type Taproot.`);
        });
      }
      _signInputAsync(inputIndex, keyPair, sighashTypes = [transaction_1.Transaction.SIGHASH_ALL]) {
        const { hash, sighashType } = getHashAndSighashType(
          this.data.inputs,
          inputIndex,
          keyPair.publicKey,
          this.__CACHE,
          sighashTypes
        );
        return Promise.resolve(keyPair.sign(hash)).then((signature) => {
          const partialSig = [
            {
              pubkey: keyPair.publicKey,
              signature: bscript.signature.encode(signature, sighashType)
            }
          ];
          this.data.updateInput(inputIndex, { partialSig });
        });
      }
      async _signTaprootInputAsync(inputIndex, input, keyPair, tapLeafHash, sighashTypes = [transaction_1.Transaction.SIGHASH_DEFAULT]) {
        const hashesForSig = this.checkTaprootHashesForSig(
          inputIndex,
          input,
          keyPair,
          tapLeafHash,
          sighashTypes
        );
        const signaturePromises = [];
        const tapKeyHash = hashesForSig.filter((h) => !h.leafHash)[0];
        if (tapKeyHash) {
          const tapKeySigPromise = Promise.resolve(
            keyPair.signSchnorr(tapKeyHash.hash)
          ).then((sig) => {
            return {
              tapKeySig: (0, bip371_1.serializeTaprootSignature)(
                sig,
                input.sighashType
              )
            };
          });
          signaturePromises.push(tapKeySigPromise);
        }
        const tapScriptHashes = hashesForSig.filter((h) => !!h.leafHash);
        if (tapScriptHashes.length) {
          const tapScriptSigPromises = tapScriptHashes.map((tsh) => {
            return Promise.resolve(keyPair.signSchnorr(tsh.hash)).then(
              (signature) => {
                const tapScriptSig = [
                  {
                    pubkey: (0, bip371_1.toXOnly)(keyPair.publicKey),
                    signature: (0, bip371_1.serializeTaprootSignature)(
                      signature,
                      input.sighashType
                    ),
                    leafHash: tsh.leafHash
                  }
                ];
                return { tapScriptSig };
              }
            );
          });
          signaturePromises.push(...tapScriptSigPromises);
        }
        return Promise.all(signaturePromises).then((results) => {
          results.forEach((v) => this.data.updateInput(inputIndex, v));
        });
      }
      checkTaprootHashesForSig(inputIndex, input, keyPair, tapLeafHashToSign, allowedSighashTypes) {
        if (typeof keyPair.signSchnorr !== "function")
          throw new Error(
            `Need Schnorr Signer to sign taproot input #${inputIndex}.`
          );
        const hashesForSig = getTaprootHashesForSig(
          inputIndex,
          input,
          this.data.inputs,
          keyPair.publicKey,
          this.__CACHE,
          tapLeafHashToSign,
          allowedSighashTypes
        );
        if (!hashesForSig || !hashesForSig.length)
          throw new Error(
            `Can not sign for input #${inputIndex} with the key ${keyPair.publicKey.toString(
              "hex"
            )}`
          );
        return hashesForSig;
      }
      toBuffer() {
        checkCache(this.__CACHE);
        return this.data.toBuffer();
      }
      toHex() {
        checkCache(this.__CACHE);
        return this.data.toHex();
      }
      toBase64() {
        checkCache(this.__CACHE);
        return this.data.toBase64();
      }
      updateGlobal(updateData) {
        this.data.updateGlobal(updateData);
        return this;
      }
      updateInput(inputIndex, updateData) {
        if (updateData.witnessScript) checkInvalidP2WSH(updateData.witnessScript);
        (0, bip371_1.checkTaprootInputFields)(
          this.data.inputs[inputIndex],
          updateData,
          "updateInput"
        );
        this.data.updateInput(inputIndex, updateData);
        if (updateData.nonWitnessUtxo) {
          addNonWitnessTxCache(
            this.__CACHE,
            this.data.inputs[inputIndex],
            inputIndex
          );
        }
        return this;
      }
      updateOutput(outputIndex, updateData) {
        const outputData = this.data.outputs[outputIndex];
        (0, bip371_1.checkTaprootOutputFields)(
          outputData,
          updateData,
          "updateOutput"
        );
        this.data.updateOutput(outputIndex, updateData);
        return this;
      }
      addUnknownKeyValToGlobal(keyVal) {
        this.data.addUnknownKeyValToGlobal(keyVal);
        return this;
      }
      addUnknownKeyValToInput(inputIndex, keyVal) {
        this.data.addUnknownKeyValToInput(inputIndex, keyVal);
        return this;
      }
      addUnknownKeyValToOutput(outputIndex, keyVal) {
        this.data.addUnknownKeyValToOutput(outputIndex, keyVal);
        return this;
      }
      clearFinalizedInput(inputIndex) {
        this.data.clearFinalizedInput(inputIndex);
        return this;
      }
    };
    exports.Psbt = Psbt2;
    var transactionFromBuffer = (buffer) => new PsbtTransaction(buffer);
    var PsbtTransaction = class {
      constructor(buffer = Buffer.from([2, 0, 0, 0, 0, 0, 0, 0, 0, 0])) {
        this.tx = transaction_1.Transaction.fromBuffer(buffer);
        checkTxEmpty(this.tx);
        Object.defineProperty(this, "tx", {
          enumerable: false,
          writable: true
        });
      }
      getInputOutputCounts() {
        return {
          inputCount: this.tx.ins.length,
          outputCount: this.tx.outs.length
        };
      }
      addInput(input) {
        if (input.hash === void 0 || input.index === void 0 || !Buffer.isBuffer(input.hash) && typeof input.hash !== "string" || typeof input.index !== "number") {
          throw new Error("Error adding input.");
        }
        const hash = typeof input.hash === "string" ? (0, bufferutils_1.reverseBuffer)(Buffer.from(input.hash, "hex")) : input.hash;
        this.tx.addInput(hash, input.index, input.sequence);
      }
      addOutput(output) {
        if (output.script === void 0 || output.value === void 0 || !Buffer.isBuffer(output.script) || typeof output.value !== "number") {
          throw new Error("Error adding output.");
        }
        this.tx.addOutput(output.script, output.value);
      }
      toBuffer() {
        return this.tx.toBuffer();
      }
    };
    function canFinalize(input, script, scriptType) {
      switch (scriptType) {
        case "pubkey":
        case "pubkeyhash":
        case "witnesspubkeyhash":
          return hasSigs(1, input.partialSig);
        case "multisig":
          const p2ms = payments.p2ms({ output: script });
          return hasSigs(p2ms.m, input.partialSig, p2ms.pubkeys);
        default:
          return false;
      }
    }
    function checkCache(cache) {
      if (cache.__UNSAFE_SIGN_NONSEGWIT !== false) {
        throw new Error("Not BIP174 compliant, can not export");
      }
    }
    function hasSigs(neededSigs, partialSig, pubkeys) {
      if (!partialSig) return false;
      let sigs;
      if (pubkeys) {
        sigs = pubkeys.map((pkey) => {
          const pubkey = compressPubkey(pkey);
          return partialSig.find((pSig) => pSig.pubkey.equals(pubkey));
        }).filter((v) => !!v);
      } else {
        sigs = partialSig;
      }
      if (sigs.length > neededSigs) throw new Error("Too many signatures");
      return sigs.length === neededSigs;
    }
    function isFinalized(input) {
      return !!input.finalScriptSig || !!input.finalScriptWitness;
    }
    function bip32DerivationIsMine(root) {
      return (d) => {
        if (!d.masterFingerprint.equals(root.fingerprint)) return false;
        if (!root.derivePath(d.path).publicKey.equals(d.pubkey)) return false;
        return true;
      };
    }
    function check32Bit(num) {
      if (typeof num !== "number" || num !== Math.floor(num) || num > 4294967295 || num < 0) {
        throw new Error("Invalid 32 bit integer");
      }
    }
    function checkFees(psbt, cache, opts) {
      const feeRate = cache.__FEE_RATE || psbt.getFeeRate();
      const vsize = cache.__EXTRACTED_TX.virtualSize();
      const satoshis = feeRate * vsize;
      if (feeRate >= opts.maximumFeeRate) {
        throw new Error(
          `Warning: You are paying around ${(satoshis / 1e8).toFixed(8)} in fees, which is ${feeRate} satoshi per byte for a transaction with a VSize of ${vsize} bytes (segwit counted as 0.25 byte per byte). Use setMaximumFeeRate method to raise your threshold, or pass true to the first arg of extractTransaction.`
        );
      }
    }
    function checkInputsForPartialSig(inputs, action) {
      inputs.forEach((input) => {
        const throws = (0, bip371_1.isTaprootInput)(input) ? (0, bip371_1.checkTaprootInputForSigs)(input, action) : (0, psbtutils_1.checkInputForSig)(input, action);
        if (throws)
          throw new Error("Can not modify transaction, signatures exist.");
      });
    }
    function checkPartialSigSighashes(input) {
      if (!input.sighashType || !input.partialSig) return;
      const { partialSig, sighashType } = input;
      partialSig.forEach((pSig) => {
        const { hashType } = bscript.signature.decode(pSig.signature);
        if (sighashType !== hashType) {
          throw new Error("Signature sighash does not match input sighash type");
        }
      });
    }
    function checkScriptForPubkey(pubkey, script, action) {
      if (!(0, psbtutils_1.pubkeyInScript)(pubkey, script)) {
        throw new Error(
          `Can not ${action} for this input with the key ${pubkey.toString("hex")}`
        );
      }
    }
    function checkTxEmpty(tx) {
      const isEmpty = tx.ins.every(
        (input) => input.script && input.script.length === 0 && input.witness && input.witness.length === 0
      );
      if (!isEmpty) {
        throw new Error("Format Error: Transaction ScriptSigs are not empty");
      }
    }
    function checkTxForDupeIns(tx, cache) {
      tx.ins.forEach((input) => {
        checkTxInputCache(cache, input);
      });
    }
    function checkTxInputCache(cache, input) {
      const key = (0, bufferutils_1.reverseBuffer)(Buffer.from(input.hash)).toString("hex") + ":" + input.index;
      if (cache.__TX_IN_CACHE[key]) throw new Error("Duplicate input detected.");
      cache.__TX_IN_CACHE[key] = 1;
    }
    function scriptCheckerFactory(payment, paymentScriptName) {
      return (inputIndex, scriptPubKey, redeemScript, ioType) => {
        const redeemScriptOutput = payment({
          redeem: { output: redeemScript }
        }).output;
        if (!scriptPubKey.equals(redeemScriptOutput)) {
          throw new Error(
            `${paymentScriptName} for ${ioType} #${inputIndex} doesn't match the scriptPubKey in the prevout`
          );
        }
      };
    }
    var checkRedeemScript = scriptCheckerFactory(payments.p2sh, "Redeem script");
    var checkWitnessScript = scriptCheckerFactory(
      payments.p2wsh,
      "Witness script"
    );
    function getTxCacheValue(key, name, inputs, c) {
      if (!inputs.every(isFinalized))
        throw new Error(`PSBT must be finalized to calculate ${name}`);
      if (key === "__FEE_RATE" && c.__FEE_RATE) return c.__FEE_RATE;
      if (key === "__FEE" && c.__FEE) return c.__FEE;
      let tx;
      let mustFinalize = true;
      if (c.__EXTRACTED_TX) {
        tx = c.__EXTRACTED_TX;
        mustFinalize = false;
      } else {
        tx = c.__TX.clone();
      }
      inputFinalizeGetAmts(inputs, tx, c, mustFinalize);
      if (key === "__FEE_RATE") return c.__FEE_RATE;
      else if (key === "__FEE") return c.__FEE;
    }
    function getFinalScripts(inputIndex, input, script, isSegwit, isP2SH, isP2WSH) {
      const scriptType = classifyScript(script);
      if (!canFinalize(input, script, scriptType))
        throw new Error(`Can not finalize input #${inputIndex}`);
      return prepareFinalScripts(
        script,
        scriptType,
        input.partialSig,
        isSegwit,
        isP2SH,
        isP2WSH
      );
    }
    function prepareFinalScripts(script, scriptType, partialSig, isSegwit, isP2SH, isP2WSH) {
      let finalScriptSig;
      let finalScriptWitness;
      const payment = getPayment(script, scriptType, partialSig);
      const p2wsh = !isP2WSH ? null : payments.p2wsh({ redeem: payment });
      const p2sh = !isP2SH ? null : payments.p2sh({ redeem: p2wsh || payment });
      if (isSegwit) {
        if (p2wsh) {
          finalScriptWitness = (0, psbtutils_1.witnessStackToScriptWitness)(
            p2wsh.witness
          );
        } else {
          finalScriptWitness = (0, psbtutils_1.witnessStackToScriptWitness)(
            payment.witness
          );
        }
        if (p2sh) {
          finalScriptSig = p2sh.input;
        }
      } else {
        if (p2sh) {
          finalScriptSig = p2sh.input;
        } else {
          finalScriptSig = payment.input;
        }
      }
      return {
        finalScriptSig,
        finalScriptWitness
      };
    }
    function getHashAndSighashType(inputs, inputIndex, pubkey, cache, sighashTypes) {
      const input = (0, utils_1.checkForInput)(inputs, inputIndex);
      const { hash, sighashType, script } = getHashForSig(
        inputIndex,
        input,
        cache,
        false,
        sighashTypes
      );
      checkScriptForPubkey(pubkey, script, "sign");
      return {
        hash,
        sighashType
      };
    }
    function getHashForSig(inputIndex, input, cache, forValidate, sighashTypes) {
      const unsignedTx = cache.__TX;
      const sighashType = input.sighashType || transaction_1.Transaction.SIGHASH_ALL;
      checkSighashTypeAllowed(sighashType, sighashTypes);
      let hash;
      let prevout;
      if (input.nonWitnessUtxo) {
        const nonWitnessUtxoTx = nonWitnessUtxoTxFromCache(
          cache,
          input,
          inputIndex
        );
        const prevoutHash = unsignedTx.ins[inputIndex].hash;
        const utxoHash = nonWitnessUtxoTx.getHash();
        if (!prevoutHash.equals(utxoHash)) {
          throw new Error(
            `Non-witness UTXO hash for input #${inputIndex} doesn't match the hash specified in the prevout`
          );
        }
        const prevoutIndex = unsignedTx.ins[inputIndex].index;
        prevout = nonWitnessUtxoTx.outs[prevoutIndex];
      } else if (input.witnessUtxo) {
        prevout = input.witnessUtxo;
      } else {
        throw new Error("Need a Utxo input item for signing");
      }
      const { meaningfulScript, type } = getMeaningfulScript(
        prevout.script,
        inputIndex,
        "input",
        input.redeemScript,
        input.witnessScript
      );
      if (["p2sh-p2wsh", "p2wsh"].indexOf(type) >= 0) {
        hash = unsignedTx.hashForWitnessV0(
          inputIndex,
          meaningfulScript,
          prevout.value,
          sighashType
        );
      } else if ((0, psbtutils_1.isP2WPKH)(meaningfulScript)) {
        const signingScript = payments.p2pkh({
          hash: meaningfulScript.slice(2)
        }).output;
        hash = unsignedTx.hashForWitnessV0(
          inputIndex,
          signingScript,
          prevout.value,
          sighashType
        );
      } else {
        if (input.nonWitnessUtxo === void 0 && cache.__UNSAFE_SIGN_NONSEGWIT === false)
          throw new Error(
            `Input #${inputIndex} has witnessUtxo but non-segwit script: ${meaningfulScript.toString("hex")}`
          );
        if (!forValidate && cache.__UNSAFE_SIGN_NONSEGWIT !== false)
          console.warn(
            "Warning: Signing non-segwit inputs without the full parent transaction means there is a chance that a miner could feed you incorrect information to trick you into paying large fees. This behavior is the same as Psbt's predecessor (TransactionBuilder - now removed) when signing non-segwit scripts. You are not able to export this Psbt with toBuffer|toBase64|toHex since it is not BIP174 compliant.\n*********************\nPROCEED WITH CAUTION!\n*********************"
          );
        hash = unsignedTx.hashForSignature(
          inputIndex,
          meaningfulScript,
          sighashType
        );
      }
      return {
        script: meaningfulScript,
        sighashType,
        hash
      };
    }
    function getAllTaprootHashesForSig(inputIndex, input, inputs, cache) {
      const allPublicKeys = [];
      if (input.tapInternalKey) {
        const key = getPrevoutTaprootKey(inputIndex, input, cache);
        if (key) {
          allPublicKeys.push(key);
        }
      }
      if (input.tapScriptSig) {
        const tapScriptPubkeys = input.tapScriptSig.map((tss) => tss.pubkey);
        allPublicKeys.push(...tapScriptPubkeys);
      }
      const allHashes = allPublicKeys.map(
        (pubicKey) => getTaprootHashesForSig(inputIndex, input, inputs, pubicKey, cache)
      );
      return allHashes.flat();
    }
    function getPrevoutTaprootKey(inputIndex, input, cache) {
      const { script } = getScriptAndAmountFromUtxo(inputIndex, input, cache);
      return (0, psbtutils_1.isP2TR)(script) ? script.subarray(2, 34) : null;
    }
    function trimTaprootSig(signature) {
      return signature.length === 64 ? signature : signature.subarray(0, 64);
    }
    function getTaprootHashesForSig(inputIndex, input, inputs, pubkey, cache, tapLeafHashToSign, allowedSighashTypes) {
      const unsignedTx = cache.__TX;
      const sighashType = input.sighashType || transaction_1.Transaction.SIGHASH_DEFAULT;
      checkSighashTypeAllowed(sighashType, allowedSighashTypes);
      const prevOuts = inputs.map(
        (i, index) => getScriptAndAmountFromUtxo(index, i, cache)
      );
      const signingScripts = prevOuts.map((o) => o.script);
      const values = prevOuts.map((o) => o.value);
      const hashes = [];
      if (input.tapInternalKey && !tapLeafHashToSign) {
        const outputKey = getPrevoutTaprootKey(inputIndex, input, cache) || Buffer.from([]);
        if ((0, bip371_1.toXOnly)(pubkey).equals(outputKey)) {
          const tapKeyHash = unsignedTx.hashForWitnessV1(
            inputIndex,
            signingScripts,
            values,
            sighashType
          );
          hashes.push({ pubkey, hash: tapKeyHash });
        }
      }
      const tapLeafHashes = (input.tapLeafScript || []).filter((tapLeaf) => (0, psbtutils_1.pubkeyInScript)(pubkey, tapLeaf.script)).map((tapLeaf) => {
        const hash = (0, bip341_1.tapleafHash)({
          output: tapLeaf.script,
          version: tapLeaf.leafVersion
        });
        return Object.assign({ hash }, tapLeaf);
      }).filter(
        (tapLeaf) => !tapLeafHashToSign || tapLeafHashToSign.equals(tapLeaf.hash)
      ).map((tapLeaf) => {
        const tapScriptHash = unsignedTx.hashForWitnessV1(
          inputIndex,
          signingScripts,
          values,
          sighashType,
          tapLeaf.hash
        );
        return {
          pubkey,
          hash: tapScriptHash,
          leafHash: tapLeaf.hash
        };
      });
      return hashes.concat(tapLeafHashes);
    }
    function checkSighashTypeAllowed(sighashType, sighashTypes) {
      if (sighashTypes && sighashTypes.indexOf(sighashType) < 0) {
        const str = sighashTypeToString(sighashType);
        throw new Error(
          `Sighash type is not allowed. Retry the sign method passing the sighashTypes array of whitelisted types. Sighash type: ${str}`
        );
      }
    }
    function getPayment(script, scriptType, partialSig) {
      let payment;
      switch (scriptType) {
        case "multisig":
          const sigs = getSortedSigs(script, partialSig);
          payment = payments.p2ms({
            output: script,
            signatures: sigs
          });
          break;
        case "pubkey":
          payment = payments.p2pk({
            output: script,
            signature: partialSig[0].signature
          });
          break;
        case "pubkeyhash":
          payment = payments.p2pkh({
            output: script,
            pubkey: partialSig[0].pubkey,
            signature: partialSig[0].signature
          });
          break;
        case "witnesspubkeyhash":
          payment = payments.p2wpkh({
            output: script,
            pubkey: partialSig[0].pubkey,
            signature: partialSig[0].signature
          });
          break;
      }
      return payment;
    }
    function getScriptFromInput(inputIndex, input, cache) {
      const unsignedTx = cache.__TX;
      const res = {
        script: null,
        isSegwit: false,
        isP2SH: false,
        isP2WSH: false
      };
      res.isP2SH = !!input.redeemScript;
      res.isP2WSH = !!input.witnessScript;
      if (input.witnessScript) {
        res.script = input.witnessScript;
      } else if (input.redeemScript) {
        res.script = input.redeemScript;
      } else {
        if (input.nonWitnessUtxo) {
          const nonWitnessUtxoTx = nonWitnessUtxoTxFromCache(
            cache,
            input,
            inputIndex
          );
          const prevoutIndex = unsignedTx.ins[inputIndex].index;
          res.script = nonWitnessUtxoTx.outs[prevoutIndex].script;
        } else if (input.witnessUtxo) {
          res.script = input.witnessUtxo.script;
        }
      }
      if (input.witnessScript || (0, psbtutils_1.isP2WPKH)(res.script)) {
        res.isSegwit = true;
      }
      return res;
    }
    function getSignersFromHD(inputIndex, inputs, hdKeyPair) {
      const input = (0, utils_1.checkForInput)(inputs, inputIndex);
      if (!input.bip32Derivation || input.bip32Derivation.length === 0) {
        throw new Error("Need bip32Derivation to sign with HD");
      }
      const myDerivations = input.bip32Derivation.map((bipDv) => {
        if (bipDv.masterFingerprint.equals(hdKeyPair.fingerprint)) {
          return bipDv;
        } else {
          return;
        }
      }).filter((v) => !!v);
      if (myDerivations.length === 0) {
        throw new Error(
          "Need one bip32Derivation masterFingerprint to match the HDSigner fingerprint"
        );
      }
      const signers = myDerivations.map((bipDv) => {
        const node = hdKeyPair.derivePath(bipDv.path);
        if (!bipDv.pubkey.equals(node.publicKey)) {
          throw new Error("pubkey did not match bip32Derivation");
        }
        return node;
      });
      return signers;
    }
    function getSortedSigs(script, partialSig) {
      const p2ms = payments.p2ms({ output: script });
      return p2ms.pubkeys.map((pk) => {
        return (partialSig.filter((ps) => {
          return ps.pubkey.equals(pk);
        })[0] || {}).signature;
      }).filter((v) => !!v);
    }
    function scriptWitnessToWitnessStack(buffer) {
      let offset = 0;
      function readSlice(n) {
        offset += n;
        return buffer.slice(offset - n, offset);
      }
      function readVarInt() {
        const vi = varuint.decode(buffer, offset);
        offset += varuint.decode.bytes;
        return vi;
      }
      function readVarSlice() {
        return readSlice(readVarInt());
      }
      function readVector() {
        const count = readVarInt();
        const vector = [];
        for (let i = 0; i < count; i++) vector.push(readVarSlice());
        return vector;
      }
      return readVector();
    }
    function sighashTypeToString(sighashType) {
      let text = sighashType & transaction_1.Transaction.SIGHASH_ANYONECANPAY ? "SIGHASH_ANYONECANPAY | " : "";
      const sigMod = sighashType & 31;
      switch (sigMod) {
        case transaction_1.Transaction.SIGHASH_ALL:
          text += "SIGHASH_ALL";
          break;
        case transaction_1.Transaction.SIGHASH_SINGLE:
          text += "SIGHASH_SINGLE";
          break;
        case transaction_1.Transaction.SIGHASH_NONE:
          text += "SIGHASH_NONE";
          break;
      }
      return text;
    }
    function addNonWitnessTxCache(cache, input, inputIndex) {
      cache.__NON_WITNESS_UTXO_BUF_CACHE[inputIndex] = input.nonWitnessUtxo;
      const tx = transaction_1.Transaction.fromBuffer(input.nonWitnessUtxo);
      cache.__NON_WITNESS_UTXO_TX_CACHE[inputIndex] = tx;
      const self = cache;
      const selfIndex = inputIndex;
      delete input.nonWitnessUtxo;
      Object.defineProperty(input, "nonWitnessUtxo", {
        enumerable: true,
        get() {
          const buf = self.__NON_WITNESS_UTXO_BUF_CACHE[selfIndex];
          const txCache = self.__NON_WITNESS_UTXO_TX_CACHE[selfIndex];
          if (buf !== void 0) {
            return buf;
          } else {
            const newBuf = txCache.toBuffer();
            self.__NON_WITNESS_UTXO_BUF_CACHE[selfIndex] = newBuf;
            return newBuf;
          }
        },
        set(data) {
          self.__NON_WITNESS_UTXO_BUF_CACHE[selfIndex] = data;
        }
      });
    }
    function inputFinalizeGetAmts(inputs, tx, cache, mustFinalize) {
      let inputAmount = 0;
      inputs.forEach((input, idx) => {
        if (mustFinalize && input.finalScriptSig)
          tx.ins[idx].script = input.finalScriptSig;
        if (mustFinalize && input.finalScriptWitness) {
          tx.ins[idx].witness = scriptWitnessToWitnessStack(
            input.finalScriptWitness
          );
        }
        if (input.witnessUtxo) {
          inputAmount += input.witnessUtxo.value;
        } else if (input.nonWitnessUtxo) {
          const nwTx = nonWitnessUtxoTxFromCache(cache, input, idx);
          const vout = tx.ins[idx].index;
          const out = nwTx.outs[vout];
          inputAmount += out.value;
        }
      });
      const outputAmount = tx.outs.reduce((total, o) => total + o.value, 0);
      const fee = inputAmount - outputAmount;
      if (fee < 0) {
        throw new Error("Outputs are spending more than Inputs");
      }
      const bytes = tx.virtualSize();
      cache.__FEE = fee;
      cache.__EXTRACTED_TX = tx;
      cache.__FEE_RATE = Math.floor(fee / bytes);
    }
    function nonWitnessUtxoTxFromCache(cache, input, inputIndex) {
      const c = cache.__NON_WITNESS_UTXO_TX_CACHE;
      if (!c[inputIndex]) {
        addNonWitnessTxCache(cache, input, inputIndex);
      }
      return c[inputIndex];
    }
    function getScriptFromUtxo(inputIndex, input, cache) {
      const { script } = getScriptAndAmountFromUtxo(inputIndex, input, cache);
      return script;
    }
    function getScriptAndAmountFromUtxo(inputIndex, input, cache) {
      if (input.witnessUtxo !== void 0) {
        return {
          script: input.witnessUtxo.script,
          value: input.witnessUtxo.value
        };
      } else if (input.nonWitnessUtxo !== void 0) {
        const nonWitnessUtxoTx = nonWitnessUtxoTxFromCache(
          cache,
          input,
          inputIndex
        );
        const o = nonWitnessUtxoTx.outs[cache.__TX.ins[inputIndex].index];
        return { script: o.script, value: o.value };
      } else {
        throw new Error("Can't find pubkey in input without Utxo data");
      }
    }
    function pubkeyInInput(pubkey, input, inputIndex, cache) {
      const script = getScriptFromUtxo(inputIndex, input, cache);
      const { meaningfulScript } = getMeaningfulScript(
        script,
        inputIndex,
        "input",
        input.redeemScript,
        input.witnessScript
      );
      return (0, psbtutils_1.pubkeyInScript)(pubkey, meaningfulScript);
    }
    function pubkeyInOutput(pubkey, output, outputIndex, cache) {
      const script = cache.__TX.outs[outputIndex].script;
      const { meaningfulScript } = getMeaningfulScript(
        script,
        outputIndex,
        "output",
        output.redeemScript,
        output.witnessScript
      );
      return (0, psbtutils_1.pubkeyInScript)(pubkey, meaningfulScript);
    }
    function redeemFromFinalScriptSig(finalScript) {
      if (!finalScript) return;
      const decomp = bscript.decompile(finalScript);
      if (!decomp) return;
      const lastItem = decomp[decomp.length - 1];
      if (!Buffer.isBuffer(lastItem) || isPubkeyLike(lastItem) || isSigLike(lastItem))
        return;
      const sDecomp = bscript.decompile(lastItem);
      if (!sDecomp) return;
      return lastItem;
    }
    function redeemFromFinalWitnessScript(finalScript) {
      if (!finalScript) return;
      const decomp = scriptWitnessToWitnessStack(finalScript);
      const lastItem = decomp[decomp.length - 1];
      if (isPubkeyLike(lastItem)) return;
      const sDecomp = bscript.decompile(lastItem);
      if (!sDecomp) return;
      return lastItem;
    }
    function compressPubkey(pubkey) {
      if (pubkey.length === 65) {
        const parity = pubkey[64] & 1;
        const newKey = pubkey.slice(0, 33);
        newKey[0] = 2 | parity;
        return newKey;
      }
      return pubkey.slice();
    }
    function isPubkeyLike(buf) {
      return buf.length === 33 && bscript.isCanonicalPubKey(buf);
    }
    function isSigLike(buf) {
      return bscript.isCanonicalScriptSignature(buf);
    }
    function getMeaningfulScript(script, index, ioType, redeemScript, witnessScript) {
      const isP2SH = (0, psbtutils_1.isP2SHScript)(script);
      const isP2SHP2WSH = isP2SH && redeemScript && (0, psbtutils_1.isP2WSHScript)(redeemScript);
      const isP2WSH = (0, psbtutils_1.isP2WSHScript)(script);
      if (isP2SH && redeemScript === void 0)
        throw new Error("scriptPubkey is P2SH but redeemScript missing");
      if ((isP2WSH || isP2SHP2WSH) && witnessScript === void 0)
        throw new Error(
          "scriptPubkey or redeemScript is P2WSH but witnessScript missing"
        );
      let meaningfulScript;
      if (isP2SHP2WSH) {
        meaningfulScript = witnessScript;
        checkRedeemScript(index, script, redeemScript, ioType);
        checkWitnessScript(index, redeemScript, witnessScript, ioType);
        checkInvalidP2WSH(meaningfulScript);
      } else if (isP2WSH) {
        meaningfulScript = witnessScript;
        checkWitnessScript(index, script, witnessScript, ioType);
        checkInvalidP2WSH(meaningfulScript);
      } else if (isP2SH) {
        meaningfulScript = redeemScript;
        checkRedeemScript(index, script, redeemScript, ioType);
      } else {
        meaningfulScript = script;
      }
      return {
        meaningfulScript,
        type: isP2SHP2WSH ? "p2sh-p2wsh" : isP2SH ? "p2sh" : isP2WSH ? "p2wsh" : "raw"
      };
    }
    function checkInvalidP2WSH(script) {
      if ((0, psbtutils_1.isP2WPKH)(script) || (0, psbtutils_1.isP2SHScript)(script)) {
        throw new Error("P2WPKH or P2SH can not be contained within P2WSH");
      }
    }
    function classifyScript(script) {
      if ((0, psbtutils_1.isP2WPKH)(script)) return "witnesspubkeyhash";
      if ((0, psbtutils_1.isP2PKH)(script)) return "pubkeyhash";
      if ((0, psbtutils_1.isP2MS)(script)) return "multisig";
      if ((0, psbtutils_1.isP2PK)(script)) return "pubkey";
      return "nonstandard";
    }
    function range(n) {
      return [...Array(n).keys()];
    }
  }
});

// node_modules/bitcoinjs-lib/src/index.js
var require_src2 = __commonJS({
  "node_modules/bitcoinjs-lib/src/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.initEccLib = exports.Transaction = exports.opcodes = exports.Psbt = exports.Block = exports.script = exports.payments = exports.networks = exports.crypto = exports.address = void 0;
    var address = require_address();
    exports.address = address;
    var crypto = require_crypto2();
    exports.crypto = crypto;
    var networks = require_networks();
    exports.networks = networks;
    var payments = require_payments();
    exports.payments = payments;
    var script = require_script();
    exports.script = script;
    var block_1 = require_block();
    Object.defineProperty(exports, "Block", {
      enumerable: true,
      get: function() {
        return block_1.Block;
      }
    });
    var psbt_1 = require_psbt2();
    Object.defineProperty(exports, "Psbt", {
      enumerable: true,
      get: function() {
        return psbt_1.Psbt;
      }
    });
    var ops_1 = require_ops();
    Object.defineProperty(exports, "opcodes", {
      enumerable: true,
      get: function() {
        return ops_1.OPS;
      }
    });
    var transaction_1 = require_transaction();
    Object.defineProperty(exports, "Transaction", {
      enumerable: true,
      get: function() {
        return transaction_1.Transaction;
      }
    });
    var ecc_lib_1 = require_ecc_lib();
    Object.defineProperty(exports, "initEccLib", {
      enumerable: true,
      get: function() {
        return ecc_lib_1.initEccLib;
      }
    });
  }
});

// src/provider/index.ts
var bitcoin = __toESM(require_src2());
var wasmInitialized = false;
var wasm;
async function initWasm() {
  if (wasmInitialized) return wasm;
  if (typeof window === "undefined") {
    return null;
  }
  console.warn("ts-sdk: metashrew WASM not available. Use alkanes-web-sys from /wasm/ for full functionality.");
  wasmInitialized = true;
  return null;
}
var BitcoinRpcClient = class {
  constructor(url) {
    this.url = url;
  }
  async call(method, params = []) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      })
    });
    const json = await response.json();
    if (json.error) {
      throw new Error(`RPC error: ${json.error.message}`);
    }
    return json.result;
  }
  async getBlockCount() {
    return this.call("getblockcount");
  }
  async getBlockHash(height) {
    return this.call("getblockhash", [height]);
  }
  async getBlock(hash) {
    return this.call("getblock", [hash, 2]);
  }
  async sendRawTransaction(hex) {
    return this.call("sendrawtransaction", [hex]);
  }
  async getTransaction(txid) {
    return this.call("getrawtransaction", [txid, true]);
  }
  async testMempoolAccept(txHex) {
    return this.call("testmempoolaccept", [txHex]);
  }
  async getMempoolEntry(txid) {
    return this.call("getmempoolentry", [txid]);
  }
};
var EsploraClient = class {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  async getAddressInfo(address) {
    const response = await fetch(`${this.baseUrl}/address/${address}`);
    return response.json();
  }
  async getAddressUtxos(address) {
    const response = await fetch(`${this.baseUrl}/address/${address}/utxo`);
    return response.json();
  }
  async getAddressBalance(address) {
    const [info, utxos] = await Promise.all([
      this.getAddressInfo(address),
      this.getAddressUtxos(address)
    ]);
    return {
      address,
      confirmed: info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum,
      unconfirmed: info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum,
      utxos
    };
  }
  async getTxInfo(txid) {
    const response = await fetch(`${this.baseUrl}/tx/${txid}`);
    return response.json();
  }
  async broadcastTx(txHex) {
    const response = await fetch(`${this.baseUrl}/tx`, {
      method: "POST",
      body: txHex
    });
    return response.text();
  }
};
var AlkanesRpcClient = class {
  constructor(metashrewUrl, sandshrewUrl) {
    this.metashrewUrl = metashrewUrl;
    this.sandshrewUrl = sandshrewUrl;
  }
  async getAlkaneBalance(address, alkaneId) {
    const wasmModule = await initWasm();
    if (!wasmModule) {
      throw new Error("WASM not available (server-side rendering)");
    }
    const result = wasmModule.get_alkane_balance(address, alkaneId);
    return JSON.parse(result);
  }
  async getAlkaneBytecode(alkaneId, blockTag) {
    const wasmModule = await initWasm();
    if (!wasmModule) {
      throw new Error("WASM not available (server-side rendering)");
    }
    const result = wasmModule.get_alkane_bytecode(alkaneId, blockTag);
    return result;
  }
  async simulateAlkaneCall(params) {
    const wasmModule = await initWasm();
    if (!wasmModule) {
      throw new Error("WASM not available (server-side rendering)");
    }
    const result = wasmModule.simulate_alkane_call(JSON.stringify(params));
    return JSON.parse(result);
  }
};
var AlkanesProvider = class {
  constructor(config) {
    this.network = config.network;
    this.networkType = config.networkType;
    this.url = config.url;
    const masterUrl = config.projectId ? `${config.url}/${config.version || "v1"}/${config.projectId}` : config.url;
    this.bitcoin = new BitcoinRpcClient(masterUrl);
    this.esplora = new EsploraClient(masterUrl);
    this.alkanes = new AlkanesRpcClient(
      masterUrl,
      void 0
    );
  }
  /**
   * Push a PSBT to the network (compatible with @oyl/sdk)
   */
  async pushPsbt({ psbtHex, psbtBase64 }) {
    if (!psbtHex && !psbtBase64) {
      throw new Error("Please supply psbt in either base64 or hex format");
    }
    if (psbtHex && psbtBase64) {
      throw new Error("Please select one format of psbt to broadcast");
    }
    let psbt;
    if (psbtHex) {
      psbt = bitcoin.Psbt.fromHex(psbtHex, { network: this.network });
    } else {
      psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: this.network });
    }
    let extractedTx;
    try {
      extractedTx = psbt.extractTransaction();
    } catch (error) {
      throw new Error(`Transaction could not be extracted due to invalid Psbt. ${error}`);
    }
    const txId = extractedTx.getId();
    const rawTx = extractedTx.toHex();
    const [result] = await this.bitcoin.testMempoolAccept([rawTx]);
    if (!result.allowed) {
      throw new Error(`Mempool rejected tx due to ${result["reject-reason"]}`);
    }
    await this.bitcoin.sendRawTransaction(rawTx);
    try {
      const mempoolEntry = await this.bitcoin.getMempoolEntry(txId);
      const fee = mempoolEntry.fees["base"] * 10 ** 8;
      return {
        txId,
        rawTx,
        size: mempoolEntry.vsize,
        weight: mempoolEntry.weight,
        fee,
        satsPerVByte: (fee / (mempoolEntry.weight / 4)).toFixed(2)
      };
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      const tx = await this.esplora.getTxInfo(txId);
      return {
        txId,
        rawTx,
        size: tx.size,
        weight: tx.weight,
        fee: tx.fee,
        satsPerVByte: (tx.fee / (tx.weight / 4)).toFixed(2)
      };
    }
  }
  /**
   * Get block information
   */
  async getBlockInfo(hashOrHeight) {
    const hash = typeof hashOrHeight === "number" ? await this.bitcoin.getBlockHash(hashOrHeight) : hashOrHeight;
    const block = await this.bitcoin.getBlock(hash);
    return {
      hash: block.hash,
      height: block.height,
      timestamp: block.time,
      txCount: block.tx.length
    };
  }
  /**
   * Get address balance
   */
  async getBalance(address) {
    return this.esplora.getAddressBalance(address);
  }
  /**
   * Get alkane balance for address
   */
  async getAlkaneBalance(address, alkaneId) {
    return this.alkanes.getAlkaneBalance(address, alkaneId);
  }
  /**
   * Simulate alkane contract call
   */
  async simulateAlkaneCall(params) {
    return this.alkanes.simulateAlkaneCall(params);
  }
};
function createProvider(config) {
  return new AlkanesProvider(config);
}
export {
  AlkanesProvider,
  AlkanesRpcClient,
  BitcoinRpcClient,
  EsploraClient,
  createProvider
};
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)

@noble/hashes/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

safe-buffer/index.js:
  (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)
*/
//# sourceMappingURL=index.mjs.map