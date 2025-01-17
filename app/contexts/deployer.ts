import { Wallet } from './wallet'
import { contractDeployment } from '@oyl/sdk/lib/alkanes'
import { accountUtxos } from '@oyl/sdk/lib/utxo'
import { Provider } from '@oyl/sdk/lib/provider'
import { timeout } from './sandshrew-provider'
const DEFAULT_RESERVE_NUMBER = '0x7'

const POLL_INTERVAL = 3000;

async function waitForIndex(provider: Provider): Promise<void> {
    while (true) {
      const bitcoinHeight = Number(await provider.sandshrew._call("getblockcount", []));
      const metashrewHeight = Number(await provider.sandshrew._call("metashrew_height", []));
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
    const wallet = options.wallet
    const payload = options.payload
    const provider = wallet.provider
    const account = wallet.account
    const signer = wallet.signer


    await provider.sandshrew._call('generatetoaddress', [
      1,
      wallet.account.nativeSegwit.address
    ])
   
   

  
    

    const { accountSpendableTotalUtxos, accountSpendableTotalBalance } =
      await accountUtxos({ account, provider })

   
      

      const {txId: revealTxId} = await contractDeployment({
        reserveNumber: options.reserveNumber,
        payload,
        gatheredUtxos: {
          utxos: accountSpendableTotalUtxos,
          totalAmount: accountSpendableTotalBalance,
        },
        feeRate: wallet.feeRate,
        account: account,
        signer: signer,
        provider: provider,
      })
  
    
    
      console.log('reveal txid: ', revealTxId)
      
      
      const blockHash2 =  await provider.sandshrew._call('generatetoaddress', [
        1,
        wallet.account.nativeSegwit.address
      ])
      console.log('Block hash: ', blockHash2)

      //await waitForIndex(wallet.provider)
  
      const contractTrace = await wallet.provider.alkanes.trace({
        txid: revealTxId,
        vout: 3
      });

      console.log('Contract trace: ', contractTrace)

      await provider.sandshrew._call('generatetoaddress', [
        10,
        wallet.account.nativeSegwit.address
      ])

}