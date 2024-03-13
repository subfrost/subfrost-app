import '../../styles/terminal.css';
import {ForwardedRef, forwardRef, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {TerminalProps} from "../../types/terminal";
import { useTerminal } from '../../hooks/terminal';
import { NETWORK, VERSION } from '../../utils/constants';
import { getSigners } from '../../lib/get-signers';

export const Terminal = forwardRef(
  (props: TerminalProps, ref: ForwardedRef<HTMLDivElement>) => {
    const {
      history = [],
      promptLabel = '>',

      commands = {},
    } = props;

    const inputRef = useRef<HTMLInputElement>();
    const [input, setInputValue] = useState<string>('');

    /**
     * Focus on the input whenever we render the terminal or click in the terminal
     */
    useEffect(() => {
      inputRef.current?.focus();
    });

    const focusInput = useCallback(() => {
      inputRef.current?.focus();
    }, []);


    /**
     * When user types something, we update the input value
     */
    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
      },
      []
    );

    /**
     * When user presses enter, we execute the command
     */
    const handleInputKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          const commandToExecute = commands?.[input.toLowerCase()];
          if (commandToExecute) {
            commandToExecute?.();
          }
          setInputValue('');
        }
      },
      [commands, input]
    );

    return (
    <div className="terminal" ref={ref} onClick={focusInput}>
      {history.map((line: any, index: number) => (
        <div className="terminal__line" key={`terminal-line-${index}-${line}`}>
          {line}
        </div>
      ))}
      <div className="terminal__prompt">
        <div className="terminal__prompt__label">{promptLabel}</div>
        <div className="terminal__prompt__input">
          <input
            type="text"
            value={input}
            onKeyDown={handleInputKeyDown}
            onChange={handleInputChange}
            // @ts-ignore
            ref={inputRef}
          />
        </div>
      </div>
    </div>
  );
});

export function CommandTerminal() {
  const {
    history,
    pushToHistory,
    setTerminalRef,
    resetTerminal,
  } = useTerminal();


  useEffect(() => {
    resetTerminal();
    pushToHistory(<>
        <div>{`To run a command as administrator (user "root"), use "sudo <command>".`}</div>
        <div>{`To view the logs, use the "watch frost" command.`}</div>
      </>
    );
  }, []);

  const commands = useMemo(() => ({
    'watch frost': async () => {
      await pushToHistory(<>
          <div>
            <strong>Connecting</strong> to the server... <span style={{color: 'green'}}>Done</span>
          </div>
        </>);
    },
    // Add more commands here similar to the above
  }), [pushToHistory]);

  return (
      <Terminal
        history={history}
        ref={setTerminalRef}
        promptLabel={<strong>anon@subfrost.io:</strong>}
        commands={commands}
      />
  )
}

export function SignersTerminal() {
  const {
    history,
    pushToHistory,
    setTerminalRef,
    resetTerminal,
  } = useTerminal();


  useEffect(() => {
    resetTerminal();

    pushToHistory(<>
      <div className="flex w-full justify-between items-start">
        <h2 className="text-xl">{`Network (${NETWORK})`}</h2>
        <h5 className="text-sm leading-0">{VERSION}</h5>
      </div>
      <div className="text-lg mb-2">Signers: <span className="text-[#ffb472]">213/255</span> online.</div>
    </>
        );

    (async () => {
      const signers = await getSigners();
      await pushToHistory(<>
        {      (signers as { address: string; value: string }[]).map((signer => (
          <div className="flex justify-between">
            <span>
            {signer.address}
            </span>
            <span>
              {signer.value} BTC
            </span>
          </div>
        )))}
      </>)
    })().catch(e => console.error(e))
  }, []);

  const commands = useMemo(() => ({
    'watch frost': async () => {
      await pushToHistory(<>
          <div>
            <strong>Connecting</strong> to the server... <span style={{color: 'green'}}>Done</span>
          </div>
        </>);
    },
    // Add more commands here similar to the above
  }), [pushToHistory]);

  return (
      <Terminal
        history={history}
        ref={setTerminalRef}
        commands={commands}
      />
  )
}