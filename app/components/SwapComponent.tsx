"use client"

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { FaSnowflake } from 'react-icons/fa'
// Keep this component LIGHT: no provider/API/SDK imports
import { Settings } from 'lucide-react'
import { SwapConfirmationModal } from './SwapConfirmationModal'
import { getConfig } from '../utils/getConfig'
import { useApiProvider } from '../hooks/useApiProvider'

interface SwapComponentProps {
  slippage: number
  onOpenSettings: () => void
  onSwapConfirm: (amount: string) => void
}

export function SwapComponent({ slippage, onOpenSettings, onSwapConfirm }: SwapComponentProps) {
  const api = useApiProvider()

  // Minimal validation (skip wallet balance checks in this simplified build)
  const validateAmount = (_v: string, _id: string) => ({ errorMessage: '' })

  // Static lightweight token list to isolate freezes (no API calls here)
  const [sellOptions, setSellOptions] = useState<{ id: string; name: string }[]>([])
  const [sellToken, setSellToken] = useState<string>('')

  // Buy token options fetched on-demand (no mount-time effect)
  const [buyOptions, setBuyOptions] = useState<{ id: string; name: string }[]>([])

  const [buyToken, setBuyToken] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [quotedOut, setQuotedOut] = useState<string>('')
  const [isQuoting, setIsQuoting] = useState(false)
  const debounceRef = (typeof window !== 'undefined') ? (window as any) : {}

  // Lightweight quote with debounce, only when inputs are ready
  useEffect(() => {
    if (!sellToken || !buyToken) { setQuotedOut(''); return }
    const amt = parseFloat(amount || '0')
    if (!isFinite(amt) || amt <= 0) { setQuotedOut(''); return }
    if (debounceRef.__q) clearTimeout(debounceRef.__q)
    debounceRef.__q = setTimeout(async () => {
      try {
        setIsQuoting(true)
        const { ALKANE_FACTORY_ID } = getConfig((process as any).env?.NEXT_PUBLIC_NETWORK || 'mainnet') as any
        const parseId = (id: string) => { const [block, tx] = (id || '').split(':'); return { block, tx } as any }
        // Fetch pairs for sell token and find direct pool with buy token
        const pairs = await api.getAlkanesTokenPairs({ factoryId: parseId(ALKANE_FACTORY_ID), alkaneId: parseId(sellToken) })
        const direct = (pairs || []).find((p: any) => {
          const id0 = `${p.token0.alkaneId.block}:${p.token0.alkaneId.tx}`
          const id1 = `${p.token1.alkaneId.block}:${p.token1.alkaneId.tx}`
          return (id0 === sellToken && id1 === buyToken) || (id1 === sellToken && id0 === buyToken)
        })
        if (!direct) { setQuotedOut('0.00'); setIsQuoting(false); return }
        const id0 = `${direct.token0.alkaneId.block}:${direct.token0.alkaneId.tx}`
        const isSell0 = id0 === sellToken
        const reserveIn = Number(isSell0 ? direct.token0.token0Amount : direct.token1.token0Amount)
        const reserveOut = Number(isSell0 ? direct.token1.token0Amount : direct.token0.token0Amount)
        const DEC = 8
        const toAlks = (v: number) => Math.floor(v * Math.pow(10, DEC))
        const fromAlks = (v: number) => (v / Math.pow(10, DEC)).toFixed(8)
        const amountIn = toAlks(amt)
        const fee = 0.003
        const amountInWithFee = Math.floor(amountIn * (1 - fee))
        const numerator = amountInWithFee * reserveOut
        const denominator = reserveIn + amountInWithFee
        const out = Math.floor(numerator / denominator)
        setQuotedOut(fromAlks(out))
      } catch {
        setQuotedOut('0.00')
      } finally {
        setIsQuoting(false)
      }
    }, 300)
  }, [sellToken, buyToken, amount])
  const handleFromAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)
  const handleConfirmSwap = () => {
    // Placeholder success
    setTimeout(() => {
      onSwapConfirm(amount)
      setIsModalOpen(false)
    }, 300)
  }

  const AssetSelector = ({ value, onChange, options, onOpen }: { value: string; onChange: (value: string) => void, options: {id:string; name:string}[], onOpen?: () => void }) => (
    <Select value={value} onValueChange={onChange} onOpenChange={(open) => { if (open && onOpen) onOpen() }}>
      <SelectTrigger className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-40 token-button-text" />
      <SelectContent>
        {options.map((asset) => (
          <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const fromAmount = amount
  const toAmount = quotedOut || '0.00'

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600 relative z-10"><span className="white-outline-text">From</span></label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={fromAmount}
            onChange={handleFromAmountChange}
            placeholder="0.00"
            className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
          />
          <AssetSelector value={sellToken} onChange={(v) => {
            setSellToken(v)
            setBuyToken('')
            setBuyOptions([])
          }} options={sellOptions} onOpen={async () => {
            if (sellOptions.length) return
            try {
              const { BUSD_ALKANE_ID, ALKANE_FACTORY_ID } = getConfig((process as any).env?.NEXT_PUBLIC_NETWORK || 'mainnet') as any
              const parseId = (id: string) => { const [block, tx] = (id || '').split(':'); return { block, tx } as any }
              const pairs = await api.getAlkanesTokenPairs({ factoryId: parseId(ALKANE_FACTORY_ID), alkaneId: parseId(BUSD_ALKANE_ID) })
              const opts: { id: string; name: string }[] = []
              ;(pairs || []).forEach((p: any) => {
                const is0 = `${p.token0.alkaneId.block}:${p.token0.alkaneId.tx}` === BUSD_ALKANE_ID
                const other = is0 ? p.token1 : p.token0
                const otherId = `${other.alkaneId.block}:${other.alkaneId.tx}`
                const [n0, n1] = String(p.poolName || '').replace(' LP','').split(' / ')
                const name = is0 ? n1 : n0
                if (!opts.find(o => o.id === otherId)) opts.push({ id: otherId, name: name || otherId })
              })
              setSellOptions(opts.slice(0, 25))
            } catch {}
          }} />
        </div>
        <p className="readable-text text-xs mt-2 h-4">&nbsp;</p>
      </div>
      <div className="flex items-center justify-center">
        <div className="border-t border-blue-300 flex-grow"></div>
        <FaSnowflake className="text-blue-300 mx-2" />
        <div className="border-t border-blue-300 flex-grow"></div>
      </div>
      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600 relative z-10"><span className="white-outline-text">To</span></label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={toAmount}
            readOnly
            placeholder="0.00"
            className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
          />
          <AssetSelector value={buyToken} onChange={setBuyToken} options={buyOptions} onOpen={async () => {
            if (!sellToken || buyOptions.length) return
            try {
              const { ALKANE_FACTORY_ID } = getConfig((process as any).env?.NEXT_PUBLIC_NETWORK || 'mainnet') as any
              const parseId = (id: string) => { const [block, tx] = (id || '').split(':'); return { block, tx } as any }
              const pairs = await api.getAlkanesTokenPairs({ factoryId: parseId(ALKANE_FACTORY_ID), alkaneId: parseId(sellToken) })
              const opts: { id: string; name: string }[] = []
              ;(pairs || []).forEach((p: any) => {
                const is0 = `${p.token0.alkaneId.block}:${p.token0.alkaneId.tx}` === sellToken
                const other = is0 ? p.token1 : p.token0
                const otherId = `${other.alkaneId.block}:${other.alkaneId.tx}`
                const [n0, n1] = String(p.poolName || '').replace(' LP','').split(' / ')
                const name = is0 ? n1 : n0
                if (!opts.find(o => o.id === otherId)) opts.push({ id: otherId, name: name || otherId })
              })
              setBuyOptions(opts.slice(0, 25))
            } catch {}
          }} />
        </div>
        <p className="readable-text text-xs mt-2 h-4">&nbsp;</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>Slippage Tolerance: {slippage.toFixed(1)}%</span></p>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Open slippage settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        {sellToken && buyToken ? (
          <div className="flex items-center mb-2">
            <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>Network Fee: </span>~ 5 sat/vB</p>
          </div>
        ) : null}
        <p className="readable-text text-sm text-blue-600 mb-2 relative z-10">
          <span>Expected {buyOptions.find(t => t.id === buyToken)?.name || buyToken || ''}: {isQuoting ? '...' : (toAmount || "0.00")}</span>
        </p>
        <Button onClick={() => setIsModalOpen(true)} disabled={!sellToken || !buyToken || !fromAmount} className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size relative z-10">
          Swap
        </Button>
      </div>

      <SwapConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        fromAsset={sellOptions.find(t => t.id === sellToken)?.name || sellToken}
        toAsset={buyOptions.find(t => t.id === buyToken)?.name || buyToken}
        fromAmount={fromAmount}
        toAmount={toAmount}
        fromDollarValue={''}
        toDollarValue={''}
        slippage={slippage}
        onConfirm={handleConfirmSwap}
      />
    </div>
  )
}

