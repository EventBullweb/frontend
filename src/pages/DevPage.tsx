import { useCallback, useEffect, useMemo, useState } from 'react'
import { isTMA, qrScanner, retrieveLaunchParams } from '@tma.js/sdk'
import './DevPage.css'

type ActivateStatus = 'activated' | 'already_activated'

interface Owner {
  telegram_id: number
  username: string | null
  full_name: string
  telegram_avatar_url: string | null
}

interface ActivateTicketResponse {
  status: ActivateStatus
  activated_at: string | null
  owner: Owner
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const DEFAULT_AVATAR_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="48" fill="#DCE3F5" />
  <circle cx="48" cy="38" r="16" fill="#8EA2D3" />
  <path d="M20 82c4-14 16-22 28-22s24 8 28 22" fill="#8EA2D3" />
</svg>`)

function extractTicketCode(scannedValue: string): string {
  const raw = scannedValue.trim()
  if (!raw) {
    return ''
  }

  try {
    const parsedUrl = new URL(raw)
    return (
      parsedUrl.searchParams.get('ticket_code') ??
      parsedUrl.searchParams.get('code') ??
      parsedUrl.pathname.split('/').filter(Boolean).at(-1) ??
      raw
    )
  } catch {
    return raw
  }
}

function formatActivatedAt(value: string | null): string {
  if (!value) {
    return 'Не передано'
  }

  return new Date(value).toLocaleString('ru-RU')
}

export default function DevPage() {
  const [lastScannedValue, setLastScannedValue] = useState('')
  const [response, setResponse] = useState<ActivateTicketResponse | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isScannerSupported, setIsScannerSupported] = useState(false)
  const [debugLines, setDebugLines] = useState<string[]>([])

  const appendDebug = useCallback((message: string) => {
    const line = `${new Date().toLocaleTimeString('ru-RU')}: ${message}`
    console.info('[TMA debug]', line)
    setDebugLines((previousLines) => [line, ...previousLines].slice(0, 12))
  }, [])

  useEffect(() => {
    const tmaDetected = isTMA()
    const scannerAvailable = qrScanner.open.isAvailable()
    setIsScannerSupported(scannerAvailable)
    appendDebug(`isTMA(): ${String(tmaDetected)}`)
    appendDebug(`qrScanner.open.isAvailable(): ${String(scannerAvailable)}`)

    try {
      const launchParams = retrieveLaunchParams()
      const launchParamsString = JSON.stringify(launchParams)
      appendDebug(`launch params: ${launchParamsString.slice(0, 220)}`)
    } catch (launchParamsError) {
      const launchParamsErrorMessage =
        launchParamsError instanceof Error ? launchParamsError.message : String(launchParamsError)
      appendDebug(`launch params error: ${launchParamsErrorMessage}`)
    }

    return () => {
      if (qrScanner.isOpened()) {
        qrScanner.close()
      }
    }
  }, [appendDebug])

  const ownerAvatarSrc = useMemo(() => {
    if (!response?.owner.telegram_avatar_url) {
      return DEFAULT_AVATAR_PLACEHOLDER
    }

    return `${API_BASE_URL}${response.owner.telegram_avatar_url}`
  }, [response])

  const statusLabel = useMemo(() => {
    if (!response) {
      return ''
    }

    if (response.status === 'activated') {
      return 'Билет активирован'
    }

    return 'Билет уже был активирован'
  }, [response])

  const activateTicket = async (targetTicketCode: string) => {
    const normalizedCode = targetTicketCode.trim()

    if (!normalizedCode) {
      setError('Пустой ticket_code после сканирования.')
      return
    }

    setIsLoading(true)
    setError('')
    setResponse(null)

    try {
      const apiResponse = await fetch(`${API_BASE_URL}/tickets/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticket_code: normalizedCode,
        }),
      })

      const payload = (await apiResponse.json()) as ActivateTicketResponse | { detail?: string }

      if (!apiResponse.ok) {
        if (apiResponse.status === 404) {
          throw new Error((payload as { detail?: string }).detail ?? 'Ticket not found')
        }

        throw new Error((payload as { detail?: string }).detail ?? 'Не удалось активировать билет.')
      }

      setResponse(payload as ActivateTicketResponse)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Сетевая ошибка.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleScanClick = async () => {
    const scannerAvailable = qrScanner.open.isAvailable()
    appendDebug(`click scan, qrScanner.open.isAvailable(): ${String(scannerAvailable)}`)

    if (!scannerAvailable) {
      setError('QR-сканер недоступен в текущем окружении Telegram Mini App.')
      return
    }

    setError('')

    try {
      const scannedQr = await qrScanner.capture({
        capture(scannedValue) {
          return Boolean(scannedValue.trim())
        },
      })

      if (!scannedQr) {
        appendDebug('Сканер закрыт без результата.')
        return
      }

      appendDebug(`QR получен: ${scannedQr.slice(0, 140)}`)
      setLastScannedValue(scannedQr)
      const extractedCode = extractTicketCode(scannedQr)
      await activateTicket(extractedCode)
    } catch (scanError) {
      const scanErrorMessage = scanError instanceof Error ? scanError.message : String(scanError)
      appendDebug(`Ошибка открытия сканера: ${scanErrorMessage}`)
      setError('Не удалось открыть QR-сканер. Проверьте запуск внутри Telegram.')
    }
  }

  return (
    <main className="checkin-page">
      <section className="checkin-card">
        <h1>QR check-in</h1>
        <p className="subtitle">Мини-апп только для сканирования билета.</p>

        <button type="button" className="primary-btn" onClick={handleScanClick} disabled={isLoading}>
          {isLoading ? 'Обработка...' : 'Сканировать QR'}
        </button>

        {!isScannerSupported && (
          <p className="hint">QR-сканер работает только внутри Telegram Mini App.</p>
        )}

        {lastScannedValue && (
          <p className="scanned-value">
            Сканировано: <code>{lastScannedValue}</code>
          </p>
        )}

        {error && <div className="error-box">{error}</div>}

        <details className="debug-box">
          <summary>TMA debug</summary>
          {debugLines.length > 0 ? (
            <div>
              {debugLines.map((line) => (
                <p key={line} className="debug-line">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="debug-line">Логи пока пусты.</p>
          )}
        </details>

        {response && (
          <article className="result-card">
            <h2>{statusLabel}</h2>
            <p>
              Время первого прохода: <strong>{formatActivatedAt(response.activated_at)}</strong>
            </p>

            <div className="owner-row">
              <img src={ownerAvatarSrc} alt={response.owner.full_name} width={64} height={64} />
              <div>
                <p className="owner-name">{response.owner.full_name}</p>
                <p className="owner-meta">@{response.owner.username ?? 'username отсутствует'}</p>
                <p className="owner-meta">ID: {response.owner.telegram_id}</p>
              </div>
            </div>
          </article>
        )}
      </section>
    </main>
  )
}
