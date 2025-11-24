import * as AlkanesSdk from '@alkanes/ts-sdk';

console.log('AlkanesSdk exports:');
for (const key in AlkanesSdk) {
  console.log(key);
}

// Also try to import specific members to check their availability
import { AlkanesProvider, AlkanesWallet, NetworkType, AlkaneId, FormattedUtxo } from '@alkanes/ts-sdk';
import type { ProviderConfig, Account, SpendStrategy } from '@alkanes/ts-sdk/types';

console.log('AlkanesProvider:', AlkanesProvider);
console.log('AlkanesWallet:', AlkanesWallet);
console.log('NetworkType:', NetworkType);
console.log('AlkaneId:', AlkaneId);
console.log('FormattedUtxo:', FormattedUtxo);
console.log('ProviderConfig:', ProviderConfig);
console.log('Account:', Account);
console.log('SpendStrategy:', SpendStrategy);
