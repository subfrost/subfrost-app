##  Processing Offers
To process an offer and execute a swap on a marketplace call `processOffer()` in ./index.ts. Most of the parameters in `ProcessOfferOptions` can be resolved with exported helper functions. E.g. see `selectSpendAddress()` which "selects" a spendAddress and its relative public key based on the estimated cost of the offer(s). If there are no exceptions, `processOffer()` returns a:
-  `prepTx` - which will contain a txId for transaction that creates dummy-utxos; otherwise `null` if there was no need to create dummy-utxos.  AND a:
- `purchaseTx` - which will contain a txId for a successful transaction.


Some marketplace apis have unique characteristics that need to be considered to avoid the process failing:

## Marketplaces that require confirmed UTXOs

Some marketplaces require that submitted offers only contain confirmed utxos as inputs. See `CONFIRMED_UTXO_ENFORCED_MARKETPLACES` in `./helpers.ts` for the list of marketplaces that require confirmed utxos.
- Offers from these marketplaces will fail unless there is/are enough confirmed UTXO(s) to cover the amount
- Ideally clients should sort the different marketplace offers to make sure bids for these marketplaces are processed first. That way, confirmed utxos are first used against these marketplace offers. The other marketplaces that allows unconfirmed inputs (utxos in mempool) can then use the outputs of these initial marketplace offers.


## Marketplaces that do NOT require confirmed UTXOs

Some marketplaces do NOT require confirmed utxos. UTXOs in mempool can be used as inputs to construct these swap transactions. But, we can not accept just any mempool transaction since mempool transactions have not been indexed yet and thus may have inscriptions or other meta-protocol items attached to them. Thus, clients should only use utxos that they know the origin of. I.e., only use unconfirmed mempool utxos that have come from previous Oyl swap transactions.

- In general, a client should only be processing a set of offers from a single buy transaction, i.e., when a user selects multiple items to purchase in a single transaction.
- To process other offers from marketplaces that don't enforce confirmed utxos, dApps may want to track the outputs from Oyl swap transactions that have been submitted previously and which are still in the mempool.
- Any mempool transactions that have been identified from previous transactions and which are available for use must be passed into the `utxos[]` parameter alongside spendable utxos.
- See an example implementation at `updateUtxos()` in `./helpers.ts`

## Using Dummy UTXOs to construct a Tx

Some marketplaces require "dummy" utxos in their offer transactions. These are usually 600 sat utxos and are used to create proper inscription flows. See `DUMMY_UTXO_ENFORCED_MARKETPLACES` in ./helpers.ts for the list of marketplaces that use Dummy utxos

  - If an address does not have a sufficient number of dummy utxos (usually 2), then they must first be created.
  - Within the individual swap methods (e.g., `oxkSwap`) the `prepareAddressForDummyUtxos()` will automatically check for existing dummy utxos and, if they do not exist, will create and submit a transaction that creates the dummy utxos as outputs.
  - If it is necessary to create dummy-utxos during a swap, the txId will be returned in `prepTx` from `processOffer`.

## UTXO Management

- `addressUtxos()` and `accountUtxos()` are heavy so avoid calling them multiple times.
- Ideally, getting spendable utxos should be done once, and then the in memory utxo list would be updated after each transaction. For example, you would remove any utxos get used as inputs for a swap transaction, and you would add new change and dummy utxos that are outputs from a swap transaction. That way you always have an accurate set of spendable utxos.
- `processOffer()` takes in a `FormattedUtxo[]` parameter that includes all utxos that can be used as spendable inputs or dummy utxos.
- You can also include unconfirmed mempool utxos in `utxos: FormattedUtxo[]`, but you should only include mempool transactions that you know do not have inscriptions attached to them. I.e., only include mempool transactions that come from previous swaps that you have tracked.

