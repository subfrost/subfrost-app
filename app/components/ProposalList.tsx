"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

const mockProposals = [
  { id: 1, title: 'Increase staking rewards', status: 'Active', progress: 65, userVote: 'Yes' },
  { id: 2, title: 'Implement new security measures', status: 'Passed', progress: 100, userVote: 'Yes' },
  { id: 3, title: 'Reduce transaction fees', status: 'Failed', progress: 30, userVote: 'No' },
]

export function ProposalList() {
  return (
    <Card className="frost-bg frost-border">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600 relative z-10"><span className="white-outline-text">Proposals</span></CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {mockProposals.map((proposal) => (
            <li key={proposal.id} className="bg-blue-800 bg-opacity-20 rounded p-4">
              <h3 className="retro-text text-sm mb-2 relative z-10"><span className="white-outline-text">{proposal.title}</span></h3>
              <div className="flex justify-between items-center mb-2">
                <span className="readable-text text-xs">Status: {proposal.status}</span>
                <span className="readable-text text-xs">Your Vote: {proposal.userVote}</span>
              </div>
              <Progress value={proposal.progress} className="h-2" />
              <span className="readable-text text-xs">{proposal.progress}% Support</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

