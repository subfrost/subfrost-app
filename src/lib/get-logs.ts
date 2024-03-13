export async function getLogs() {
  // TODO: Open logs websocket here
  return new Promise((res, rej) => res(true))
}

export async function renderLog(log: string) {
  // TODO: Format the logs to HTML to be rendered in the terminal
  return log
}
