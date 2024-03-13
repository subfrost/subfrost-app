import { useCallback, useEffect, useState } from 'react'
import {
  TerminalHistory,
  TerminalHistoryItem,
  TerminalPushToHistoryWithDelayProps
} from '../types/terminal'

export const useTerminal = () => {
  const [terminalRef, setDomNode] = useState<HTMLDivElement>()
  const setTerminalRef = useCallback(
    (node: HTMLDivElement) => setDomNode(node),
    []
  )

  const [history, setHistory] = useState<TerminalHistory>([])

  /**
   * Scroll to the bottom of the terminal when window is resized
   */
  useEffect(() => {
    const windowResizeEvent = () => {
      terminalRef?.scrollTo({
        top: terminalRef?.scrollHeight ?? 99999,
        behavior: 'smooth'
      })
    }
    window.addEventListener('resize', windowResizeEvent)

    return () => {
      window.removeEventListener('resize', windowResizeEvent)
    }
  }, [terminalRef])

  /**
   * Scroll to the bottom of the terminal on every new history item
   */
  useEffect(() => {
    terminalRef?.scrollTo({
      top: terminalRef?.scrollHeight ?? 99999,
      behavior: 'smooth'
    })
  }, [history, terminalRef])

  const pushToHistory = useCallback((item: TerminalHistoryItem) => {
    setHistory((old: any) => [...old, item])
  }, [])

  /**
   * Write text to terminal
   * @param content The text to be printed in the terminal
   * @param delay The delay in ms before the text is printed
   * @param executeBefore The function to be executed before the text is printed
   * @param executeAfter The function to be executed after the text is printed
   */
  const pushToHistoryWithDelay = useCallback(
    ({ delay = 0, content }: TerminalPushToHistoryWithDelayProps) =>
      new Promise((resolve) => {
        setTimeout(() => {
          pushToHistory(content)
          return resolve(content)
        }, delay)
      }),
    [pushToHistory]
  )

  /**
   * Reset the terminal window
   */
  const resetTerminal = useCallback(() => {
    setHistory([])
  }, [])

  return {
    history,
    pushToHistory,
    pushToHistoryWithDelay,

    terminalRef,
    setTerminalRef,

    resetTerminal
  }
}
