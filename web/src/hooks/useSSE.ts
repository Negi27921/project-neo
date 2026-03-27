import { useEffect, useRef, useState } from 'react'

export function useSSE<T>(url: string, eventName = 'message') {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let es: EventSource
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource(url)
      esRef.current = es

      es.addEventListener(eventName, (e: MessageEvent) => {
        try {
          setData(JSON.parse(e.data) as T)
          setError(null)
        } catch {
          setError('Parse error')
        }
      })

      es.onerror = () => {
        es.close()
        setError('Connection lost — reconnecting…')
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      clearTimeout(retryTimer)
      esRef.current?.close()
    }
  }, [url, eventName])

  return { data, error }
}
