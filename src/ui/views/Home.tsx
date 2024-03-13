import { ReactElement } from 'react'
import { Section } from '../base/section'
import { CommandTerminal, SignersTerminal } from '../features/terminal'

function Home(): ReactElement {
  return (
    <div className="flex flex-col justify-center gap-6">
      {/* Signers */}
      <Section>
        <SignersTerminal />
      </Section>

      {/* Logs */}
      <Section>
        <CommandTerminal />
      </Section>
    </div>
  )
}

export default Home
