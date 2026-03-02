import { AlkanesProvider } from '@alkanes/ts-sdk';

const provider = new AlkanesProvider({
  network: 'subfrost-regtest',
  jsonrpcUrl: 'https://regtest.subfrost.io/v4/jsonrpc'
});

const txid = '821dae1eabc0b83c6080f097ef5d74fe21685d2d720c02e8f0dcecfc19db02e8';

try {
  const tx = await provider.bitcoind.getRawTransaction(txid, true);

  console.log('\n=== Transaction Outputs ===');
  tx.vout.forEach((output, i) => {
    const address = output.scriptPubKey?.address || output.scriptPubKey?.addresses?.[0] || 'OP_RETURN/Unknown';
    console.log(`Output ${i}: ${address} - ${output.value} BTC`);
  });

  console.log('\n=== Expected Addresses ===');
  console.log('Signer:  bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz');
  console.log('User:    bcrt1pvu3q2v23xpmfxcphfdr2d8502gy9hnkf2rr8ekp44p47l0q0hn5sw6gqap');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
