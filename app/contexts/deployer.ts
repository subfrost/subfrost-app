import { Wallet } from './wallet'
import { deployCommit, deployReveal } from '@oyl/sdk/lib/alkanes'
import { accountUtxos } from '@oyl/sdk/lib/utxo'
import { Provider } from '@oyl/sdk/lib/provider'
import { timeout } from './sandshrew-provider'
const DEFAULT_RESERVE_NUMBER = '0x7'

const POLL_INTERVAL = 3000;

async function waitForIndex(provider: Provider): Promise<void> {
    while (true) {
      const bitcoinHeight = Number(await provider.sandshrew._call("getblockcount", []));
      const metashrewHeight = Number(await provider.sandshrew._call("metashrew_height", []));
      console.log("bitcoin height: " + bitcoinHeight);
      console.log("metashrew height: " + metashrewHeight);
      if (metashrewHeight >= bitcoinHeight) {
        console.log("indexer caught up");
        break;
      } else {
        await timeout(POLL_INTERVAL);
        console.log("retry poll");
      }
    }
  }

export async function contractDeployer(options: any) { 
    const wallet: Wallet = new Wallet({
      mnemonic: options.mnemonic,
      feeRate: options.feeRate,
    });

    const payload = options.payload

    const tx = await wallet.provider.sandshrew._call('generatetoaddress', [200, wallet.account.nativeSegwit.address])
   
   

  
    

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await accountUtxos({ account: wallet.account, provider: wallet.provider })

   
      

      const { txId: commitTxId, script , fee: fee1} = await deployCommit({
        payload,
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
        feeRate: wallet.feeRate,
        account: wallet.account,
        signer: wallet.signer,
        provider: wallet.provider,
      })
  
    
      const mempool = await wallet.provider.sandshrew._call('getrawmempool', [true])
      const mempoolTxs = Object.keys(mempool)
      console.log('mempool transactions: ', mempoolTxs)
  
      const blockHash = await wallet.provider.sandshrew._call('generateblock', [
        wallet.account.nativeSegwit.address,
        mempoolTxs
      ])
  
      console.log('Block hash: ', blockHash)
      
      await timeout(5000)
  
      const { txId: revealTxId, fee: fee2 } = await deployReveal({
        createReserveNumber: options.reserveNumber || DEFAULT_RESERVE_NUMBER,
        commitTxId: commitTxId,
        script: script,
        account: wallet.account,
        provider: wallet.provider,
        feeRate: 50,
        signer: wallet.signer,
      })
  
      console.log('Reveal txid: ', revealTxId)
 

      const mempool2 = await wallet.provider.sandshrew._call('getrawmempool', [true])
      const mempoolTxs2 = Object.keys(mempool2)
      console.log('mempool transactions: ', mempoolTxs2)
      const blockHash2 = await wallet.provider.sandshrew._call('generateblock', [
        wallet.account.nativeSegwit.address,
        mempoolTxs2
      ])
      console.log('Block hash: ', blockHash2)
      await waitForIndex(wallet.provider)
  
      const contractTrace = await wallet.provider.alkanes.trace({
        txid: revealTxId,
        vout: 3
      });
  
      console.log('Contract trace: ', contractTrace)

}