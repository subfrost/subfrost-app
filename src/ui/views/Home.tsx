import { ReactElement, useEffect, useMemo } from 'react'
import { Section } from '../base';
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
