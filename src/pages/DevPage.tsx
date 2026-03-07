import { useCallback, useEffect, useMemo, useState } from 'react'
import { isTMA, qrScanner, retrieveLaunchParams } from '@tma.js/sdk'
import './DevPage.css'

type ApiActivateStatus = 'activated' | 'already_activated'
type ActivateStatus = ApiActivateStatus | 'not_found'

interface Owner {
  telegram_id: number
  username: string | null
  full_name: string
  telegram_avatar_url: string | null
}

interface ActivateTicketResponse {
  status: ApiActivateStatus
  ticket_number?: string
  lottery_code?: string | null
  activated_at: string | null
  owner: Owner
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '')
const TICKET_NUMBER_REGEX = /^\d{13}$/
const EXPECTED_TOTAL_FROM_ENV = Number.parseInt(import.meta.env.VITE_EXPECTED_GUESTS ?? '', 10)
const EXPECTED_TOTAL = Number.isNaN(EXPECTED_TOTAL_FROM_ENV) ? null : EXPECTED_TOTAL_FROM_ENV

const DEFAULT_AVATAR_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="48" fill="#DCE3F5" />
  <circle cx="48" cy="38" r="16" fill="#8EA2D3" />
  <path d="M20 82c4-14 16-22 28-22s24 8 28 22" fill="#8EA2D3" />
