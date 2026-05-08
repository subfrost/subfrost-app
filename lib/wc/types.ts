/**
 * Plaintext request/response variants. Mirrors
 * `~/subfrost-mobile/crates/subfrost-mobile-wc/src/wire.rs`. Use the
 * type tag to discriminate — serde on the Rust side is
 * `tag = "type", rename_all = "snake_case"`.
 */

export type Plaintext =
  | {
      type:        'sign_psbt';
      psbt_hex:    string;
      addresses:   string[];
      request_id:  string;
      origin:      string;
    }
  | {
      type:        'sign_message';
      message:     string;
      address:     string;
      request_id:  string;
      origin:      string;
    }
  | {
      type:        'get_accounts';
      request_id:  string;
      origin:      string;
    }
  | {
      type:        'result';
      request_id:  string;
      result:      string;
    }
  | {
      type:        'error';
      request_id:  string;
      code:        'user_rejected' | 'permission_denied' | 'internal' | string;
      message:     string;
    }
  | {
      type:        'accounts';
      request_id:  string;
      addresses:   string[];
    };

export interface RequestEnvelope {
  ciphertext: string;
  nonce:      string;
  origin:     string;
  request_id: string;
}

export interface ResponseEnvelope {
  ciphertext: string;
  nonce:      string;
}
