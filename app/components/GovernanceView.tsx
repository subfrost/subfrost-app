"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { FaSnowflake } from 'react-icons/fa'

const mockProposals = [
  { id: 1, title: 'Increase staking rewards', description: 'Proposal to increase staking rewards by 2%' },
  { id: 2, title: 'Implement new security measures', description: 'Proposal to implement additional security features' },
]

export function GovernanceView() {
  const [newProposal, setNewProposal] = useState({ title: '', description: '' })
  const frostBalance = 1000 // This should be fetched from your state management solution

  const handleCreateProposal = () => {
    // Implement proposal creation logic here
    console.log('Creating new proposal:', newProposal)
  }

  const handleVote = (proposalId: number, vote: 'yes' | 'no') => {
    // Implement voting logic here
    console.log(`Voting ${vote} on proposal ${proposalId}`)
  }

  return (
    <div className="space-y-8">
      <Card className="frost-bg frost-border">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center">
            <FaSnowflake className="mr-2" />
            Active Proposals
          </CardTitle>
          <CardDescription className="readable-text text-sm">Vote on existing governance proposals</CardDescription>
        </CardHeader>
        <CardContent>
          {mockProposals.map((proposal) => (
            <div key={proposal.id} className="mb-4 p-4 border rounded frost-bg frost-border">
              <h3 className="text-lg font-semibold retro-text text-blue-500">{proposal.title}</h3>
              <p className="readable-text text-sm text-gray-600 mb-2">{proposal.description}</p>
              <div className="space-x-2">
                <Button onClick={() => handleVote(proposal.id, 'yes')} className="readable-text text-sm bg-green-500 hover:bg-green-600">Vote Yes</Button>
                <Button onClick={() => handleVote(proposal.id, 'no')} variant="outline" className="readable-text text-sm">Vote No</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="frost-bg frost-border">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center">
            <FaSnowflake className="mr-2" />
            Create New Proposal
          </CardTitle>
          <CardDescription className="readable-text text-sm">Submit a new governance proposal using your FROST tokens</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Proposal Title"
            value={newProposal.title}
            onChange={(e) => setNewProposal({ ...newProposal, title: e.target.value })}
            className="mb-4 readable-text text-sm"
          />
          <Textarea
            placeholder="Proposal Description"
            value={newProposal.description}
            onChange={(e) => setNewProposal({ ...newProposal, description: e.target.value })}
            className="mb-4 readable-text text-sm"
          />
          <p className="readable-text text-sm mb-2">Available FROST balance: {frostBalance} FROST</p>
        </CardContent>
        <CardFooter>
          <Button onClick={handleCreateProposal} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">Create Proposal</Button>
        </CardFooter>
      </Card>
    </div>
  )
}

