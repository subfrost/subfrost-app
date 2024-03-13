import { ReactElement } from 'react'
import { Section } from '../base/section'
import { CommandTerminal, SignersTerminal } from '../features/terminal'

function Home(): ReactElement {
  return (
    <div className="flex flex-col justify-center gap-4 xl:flex-row max-w-7xl mx-auto">
      {/* Signers */}
      <div className="">
        <Section className="px-4 xl:px-0">
          <SignersTerminal focus={false} />
        </Section>
      </div>

      {/* Logs */}
      <div className="xl:flex-grow">
        <Section className="px-4 xl:px-0">
          <CommandTerminal focus />
        </Section>
      </div>
    </div>
  )
}

export default Home