</svg>`)

function extractTicketNumber(scannedValue: string): string {
  const raw = scannedValue.trim()
  if (!raw) {
    return ''
  }

  try {
    const parsedUrl = new URL(raw)
    return (
      parsedUrl.searchParams.get('ticket_number') ??
      parsedUrl.searchParams.get('ticket_code') ??
      parsedUrl.searchParams.get('code') ??
      parsedUrl.pathname.split('/').filter(Boolean).at(-1) ??
      raw
    )
  } catch {
    return raw
  }
}

function isValidNewTicketNumber(value: string): boolean {
  return TICKET_NUMBER_REGEX.test(value)
}

function formatActivatedAt(value: string | null): string {
  if (!value) {
    return 'Не передано'
  }

  return new Date(value).toLocaleString('ru-RU')
}

function getPayloadDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('detail' in payload)) {
    return null
  }
  const detail = payload.detail
  return typeof detail === 'string' ? detail : null
}

function getStatusTitle(status: ActivateStatus): string {
  if (status === 'activated') {
    return 'Успешно активирован'
  }
  if (status === 'already_activated') {
    return 'Уже был активирован'
  }
  return 'Билет не найден'
}

function getStatusDescription(status: ActivateStatus): string {
  if (status === 'activated') {
    return 'Гость только что прошел check-in.'
  }
  if (status === 'already_activated') {
    return 'Это повторное сканирование, первый проход уже зафиксирован.'
  }
  return 'Проверьте корректность QR-кода или номер билета.'
}

function getAvatarSrc(owner?: Owner): string {
  if (!owner?.telegram_avatar_url) {
    return DEFAULT_AVATAR_PLACEHOLDER
  }
  return `${API_BASE_URL}${owner.telegram_avatar_url}`
}

interface ActivationResult {
  status: ActivateStatus
  ticket_number?: string
  lottery_code?: string | null
  activated_at: string | null
  owner?: Owner
}

interface ScanHistoryItem {
  id: string
  scanned_at: string
  ticket_code: string
  status: ActivateStatus
  owner_name: string
}

interface CheckinStats {
  expected: number | null
  activated: number
  alreadyActivated: number
  notFound: number
  scansTotal: number
}

interface BackendStats {
  expected: number | null
  activated: number | null
}

function toObject(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
}

function getNumberField(payload: unknown, keys: string[]): number | null {
  const objectPayload = toObject(payload)
  if (!objectPayload) {
    return null
  }
  for (const key of keys) {
    const value = objectPayload[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return null
}

function parseBackendStats(payload: unknown): BackendStats {
  return {
    expected: getNumberField(payload, ['expected', 'expected_total', 'total_expected', 'total']),
    activated: getNumberField(payload, [
      'already_activated',
      'activated',
      'activated_total',
      'activated_count',
    ]),
  }
}

export default function DevPage() {
  const [lastScannedValue, setLastScannedValue] = useState('')
  const [response, setResponse] = useState<ActivationResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStatsLoading, setIsStatsLoading] = useState(false)
  const [isScannerSupported, setIsScannerSupported] = useState(false)
  const [debugLines, setDebugLines] = useState<string[]>([])
  const [statsSyncError, setStatsSyncError] = useState('')
  const [backendStats, setBackendStats] = useState<BackendStats | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([])
  const [stats, setStats] = useState<CheckinStats>({
    expected: EXPECTED_TOTAL,
    activated: 0,
    alreadyActivated: 0,
    notFound: 0,
    scansTotal: 0,
  })

  const appendDebug = useCallback((message: string) => {
    const line = `${new Date().toLocaleTimeString('ru-RU')}: ${message}`
    console.info('[TMA debug]', line)
    setDebugLines((previousLines) => [line, ...previousLines].slice(0, 12))
  }, [])

  const syncCheckinStats = useCallback(async () => {
    setIsStatsLoading(true)
    try {
      const statsResponse = await fetch(`${API_BASE_URL}/tickets/checkin-stats`)
      const payload = (await statsResponse.json().catch(() => null)) as unknown
      if (!statsResponse.ok) {
        const detail = getPayloadDetail(payload)
        throw new Error(detail ?? 'Не удалось получить статистику check-in.')
      }
      const parsedStats = parseBackendStats(payload)
      setBackendStats(parsedStats)
      setStatsSyncError('')
      appendDebug(
        `sync stats: expected=${String(parsedStats.expected)}, activated=${String(parsedStats.activated)}`,
      )
    } catch (syncError) {
      const errorMessage = syncError instanceof Error ? syncError.message : String(syncError)
      appendDebug(`sync stats error: ${errorMessage}`)
      setStatsSyncError('Не удалось обновить общую статистику с backend.')
    } finally {
      setIsStatsLoading(false)
    }
  }, [appendDebug])

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

  useEffect(() => {
    void syncCheckinStats()
  }, [syncCheckinStats])

  const ownerAvatarSrc = useMemo(() => getAvatarSrc(response?.owner), [response])
  const displayedExpected = backendStats?.expected ?? stats.expected
  const displayedActivated = backendStats?.activated ?? stats.activated
  const progress = useMemo(() => {
    if (!displayedExpected || displayedExpected <= 0) {
      return null
    }
    return Math.min((displayedActivated / displayedExpected) * 100, 100)
  }, [displayedActivated, displayedExpected])

  const activateTicket = async (targetTicketNumber: string) => {
    const normalizedTicketNumber = targetTicketNumber.trim()

    if (!normalizedTicketNumber) {
      setError('Пустой ticket_code после сканирования.')
      return
    }

    if (!isValidNewTicketNumber(normalizedTicketNumber)) {
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
          ticket_code: normalizedTicketNumber,
        }),
      })

      const payload = (await apiResponse.json().catch(() => null)) as unknown
      const detail = getPayloadDetail(payload)

      if (!apiResponse.ok) {
        if (apiResponse.status === 404 && detail === 'Ticket not found') {
          const notFoundResponse: ActivationResult = {
            status: 'not_found',
            ticket_number: normalizedTicketNumber,
            activated_at: null,
          }
          setResponse(notFoundResponse)
          setStats((previousStats) => ({
            ...previousStats,
            scansTotal: previousStats.scansTotal + 1,
            notFound: previousStats.notFound + 1,
          }))
          setScanHistory((previousHistory) => {
            const nextHistory: ScanHistoryItem[] = [
              {
                id: `${Date.now()}-${normalizedTicketNumber}`,
                scanned_at: new Date().toISOString(),
                ticket_code: normalizedTicketNumber,
                status: 'not_found',
                owner_name: 'Неизвестный билет',
              },
              ...previousHistory,
            ]
            return nextHistory.slice(0, 8)
          })
          void syncCheckinStats()
          return
        }
        throw new Error(detail ?? 'Не удалось активировать билет.')
      }

      const successPayload = payload as ActivateTicketResponse
      const successResult: ActivationResult = {
        status: successPayload.status,
        ticket_number: successPayload.ticket_number ?? normalizedTicketNumber,
        lottery_code: successPayload.lottery_code,
        activated_at: successPayload.activated_at,
        owner: successPayload.owner,
      }
      setResponse(successResult)
      setStats((previousStats) => ({
        ...previousStats,
        scansTotal: previousStats.scansTotal + 1,
        activated: previousStats.activated + (successPayload.status === 'activated' ? 1 : 0),
        alreadyActivated:
          previousStats.alreadyActivated + (successPayload.status === 'already_activated' ? 1 : 0),
      }))
      setScanHistory((previousHistory) => {
        const nextHistory: ScanHistoryItem[] = [
          {
            id: `${Date.now()}-${normalizedTicketNumber}`,
            scanned_at: new Date().toISOString(),
            ticket_code: successPayload.ticket_number ?? normalizedTicketNumber,
            status: successPayload.status,
            owner_name: successPayload.owner.full_name,
          },
          ...previousHistory,
        ]
        return nextHistory.slice(0, 8)
      })
      void syncCheckinStats()
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
          const extractedTicketNumber = extractTicketNumber(scannedValue)
          return isValidNewTicketNumber(extractedTicketNumber)
        },
      })

      if (!scannedQr) {
        appendDebug('Сканер закрыт без результата.')
        return
      }

      appendDebug(`QR получен: ${scannedQr.slice(0, 140)}`)
      setLastScannedValue(scannedQr)
      const extractedTicketNumber = extractTicketNumber(scannedQr)

      if (!isValidNewTicketNumber(extractedTicketNumber)) {
        setError('QR считан, но ticket_code не похож на валидный код билета.')
        return
      }

      await activateTicket(extractedTicketNumber)
    } catch (scanError) {
      const scanErrorMessage = scanError instanceof Error ? scanError.message : String(scanError)
      appendDebug(`Ошибка открытия сканера: ${scanErrorMessage}`)
      setError('Не удалось открыть QR-сканер. Проверьте запуск внутри Telegram.')
    }
  }

  return (
    <main className="checkin-page">
      <section className="checkin-card">
        <header className="checkin-header">
          <div>
            <h1>QR check-in</h1>
            <p className="subtitle">Сканирование билетов на входе, без авторизации.</p>
          </div>
          <div className="stats-grid">
            <article className="stats-item">
              <span className="stats-label">Ожидается</span>
              <strong>{displayedExpected ?? '—'}</strong>
            </article>
            <article className="stats-item">
              <span className="stats-label">Уже активировано</span>
              <strong>{displayedActivated}</strong>
            </article>
            <article className="stats-item">
              <span className="stats-label">Повторных сканов</span>
              <strong>{stats.alreadyActivated}</strong>
            </article>
            <article className="stats-item">
              <span className="stats-label">Не найдено</span>
              <strong>{stats.notFound}</strong>
            </article>
          </div>
          <div className="stats-toolbar">
            <button type="button" className="ghost-btn" onClick={() => void syncCheckinStats()}>
              {isStatsLoading ? 'Обновляем...' : 'Обновить статистику'}
            </button>
            {statsSyncError && <span className="stats-error">{statsSyncError}</span>}
          </div>
        </header>

        {progress !== null && (
          <div className="progress-block" aria-label="Прогресс check-in">
            <div className="progress-row">
              <span>Прогресс прохода</span>
              <strong>{progress.toFixed(1)}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <button type="button" className="primary-btn" onClick={handleScanClick} disabled={isLoading}>
          {isLoading ? 'Обработка...' : 'Начать сканирование'}
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
          <article className={`result-card result-${response.status}`}>
            <h2>{getStatusTitle(response.status)}</h2>
            <p className="status-description">{getStatusDescription(response.status)}</p>
            {response.ticket_number && (
              <p>
                Номер билета: <strong>{response.ticket_number}</strong>
              </p>
            )}
            {response.status === 'activated' && response.lottery_code && (
              <p>
                Lottery code: <strong>{response.lottery_code}</strong>
              </p>
            )}
            <p>
              Время первого прохода: <strong>{formatActivatedAt(response.activated_at)}</strong>
            </p>

            <div className="owner-row">
              <img
                src={ownerAvatarSrc}
                alt={response.owner?.full_name ?? 'Владелец билета'}
                width={64}
                height={64}
              />
              <div>
                <p className="owner-name">{response.owner?.full_name ?? 'Данные владельца недоступны'}</p>
                <p className="owner-meta">@{response.owner?.username ?? 'username отсутствует'}</p>
                <p className="owner-meta">ID: {response.owner?.telegram_id ?? '—'}</p>
              </div>
            </div>
          </article>
        )}

        <section className="history-card">
          <h3>Последние сканы ({stats.scansTotal})</h3>
          {scanHistory.length === 0 ? (
            <p className="hint">История появится после первого сканирования.</p>
          ) : (
            <ul className="history-list">
              {scanHistory.map((item) => (
                <li key={item.id} className={`history-item status-${item.status}`}>
                  <div>
                    <strong>{item.ticket_code}</strong>
                    <p>{item.owner_name}</p>
                  </div>
                  <div className="history-meta">
                    <span>{getStatusTitle(item.status)}</span>
                    <time dateTime={item.scanned_at}>
                      {new Date(item.scanned_at).toLocaleTimeString('ru-RU')}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  )
}
