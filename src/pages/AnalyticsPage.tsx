import { useEffect, useState } from 'react'
import './AnalyticsPage.css'

/**
 * API: GET {API_BASE_URL}/stats/project-detailed
 * Ожидается один JSON-объект с полями (все number): started_bot, started_registration,
 * left_contact, registration_completed, tickets_issued, opened_my_ticket, tickets_annulled,
 * attended_qr_scan, lottery_participants.
 * Конверсии на фронте: 2/1, 3/2, 6/5, 9/8 (%). Ожидаемые гости: opened_my_ticket - tickets_annulled.
 */

/** Ответ API с данными воронки: от входа в бота до участия в мероприятии */
export interface FunnelStatsResponse {
  /** Запустили бота (Start) */
  started_bot: number
  /** Начали регистрацию (отправили имя) */
  started_registration: number
  /** Оставили контакт (телефон) */
  left_contact: number
  /** Регистрация завершена */
  registration_completed: number
  /** Билетов выдано */
  tickets_issued: number
  /** Открыли раздел «Мой билет» */
  opened_my_ticket: number
  /** Аннулировали билет */
  tickets_annulled: number
  /** Пришли на мероприятие (QR-скан) */
  attended_qr_scan: number
  /** Участники розыгрыша */
  lottery_participants: number
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '')

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value)
}

function getFileNameFromDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null
  }

  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1].replace(/['"]/g, '').trim())
  }

  const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
  return basicMatch?.[1]?.trim() ?? null
}

/** Один этап воронки для отображения */
interface FunnelStepRow {
  step: number
  label: string
  count: number
  conversionFromPrevious: number | null
}

function buildFunnelSteps(d: FunnelStatsResponse): FunnelStepRow[] {
  const expectedGuests = Math.max(0, d.opened_my_ticket - d.tickets_annulled)

  const conv = (current: number, previous: number) =>
    previous > 0 ? (current / previous) * 100 : null

  return [
    { step: 1, label: 'Запустили бота (Start)', count: d.started_bot, conversionFromPrevious: null },
    {
      step: 2,
      label: 'Начали регистрацию',
      count: d.started_registration,
      conversionFromPrevious: conv(d.started_registration, d.started_bot),
    },
    {
      step: 3,
      label: 'Оставили контакт (телефон)',
      count: d.left_contact,
      conversionFromPrevious: conv(d.left_contact, d.started_registration),
    },
    {
      step: 4,
      label: 'Регистрация завершена',
      count: d.registration_completed,
      conversionFromPrevious: null,
    },
    { step: 5, label: 'Билетов выдано', count: d.tickets_issued, conversionFromPrevious: null },
    {
      step: 6,
      label: 'Открыли раздел «Мой билет»',
      count: d.opened_my_ticket,
      conversionFromPrevious: conv(d.opened_my_ticket, d.tickets_issued),
    },
    {
      step: 7,
      label: 'Ожидаемых гостей',
      count: expectedGuests,
      conversionFromPrevious: null,
    },
    {
      step: 8,
      label: 'Пришли на мероприятие (QR-скан)',
      count: d.attended_qr_scan,
      conversionFromPrevious: conv(d.attended_qr_scan, expectedGuests),
    },
    {
      step: 9,
      label: 'Участники розыгрыша',
      count: d.lottery_participants,
      conversionFromPrevious: null,
    },
  ]
}

export default function AnalyticsPage() {
  const [data, setData] = useState<FunnelStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [activeDownload, setActiveDownload] = useState<'lottery' | 'analytics' | null>(null)

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true)
      setError('')

      try {
        const response = await fetch(`${API_BASE_URL}/stats/project-detailed`)
        const payload = (await response.json().catch(() => null)) as unknown

        if (!response.ok) {
          throw new Error('Не удалось получить данные аналитики.')
        }

        setData(payload as FunnelStatsResponse)
      } catch (requestError) {
        const errorMessage =
          requestError instanceof Error ? requestError.message : 'Сетевая ошибка при загрузке аналитики.'
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    void fetchAnalytics()
  }, [])

  const funnelSteps = data ? buildFunnelSteps(data) : []

  const downloadFile = async (
    path: string,
    fallbackName: string,
    downloadType: 'lottery' | 'analytics',
  ) => {
    setDownloadError('')
    setActiveDownload(downloadType)

    try {
      const response = await fetch(`${API_BASE_URL}${path}`)
      if (!response.ok) {
        throw new Error('Не удалось скачать файл.')
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      const filename = getFileNameFromDisposition(contentDisposition) ?? fallbackName

      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error ? requestError.message : 'Ошибка скачивания файла.'
      setDownloadError(errorMessage)
    } finally {
      setActiveDownload(null)
    }
  }

  if (isLoading) {
    return (
      <main className="analytics-page">
        <section className="analytics-card">
          <h1>Аналитика проекта</h1>
          <p className="analytics-hint">Загружаем данные...</p>
        </section>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="analytics-page">
        <section className="analytics-card">
          <h1>Аналитика проекта</h1>
          <div className="analytics-error">{error || 'Данные аналитики недоступны.'}</div>
        </section>
      </main>
    )
  }

  return (
    <main className="analytics-page">
      <section className="analytics-card">
        <header className="analytics-header">
          <h1>Воронка мероприятия</h1>
          <p className="analytics-hint">
            Путь посетителя от входа в бота до участия в мероприятии.
          </p>
          <div className="analytics-actions">
            <button
              type="button"
              className="analytics-action-btn"
              onClick={() =>
                void downloadFile('/eksport/lotereynye-bilety', 'lotereynye-bilety.xlsx', 'lottery')
              }
              disabled={activeDownload !== null}
            >
              {activeDownload === 'lottery' ? 'Скачиваем...' : 'Скачать лотерейные билеты'}
            </button>
            <button
              type="button"
              className="analytics-action-btn"
              onClick={() => void downloadFile('/eksport/analitika', 'analitika.xlsx', 'analytics')}
              disabled={activeDownload !== null}
            >
              {activeDownload === 'analytics' ? 'Скачиваем...' : 'Скачать аналитику'}
            </button>
          </div>
          {downloadError && <div className="analytics-error">{downloadError}</div>}
        </header>

        <section className="analytics-section analytics-funnel">
          <h2>Этапы воронки</h2>
          <ol className="funnel-list">
            {funnelSteps.map((row) => (
              <li key={row.step} className="funnel-step">
                <span className="funnel-step-num">{row.step}</span>
                <div className="funnel-step-content">
                  <span className="funnel-step-label">{row.label}</span>
                  <span className="funnel-step-count">{formatNumber(row.count)} чел.</span>
                  {row.conversionFromPrevious !== null && (
                    <span className="funnel-step-conversion">
                      Конверсия {formatPercent(row.conversionFromPrevious)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  )
}
