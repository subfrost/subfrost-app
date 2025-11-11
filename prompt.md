The UI for the /swap view should reuse component architecture that we have in ./reference/oyl.io, while still using our existing design system for subfrost

We want the top of the swap view to be the component where we can toggle to reverse the direction of the swap, with dropdowns for the tokens we are trading in or outputting, where we populate with graphics accordingly as we expand the dropdown. The mathematics in-page to render values should be identical.

Below this component we want to show a list of pools like we see on the oyl.io Explore tab with the list of pairs and markets, with data for them. We want that list to be on the swap view where we can quickly choose the trade we want to make instead of using the dropdowns to select the assets. The default swap should be BTC to frBTC.

We do not need a /wrap tab. The transactions we build purely for wrap are just the [32, 0, 77] wrap cellpack as a singular Protostone, when we swap from BTC to frBTC. Swapping from frBTC to BTC is implicitly an unwrap, and vice versa. Whereas if we swap from BTC to any other asset, we compose protostones to wrap to frBTC first then direct the frBTC into the swap protostone to execute, the same as it is done in oyl.io
I would put this in ./docs
deedee
alright
flex鬼
Whats your TG?
I'll add you to the group with Luce
Have you met Luce
deedee
@doubleedee

flex鬼
Have you met Luce
yeah
when i was working on the contract indexer
flex鬼
12:34
flex:
Ok so I think this works best if we follow the Curve/YFi model (use DIESEL/veDIESEL for governance). There are a bunch of possible vaults here, but this would strike a balance of time locking DIESEL to reduce circulation, and using the DIESEL subsidy to incentivize minting frBTC. Should drive frBTC supply up and DIESEL supply down. We’re already getting ready to deploy EIP-4626 vaults and can support them but it’ll require Oyl to be on board with allocating 80% of their protocol DIESEL per block to gauge contracts, and you to allocate DIESEL for the yvfrBTC vault (will come up with a better name than yv{..}. The only possible conflict interest would be Oyl approving distribution of veDIESEL via DIESEL-frBTC rewards. Can always spin up another vault for yvOyl-DIESEL-frBTC if that’s an issue though

1. Introduce something like veDIESEL which comes from locking DIESEL
2. Introduce gauge contracts for AMM pools. Staking LP tokens in a gauge earns DIESEL from 10% of the protocol fee taken per block.
3. Use 30% of the DIESEL earned per block to buy frBTC/DIESEL LP positions. This is distributed to users as rewards.
4. LP tokens staked in gauges are boosted by veDIESEL held. Up to 2.5x (like Curve).

yveDIESEL Vault Spec:
1. When a user deposits DIESEL into the vault, it’s locked as veDIESEL and yveDIESEL is given back to the user.
2. All vaults get boosted DIESEL yield because of the veDIESEL locked in the yveDIESEL vault.
3. 50% of the frBTC/DIESEL LP positions earned are claimed as DIESEL, out of which 10% is locked for the maximum duration to earn more veDIESEL. The remaining LP positions are distributed to users to be claimed as rewards.
4. 10% of the farmed DIESEL from all vaults goes back the yveDIESEL Vault to be claimed as rewards by users.

yvBOOST Vault Spec (optional):
1. When a user deposits yveDIESEL, they get yvBOOST back.
2. The vault automatically claims the frBTC/DIESEL LP tokens on behalf of the user and unwraps to be restaked in yvBOOST and vefrBTC.

yv{TOKEN} Vault Spec:
1. User deposits {TOKEN} for yv{TOKEN}.
2. Vault has a strategy (EIP-4626) to stake the token. This may include using Gauge contracts to take advantage of boosting.

yvfrBTC Vault Spec:
1. Deposit yvfrBTC
2. Earn DIESEL rewards subsidy from Alkanes Foundation.
3. Auto deposit the DIESEL into yvBOOST (this earns frBTC-DIESEL LP). All frBTC-DIESEL LP is swapped back to frBTC as rewards.

flex, [10/31/25 4:46 PM]
What about frBTC/bUSD LP

flex, [10/31/25 4:46 PM]
We can use that too, no?

flex, [10/31/25 4:46 PM]
Right now I am building these vaults into subfrost-app

flex, [10/31/25 4:46 PM]
And replicating the flows in Bitcoin V8

flex, [10/31/25 4:47 PM]
The mobile app I made for normies

flex, [10/31/25 4:47 PM]
Well sorta normies

flex, [10/31/25 4:47 PM]
Wrote it in Kotlin/Swift

luce, [10/31/25 4:48 PM]
I think you only want the yvfrBTC-DIESEL and yfrBTC vaults on subfrost

flex, [10/31/25 4:49 PM]
Yeah I guess I can't subsidize with bUSD

flex, [10/31/25 4:49 PM]
And the BTC I can supply to the system is scarce

flex, [10/31/25 4:49 PM]
So I agree

luce, [10/31/25 4:49 PM]
Can create a marketing scenario where subfrost is using selling off DIESEL to drive up the value / usage of frBTC, and Oyl is doing the opposite to drive up the value of DIESEL

flex, [10/31/25 4:49 PM]
Interesting

luce, [10/31/25 4:49 PM]
I’ll see if Jonto is available to work with some of the tokenomics here

flex, [10/31/25 4:50 PM]
Let's make a group

flex, [10/31/25 4:50 PM]
rebar x subfrost

flex, [10/31/25 4:50 PM]
I have Gabe

luce, [10/31/25 4:50 PM]
And bUSD is an interesting situation

flex, [10/31/25 4:50 PM]
He will have an opinion on this

luce, [10/31/25 4:50 PM]
Go for it

luce, [10/31/25 4:51 PM]
Using bUSD as well would mean more trading volume to earn yield on, and because the lending vaults ultimately move 10% of trading fees back into DIESEL it would drive up the price of DIESEL

luce, [10/31/25 4:52 PM]
But if you subsidize it, the cost gets offset

Sortof give the user more variety in how he deploys his BTC
While keeping it simple for him
These vaults are better than just trivial dxBTCUSD
I'm going to subsidize them with my DIESEL
The ones with DIESEL emissions
When you get a swift build of the UI let me know ℭℭ𝔬𝔩𝔢
I've been helping hath with alkamon
But was experimenting trying to get a basic android monorepo with swift sdk
Porting from cas's work
Going to nix the Rust linkage with alkanes-cli-* for now just since ana is still working on it and also cas has a seemingly owrking build of the Kotlin
casuwu
emphasis on seemingly
deedee
im working on the UX in subfrost-app to enable these flows on the web
that should get us to a POC quick
flex鬼
We're going to port those flows into the Kotlin pure-business-logic casuwu
While Cole rigs UI

luce:
Basically we have a unique opportunity to “pit” subfrost and oyl against each other from a marketing perspective and create an actual use case for subfrost BTC. Using curve style veDIESEL and gauges we can use the DIESEL Oyl receives each block as rewards and incentivize LP activity on the Oyl AMM. And because Ray controls so much of DIESEL’s supply and wants volume to go through subfrost, he’ll subsidize the vault with DIESEL so we can drive up the value of subfrost BTC relative to DIESEL. So publicly both sides are trying to move the price / volume in their favor, and internally we can very tightly control price direction and incentives to increase TVL of subfrost and market price of DIESEL while bringing in some of the DIESEL held by both teams that is not currently in circulation

flex:
Functionally I think token economics are easier being that we can at least subsidize with my DIESEL (vaults) and frBTC fees

Should be enough to get some traction

luce:
Are you willing to subsidize the “yfrBTC” vault with frBTC fees?

That would be a good boost to yield, if you control some of the DIESEL that is not currently circulating and the frBTC fees, and Oyl controls the supply of DIESEL minted to the protocol each block then we have the resources on both sides to create yield opportunities and have some fun with the marketing to get people staking

flex:
Yes but I'm going to call yfrBTC dxBTC

Since that is already on our roadmap

Which is pure BTC yield

Does that break our naming convention

luce:
Well is dxBTC going to support strategies like LP’ing in DIESEL-frBTC pool?

If not we can auto wrap BTC to dxBTC and make a yvdxBTC vault

flex:
The way it would need to work

Is that frBTC in the dxBTC vault

Cannot be subject to market movement external to BTC

luce:
It would be dxBTC, but you can deposit frBTC and it’ll convert it

flex:
It should just feed back in terms of frBTC

But do we have that property on yfrBTC?

luce:
It would work either way, we just need a BTC vault that can earn yield from subsidies + DIESEL-frBTC + dxBTC if we support it

flex:
We are pitching on a BTC yield product

So if yfrBTC is that yield product

It will help us close anyway

And also helps DIESEL

luce:
Ah wait a sec

Oyl takes a protocol fee on the AMM outside of LPs, Alec said he’s also willing to use that to subsidize the veDIESEL

flex:
The protocol fee currently is just held as LP

We can already subsidize veDIESEL with DIESEL

The protocol fee we don't need to touch

luce:
Any reason not to distribute that to veDIESEL holders?

flex:
We have various sources of DIESEL and also I have a supply of DIESEL myself

